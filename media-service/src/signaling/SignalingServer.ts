import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { readCallTokenIdentity, verifyCallToken } from "../auth/callToken.js";
import * as roomManager from "../rooms/RoomManager.js";
import { Room } from "../rooms/Room.js";
import { Participant } from "../rooms/Participant.js";
import { SessionRegistry } from "../rooms/SessionRegistry.js";
import { config } from "../config.js";
import { notifySpringBoot } from "../webhooks/notifySpringBoot.js";
import { dispatch } from "./handlers.js";
import { syncGroupAudio, syncVideoWithEveryone } from "./mediaRouting.js";
import { RateLimiter } from "../util/rateLimiter.js";
import { randomUUID } from "node:crypto";

interface ClientMessage {
  reqId: string;
  type: string;
  payload?: unknown;
}

// Защита сигнального канала от спама - тот же принцип, что CallRateLimiter на Java-стороне.
const connectionLimiter = new RateLimiter(10, 60_000); // 10 попыток подключения в минуту на userId
const messageLimiter = new RateLimiter(60, 10_000); // 60 сигнальных сообщений за 10 секунд на участника
const sessionRegistry = new SessionRegistry();
const detachTimers = new Map<string, ReturnType<typeof setTimeout>>();
const emptyRoomTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function attachSignalingServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    void handleConnection(ws, req);
  });
}

async function handleConnection(ws: WebSocket, _req: IncomingMessage): Promise<void> {
  // Токен передаётся первым сообщением {type:"auth", payload:{token}}, а не в адресе:
  // адрес подключения пишется в логи nginx, токен не должен там оказаться.
  let room: Room | null = null;
  let participant: Participant | null = null;
  let authenticating = false;
  let lastMessageAt = Date.now();

  const authTimer = setTimeout(() => {
    if (!participant) {
      console.log("[ws] rejected: auth timeout");
      ws.close(4401, "Auth timeout");
    }
  }, 5_000);

  const heartbeatTimer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    if (Date.now() - lastMessageAt > config.websocketHeartbeatTimeoutMs) {
      console.warn("[ws] heartbeat timeout; detaching signaling session");
      ws.terminate();
      return;
    }
    ws.send(JSON.stringify({ type: "ping" }));
  }, config.websocketHeartbeatIntervalMs);

  ws.on("message", (raw) => {
    lastMessageAt = Date.now();
    const text = raw.toString();
    if (room && participant) {
      void handleMessage(room, participant, text);
      return;
    }
    if (authenticating) return;
    authenticating = true;
    void authenticate(ws, text).then((result) => {
      if (!result) return;
      room = result.room;
      participant = result.participant;
      clearTimeout(authTimer);
    }).finally(() => { authenticating = false; });
  });

  ws.on("close", () => {
    clearTimeout(authTimer);
    clearInterval(heartbeatTimer);
    if (room && participant && participant.detach(ws)) {
      startDetachGrace(room, participant);
    }
  });
}

async function authenticate(ws: WebSocket, text: string): Promise<{ room: Room; participant: Participant } | null> {
  let message: { reqId?: string; type?: string; payload?: { token?: string; sessionId?: string; resume?: boolean } };
  try {
    message = JSON.parse(text);
  } catch {
    ws.close(4401, "Auth required");
    return null;
  }

  const token = message.payload?.token;
  if (message.type !== "auth" || !token) {
    console.log("[ws] rejected: first message is not auth");
    ws.close(4401, "Auth required");
    return null;
  }

  const requestedSessionId = message.payload?.sessionId;
  const wantsResume = message.payload?.resume === true;
  if (wantsResume && !requestedSessionId) {
    ws.close(4408, "Call session expired");
    return null;
  }
  const tokenIdentity = readCallTokenIdentity(token);
  if (!tokenIdentity) {
    ws.close(4401, "Invalid call token");
    return null;
  }

  const room = roomManager.getRoom(tokenIdentity.callId);
  if (!room) {
    console.log("[ws] rejected: room not found");
    ws.close(4404, "Call room not found - has the call been started?");
    return null;
  }

  let existing: Participant | undefined;
  let canResume = false;
  if (wantsResume && requestedSessionId) {
    existing = room.participantBySession(requestedSessionId);
    const detachedSession = sessionRegistry.get(requestedSessionId);
    canResume = !!existing
      && existing.userId === tokenIdentity.userId
      && (!existing.isDetached || !!detachedSession)
      && (!detachedSession || (detachedSession.callId === tokenIdentity.callId && detachedSession.userId === tokenIdentity.userId));
    if (!canResume) {
      console.info("[session] resume rejected: session is no longer active");
      ws.close(4408, "Call session expired");
      return null;
    }
  }

  let userId: string;
  let callId: string;
  try {
    ({ userId, callId } = verifyCallToken(token, canResume && !!existing?.isDetached));
  } catch (e) {
    console.log("[ws] rejected: invalid/expired call token");
    ws.close(4401, "Invalid or expired token");
    return null;
  }

  if (!canResume && !connectionLimiter.allow(userId)) {
    console.log("[ws] rejected: connection rate limit");
    ws.close(4429, "Too many connection attempts - try again later");
    return null;
  }

  if (userId !== tokenIdentity.userId || callId !== tokenIdentity.callId) {
    ws.close(4401, "Invalid call token");
    return null;
  }

  let participant: Participant;
  let resumed = false;
  if (canResume && existing) {
    const oldTimer = detachTimers.get(existing.sessionId);
    if (oldTimer) clearTimeout(oldTimer);
    detachTimers.delete(existing.sessionId);
    sessionRegistry.remove(existing.sessionId);
    if (existing.socket !== ws && (existing.socket.readyState === existing.socket.OPEN || existing.socket.readyState === existing.socket.CONNECTING)) {
      existing.socket.close(4412, "Session resumed on another connection");
    }
    existing.attach(ws);
    participant = existing;
    resumed = true;
    console.info("[session] participant session resumed");
  } else {
    const sessionId = requestedSessionId && requestedSessionId.length <= 128 ? requestedSessionId : randomUUID();
    const previous = room.participants.get(userId);
    if (previous) room.removeParticipant(userId);
    participant = new Participant(userId, ws, sessionId);
    room.addParticipant(participant);
    console.info("[session] participant session created");
  }
  const roomTimer = emptyRoomTimers.get(room.callId);
  if (roomTimer) clearTimeout(roomTimer);
  emptyRoomTimers.delete(room.callId);

  ws.send(JSON.stringify({
    reqId: message.reqId,
    ok: true,
    payload: { resumed, sessionId: participant.sessionId, ...(resumed ? { state: room.stateFor(participant) } : {}) },
  }));
  if (resumed) {
    void syncGroupAudio(room, participant);
    void syncVideoWithEveryone(room, participant);
  }
  return { room, participant };
}

async function handleMessage(room: Room, participant: Participant, raw: string): Promise<void> {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    return; // невалидный JSON от клиента - молча игнорируем, соединение не рвём
  }

  if (message.type === "ping") {
    participant.send({ type: "pong" });
    return;
  }
  if (message.type === "pong") return;

  if (!messageLimiter.allow(participant.userId)) {
    participant.send({ reqId: message.reqId, ok: false, error: "Rate limit exceeded" });
    return;
  }

  try {
    if (message.type === "leave") {
      participant.send({ reqId: message.reqId, ok: true, payload: {} });
      await finalizeParticipant(room, participant, "left");
      return;
    }
    const result = await dispatch(message.type, room, participant, message.payload);
    console.log(`[ws] ${message.type} ok`);
    participant.send({ reqId: message.reqId, ok: true, payload: result ?? {} });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.warn(`[ws] ${message.type} failed`);
    participant.send({
      reqId: message.reqId,
      ok: false,
      error: errorMessage,
    });
  }
}

function startDetachGrace(room: Room, participant: Participant): void {
  const detached = sessionRegistry.detach(participant.sessionId, room.callId, participant.userId, config.callSessionGraceMs);
  console.info(`[session] participant detached graceMs=${config.callSessionGraceMs}`);
  const timer = setTimeout(() => {
    const current = sessionRegistry.get(participant.sessionId);
    if (!current || current.expiresAt !== detached.expiresAt) return;
    detachTimers.delete(participant.sessionId);
    sessionRegistry.remove(participant.sessionId);
    void finalizeParticipant(room, participant, "expired");
  }, config.callSessionGraceMs);
  detachTimers.set(participant.sessionId, timer);
}

async function finalizeParticipant(room: Room, participant: Participant, reason: "left" | "expired" = "expired"): Promise<void> {
  if (room.participants.get(participant.userId) !== participant) return;
  console.info(`[session] participant ${reason}`);
  const timer = detachTimers.get(participant.sessionId);
  if (timer) clearTimeout(timer);
  detachTimers.delete(participant.sessionId);
  sessionRegistry.remove(participant.sessionId);
  messageLimiter.clear(participant.userId);
  room.removeParticipant(participant.userId);
  await notifySpringBoot(room.callId, "LEFT", participant.userId);

  if (room.isEmpty) {
    scheduleEmptyRoomClose(room);
  }
}

function scheduleEmptyRoomClose(room: Room): void {
  const previous = emptyRoomTimers.get(room.callId);
  if (previous) clearTimeout(previous);
  console.info(`[session] room idle; retaining for ${config.emptyRoomRetentionMs}ms`);
  const timer = setTimeout(() => {
    emptyRoomTimers.delete(room.callId);
    if (roomManager.getRoom(room.callId) !== room || !room.isEmpty) return;
    roomManager.closeRoom(room.callId);
    void notifySpringBoot(room.callId, "ROOM_EMPTY");
  }, config.emptyRoomRetentionMs);
  emptyRoomTimers.set(room.callId, timer);
}

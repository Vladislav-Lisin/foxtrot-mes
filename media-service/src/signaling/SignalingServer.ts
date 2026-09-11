import { WebSocketServer, type WebSocket } from "ws";
import type { Server as HttpServer, IncomingMessage } from "node:http";
import { verifyCallToken } from "../auth/callToken.js";
import * as roomManager from "../rooms/RoomManager.js";
import { Room } from "../rooms/Room.js";
import { Participant } from "../rooms/Participant.js";
import { notifySpringBoot } from "../webhooks/notifySpringBoot.js";
import { dispatch } from "./handlers.js";
import { RateLimiter } from "../util/rateLimiter.js";

interface ClientMessage {
  reqId: string;
  type: string;
  payload?: unknown;
}

// Защита сигнального канала от спама - тот же принцип, что CallRateLimiter на Java-стороне.
const connectionLimiter = new RateLimiter(10, 60_000); // 10 попыток подключения в минуту на userId
const messageLimiter = new RateLimiter(60, 10_000); // 60 сигнальных сообщений за 10 секунд на участника

export function attachSignalingServer(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    void handleConnection(ws, req);
  });
}

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? "", "http://localhost");
  const token = url.searchParams.get("token");

  if (!token) {
    console.log("[ws] rejected: missing token");
    ws.close(4401, "Missing token");
    return;
  }

  let userId: string;
  let callId: string;
  try {
    ({ userId, callId } = verifyCallToken(token));
  } catch (e) {
    console.log("[ws] rejected: invalid/expired token -", e instanceof Error ? e.message : e);
    ws.close(4401, "Invalid or expired token");
    return;
  }

  if (!connectionLimiter.allow(userId)) {
    console.log(`[ws] rejected: rate limit for user ${userId.slice(0, 8)}`);
    ws.close(4429, "Too many connection attempts - try again later");
    return;
  }

  const room = roomManager.getRoom(callId);
  if (!room) {
    console.log(`[ws] rejected: room not found for callId=${callId} (user ${userId.slice(0, 8)})`);
    ws.close(4404, "Call room not found - has the call been started?");
    return;
  }

  console.log(`[ws] connected: user=${userId.slice(0, 8)} callId=${callId}`);
  const participant = new Participant(userId, ws);
  room.addParticipant(participant);

  ws.on("message", (raw) => {
    void handleMessage(room, participant, raw.toString());
  });

  ws.on("close", () => {
    void handleDisconnect(room, participant);
  });
}

async function handleMessage(room: Room, participant: Participant, raw: string): Promise<void> {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw) as ClientMessage;
  } catch {
    return; // невалидный JSON от клиента - молча игнорируем, соединение не рвём
  }

  if (!messageLimiter.allow(participant.userId)) {
    participant.send({ reqId: message.reqId, ok: false, error: "Rate limit exceeded" });
    return;
  }

  try {
    const result = await dispatch(message.type, room, participant, message.payload);
    console.log(`[ws] ${participant.userId.slice(0, 8)} <${message.type}> ok`);
    participant.send({ reqId: message.reqId, ok: true, payload: result ?? {} });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.log(`[ws] ${participant.userId.slice(0, 8)} <${message.type}> FAILED: ${errorMessage}`);
    participant.send({
      reqId: message.reqId,
      ok: false,
      error: errorMessage,
    });
  }
}

async function handleDisconnect(room: Room, participant: Participant): Promise<void> {
  console.log(`[ws] disconnected: user=${participant.userId.slice(0, 8)} callId=${room.callId}`);
  messageLimiter.clear(participant.userId);
  room.removeParticipant(participant.userId);
  await notifySpringBoot(room.callId, "LEFT", participant.userId);

  if (room.isEmpty) {
    roomManager.closeRoom(room.callId);
    await notifySpringBoot(room.callId, "ROOM_EMPTY");
  }
}

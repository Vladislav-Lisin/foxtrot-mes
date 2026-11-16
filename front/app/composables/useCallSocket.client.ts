import type { Device } from "mediasoup-client";
import type { Consumer, DtlsParameters, IceCandidate, IceParameters, Producer, Transport } from "mediasoup-client/types";
import type { ProducerKind } from "~/types/call";
import { shouldRestartIce, shouldRetryIceRestart } from "~/utils/iceRestart";

type CreateTransportResult = {
  transportId: string
  iceParameters: IceParameters
  iceCandidates: IceCandidate[]
  dtlsParameters: DtlsParameters
  // Короткоживущие TURN-креденшлы для клиентов за строгим NAT/файрволом - пусто, если
  // coturn не настроен (см. media-service/src/turn/turnCredentials.ts)
  iceServers: RTCIceServer[]
}

// Протокол сигнализации media-service (см. media-service/src/signaling/*):
// клиент -> сервер: { reqId, type, payload } ждёт { reqId, ok, payload | error }
// сервер -> клиент (push, без reqId): { type, payload }
// "consume" как отдельная команда не заведена - сервер сам решает, кого с кем
// соединять (в этом весь смысл групп), и проактивно шлёт "new-consumer".

type CallSocketHandlers = {
  onParticipantJoined?: (userId: string) => void
  onParticipantLeft?: (userId: string) => void
  onTrack?: (peerUserId: string, kind: ProducerKind, track: MediaStreamTrack) => void
  onTrackRemoved?: (peerUserId: string, kind: ProducerKind) => void
  onGroupChanged?: (userId: string, group: string | null) => void
  onSpeakingChanged?: (userId: string, speaking: boolean) => void
  onNewProducer?: (userId: string, kind: ProducerKind) => void
  onRoomState?: (state: RoomState) => void
  onIceRestartState?: (active: boolean, direction?: "send" | "recv") => void
  onRecoveryRequired?: () => void
  onNetworkStatus?: (online: boolean) => void
  // "intentional" - сами вызвали disconnect() (leave/end у себя). "ended" - звонок
  // завершён владельцем/пуст, сервер закрыл соединение сам (код 4410, см.
  // media-service/src/rooms/Participant.ts) - и то, и другое не должно вызывать реконнект,
  // но "ended" должен увести со страницы звонка, а "intentional" - нет (мы это уже сделали).
  // "unexpected" - разрыв по сети, единственный случай, когда реконнект имеет смысл.
  onConnectedChange?: (connected: boolean, reason?: "intentional" | "ended" | "unexpected" | "session-expired") => void
}

type RoomState = {
  self: { userId: string; group: string | null; producers: ProducerKind[]; sessionId: string }
  participants: Array<{ userId: string; group: string | null; producers: ProducerKind[] }>
}

type AuthResult = { resumed: boolean; sessionId: string; state?: RoomState };

const CALL_ENDED_CLOSE_CODE = 4410;
const CALL_KICKED_CLOSE_CODE = 4403;
const CALL_SESSION_EXPIRED_CLOSE_CODE = 4408;
// Без таймаутов при недоступном media-service (закрытый порт, неверный MEDIA_SERVICE_PUBLIC_URL)
// браузер может ждать соединения очень долго, и пользователь видит бесконечное "Подключение..."
const SOCKET_OPEN_TIMEOUT_MS = 10_000;
const HANDSHAKE_TIMEOUT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 25_000;
const ICE_RESTART_CHECK_MS = 8_000;

function withTimeout<T>(task: Promise<T>, ms: number, message: string, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, ms);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

type PendingRequest = {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

let ws: WebSocket | null = null;
let device: Device | null = null;
let sendTransport: Transport | null = null;
let recvTransport: Transport | null = null;
let handlers: CallSocketHandlers = {};
let intentionalClose = false;
let sessionId: string | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatWatchdog: ReturnType<typeof setInterval> | null = null;
let onlineProbeTimer: ReturnType<typeof setTimeout> | null = null;
let lastServerMessageAt = 0;
let networkListenersAttached = false;
const iceRestartAttempts: Record<"send" | "recv", number> = { send: 0, recv: 0 };
const iceRestartTimers: Partial<Record<"send" | "recv", ReturnType<typeof setTimeout>>> = {};
const iceRestartInFlight = new Set<"send" | "recv">();
const onlineHandler = () => {
  handlers.onNetworkStatus?.(true);
  probeSignaling();
  checkTransportsNow();
};
const offlineHandler = () => handlers.onNetworkStatus?.(false);
const connectionChangeHandler = () => {
  probeSignaling();
  checkTransportsNow();
};
const networkConnection = typeof navigator === "undefined"
  ? undefined
  : (navigator as Navigator & { connection?: EventTarget }).connection;

const producers = new Map<ProducerKind, Producer>();
const consumers = new Map<string, Map<ProducerKind, Consumer>>();

let reqCounter = 0;
const pending = new Map<string, PendingRequest>();

// Токен в адрес не кладём: адрес пишется в логи nginx. Токен уходит первым сообщением (см. connect).
function wsUrlFrom(mediaServiceUrl: string): string {
  const url = new URL("/ws", mediaServiceUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function request<T = unknown>(type: string, payload?: unknown): Promise<T> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("Call socket is not connected"));
  }

  const reqId = `${Date.now()}-${++reqCounter}`;
  const message = JSON.stringify({ reqId, type, payload });

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(reqId);
      reject(new Error(`Call socket request timed out: ${type}`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(reqId, { resolve: resolve as (p: unknown) => void, reject, timeout });
    ws!.send(message);
  });
}

function handleServerMessage(raw: string): void {
  lastServerMessageAt = Date.now();
  let message: { reqId?: string, ok?: boolean, payload?: unknown, error?: string, type?: string };
  try {
    message = JSON.parse(raw);
  } catch {
    return;
  }

  if (message.reqId) {
    const waiting = pending.get(message.reqId);
    if (!waiting) return;
    pending.delete(message.reqId);
    clearTimeout(waiting.timeout);
    if (message.ok) {
      waiting.resolve(message.payload);
    } else {
      waiting.reject(new Error(message.error || "Call socket request failed"));
    }
    return;
  }

  if (!message.type) return;
  handlePush(message.type, message.payload);
}

function clearHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (heartbeatWatchdog) clearInterval(heartbeatWatchdog);
  heartbeatTimer = null;
  heartbeatWatchdog = null;
  if (onlineProbeTimer) clearTimeout(onlineProbeTimer);
  onlineProbeTimer = null;
}

function startHeartbeat(): void {
  clearHeartbeat();
  lastServerMessageAt = Date.now();
  heartbeatTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatWatchdog = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN && Date.now() - lastServerMessageAt > HEARTBEAT_TIMEOUT_MS) {
      console.warn("[call] signaling heartbeat timed out");
      ws.close();
    }
  }, 2_000);
}

function probeSignaling(): void {
  if (ws?.readyState !== WebSocket.OPEN) return;
  if (onlineProbeTimer) clearTimeout(onlineProbeTimer);
  const previousMessageAt = lastServerMessageAt;
  ws.send(JSON.stringify({ type: "ping" }));
  onlineProbeTimer = setTimeout(() => {
    onlineProbeTimer = null;
    if (ws?.readyState === WebSocket.OPEN && lastServerMessageAt === previousMessageAt) {
      console.warn("[call] signaling did not answer network-change probe");
      ws.close();
    }
  }, 2_000);
}

function checkTransportsNow(): void {
  for (const [direction, transport] of [["send", sendTransport], ["recv", recvTransport]] as const) {
    if (transport && (transport.connectionState === "disconnected" || transport.connectionState === "failed")) {
      scheduleIceRestart(direction, 0);
    }
  }
}

function attachNetworkListeners(): void {
  if (networkListenersAttached) return;
  networkListenersAttached = true;
  window.addEventListener("online", onlineHandler);
  window.addEventListener("offline", offlineHandler);
  networkConnection?.addEventListener("change", connectionChangeHandler);
}

function detachNetworkListeners(): void {
  if (!networkListenersAttached) return;
  networkListenersAttached = false;
  window.removeEventListener("online", onlineHandler);
  window.removeEventListener("offline", offlineHandler);
  networkConnection?.removeEventListener("change", connectionChangeHandler);
}

function clearMediaState(): void {
  for (const timer of Object.values(iceRestartTimers)) if (timer) clearTimeout(timer);
  for (const producer of producers.values()) producer.close();
  for (const byPeer of consumers.values()) for (const consumer of byPeer.values()) consumer.close();
  sendTransport?.close();
  recvTransport?.close();
  sendTransport = null;
  recvTransport = null;
  device = null;
  producers.clear();
  consumers.clear();
  iceRestartAttempts.send = 0;
  iceRestartAttempts.recv = 0;
  iceRestartInFlight.clear();
  delete iceRestartTimers.send;
  delete iceRestartTimers.recv;
}

function applyRoomState(state: RoomState): void {
  const currentPeers = new Map(state.participants.map(peer => [peer.userId, new Set(peer.producers)]));
  for (const [peerUserId, byKind] of consumers) {
    const activeKinds = currentPeers.get(peerUserId);
    for (const [kind, consumer] of byKind) {
      if (!activeKinds?.has(kind)) {
        consumer.close();
        byKind.delete(kind);
        handlers.onTrackRemoved?.(peerUserId, kind);
      }
    }
    if (byKind.size === 0) consumers.delete(peerUserId);
  }
  handlers.onRoomState?.(state);
}

async function restartTransportIce(direction: "send" | "recv"): Promise<void> {
  const transport = direction === "send" ? sendTransport : recvTransport;
  if (!transport || ws?.readyState !== WebSocket.OPEN || iceRestartInFlight.has(direction)) {
    throw new Error("ICE restart is not currently available");
  }
  // "new" - медиа ещё не публиковалось/не принималось, ICE-транспорт не поднимался.
  // Перезапускать нечего: иначе звонок без включённых камеры/микрофона уходит в
  // бесконечный цикл restart-ice и навсегда показывает "Восстанавливаем медиасоединение".
  if (!shouldRestartIce(transport.connectionState)) {
    iceRestartAttempts[direction] = 0;
    handlers.onIceRestartState?.(false, direction);
    return;
  }
  iceRestartInFlight.add(direction);
  handlers.onIceRestartState?.(true, direction);
  const startedAt = Date.now();
  try {
    const { iceParameters } = await request<{ iceParameters: IceParameters }>("restart-ice", { direction });
    await transport.restartIce({ iceParameters });
    console.info(`[call] ICE restart applied direction=${direction} in ${Date.now() - startedAt}ms`);
    iceRestartTimers[direction] = setTimeout(() => {
      delete iceRestartTimers[direction];
      iceRestartInFlight.delete(direction);
      if (shouldRetryIceRestart(transport.connectionState)) {
        if (iceRestartAttempts[direction] >= 6) handlers.onRecoveryRequired?.();
        else scheduleIceRestart(direction);
      } else {
        if (transport.connectionState === "new" || transport.connectionState === "connected") {
          iceRestartAttempts[direction] = 0;
        }
        handlers.onIceRestartState?.(false, direction);
      }
    }, ICE_RESTART_CHECK_MS);
  } catch (error) {
    iceRestartInFlight.delete(direction);
    handlers.onIceRestartState?.(false, direction);
    throw error;
  }
}

function scheduleIceRestart(direction: "send" | "recv", delayMs?: number): void {
  if (intentionalClose) return;
  if (iceRestartTimers[direction] || iceRestartInFlight.has(direction)) return;
  const attempts = iceRestartAttempts[direction];
  if (attempts >= 6) {
    console.warn(`[call] ICE restart exhausted direction=${direction}; requesting full rejoin`);
    handlers.onRecoveryRequired?.();
    return;
  }
  const delay = delayMs ?? Math.min(30_000, 1_000 * (2 ** attempts));
  iceRestartTimers[direction] = setTimeout(() => {
    delete iceRestartTimers[direction];
    iceRestartAttempts[direction] += 1;
    void restartTransportIce(direction).catch((error) => {
      console.warn(`[call] ICE restart failed direction=${direction} attempt=${iceRestartAttempts[direction]}`, error);
      iceRestartInFlight.delete(direction);
      if (iceRestartAttempts[direction] >= 6) handlers.onRecoveryRequired?.();
      else scheduleIceRestart(direction);
    });
  }, delay);
}

async function openSocketAndAuthenticate(
  params: { mediaServiceUrl: string; callToken: string },
  authPayload: { sessionId?: string; resume: boolean; previousToken?: string },
): Promise<AuthResult> {
  const callServerHost = new URL(params.mediaServiceUrl).host;
  const unavailableMessage = `Сервер звонков ${callServerHost} не отвечает. Проверьте MEDIA_SERVICE_PUBLIC_URL и доступность порта.`;
  await withTimeout(new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(wsUrlFrom(params.mediaServiceUrl));
    ws = socket;
    socket.onopen = () => resolve();
    socket.onerror = () => reject(new Error("Failed to connect to call socket"));
    socket.onmessage = event => handleServerMessage(String(event.data));
    socket.onclose = (event) => {
      clearHeartbeat();
      const reason = intentionalClose
        ? "intentional"
        : event.code === CALL_ENDED_CLOSE_CODE || event.code === CALL_KICKED_CLOSE_CODE ? "ended"
        : event.code === CALL_SESSION_EXPIRED_CLOSE_CODE ? "session-expired" : "unexpected";
      const error = event.code === CALL_SESSION_EXPIRED_CLOSE_CODE
        ? new Error("CALL_SESSION_EXPIRED")
        : new Error(`Call socket closed (code ${event.code}): ${event.reason || "no reason"}`);
      for (const [reqId, waiting] of pending) {
        clearTimeout(waiting.timeout);
        waiting.reject(error);
        pending.delete(reqId);
      }
      handlers.onConnectedChange?.(false, reason);
    };
  }), SOCKET_OPEN_TIMEOUT_MS, unavailableMessage, () => ws?.close());
  startHeartbeat();
  const result = await withTimeout(
    request<AuthResult>("auth", { token: params.callToken, ...authPayload }),
    HANDSHAKE_TIMEOUT_MS,
    unavailableMessage,
    () => ws?.close(),
  );
  return result;
}

function handlePush(type: string, payload: unknown): void {
  switch (type) {
    case "ping":
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "pong" }));
      break;
    case "pong":
      if (onlineProbeTimer) clearTimeout(onlineProbeTimer);
      onlineProbeTimer = null;
      break;
    case "room-state":
      handlers.onRoomState?.(payload as RoomState);
      break;
    case "participant-joined": {
      const { userId } = payload as { userId: string };
      handlers.onParticipantJoined?.(userId);
      break;
    }
    case "participant-left": {
      const { userId } = payload as { userId: string };
      handlers.onParticipantLeft?.(userId);
      break;
    }
    case "new-producer": {
      const { userId, kind } = payload as { userId: string, kind: ProducerKind };
      handlers.onNewProducer?.(userId, kind);
      break;
    }
    case "group-changed": {
      const { userId, group } = payload as { userId: string, group: string | null };
      handlers.onGroupChanged?.(userId, group);
      break;
    }
    case "speaking-changed": {
      const { userId, speaking } = payload as { userId: string, speaking: boolean };
      handlers.onSpeakingChanged?.(userId, speaking);
      break;
    }
    case "new-consumer": {
      void handleNewConsumer(payload as {
        peerUserId: string
        kind: ProducerKind
        consumerId: string
        producerId: string
        rtpParameters: Consumer["rtpParameters"]
      });
      break;
    }
    case "consumer-closed": {
      const { peerUserId, kind } = payload as { peerUserId: string, kind: ProducerKind };
      consumers.get(peerUserId)?.get(kind)?.close();
      consumers.get(peerUserId)?.delete(kind);
      handlers.onTrackRemoved?.(peerUserId, kind);
      break;
    }
  }
}

async function handleNewConsumer(payload: {
  peerUserId: string
  kind: ProducerKind
  consumerId: string
  producerId: string
  rtpParameters: Consumer["rtpParameters"]
}): Promise<void> {
  if (!recvTransport) return;

  const consumer = await recvTransport.consume({
    id: payload.consumerId,
    producerId: payload.producerId,
    // "screenAudio" (звук демонстрации) - тоже реально RTP-аудио, не видео.
    kind: payload.kind === "audio" || payload.kind === "screenAudio" ? "audio" : "video",
    rtpParameters: payload.rtpParameters,
  });

  let byPeer = consumers.get(payload.peerUserId);
  if (!byPeer) {
    byPeer = new Map();
    consumers.set(payload.peerUserId, byPeer);
  }
  byPeer.set(payload.kind, consumer);

  handlers.onTrack?.(payload.peerUserId, payload.kind, consumer.track);

  // сервер создаёт Consumer на паузе - явно подтверждаем готовность принимать
  await request("resume-consumer", { peerUserId: payload.peerUserId, kind: payload.kind });
}

async function setupTransport(direction: "send" | "recv"): Promise<Transport> {
  const params = await request<CreateTransportResult>("create-transport", { direction });
  const transportOptions = {
    id: params.transportId,
    iceParameters: params.iceParameters,
    iceCandidates: params.iceCandidates,
    dtlsParameters: params.dtlsParameters,
    iceServers: params.iceServers,
  };

  const transport = direction === "send"
    ? device!.createSendTransport(transportOptions)
    : device!.createRecvTransport(transportOptions);

  transport.on("connect", ({ dtlsParameters }, callback, errback) => {
    request("connect-transport", { transportId: transport.id, dtlsParameters })
      .then(() => callback())
      .catch(errback);
  });

  if (direction === "send") {
    transport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      request<{ producerId: string }>("produce", { transportId: transport.id, kind, rtpParameters, appData })
        .then(({ producerId }) => callback({ id: producerId }))
        .catch(errback);
    });
  }

  transport.on("connectionstatechange", (state) => {
    console.info(`[call] ${direction} transport state=${state}`);
    handlers.onIceRestartState?.(state === "disconnected" || state === "failed", direction);
    if (state === "connected") {
      iceRestartAttempts[direction] = 0;
      const timer = iceRestartTimers[direction];
      if (timer) clearTimeout(timer);
      delete iceRestartTimers[direction];
      iceRestartInFlight.delete(direction);
      handlers.onIceRestartState?.(false, direction);
    } else if (state === "failed" || state === "disconnected") {
      scheduleIceRestart(direction, state === "failed" ? 0 : 1_000);
    }
  });

  return transport;
}

export const useCallSocket = () => {
  const connect = async (params: {
    callId: string
    callToken: string
    previousCallToken?: string
    mediaServiceUrl: string
    handlers: CallSocketHandlers
  }): Promise<void> => {
    handlers = params.handlers;
    intentionalClose = true;
    attachNetworkListeners();
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    clearMediaState();
    sessionId = crypto.randomUUID();
    intentionalClose = false;

    const auth = await openSocketAndAuthenticate(params, { sessionId, resume: false, previousToken: params.previousCallToken });
    sessionId = auth.sessionId;
    const handshake = async () => {
      const { rtpCapabilities } = await request<{ rtpCapabilities: unknown }>("get-rtp-capabilities");
      const { Device } = await import("mediasoup-client");
      device = new Device();
      await device.load({ routerRtpCapabilities: rtpCapabilities as never });
      await request("join", { rtpCapabilities: device.rtpCapabilities });
      recvTransport = await setupTransport("recv");
      sendTransport = await setupTransport("send");
    };
    await withTimeout(handshake(), HANDSHAKE_TIMEOUT_MS, `Сервер звонков ${new URL(params.mediaServiceUrl).host} не отвечает.`, () => ws?.close());
    handlers.onConnectedChange?.(true);
  };

  const resume = async (params: {
    callId: string
    callToken: string
    mediaServiceUrl: string
    handlers: CallSocketHandlers
  }): Promise<void> => {
    handlers = params.handlers;
    intentionalClose = false;
    attachNetworkListeners();
    if (!sessionId || !device || !sendTransport || !recvTransport) throw new Error("CALL_SESSION_EXPIRED");
    const auth = await openSocketAndAuthenticate(params, { sessionId, resume: true });
    if (!auth.resumed) throw new Error("CALL_SESSION_EXPIRED");
    if (auth.state) applyRoomState(auth.state);
    for (const timer of Object.values(iceRestartTimers)) if (timer) clearTimeout(timer);
    delete iceRestartTimers.send;
    delete iceRestartTimers.recv;
    iceRestartAttempts.send = 0;
    iceRestartAttempts.recv = 0;
    iceRestartInFlight.clear();
    const restartResults = await Promise.allSettled([
      restartTransportIce("send"),
      restartTransportIce("recv"),
    ]);
    for (const [index, result] of restartResults.entries()) {
      if (result.status === "rejected") {
        const direction = index === 0 ? "send" : "recv";
        console.warn(`[call] ICE restart request failed direction=${direction}; retrying`);
        scheduleIceRestart(direction, 1_000);
      }
    }
    handlers.onConnectedChange?.(true);
  };

  const produce = async (kind: ProducerKind, track: MediaStreamTrack): Promise<void> => {
    if (!sendTransport) throw new Error("Call socket is not connected");

    producers.get(kind)?.close();
    const producer = await sendTransport.produce({
      track,
      appData: { kind },
      // Камера - 3 слоя качества (simulcast): mediasoup сам выбирает, какой слой
      // форвардить каждому конкретному consumer'у по его реальной пропускной
      // способности - на сервере для этого ничего дополнительно писать не нужно,
      // это уже штатное поведение mediasoup при наличии нескольких encodings.
      // Экран - статичный контент с текстом: один слой, выше битрейт и явные codecOptions -
      // без них энкодер браузера сам решает стартовый/потолочный битрейт консервативно,
      // из-за чего текст на экране может оставаться смазанным даже при высоком maxBitrate
      // в encodings (тот только верхний предел, а не подсказка "старайся качественнее").
      ...(kind === "camera"
        ? {
            encodings: [
              { rid: "r0", maxBitrate: 150_000, scaleResolutionDownBy: 4 },
              { rid: "r1", maxBitrate: 700_000, scaleResolutionDownBy: 2 },
              { rid: "r2", maxBitrate: 2_500_000, scaleResolutionDownBy: 1 },
            ],
            // Стартовая подсказка кодировщику: без неё браузер начинает с консервативных
            // ~300-500 kbps и разгоняется слишком медленно, из-за чего первые секунды
            // звонка выглядят заметно мягче/пиксельнее.
            codecOptions: { videoGoogleStartBitrate: 1500, videoGoogleMaxBitrate: 2500, videoGoogleMinBitrate: 300 },
          }
        : {}),
      ...(kind === "screen"
        ? {
            // maxFramerate - без него браузер может сам занизить fps ради экономии битрейта/
            // CPU даже при высоком maxBitrate (тот ограничивает только КАЧЕСТВО кадра, не
            // частоту) - отсюда дёрганая картинка при движении/скролле. Битрейт поднят вместе
            // с ним - 60 fps на том же битрейте, что раньше был для 30, даёт заметно худшую
            // резкость на статичных кадрах.
            encodings: [{ maxBitrate: 8_000_000, maxFramerate: 90 }],
            codecOptions: { videoGoogleStartBitrate: 3000, videoGoogleMaxBitrate: 8000, videoGoogleMinBitrate: 500 },
          }
        : {}),
    });
    producers.set(kind, producer);
  };

  const stopProducing = async (kind: ProducerKind): Promise<void> => {
    producers.get(kind)?.close();
    producers.delete(kind);
    // Закрытие локального producer'а само по себе серверу ничего не сообщает - без этого
    // запроса серверный Producer оставался бы открытым навсегда, а у собеседника - зависший
    // тайл без единого сигнала о том, что поток остановлен (см. handleCloseProducer).
    try {
      await request("close-producer", { kind });
    } catch (e) {
      console.error("Failed to notify server about closed producer:", e);
    }
  };

  const switchGroup = async (group: string | null): Promise<string | null> => {
    const result = await request<{ group: string | null }>("switch-group", { group });
    return result.group;
  };

  const disconnect = (): void => {
    intentionalClose = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "leave" }));
    clearHeartbeat();
    detachNetworkListeners();
    clearMediaState();
    ws?.close();
    ws = null;
    sessionId = null;
    handlers = {};

    // Явно отклоняем, а не просто .clear() - иначе любой ещё не разрешившийся await
    // request(...) (например, close-producer из stopProducing) зависает навсегда, потому
    // что его resolve/reject из pending исчезает вместе с записью, и код после await
    // просто никогда не выполняется.
    for (const waiting of pending.values()) {
      clearTimeout(waiting.timeout);
      waiting.reject(new Error("Call socket disconnected"));
    }
    pending.clear();
  };

  return {
    connect,
    resume,
    produce,
    stopProducing,
    switchGroup,
    disconnect,
    get connected() {
      return ws?.readyState === WebSocket.OPEN;
    },
    get sessionId() {
      return sessionId;
    },
  };
};

import { Device } from "mediasoup-client";
import type { Consumer, DtlsParameters, IceCandidate, IceParameters, Producer, Transport } from "mediasoup-client/types";
import type { ProducerKind } from "~/types/call";

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
  // "intentional" - сами вызвали disconnect() (leave/end у себя). "ended" - звонок
  // завершён владельцем/пуст, сервер закрыл соединение сам (код 4410, см.
  // media-service/src/rooms/Participant.ts) - и то, и другое не должно вызывать реконнект,
  // но "ended" должен увести со страницы звонка, а "intentional" - нет (мы это уже сделали).
  // "unexpected" - разрыв по сети, единственный случай, когда реконнект имеет смысл.
  onConnectedChange?: (connected: boolean, reason?: "intentional" | "ended" | "unexpected") => void
}

const CALL_ENDED_CLOSE_CODE = 4410;

type PendingRequest = {
  resolve: (payload: unknown) => void
  reject: (error: Error) => void
}

let ws: WebSocket | null = null;
let device: Device | null = null;
let sendTransport: Transport | null = null;
let recvTransport: Transport | null = null;
let handlers: CallSocketHandlers = {};
let intentionalClose = false;

const producers = new Map<ProducerKind, Producer>();
const consumers = new Map<string, Map<ProducerKind, Consumer>>();

let reqCounter = 0;
const pending = new Map<string, PendingRequest>();

function wsUrlFrom(mediaServiceUrl: string, token: string): string {
  const url = new URL("/ws", mediaServiceUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("token", token);
  return url.toString();
}

function request<T = unknown>(type: string, payload?: unknown): Promise<T> {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("Call socket is not connected"));
  }

  const reqId = `${Date.now()}-${++reqCounter}`;
  const message = JSON.stringify({ reqId, type, payload });

  return new Promise<T>((resolve, reject) => {
    pending.set(reqId, { resolve: resolve as (p: unknown) => void, reject });
    ws!.send(message);
  });
}

function handleServerMessage(raw: string): void {
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

function handlePush(type: string, payload: unknown): void {
  switch (type) {
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

  return transport;
}

export const useCallSocket = () => {
  const connect = async (params: {
    callId: string
    callToken: string
    mediaServiceUrl: string
    handlers: CallSocketHandlers
  }): Promise<void> => {
    handlers = params.handlers;
    intentionalClose = false;

    // На реконнект (после случайного обрыва) - подчищаем состояние предыдущего
    // соединения перед тем, как строить новое поверх свежего WS/токена.
    sendTransport?.close();
    recvTransport?.close();
    sendTransport = null;
    recvTransport = null;
    producers.clear();
    consumers.clear();

    await new Promise<void>((resolve, reject) => {
      ws = new WebSocket(wsUrlFrom(params.mediaServiceUrl, params.callToken));

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Failed to connect to call socket"));
      ws.onmessage = event => handleServerMessage(String(event.data));
      ws.onclose = (event) => {
        const reason = intentionalClose ? "intentional" : event.code === CALL_ENDED_CLOSE_CODE ? "ended" : "unexpected";

        // Раньше pending-запросы отклонялись только в явном disconnect() - если сервер
        // закрывал сокет сам (например, "комната не найдена", код 4404, или любой другой
        // обрыв не по нашей инициативе) во время ожидания ответа (например,
        // get-rtp-capabilities внутри connect()), этот await зависал навсегда - именно
        // так выглядела "постоянная загрузка" на кнопке "переподключиться".
        for (const { reject } of pending.values()) {
          reject(new Error(`Call socket closed (code ${event.code}): ${event.reason || "no reason"}`));
        }
        pending.clear();

        handlers.onConnectedChange?.(false, reason);
      };
    });

    // Раньше сигнализировали "подключено" сразу по факту открытия голого WS - но сервер
    // проверяет существование комнаты АСИНХРОННО, уже после ws.onopen (см. handleConnection
    // в SignalingServer.ts), и может тут же закрыть соединение (4404 "room not found").
    // onConnectedChange(true) в этот момент преждевременно сбрасывал reconnecting.value в
    // false у вызывающего кода (см. useCall.ts attemptReconnect) - защита от повторного
    // входа снималась ДО того, как стало известно, что соединение вообще-то не удалось,
    // и при следующей же ошибке параллельно стартовал ещё один reconnect - шторм
    // переподключений и мгновенный rate-limit. Сигнализируем "подключено" только когда
    // весь handshake (get-rtp-capabilities, join, оба transport'а) реально завершился.
    const { rtpCapabilities } = await request<{ rtpCapabilities: unknown }>("get-rtp-capabilities");

    device = new Device();
    await device.load({ routerRtpCapabilities: rtpCapabilities as never });

    await request("join", { rtpCapabilities: device.rtpCapabilities });

    recvTransport = await setupTransport("recv");
    sendTransport = await setupTransport("send");

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
              { rid: "r0", maxBitrate: 100_000, scaleResolutionDownBy: 4 },
              { rid: "r1", maxBitrate: 300_000, scaleResolutionDownBy: 2 },
              { rid: "r2", maxBitrate: 900_000, scaleResolutionDownBy: 1 },
            ],
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

    for (const producer of producers.values()) producer.close();
    producers.clear();

    for (const byPeer of consumers.values()) {
      for (const consumer of byPeer.values()) consumer.close();
    }
    consumers.clear();

    sendTransport?.close();
    recvTransport?.close();
    sendTransport = null;
    recvTransport = null;
    device = null;

    ws?.close();
    ws = null;
    handlers = {};

    // Явно отклоняем, а не просто .clear() - иначе любой ещё не разрешившийся await
    // request(...) (например, close-producer из stopProducing) зависает навсегда, потому
    // что его resolve/reject из pending исчезает вместе с записью, и код после await
    // просто никогда не выполняется.
    for (const { reject } of pending.values()) {
      reject(new Error("Call socket disconnected"));
    }
    pending.clear();
  };

  return {
    connect,
    produce,
    stopProducing,
    switchGroup,
    disconnect,
    get connected() {
      return ws?.readyState === WebSocket.OPEN;
    },
  };
};

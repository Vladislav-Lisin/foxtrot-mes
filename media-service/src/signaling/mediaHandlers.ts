import type { DtlsParameters, DtlsState, MediaKind, RtpCapabilities, RtpParameters } from "mediasoup/types";
import type { Room } from "../rooms/Room.js";
import type { Participant, ProducerKind } from "../rooms/Participant.js";
import { config } from "../config.js";
import { notifySpringBoot } from "../webhooks/notifySpringBoot.js";
import { syncGroupAudio, syncVideoWithEveryone } from "./mediaRouting.js";
import { generateTurnCredentials } from "../turn/turnCredentials.js";

export async function handleJoin(
  room: Room,
  participant: Participant,
  payload: { rtpCapabilities: RtpCapabilities }
) {
  participant.rtpCapabilities = payload.rtpCapabilities;
  room.broadcast({ type: "participant-joined", payload: { userId: participant.userId } }, participant.userId);

  // Broadcast выше сообщает ОСТАЛЬНЫМ про нового участника, но не наоборот - сам новичок
  // иначе узнаёт о уже присутствующих только через new-consumer, а тот приходит лишь если
  // у пира УЖЕ есть активный producer (аудио/камера). Если пир ещё ничего не включил -
  // новичок так и не узнаёт о его существовании. Явно шлём снапшот текущего состава.
  for (const peer of room.participants.values()) {
    if (peer.userId === participant.userId) continue;
    participant.send({ type: "participant-joined", payload: { userId: peer.userId } });
  }

  await notifySpringBoot(room.callId, "JOINED", participant.userId);
  return { routerRtpCapabilities: room.router.rtpCapabilities };
}

export function handleGetRtpCapabilities(room: Room) {
  return { rtpCapabilities: room.router.rtpCapabilities };
}

export async function handleCreateTransport(
  room: Room,
  participant: Participant,
  payload: { direction: "send" | "recv" }
) {
  const transport = await room.router.createWebRtcTransport({
    listenIps: [{ ip: config.mediasoup.listenIp, announcedIp: config.mediasoup.announcedIp }],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    // Стартовая оценка полосы для битрейт-контроллера (REMB/transport-cc) - не потолок,
    // тот задаётся per-encoding в produce() (maxBitrate), но заниженное стартовое значение
    // заставляет энкодер дольше "разгоняться" до реального качества в начале потока.
    // Подняли вместе с maxBitrate демонстрации экрана (см. useCallSocket.client.ts).
    initialAvailableOutgoingBitrate: 8_000_000,
  });

  const transportTag = `[ice ${payload.direction} ${transport.id.slice(0, 8)}]`;
  console.log(`${transportTag} created, initial iceState=${transport.iceState}`);
  transport.on("icestatechange", (state) => console.log(`${transportTag} iceState -> ${state}`));
  transport.on("iceselectedtuplechange", () => console.log(`${transportTag} selected ICE tuple changed`));

  transport.on("dtlsstatechange", (state: DtlsState) => {
    console.log(`${transportTag} dtlsState -> ${state}`);
    if (state === "closed") transport.close();
  });

  if (payload.direction === "send") {
    participant.sendTransport?.close();
    participant.sendTransport = transport;
  } else {
    participant.recvTransport?.close();
    participant.recvTransport = transport;
    // получатель готов - подтягиваем всё, что ему уже должно быть видно/слышно
    void syncGroupAudio(room, participant);
    void syncVideoWithEveryone(room, participant);
  }

  // TURN нужен клиенту (браузеру), а не этому серверному transport'у - сервер и так
  // слушает на своём announcedIp, relay нужен только тому, кто не может достучаться до
  // сервера напрямую. Поэтому креденшлы идут в ответ клиенту, а не в createWebRtcTransport.
  const turnServer = generateTurnCredentials(participant.userId);

  // Без STUN у клиента за NAT (почти любой телефон на мобильной сети, большинство
  // домашних роутеров) ICE может собрать только "host"-кандидаты - свои же локальные IP,
  // до которых снаружи не достучаться. STUN бесплатный и не требует своей инфраструктуры -
  // отдаём его ВСЕГДА, а TURN (relay) добавляем поверх, если он сконфигурирован (см.
  // coturn/TURN_HOST/TURN_SECRET) - без TURN звонок всё ещё может не пройти при жёстком/
  // симметричном NAT с обеих сторон (типично для мобильных операторов).
  const iceServers = [...(config.stunUrls.length ? [{ urls: config.stunUrls }] : []), ...(turnServer ? [turnServer] : [])];

  return {
    transportId: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    iceServers,
  };
}

export async function handleRestartIce(
  _room: Room,
  participant: Participant,
  payload: { direction: "send" | "recv" },
) {
  if (payload.direction !== "send" && payload.direction !== "recv") throw new Error("Invalid transport direction");
  const transport = payload.direction === "send" ? participant.sendTransport : participant.recvTransport;
  if (!transport || transport.closed) throw new Error(`${payload.direction} transport is not available`);
  console.info(`[ice] restart requested direction=${payload.direction}`);
  const iceParameters = await transport.restartIce();
  console.info(`[ice] restart prepared direction=${payload.direction}`);
  return { iceParameters };
}

export async function handleConnectTransport(
  room: Room,
  participant: Participant,
  payload: { transportId: string; dtlsParameters: DtlsParameters }
) {
  const transport = [participant.sendTransport, participant.recvTransport].find((t) => t?.id === payload.transportId);
  if (!transport) throw new Error(`Unknown transport: ${payload.transportId}`);

  await transport.connect({ dtlsParameters: payload.dtlsParameters });
  return {};
}

export async function handleProduce(
  room: Room,
  participant: Participant,
  payload: { transportId: string; kind: MediaKind; rtpParameters: RtpParameters; appData?: { kind?: ProducerKind } }
) {
  const transport = participant.sendTransport;
  if (!transport || transport.id !== payload.transportId) {
    throw new Error("Send transport is not ready");
  }

  const producerKind: ProducerKind = payload.appData?.kind ?? (payload.kind === "audio" ? "audio" : "camera");

  // Решение: один активный показ экрана на комнату одновременно (как в большинстве
  // митинг-приложений по умолчанию) - иначе несколько одновременных демонстраций будут
  // конкурировать за внимание в сетке участников. Кидаем ошибку до produce - клиент
  // получит её в reject промиса sendTransport.produce().
  if (producerKind === "screen") {
    const activeSharer = [...room.participants.values()].find(
      (p) => p.userId !== participant.userId && p.producers.has("screen")
    );
    if (activeSharer) {
      throw new Error(`Screen is already being shared by ${activeSharer.userId}`);
    }
  }

  // повторный produce того же вида (например, перезапуск камеры) - закрываем старый
  participant.producers.get(producerKind)?.close();

  const producer = await transport.produce({
    kind: payload.kind,
    rtpParameters: payload.rtpParameters,
    appData: { kind: producerKind },
  });
  participant.producers.set(producerKind, producer);

  // Проверяем, реально ли текут байты (а не просто успешно создался объект Producer) -
  // 0 байт после нескольких секунд значит проблема на уровне ICE/DTLS/сети, а не сигнализации.
  for (const delayMs of [3000, 10000]) {
    setTimeout(() => {
      if (producer.closed) return;
      producer.getStats()
        .then((stats) => console.log(`[stats +${delayMs}ms] producer ${producer.id} (${producerKind}):`, JSON.stringify(stats)))
        .catch((e) => console.error(`[stats] failed for producer ${producer.id}:`, e));
    }, delayMs);
  }

  producer.on("transportclose", () => {
    participant.producers.delete(producerKind);
  });

  if (producerKind === "audio") {
    await room.audioLevelObserver.addProducer({ producerId: producer.id });
    await syncGroupAudio(room, participant);
  } else if (producerKind === "screenAudio") {
    // Звук демонстрации маршрутизируется как микрофон - только своя группа (см. syncGroupAudio).
    await syncGroupAudio(room, participant);
  } else {
    await syncVideoWithEveryone(room, participant);
    room.broadcast({ type: "new-producer", payload: { userId: participant.userId, kind: producerKind } }, participant.userId);
  }

  return { producerId: producer.id };
}

// Раньше клиент при "остановить демонстрацию/камеру/микрофон" закрывал только СВОЙ,
// локальный mediasoup-client Producer - это не сообщает об этом серверу вообще никак.
// Серверный Producer оставался открытым навсегда, вместе со всеми Consumer'ами на него у
// остальных - те просто переставали получать RTP (зависший/чёрный кадр), но никогда не
// получали "producerclose"/consumer-closed, и тайл на их экране не убирался. А при
// повторном produce() того же вида (например, новый показ экрана) закрытие СТАРОГО
// server-side Producer'а (см. handleProduce) гонялось асинхронно с созданием нового
// Consumer'а на него - отсюда "работает через раз" при перезапуске демонстрации.
export async function handleCloseProducer(
  room: Room,
  participant: Participant,
  payload: { kind: ProducerKind }
) {
  const producer = participant.producers.get(payload.kind);
  if (!producer) return {};

  producer.close(); // каскадно закрывает и Consumer'ы остальных на него (событие producerclose)
  participant.producers.delete(payload.kind);

  return {};
}

export async function handleResumeConsumer(
  room: Room,
  participant: Participant,
  payload: { peerUserId: string; kind: ProducerKind }
) {
  const consumer = participant.consumers.get(payload.peerUserId)?.get(payload.kind);
  if (!consumer) throw new Error("Unknown consumer");

  await consumer.resume();

  // Consumer создаётся на паузе (см. createConsumerFor) - без явного запроса keyframe
  // декодер остаётся на пустом/чёрном кадре, пока источник не пришлёт следующий keyframe
  // сам по себе. Для камеры кодек шлёт их регулярно (пара секунд), а для демонстрации
  // статичного экрана следующий keyframe может не прийти вообще, если картинка не меняется -
  // отсюда "у собеседника чёрный экран" при показе.
  //
  // ОДИН запрос ненадёжен: сразу после resume ICE/DTLS у слушателя может быть ещё не до
  // конца устаканен (особенно на STUN/TURN-путях с реальным NAT, а не в локальной сети) -
  // сам keyframe-request (RTCP PLI серверу-продьюсеру) или ответный keyframe могут потеряться
  // как обычные UDP-пакеты. Раньше это не проявлялось на локальных тестах (без потерь пакетов
  // на LAN), но стало видно на реальных сетях. Повторяем запрос несколько раз в течение
  // нескольких секунд - недорого (это просто RTCP FIR/PLI, не сам поток), а шанс permanently
  // чёрного экрана падает многократно.
  if (payload.kind !== "audio") {
    for (const delayMs of [0, 500, 1500, 3000]) {
      setTimeout(() => {
        if (consumer.closed) return;
        consumer.requestKeyFrame().catch((e) => console.error(`[keyframe] request failed for consumer ${consumer.id}:`, e));
      }, delayMs);
    }
  }

  return {};
}

import type { Room } from "../rooms/Room.js";
import type { Participant, ProducerKind } from "../rooms/Participant.js";
import { notifySpringBoot } from "../webhooks/notifySpringBoot.js";

/**
 * Ядро фичи с цветовыми группами (см. Foxtrot Calls - Roadmap, §4 и §6.4).
 *
 * Идея в одном предложении: одна SFU-комната на весь звонок, изоляция звука - это вопрос
 * того, кто на чей Producer подписан (Consumer), а не отдельных "под-комнат". Переключение
 * группы - пересборка подписок для одного участника, без пересоздания Transport и без
 * ICE-рестарта, поэтому ощущается мгновенно.
 *
 * Видео (camera/screen) в этой логике не участвует - оно видно всем в звонке независимо
 * от группы (см. решение в roadmap, этап 4), см. syncVideoWithEveryone ниже.
 */

async function createConsumerFor(
  room: Room,
  listener: Participant,
  speaker: Participant,
  kind: ProducerKind
): Promise<void> {
  if (listener.consumers.get(speaker.userId)?.has(kind)) return; // уже подписан

  const producer = speaker.producers.get(kind);
  if (!producer) return; // говорящий ещё не включил соответствующий поток

  if (!listener.recvTransport || !listener.rtpCapabilities) return; // слушатель ещё не готов

  if (!room.router.canConsume({ producerId: producer.id, rtpCapabilities: listener.rtpCapabilities })) {
    return;
  }

  // Резервируем слот СРАЗУ, до await consume() - синхронизация запускается из нескольких
  // независимых мест (recvTransport готов / кто-то произвёл поток / кто-то переключил
  // группу), и они легко накладываются друг на друга по времени (пиры почти одновременно
  // подключаются/что-то включают). Без резервации оба конкурентных вызова проходят проверку
  // выше ДО того, как первый успевает дописать Consumer в listener.consumers, и оба начинают
  // создавать свой Consumer на один и тот же Producer - в лучшем случае лишняя работа, в
  // худшем один из них так и остаётся никем не resumed, и звук/видео с этого пира не идёт,
  // пока что-то ещё не перезапустит синхронизацию (отсюда "заработало только после того,
  // как собеседник тоже что-то включил").
  const pendingKey = `${speaker.userId}:${kind}`;
  if (listener.pendingConsumes.has(pendingKey)) return;
  listener.pendingConsumes.add(pendingKey);

  try {
    const consumer = await listener.recvTransport.consume({
      producerId: producer.id,
      rtpCapabilities: listener.rtpCapabilities,
      // клиент сам резюмирует явным resume-consumer, когда реально готов принимать
      paused: true,
    });

    let byPeer = listener.consumers.get(speaker.userId);
    if (!byPeer) {
      byPeer = new Map();
      listener.consumers.set(speaker.userId, byPeer);
    }
    byPeer.set(kind, consumer);

    consumer.on("producerclose", () => {
      byPeer!.delete(kind);
      listener.send({ type: "consumer-closed", payload: { peerUserId: speaker.userId, kind } });
    });

    consumer.on("layerschange", (layers) => {
      console.info(`[quality] consumer layer updated spatial=${layers?.spatialLayer ?? "none"} temporal=${layers?.temporalLayer ?? "none"}`);
    });

    listener.send({
      type: "new-consumer",
      payload: {
        peerUserId: speaker.userId,
        kind,
        consumerId: consumer.id,
        producerId: producer.id,
        rtpParameters: consumer.rtpParameters,
      },
    });
  } finally {
    listener.pendingConsumes.delete(pendingKey);
  }
}

// Promise.all тут не годится: одна упавшая пара (например, слушатель отключился прямо
// посреди synca) обрывает await у ВСЕХ остальных пар в этой же пачке разом - они просто
// не досоздаются, хотя сами по себе были бы в полном порядке. allSettled гарантирует, что
// падение одной пары не заденет остальные, а ошибку хотя бы видно в логах, а не тихо теряется
// в fire-and-forget вызовах (void syncGroupAudio(...) и т.п. в mediaHandlers.ts).
async function settleAll(promises: Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(promises);
  for (const r of results) {
    if (r.status === "rejected") console.error("[mediaRouting] createConsumerFor failed:", r.reason);
  }
}

function closeConsumerFor(listener: Participant, speakerUserId: string, kind: ProducerKind): void {
  const byPeer = listener.consumers.get(speakerUserId);
  const consumer = byPeer?.get(kind);
  if (!consumer) return;

  consumer.close();
  byPeer!.delete(kind);
  listener.send({ type: "consumer-closed", payload: { peerUserId: speakerUserId, kind } });
}

/**
 * Звук - только текущая группа участника (null - тоже группа, общая для всех "без команды").
 * screenAudio (звук демонстрации) озвучивается так же, как микрофон - демонстрация ВИДНА
 * всем (см. syncVideoWithEveryone), но СЛЫШНА только своей группе.
 */
export async function syncGroupAudio(room: Room, participant: Participant): Promise<void> {
  const peers = room.membersOf(participant.group, participant.userId);
  await settleAll(
    peers.flatMap((peer) => [
      createConsumerFor(room, participant, peer, "audio"),
      createConsumerFor(room, peer, participant, "audio"),
      createConsumerFor(room, participant, peer, "screenAudio"),
      createConsumerFor(room, peer, participant, "screenAudio"),
    ])
  );
}

/**
 * Видео и демонстрация экрана (картинка) - видно всем участникам звонка, группы не
 * касаются. Звук демонстрации (screenAudio) сюда НЕ входит - он озвучивается по группам,
 * так же как микрофон (см. syncGroupAudio) - решение по продукту: демонстрация видна всем,
 * но слышна только своей команде, идентично голосу.
 */
export async function syncVideoWithEveryone(room: Room, participant: Participant): Promise<void> {
  const peers = [...room.participants.values()].filter((p) => !p.isDetached && p.userId !== participant.userId);
  await settleAll(
    peers.flatMap((peer) => [
      createConsumerFor(room, participant, peer, "camera"),
      createConsumerFor(room, peer, participant, "camera"),
      createConsumerFor(room, participant, peer, "screen"),
      createConsumerFor(room, peer, participant, "screen"),
    ])
  );
}

/**
 * Переключение цветовой группы. Единственное, что меняется - аудио-подписки этого
 * участника и симметрично тех, кого он покидает/к кому присоединяется. Видео не трогаем.
 */
export async function applyGroupChange(room: Room, participant: Participant, newGroup: string | null): Promise<void> {
  const oldGroup = participant.group;
  if (oldGroup === newGroup) return;

  const leaving = room.membersOf(oldGroup, participant.userId);
  participant.group = newGroup; // фиксируем сразу - membersOf(newGroup, ...) у остальных уже видит его

  for (const peer of leaving) {
    closeConsumerFor(participant, peer.userId, "audio");
    closeConsumerFor(peer, participant.userId, "audio");
    closeConsumerFor(participant, peer.userId, "screenAudio");
    closeConsumerFor(peer, participant.userId, "screenAudio");
  }

  await syncGroupAudio(room, participant);

  room.broadcast({ type: "group-changed", payload: { userId: participant.userId, group: newGroup } });
  // не await - историческая запись в Postgres не должна задерживать ощущение "мгновенно"
  void notifySpringBoot(room.callId, "GROUP_CHANGED", participant.userId, newGroup);
}

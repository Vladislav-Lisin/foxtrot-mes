import type { AudioLevelObserver, Router } from "mediasoup/types";
import { Participant } from "./Participant.js";

export class Room {
  readonly callId: string;
  readonly router: Router;
  readonly audioLevelObserver: AudioLevelObserver;
  readonly participants = new Map<string, Participant>();

  private currentSpeakerId: string | null = null;

  constructor(callId: string, router: Router, audioLevelObserver: AudioLevelObserver) {
    this.callId = callId;
    this.router = router;
    this.audioLevelObserver = audioLevelObserver;

    // "volumes" - самый громкий говорящий раз в интервал (см. RoomManager - настройки
    // порога/интервала), "silence" - все ниже порога. Меняем только на реальную смену
    // говорящего, чтобы не спамить клиентов событием на каждый тик.
    this.audioLevelObserver.on("volumes", (volumes) => {
      const loudest = volumes[0]?.producer;
      if (!loudest) return;
      const speaker = [...this.participants.values()].find((p) => p.producers.get("audio")?.id === loudest.id);
      this.setSpeaker(speaker?.userId ?? null);
    });

    this.audioLevelObserver.on("silence", () => {
      this.setSpeaker(null);
    });
  }

  private setSpeaker(userId: string | null): void {
    if (this.currentSpeakerId === userId) return;
    const previous = this.currentSpeakerId;
    this.currentSpeakerId = userId;

    if (previous) {
      this.broadcast({ type: "speaking-changed", payload: { userId: previous, speaking: false } });
    }
    if (userId) {
      this.broadcast({ type: "speaking-changed", payload: { userId, speaking: true } });
    }
  }

  addParticipant(participant: Participant): void {
    this.participants.set(participant.userId, participant);
  }

  /** Закрывает Transport'ы участника (это каскадно закрывает и его Producer'ы, и Consumer'ы
   *  других на них), убирает его из комнаты и чистит "висящие" подписки остальных на него. */
  removeParticipant(userId: string): Participant | undefined {
    const participant = this.participants.get(userId);
    if (!participant) return undefined;

    participant.close();
    this.participants.delete(userId);

    if (this.currentSpeakerId === userId) {
      this.setSpeaker(null);
    }

    for (const other of this.participants.values()) {
      other.consumers.delete(userId);
    }

    // Раньше это уведомление слали только тем, у кого был активный Consumer на ушедшего -
    // но участник может быть виден остальным просто как "плейсхолдер" по participant-joined
    // (см. handleJoin) без единого реального Producer'а, и тогда consumers.delete() всегда
    // возвращал false, а тайл так и оставался висеть у всех после ухода.
    this.broadcast({ type: "participant-left", payload: { userId } });

    return participant;
  }

  get isEmpty(): boolean {
    return this.participants.size === 0;
  }

  broadcast(message: Record<string, unknown>, exceptUserId?: string): void {
    for (const participant of this.participants.values()) {
      if (participant.userId !== exceptUserId) {
        participant.send(message);
      }
    }
  }

  /** Все участники (кроме excludeUserId) с указанной группой - null тоже валидная группа. */
  membersOf(group: string | null, excludeUserId: string): Participant[] {
    return [...this.participants.values()].filter(
      (p) => p.userId !== excludeUserId && p.group === group
    );
  }

  close(): void {
    for (const participant of this.participants.values()) {
      participant.close();
    }
    // Закрытие Router'а каскадно закрывает и AudioLevelObserver, который на нём создан.
    this.router.close();
  }
}

import type { WebSocket } from "ws";
import type { Consumer, Producer, RtpCapabilities, WebRtcTransport } from "mediasoup/types";

// audio/camera/screen/screenAudio - максимум по одному Producer каждого вида на участника
// одновременно. screenAudio - системный/вкладочный звук вместе с демонстрацией экрана,
// отдельный от микрофона (audio) - маршрутизируется как видео (всем, не по группам).
export type ProducerKind = "audio" | "camera" | "screen" | "screenAudio";

export class Participant {
  readonly userId: string;
  private readonly ws: WebSocket;

  // null - "без группы" (дефолт), это тоже валидное значение группы само по себе:
  // все участники с group === null слышат друг друга как в обычном звонке без команд.
  group: string | null = null;

  rtpCapabilities?: RtpCapabilities;
  sendTransport?: WebRtcTransport;
  recvTransport?: WebRtcTransport;

  readonly producers = new Map<ProducerKind, Producer>();
  // на кого Я подписан: remoteUserId -> (вид потока -> Consumer)
  readonly consumers = new Map<string, Map<ProducerKind, Consumer>>();
  // "speakerId:kind", для которых прямо сейчас идёт createConsumerFor (см. mediaRouting.ts) -
  // резервирует слот ДО завершения асинхронного consume(), иначе два параллельных триггера
  // синхронизации (например, "я только что подключил recvTransport" и "собеседник только что
  // включил микрофон", случившиеся почти одновременно) оба проходят проверку "уже подписан"
  // до того, как первый успел дописать в consumers, и создают Consumer'ы вдвоём наперегонки.
  readonly pendingConsumes = new Set<string>();

  constructor(userId: string, ws: WebSocket) {
    this.userId = userId;
    this.ws = ws;
  }

  send(message: Record<string, unknown>): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  close(): void {
    this.sendTransport?.close();
    this.recvTransport?.close();
    this.producers.clear();
    this.consumers.clear();

    // Раньше тут не закрывался сам ws - при принудительном Room.close() (звонок завершён
    // владельцем) у остальных участников соединение просто зависало без единого события:
    // клиент не получал ни onclose, ни какой-либо сигнал, что что-то произошло, и оставался
    // повиснуть на странице звонка. Код 4410 - см. useCallSocket.client.ts, отличает
    // "звонок завершён" от обрыва сети (после которого имеет смысл переподключаться).
    if (this.ws.readyState === this.ws.OPEN || this.ws.readyState === this.ws.CONNECTING) {
      this.ws.close(4410, "Call ended");
    }
  }
}

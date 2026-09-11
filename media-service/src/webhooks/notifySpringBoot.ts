import { config } from "../config.js";

export type CallEventType = "JOINED" | "LEFT" | "ROOM_EMPTY" | "GROUP_CHANGED";

/**
 * Сообщает Spring Boot о событии участника - тело и заголовок X-Internal-Secret
 * ровно те, что ждёт CallWebhookController + InternalServiceAuthFilter на Java-стороне.
 * Ошибка здесь не должна ронять сигнальный поток - звонок должен продолжать работать,
 * даже если Spring Boot временно недоступен; просто логируем.
 *
 * group используется только для GROUP_CHANGED - пишется в CallParticipant.groupTag как
 * исторический снимок, живая маршрутизация звука на это никак не завязана (см.
 * media-service/src/signaling/mediaRouting.ts - там источник истины на время звонка).
 */
export async function notifySpringBoot(
  callId: string,
  type: CallEventType,
  userId?: string,
  group?: string | null
): Promise<void> {
  try {
    const res = await fetch(`${config.springBootInternalUrl}/internal/calls/${callId}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": config.internalSecret,
      },
      body: JSON.stringify({ type, userId, group }),
    });

    if (!res.ok) {
      console.error(`notifySpringBoot: ${type} for call ${callId} responded with ${res.status}`);
    }
  } catch (err) {
    console.error(`notifySpringBoot: ${type} for call ${callId} failed`, err);
  }
}

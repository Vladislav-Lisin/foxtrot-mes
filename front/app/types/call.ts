export type CallStatus = "RINGING" | "ACTIVE" | "ENDED"

// Зеркало CallResponse.java
export type CallResponse = {
  callId: string
  chatId: string | null
  ownerId: string
  joinCode: string | null
  status: CallStatus
  startedAt: string
  // null в ответе на getCall (просмотр до входа) - токен выдаётся только на реальном join
  callToken: string | null
  mediaServiceUrl: string
  roomId: string | null
}

// Зеркало CallNotification.java - пуш по STOMP /user/queue/calls
export type CallNotification = {
  callId: string
  chatId: string | null
  ownerId: string
  status: CallStatus
}

// audio/camera/screen/screenAudio - см. media-service/src/rooms/Participant.ts.
// screenAudio - системный/вкладочный звук вместе с демонстрацией экрана, отдельный producer
// от микрофона (audio), потому что у него другая маршрутизация - виден всем как видео
// демонстрации, а не только своей цветовой группе (см. syncVideoWithEveryone).
export type ProducerKind = "audio" | "camera" | "screen" | "screenAudio"

export type CallParticipantState = {
  userId: string
  group: string | null
  tracks: Partial<Record<ProducerKind, MediaStreamTrack>>
  speaking: boolean
}

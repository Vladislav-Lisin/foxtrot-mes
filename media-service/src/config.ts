import "dotenv/config";
import os from "node:os";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

export const config = {
  httpPort: Number(process.env.PORT ?? 4000),

  // Совпадает с call.jwt.secret на стороне Spring Boot - см. CallTokenService.java
  callJwtSecret: required("CALL_JWT_SECRET"),

  // Общий секрет для обеих сторон внутренней связи с Spring Boot (POST/DELETE /rooms
  // сюда, и вебхуки /internal/calls/*/events отсюда)
  internalSecret: required("MEDIA_SERVICE_INTERNAL_SECRET"),
  springBootInternalUrl: process.env.SPRING_BOOT_INTERNAL_URL ?? "http://localhost:8080",
  callSessionGraceMs: positiveInteger("CALL_SESSION_GRACE_SECONDS", 45) * 1000,
  emptyRoomRetentionMs: positiveInteger("CALL_ROOM_IDLE_SECONDS", 120) * 1000,
  websocketHeartbeatIntervalMs: positiveInteger("WS_HEARTBEAT_INTERVAL_MS", 10_000),
  websocketHeartbeatTimeoutMs: positiveInteger("WS_HEARTBEAT_TIMEOUT_MS", 30_000),

  mediasoup: {
    numWorkers: Number(process.env.MEDIASOUP_NUM_WORKERS || os.cpus().length),
    rtcMinPort: Number(process.env.MEDIASOUP_RTC_MIN_PORT ?? 40000),
    rtcMaxPort: Number(process.env.MEDIASOUP_RTC_MAX_PORT ?? 49999),
    listenIp: process.env.MEDIASOUP_LISTEN_IP ?? "0.0.0.0",
    // undefined в локальной разработке; в проде обязателен (публичный IP сервера)
    announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
  },

  // TURN нужен клиентам за строгим NAT/файрволом, которым прямой UDP до media-service
  // недоступен - без него для них звонок просто не соединится (см. Foxtrot Calls -
  // Roadmap, §6.6). Оба undefined - клиенты получат transport вообще без iceServers
  // (см. auth/turnCredentials.ts) - работает только пока прямое соединение возможно,
  // это нормально для локальной разработки, но не для прода.
  turn: {
    host: process.env.TURN_HOST || undefined,
    // Тот же static-auth-secret, что задан в конфиге самого coturn (--static-auth-secret)
    secret: process.env.TURN_SECRET || undefined,
    udpPort: Number(process.env.TURN_UDP_PORT ?? 3478),
    tlsPort: Number(process.env.TURN_TLS_PORT ?? 5349),
  },
  stunUrls: (process.env.STUN_URLS ?? "stun:stun.l.google.com:19302")
    .split(",").map((url) => url.trim()).filter(Boolean),
};

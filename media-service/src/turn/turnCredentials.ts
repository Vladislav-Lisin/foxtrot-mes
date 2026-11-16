import crypto from "node:crypto";
import { config } from "../config.js";

export interface IceServerConfig {
  urls: string[];
  username: string;
  credential: string;
}

const DEFAULT_TTL_SECONDS = 3600;

/**
 * Короткоживущие TURN-креденшлы по стандарту "REST API For Access To TURN Services"
 * (username = "<expiryUnixTs>:<userId>", credential = base64(HMAC-SHA1(secret, username))) -
 * тот же static-auth-secret, что задан coturn'у через --static-auth-secret, coturn
 * проверяет их сам, не дёргая обратно ни media-service, ни Spring Boot.
 *
 * Возвращает null, если TURN не сконфигурирован (локальная разработка без coturn) -
 * тогда клиент просто не получит iceServers и будет работать только на прямом соединении.
 */
export function generateTurnCredentials(userId: string, ttlSeconds = DEFAULT_TTL_SECONDS): IceServerConfig | null {
  if (!config.turn.host || !config.turn.secret) return null;

  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const username = `${expiry}:${userId}`;
  const credential = crypto.createHmac("sha1", config.turn.secret).update(username).digest("base64");

  return {
    urls: [
      `turn:${config.turn.host}:${config.turn.udpPort}?transport=udp`,
      `turn:${config.turn.host}:${config.turn.udpPort}?transport=tcp`,
      `turns:${config.turn.host}:${config.turn.tlsPort}?transport=tcp`,
    ],
    username,
    credential,
  };
}

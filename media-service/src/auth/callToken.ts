import jwt from "jsonwebtoken";
import { config } from "../config.js";

export interface CallTokenPayload {
  userId: string;
  callId: string;
}

/**
 * Проверяет callToken, выпущенный Spring Boot'ом (CallTokenService.generate):
 * sub = userId, claim "callId" = callId, подписан call.jwt.secret (= CALL_JWT_SECRET здесь).
 * Кидает исключение на невалидной подписи/истёкшем токене - вызывающий код должен это ловить.
 */
export function verifyCallToken(token: string, allowExpired = false): CallTokenPayload {
  const decoded = jwt.verify(token, config.callJwtSecret, { ignoreExpiration: allowExpired }) as jwt.JwtPayload;

  const userId = decoded.sub;
  const callId = decoded.callId;

  if (typeof userId !== "string" || typeof callId !== "string") {
    throw new Error("Malformed call token: missing sub/callId");
  }

  return { userId, callId };
}

/** Untrusted identity hint; callers must verify the signature before accepting it. */
export function readCallTokenIdentity(token: string): CallTokenPayload | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string") return null;
  const userId = decoded.sub;
  const callId = decoded.callId;
  return typeof userId === "string" && typeof callId === "string" ? { userId, callId } : null;
}

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
export function verifyCallToken(token: string): CallTokenPayload {
  const decoded = jwt.verify(token, config.callJwtSecret) as jwt.JwtPayload;

  const userId = decoded.sub;
  const callId = decoded.callId;

  if (typeof userId !== "string" || typeof callId !== "string") {
    throw new Error("Malformed call token: missing sub/callId");
  }

  return { userId, callId };
}

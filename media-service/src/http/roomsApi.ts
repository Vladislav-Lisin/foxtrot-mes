import express, { type NextFunction, type Request, type Response } from "express";
import { config } from "../config.js";
import * as roomManager from "../rooms/RoomManager.js";

export const roomsRouter = express.Router();

// Та же защита, что и в обратную сторону (см. InternalServiceAuthFilter на Java) - общий
// секрет в заголовке, не пользовательский JWT. Эти роуты вызывает только Spring Boot.
function checkInternalSecret(req: Request, res: Response, next: NextFunction): void {
  if (req.header("X-Internal-Secret") !== config.internalSecret) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
}

roomsRouter.use(checkInternalSecret);

// Вызывается из MediaServiceClient.createRoom(callId) при старте звонка.
roomsRouter.post("/rooms", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { callId } = req.body as { callId?: string };
    if (!callId) {
      res.status(400).json({ message: "callId is required" });
      return;
    }

    await roomManager.createRoom(callId);
    // roomId = callId - см. комментарий в RoomManager.ts
    res.status(201).json({ roomId: callId });
  } catch (err) {
    next(err);
  }
});

// Удаление участника создателем (MediaServiceClient.kickParticipant).
roomsRouter.post("/rooms/:callId/kick", (req: Request<{ callId: string }>, res: Response) => {
  const { userId } = req.body as { userId?: string };
  const room = roomManager.getRoom(req.params.callId);
  const participant = userId ? room?.participants.get(userId) : undefined;
  if (participant && room) {
    participant.kick();
    room.removeParticipant(participant.userId);
  }
  res.status(204).send();
});

// Вызывается из MediaServiceClient.closeRoom(callId) при принудительном завершении звонка.
roomsRouter.delete("/rooms/:callId", (req: Request<{ callId: string }>, res: Response) => {
  roomManager.closeRoom(req.params.callId);
  res.status(204).send();
});

import { createRouter } from "../mediasoup/workers.js";
import { Room } from "./Room.js";

// Один звонок = один Router = одна запись здесь. roomId намеренно равен callId - отдельный
// генерируемый идентификатор не нужен, у звонка и так ровно одна комната (см. Foxtrot Calls -
// Roadmap, §4: изоляция звука по группам - это подписки, а не отдельные "под-комнаты").
const rooms = new Map<string, Room>();

export async function createRoom(callId: string): Promise<Room> {
  if (rooms.has(callId)) {
    throw new Error(`Room already exists for call ${callId}`);
  }
  const router = await createRouter();
  // maxEntries: 1 - нужен только самый громкий, threshold в дБ - типичный порог для речи,
  // interval - как часто проверять; см. Room.ts, где эти события превращаются в
  // редкое "speaking-changed" (только на смену говорящего, не на каждый тик).
  const audioLevelObserver = await router.createAudioLevelObserver({
    maxEntries: 1,
    threshold: -70,
    interval: 800,
  });
  const room = new Room(callId, router, audioLevelObserver);
  rooms.set(callId, room);
  return room;
}

export function getRoom(callId: string): Room | undefined {
  return rooms.get(callId);
}

export function closeRoom(callId: string): void {
  const room = rooms.get(callId);
  if (!room) return;
  room.close();
  rooms.delete(callId);
}

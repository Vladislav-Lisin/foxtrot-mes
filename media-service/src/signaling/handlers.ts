import type { Room } from "../rooms/Room.js";
import type { Participant } from "../rooms/Participant.js";
import {
  handleCloseProducer,
  handleConnectTransport,
  handleCreateTransport,
  handleGetRtpCapabilities,
  handleJoin,
  handleProduce,
  handleResumeConsumer,
  handleRestartIce,
} from "./mediaHandlers.js";
import { handleSwitchGroup } from "./switchGroupHandler.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (room: Room, participant: Participant, payload: any) => Promise<unknown> | unknown;

// Протокол сигнализации - см. Foxtrot Calls - Roadmap, §6.3. "consume" как отдельная
// клиентская команда сознательно не заведена: сервер сам решает, кого с кем соединять
// (это и есть весь смысл групп/switch-group), и проактивно шлёт new-consumer; клиент
// только резюмирует через resume-consumer, когда готов принимать.
const handlers: Record<string, Handler> = {
  join: handleJoin,
  "get-rtp-capabilities": handleGetRtpCapabilities,
  "create-transport": handleCreateTransport,
  "connect-transport": handleConnectTransport,
  produce: handleProduce,
  "close-producer": handleCloseProducer,
  "resume-consumer": handleResumeConsumer,
  "restart-ice": handleRestartIce,
  "switch-group": handleSwitchGroup,
};

export async function dispatch(type: string, room: Room, participant: Participant, payload: unknown): Promise<unknown> {
  const handler = handlers[type];
  if (!handler) {
    throw new Error(`Unknown command: ${type}`);
  }
  return handler(room, participant, payload);
}

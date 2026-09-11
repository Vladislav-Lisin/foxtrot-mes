import type { Room } from "../rooms/Room.js";
import type { Participant } from "../rooms/Participant.js";
import { applyGroupChange } from "./mediaRouting.js";

export async function handleSwitchGroup(room: Room, participant: Participant, payload: { group: string | null }) {
  await applyGroupChange(room, participant, payload.group ?? null);
  return { group: participant.group };
}

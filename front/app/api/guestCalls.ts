import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";
import type { CallResponse } from "~/types/call";

/** Guest join endpoint used to refresh a call token after the media session expires. */
export const guestJoinCall = async (callId: string, password: string | null, name: string) => {
  const response = await fetch(`${apiBase()}/calls/${callId}/guest-join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password, name }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось войти в конференцию"));
  }

  return (await response.json()) as CallResponse;
};

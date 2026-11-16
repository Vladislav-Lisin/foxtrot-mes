import { secureFetch } from "./auth";
import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";
import type { CallResponse } from "~/types/call";

export async function joinCallWithPassword(callId: string, password: string): Promise<CallResponse> {
  const response = await secureFetch(`${apiBase()}/calls/${callId}/join`, {
    method: "POST",
    body: JSON.stringify({ password }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось присоединиться к звонку"));
  }

  return (await response.json()) as CallResponse;
}

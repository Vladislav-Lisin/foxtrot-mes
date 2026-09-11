import { secureFetch } from "./auth";
import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";
import type { CallResponse } from "~/types/call";

// Зеркало CallController.java

export const startCall = async (chatId?: string) => {
  const response = await secureFetch(`${apiBase()}/calls`, {
    method: "POST",
    body: JSON.stringify({ chatId: chatId ?? null }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось начать звонок"));
  }

  return (await response.json()) as CallResponse;
};

export const getCall = async (callId: string) => {
  const response = await secureFetch(`${apiBase()}/calls/${callId}`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось получить данные звонка"));
  }

  return (await response.json()) as CallResponse;
};

// null, если в чате сейчас нет активного звонка (204 No Content)
export const getActiveCallForChat = async (chatId: string): Promise<CallResponse | null> => {
  const response = await secureFetch(`${apiBase()}/calls/active-by-chat/${chatId}`, {
    method: "GET",
  });

  if (response.status === 204) return null;
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось проверить активный звонок"));
  }

  return (await response.json()) as CallResponse;
};

export const joinCall = async (callId: string) => {
  const response = await secureFetch(`${apiBase()}/calls/${callId}/join`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось присоединиться к звонку"));
  }

  return (await response.json()) as CallResponse;
};

export const leaveCall = async (callId: string) => {
  const response = await secureFetch(`${apiBase()}/calls/${callId}/leave`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось выйти из звонка"));
  }
};

export const endCall = async (callId: string) => {
  const response = await secureFetch(`${apiBase()}/calls/${callId}/end`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось завершить звонок"));
  }
};

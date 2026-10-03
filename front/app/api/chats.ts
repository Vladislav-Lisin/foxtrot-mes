import { secureFetch } from "./auth";
import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";
import { prepareImageForUpload } from "./imageCompress";
import type { ChatFinderResponse, ChatPreviewDTO, GetChatHistoryResponse } from "~/types/chat";

export const findChatByTag = async (tag: string) => {
  const response = await secureFetch(`${apiBase()}/chats/finder`, {
    method: "POST",
    body: JSON.stringify({ tag }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось найти чат по тегу"));
  }

  const dto = (await response.json()) as {
    chatId: string | null
    partner: ChatFinderResponse["partner"]
    alreadyExists: boolean
    lastMessage: string | null
    lastMessageAt: string | null
  };

  return dto as ChatFinderResponse;
};

export const createPrivateChat = async (partnerId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/create-private`, {
    method: "POST",
    body: JSON.stringify({ partnerId }),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось создать приватный чат"));
  }

  return (await response.json()) as ChatFinderResponse;
};

export const getAllChatsPreview = async () => {
  const response = await secureFetch(`${apiBase()}/chats/all-chats-preview`, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось загрузить список чатов"));
  }

  const result = await response.json() as { allChats: ChatPreviewDTO[] };
  return result.allChats;
};

export const getChatHistory = async (chatId: string, page = 0, size = 30) => {
  const url = `${apiBase()}/chats/${chatId}/history?page=${page}&size=${size}`;
  const response = await secureFetch(url, {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось загрузить историю чата"));
  }

  return (await response.json()) as GetChatHistoryResponse;
};

export const searchChatMessages = async (chatId: string, query: string, page = 0, size = 20) => {
  const url = `${apiBase()}/chats/${chatId}/search?${new URLSearchParams({ query, page: String(page), size: String(size) })}`;
  const response = await secureFetch(url, { method: "GET" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось выполнить поиск по сообщениям"));
  }

  return (await response.json()) as GetChatHistoryResponse;
};

export const uploadChatBackground = async (chatId: string, original: File) => {
  const file = await prepareImageForUpload(original);
  const formData = new FormData();
  formData.append("file", file);

  const response = await secureFetch(`${apiBase()}/chats/${chatId}/background`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось загрузить фон чата"));
  }

  return (await response.json()) as { backgroundUrl: string };
};

export const resetChatBackground = async (chatId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/${chatId}/background`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось сбросить фон чата"));
  }
};

export const blockChatPartner = async (chatId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/${chatId}/block`, { method: "POST" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось заблокировать пользователя"));
  }
};

export const unblockChatPartner = async (chatId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/${chatId}/block`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось разблокировать пользователя"));
  }
};

export const deleteChatForMe = async (chatId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/${chatId}/for-me`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось удалить чат"));
  }
};

export const deleteChatForEveryone = async (chatId: string) => {
  const response = await secureFetch(`${apiBase()}/chats/${chatId}/for-everyone`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось удалить чат для всех"));
  }
};

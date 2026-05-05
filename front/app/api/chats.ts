import { secureFetch } from "./auth";
import type { ChatFinderResponse } from "~/types/chat";

export const findChatByTag = async (tag: string) => {
  const response = await secureFetch("http://localhost:8080/chats/finder", {
    method: "POST",
    body: JSON.stringify({ tag }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Не удалось найти чат по тегу");
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
  const response = await secureFetch("http://localhost:8080/chats/create-private", {
    method: "POST",
    body: JSON.stringify({ partnerId }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Не удалось создать приватный чат");
  }

  return (await response.json()) as ChatFinderResponse;
};

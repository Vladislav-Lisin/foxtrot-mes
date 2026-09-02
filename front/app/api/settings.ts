import { secureFetch } from "./auth";
import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";

export const updateUserSettings = async (data: {
  username: string
  tag: string
}) => {
  const response = await secureFetch(`${apiBase()}/settings/profile`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось обновить настройки пользователя"));
  }

  return response.json() as Promise<{
    username: string
    tag: string
  }>;
};

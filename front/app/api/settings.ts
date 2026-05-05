import { secureFetch } from "./auth";

export const updateUserSettings = async (data: {
  username: string
  tag: string
}) => {
  const response = await secureFetch("http://localhost:8080/settings/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Не удалось обновить настройки пользователя");
  }

  return response.json() as Promise<{
    username: string
    tag: string
  }>;
};

import { secureFetch } from "./auth";
import { apiBase } from "./apiBase";
import { extractErrorMessage } from "./apiError";
import { prepareImageForUpload } from "./imageCompress";

type ProfileSettingsResponse = {
  username: string
  tag: string
  avatarUrl: string | null
  statusText: string | null
};

export const updateUserSettings = async (data: {
  username: string
  tag: string
  // undefined - не трогать статус; "" - явно сбросить; текст - обновить (см. бэкенд).
  statusText?: string
}) => {
  const response = await secureFetch(`${apiBase()}/settings/profile`, {
    method: "PUT",
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось обновить настройки пользователя"));
  }

  return response.json() as Promise<ProfileSettingsResponse>;
};

export const uploadAvatar = async (original: File) => {
  const file = await prepareImageForUpload(original);
  const formData = new FormData();
  formData.append("file", file);

  const response = await secureFetch(`${apiBase()}/settings/avatar`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось загрузить аватарку"));
  }

  return response.json() as Promise<ProfileSettingsResponse>;
};

export const resetAvatar = async () => {
  const response = await secureFetch(`${apiBase()}/settings/avatar`, { method: "DELETE" });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, "Не удалось сбросить аватарку"));
  }

  return response.json() as Promise<ProfileSettingsResponse>;
};

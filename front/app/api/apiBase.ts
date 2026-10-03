export const apiBase = () => {
  return useRuntimeConfig().public.apiBase || "http://localhost:8080";
};

// Относительные пути ("/uploads/...") с бэкенда - префиксуем адресом API, иначе картинка
// запрашивается у фронтенда и отдаёт 404 (битый значок вместо аватарки).
export const mediaUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  return url.startsWith("/") ? `${apiBase()}${url}` : url;
};

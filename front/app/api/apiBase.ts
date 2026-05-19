export const apiBase = () => {
  return useRuntimeConfig().public.apiBase || "http://localhost:8080";
};

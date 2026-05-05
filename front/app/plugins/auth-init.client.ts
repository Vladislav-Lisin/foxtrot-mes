import { fetchMe } from "~/api/auth";

export default defineNuxtPlugin(async () => {
  const { setUser, clearUser, isAuthReady, loadToken, setToken } = useUserState();

  // Восстанавливаем токен из localStorage
  loadToken();

  try {
    const me = await fetchMe();

    if (me) {
      setUser(me);
    } else {
      clearUser();
      setToken(null);
    }
  } catch {
    clearUser();
    setToken(null);
  } finally {
    // 👇 ВАЖНО: говорим "проверка завершена"
    isAuthReady.value = true;
  }
});

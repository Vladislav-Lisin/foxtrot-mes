import { fetchMe, proactiveRefreshToken } from "~/api/auth";

export default defineNuxtPlugin(async () => {
  const { setUser, clearUser, isAuthReady, loadToken, setToken, token } = useUserState();

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

  // Настраиваем проактивный рефреш токена
  if (token.value) {
    // Запускаем сразу
    proactiveRefreshToken();

    // И каждые 5 минут проверяем
    setInterval(proactiveRefreshToken, 5 * 60 * 1000);
  }
});

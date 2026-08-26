import { fetchMe, proactiveRefreshToken } from "~/api/auth";

export default defineNuxtPlugin(async () => {
  const { setUser, clearAuth, isAuthReady, loadToken, token } = useUserState();

  // Восстанавливаем токен из localStorage
  loadToken();

  try {
    const me = await fetchMe();

    if (me) {
      setUser(me);
    } else {
      clearAuth();
    }
  } catch {
    clearAuth();
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

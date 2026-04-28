import { fetchMe } from "~/api/auth";

export default defineNuxtPlugin(async () => {
  const { setUser, clearUser, isAuthReady } = useUserState();

  try {
    const me = await fetchMe();

    if (me) {
      setUser(me);
    } else {
      clearUser();
    }
  } catch {
    clearUser();
  } finally {
    // 👇 ВАЖНО: говорим "проверка завершена"
    isAuthReady.value = true;
  }
});

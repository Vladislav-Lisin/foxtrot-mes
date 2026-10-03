const PRESENCE_REFRESH_MS = 20_000;

export default defineNuxtPlugin(() => {
  const { token } = useUserState();
  const { refreshPresence } = useChats();

  const tick = async () => {
    if (!token.value) return;
    try {
      await refreshPresence();
    } catch (error) {
      console.error("Presence refresh failed:", error);
    }
  };

  setInterval(tick, PRESENCE_REFRESH_MS);
});

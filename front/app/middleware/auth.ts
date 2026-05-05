import { watch } from "vue";

export default defineNuxtRouteMiddleware(async () => {
  const { user, isAuthReady } = useUserState();

  if (!isAuthReady.value) {
    await new Promise<void>((resolve) => {
      const stop = watch(isAuthReady, (ready) => {
        if (!ready) return;
        stop();
        resolve();
      });
    });
  }

  if (!user.value) {
    return navigateTo("/authorization");
  }
});

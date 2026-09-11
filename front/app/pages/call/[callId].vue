<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const route = useRoute();
const callId = computed(() => String(route.params.callId));

const { activeCall, joinExistingCall, leaveActiveCall } = useCall();
const toast = useToast();

onMounted(async () => {
  // уже подключены (например, сами начали этот звонок и нас сразу перенаправило сюда)
  if (activeCall.value?.callId === callId.value) return;

  try {
    await joinExistingCall(callId.value);
  } catch (e) {
    toast.add({
      title: "Не удалось присоединиться к звонку",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
    await navigateTo("/user/panel");
  }
});

onBeforeUnmount(() => {
  if (activeCall.value?.callId === callId.value) {
    void leaveActiveCall();
  }
});
</script>

<template>
  <div class="h-[calc(100vh-3rem)]">
    <CallRoom />
  </div>
</template>

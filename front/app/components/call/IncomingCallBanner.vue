<script setup lang="ts">
const { incomingCall, acceptIncomingCall, dismissIncomingCall } = useCall();
const { chatPreviews } = useChats();
const toast = useToast();

const accepting = ref(false);

// Для 1:1 чата звонящий - это партнёр в том самом чате; для standalone-звонка (chatId
// нет) ищем по ownerId среди уже известных партнёров, фолбэк - короткий id.
const callerName = computed(() => {
  const call = incomingCall.value;
  if (!call) return "";
  const byChat = call.chatId ? chatPreviews.value.find(p => p.chatId === call.chatId) : null;
  if (byChat) return byChat.username;
  const byOwner = chatPreviews.value.find(p => p.partnerId === call.ownerId);
  return byOwner?.username ?? `Пользователь ${call.ownerId.slice(0, 8)}`;
});

const accept = async () => {
  const callId = incomingCall.value?.callId;
  if (!callId) return;

  accepting.value = true;
  try {
    await acceptIncomingCall();
    await navigateTo(`/call/${callId}`);
  } catch (e) {
    toast.add({
      title: "Не удалось подключиться к звонку",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    accepting.value = false;
  }
};
</script>

<template>
  <div
    v-if="incomingCall"
    class="fixed inset-x-0 top-16 z-40 mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-gray-700 bg-[#111a2e] p-3 shadow-lg"
  >
    <div class="flex items-center gap-2 text-sm text-gray-100">
      <UIcon name="i-lucide-phone-incoming" class="h-5 w-5 text-yellow-400" />
      Входящий звонок от {{ callerName }}
    </div>
    <div class="flex gap-2">
      <UButton color="success" variant="solid" icon="i-lucide-phone" :loading="accepting" @click="accept" />
      <UButton color="error" variant="soft" icon="i-lucide-phone-off" @click="dismissIncomingCall" />
    </div>
  </div>
</template>

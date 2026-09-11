<script setup lang="ts">
const messageText = ref("");
const scrollEl = ref<HTMLElement | null>(null);

defineProps<{
  showSidebarToggle?: boolean
}>();

defineEmits<{
  openSidebar: []
}>();

const {
  selectedChat,
  currentMessages,
  sendMessage,
  markChatRead
} = useChats();

const { user } = useUserState();
const { startChatCall, joinExistingCall, activeCall, activeCallByChat, checkActiveCallForChat } = useCall();

const startingCall = ref(false);

// Звонок этого чата уже идёт где-то (мы из него вышли, или его начал собеседник), но мы
// сейчас в нём не находимся - показываем "переподключиться" вместо обычной "позвонить".
const activeCallForChat = computed(() => {
  const chatId = selectedChat.value?.chatId;
  if (!chatId) return null;
  const call = activeCallByChat.value[chatId];
  if (!call || call.status === "ENDED") return null;
  if (activeCall.value?.callId === call.callId) return null; // уже внутри - кнопка звонка не нужна вовсе, но UI и так на /call/[callId]
  return call;
});

const callSelectedChat = async () => {
  if (!selectedChat.value?.chatId || startingCall.value) return;
  startingCall.value = true;
  try {
    const call = await startChatCall(selectedChat.value.chatId);
    await navigateTo(`/call/${call.callId}`);
  } catch (e) {
    const toast = useToast();
    toast.add({
      title: "Не удалось начать звонок",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    startingCall.value = false;
  }
};

const reconnectToCall = async () => {
  const callId = activeCallForChat.value?.callId;
  if (!callId || startingCall.value) return;
  startingCall.value = true;
  try {
    await joinExistingCall(callId);
    await navigateTo(`/call/${callId}`);
  } catch (e) {
    const toast = useToast();
    toast.add({
      title: "Не удалось переподключиться к звонку",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    startingCall.value = false;
  }
};

watch(
  () => selectedChat.value?.chatId,
  (chatId) => {
    if (chatId) void checkActiveCallForChat(chatId);
  },
  { immediate: true }
);

const normalizeId = (raw: unknown) =>
  typeof raw === "string"
    ? raw.trim().toLowerCase().replace(/-/g, "")
    : "";

const isMine = (senderId?: string) =>
  !!senderId
  && !!user.value?.id
  && normalizeId(senderId) === normalizeId(user.value.id);

const formatTime = (v: unknown) => {
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const submitMessage = async () => {
  const text = messageText.value.trim();
  if (!text) return;
  try {
    await sendMessage(text);
    messageText.value = "";
  } catch (e) {
    const toast = useToast();
    toast.add({
      title: "Не удалось отправить",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  }
};

watch(
  () => currentMessages.value.length,
  async () => {
    await nextTick();
    scrollEl.value?.scrollTo({ top: scrollEl.value.scrollHeight, behavior: "smooth" });
    // Новое сообщение пришло, пока диалог уже открыт - собеседник его тут же видит,
    // так что помечаем прочитанным сразу же, а не только при переключении чатов.
    if (selectedChat.value?.chatId) void markChatRead();
  }
);

watch(
  () => selectedChat.value,
  (chat) => {
    messageText.value = "";
    if (chat?.chatId) void markChatRead();
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex h-full flex-col">
    <UCard variant="outline" class="w-full rounded-none">
      <template #header>
        <div class="flex items-center gap-3">
          <UButton
            v-if="showSidebarToggle"
            color="warning"
            variant="ghost"
            icon="i-lucide-panel-left-open"
            aria-label="Открыть список чатов"
            class="md:hidden"
            @click="$emit('openSidebar')"
          />
          <div v-if="selectedChat" class="flex min-w-0 flex-1 items-center justify-between gap-3">
            <UUser
              :name="selectedChat.username"
              :description="selectedChat.userTag"
              :avatar="{
                src: selectedChat.avatar || '/ava.jpg'
              }"
              chip
              size="xl"
            />
            <UButton
              v-if="selectedChat.chatId && activeCallForChat"
              color="success"
              variant="solid"
              icon="i-lucide-phone-incoming"
              label="Переподключиться"
              :loading="startingCall"
              @click="reconnectToCall"
            />
            <UButton
              v-else-if="selectedChat.chatId"
              color="warning"
              variant="soft"
              icon="i-lucide-phone"
              aria-label="Позвонить"
              :loading="startingCall"
              @click="callSelectedChat"
            />
          </div>
        </div>
      </template>
    </UCard>

    <div ref="scrollEl" class="min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden bg-[#0b1220] p-4">
      <div v-if="!selectedChat" />
      <div v-else-if="!currentMessages.length" class="text-gray-400">
        здесь пока нет сообщений
      </div>
      <div v-else class="min-w-0 space-y-2">
        <div
          v-for="msg in currentMessages"
          :key="msg.id || `${msg.chatId}-${msg.timestamp}`"
          class="flex w-full min-w-0"
          :class="isMine(msg.senderId) ? 'justify-end' : 'justify-start'"
        >
          <div
            class="min-w-0 max-w-[min(75%,36rem)] w-fit rounded-2xl border px-3 py-2"
            :class="isMine(msg.senderId)
              ? 'rounded-br-md border-[#2b5cff55] bg-[#2b5cff1a]'
              : 'rounded-bl-md border-gray-700 bg-[#111a2e]'"
          >
            <div
              class="whitespace-pre-wrap break-all break-words text-sm leading-snug text-gray-100 [overflow-wrap:anywhere]"
            >
              {{ msg.content }}
            </div>
            <div class="mt-2 flex items-center justify-end gap-2 text-[11px] text-gray-400">
              <span>{{ formatTime(msg.timestamp) }}</span>
              <UBadge
                v-if="isMine(msg.senderId)"
                size="xs"
                variant="soft"
                color="neutral"
                :label="msg.status || 'SENT'"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <form
      v-if="selectedChat"
      class="flex items-center gap-2 border-t border-gray-700 p-3"
      @submit.prevent="submitMessage"
    >
      <UInput
        v-model="messageText"
        placeholder="Сообщение"
        class="flex-1"
        size="xl"
        variant="outline"
      />
      <UButton
        type="submit"
        color="warning"
        label="Отправить"
        icon="i-lucide-send"
        :disabled="!messageText.trim()"
      />
    </form>
  </div>
</template>

<script setup lang="ts">
const messageText = ref("");
const scrollEl = ref<HTMLElement | null>(null);

const {
  selectedChat,
  currentMessages,
  sendMessage
} = useChats();

const { user } = useUserState();

const normalizeId = (raw: unknown) =>
  typeof raw === "string"
    ? raw.trim().toLowerCase().replace(/-/g, "")
    : "";

const isMine = (senderId?: string) =>
  !!senderId &&
  !!user.value?.id &&
  normalizeId(senderId) === normalizeId(user.value.id);

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
  }
);
</script>

<template>
  <div class="flex flex-col h-full">
    <UCard variant="outline" class="w-full rounded-none">
      <template #header>
        <div v-if="selectedChat" class="flex gap-3 items-center">
          <UUser
            :name="selectedChat.username"
            :description="selectedChat.userTag"
            :avatar="{
              src: selectedChat.avatar || '/ava.jpg'
            }"
            chip
            size="xl"
          />
        </div>
      </template>
    </UCard>
    <div ref="scrollEl" class="flex-1 overflow-auto p-4 space-y-2 bg-[#0b1220]">
      <div v-if="!selectedChat" class="text-gray-400">
        Выберите чат в списке слева
      </div>
      <div v-else-if="!currentMessages.length" class="text-gray-400">
        здесь пока нет сообщений
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="msg in currentMessages"
          :key="msg.id || `${msg.chatId}-${msg.timestamp}`"
          class="flex"
          :class="isMine(msg.senderId) ? 'justify-end' : 'justify-start'"
        >
          <UCard
            variant="soft"
            class="max-w-[75%]"
            :ui="{
              root: isMine(msg.senderId)
                ? 'rounded-2xl rounded-br-md border border-[#2b5cff55] bg-[#2b5cff1a]'
                : 'rounded-2xl rounded-bl-md border border-gray-700 bg-[#111a2e]'
            }"
          >
            <div class="whitespace-pre-wrap break-words text-sm leading-snug text-gray-100">
              {{ msg.content }}
            </div>
            <div class="mt-2 flex items-center gap-2 justify-end text-[11px] text-gray-400">
              <span>{{ formatTime(msg.timestamp) }}</span>
              <UBadge
                v-if="isMine(msg.senderId)"
                size="xs"
                variant="soft"
                color="neutral"
                :label="msg.status || 'SENT'"
              />
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <form class="p-3 border-t border-gray-700 flex items-center gap-2" @submit.prevent="submitMessage">
      <UInput
        v-model="messageText"
        placeholder="Сообщение"
        class="flex-1"
        :disabled="!selectedChat"
        size="xl"
        variant="outline"
      />
      <UButton
        type="submit"
        color="warning"
        label="Отправить"
        icon="i-lucide-send"
        :disabled="!selectedChat || !messageText.trim()"
      />
    </form>
  </div>
</template>

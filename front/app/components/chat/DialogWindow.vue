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
  sendMessage
} = useChats();

const { user } = useUserState();

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
  }
);

watch(
  () => selectedChat.value,
  () => {
    messageText.value = "";
  }
);
</script>

<template>
  <div class="flex flex-col h-full">
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
          <div v-if="selectedChat" class="flex gap-3 items-center min-w-0">
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
          <div v-else class="text-sm text-gray-400">
            Выберите чат
          </div>
        </div>
      </template>
    </UCard>
    <div ref="scrollEl" class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-2 bg-[#0b1220] min-w-0">
      <div v-if="!selectedChat" class="text-gray-400">
        Выберите чат в списке слева
      </div>
      <div v-else-if="!currentMessages.length" class="text-gray-400">
        здесь пока нет сообщений
      </div>
      <div v-else class="space-y-2 min-w-0">
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
              class="whitespace-pre-wrap text-sm leading-snug text-gray-100 break-words break-all [overflow-wrap:anywhere]"
            >
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
          </div>
        </div>
      </div>
    </div>

    <form
      v-if="selectedChat"
      class="p-3 border-t border-gray-700 flex items-center gap-2"
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

    <UButton
      v-if="showSidebarToggle && !selectedChat"
      color="warning"
      variant="soft"
      icon="i-lucide-users"
      label="Чаты"
      class="absolute left-4 top-20 z-10 md:hidden"
      @click="$emit('openSidebar')"
    />
  </div>
</template>

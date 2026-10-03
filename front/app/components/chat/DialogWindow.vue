<script setup lang="ts">
import { apiBase } from "~/api/apiBase";

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
  markChatRead,
  searchMessagesInChat
} = useChats();

const isProfileOpen = ref(false);
const isAvatarZoomed = ref(false);
const partnerOnlineText = computed(() => {
  const online = selectedChat.value?.partnerOnline;
  if (online == null) return "";
  return online ? "в сети" : "не в сети";
});

const isSearchOpen = ref(false);
const searchQuery = ref("");
const searchResults = ref<{ id: string, senderId: string, content: string, createdAt: string }[]>([]);
const isSearching = ref(false);
const highlightedMessageId = ref<string | null>(null);
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequestSeq = 0;

const runSearch = async () => {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = [];
    return;
  }
  const requestId = ++searchRequestSeq;
  isSearching.value = true;
  try {
    const response = await searchMessagesInChat(query);
    if (requestId !== searchRequestSeq) return; // пришёл ответ на уже устаревший запрос - игнорируем
    searchResults.value = response.history.content.map(m => ({
      id: m.id,
      senderId: m.senderId,
      content: typeof m.content === "string" ? m.content : "",
      createdAt: m.createdAt,
    }));
  } catch (e) {
    const toast = useToast();
    toast.add({ title: "Не удалось выполнить поиск", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    if (requestId === searchRequestSeq) isSearching.value = false;
  }
};

// Динамический поиск - без нажатия Enter, но с задержкой: иначе каждое нажатие клавиши
// слало бы отдельный запрос на сервер, а предыдущий ответ мог прийти ПОСЛЕ более нового
// (гонка) - отсюда searchRequestSeq выше, который отбрасывает устаревшие ответы.
watch(searchQuery, () => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(runSearch, 300);
});

const jumpToMessage = async (messageId: string) => {
  await nextTick();
  const target = scrollEl.value?.querySelector<HTMLElement>(`[data-msg-id="${messageId}"]`);
  if (!target) {
    const toast = useToast();
    toast.add({ title: "Сообщение не найдено в загруженной истории", description: "Долистайте выше, чтобы подгрузить более старые сообщения", color: "warning" });
    return;
  }
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  highlightedMessageId.value = messageId;
  setTimeout(() => {
    if (highlightedMessageId.value === messageId) highlightedMessageId.value = null;
  }, 2000);
};

watch(() => selectedChat.value?.chatId, () => {
  isSearchOpen.value = false;
  searchQuery.value = "";
  searchResults.value = [];
});

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

// 1:1 чат - отправитель всегда либо я, либо текущий собеседник, явно по имени, а не только
// по стороне/цвету пузыря (что легко не заметить, особенно на телефоне или при беглом чтении).
const senderLabel = (senderId?: string) =>
  isMine(senderId) ? (user.value?.username ?? "Вы") : (selectedChat.value?.username ?? "Собеседник");

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
            <div
              class="min-w-0 cursor-pointer rounded-lg transition hover:bg-white/5"
              role="button"
              tabindex="0"
              title="Открыть профиль собеседника"
              @click="isProfileOpen = true"
              @keydown.enter="isProfileOpen = true"
            >
              <UUser
                :name="selectedChat.username"
                :description="`${selectedChat.userTag} ${selectedChat.partnerOnline == null ? '' : selectedChat.partnerOnline ? '· в сети' : '· не в сети'}`"
                :avatar="{
                  src: selectedChat.avatar || '/ava.jpg'
                }"
                chip
                size="xl"
              />
              <div v-if="selectedChat.partnerStatusText" class="truncate pl-[3.25rem] text-xs italic text-warning-400">
                {{ selectedChat.partnerStatusText }}
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="selectedChat.blockedByMe || selectedChat.blockedByPartner"
                color="neutral"
                variant="soft"
                disabled
                :label="selectedChat.blockedByMe ? 'Вы заблокировали пользователя' : 'Пользователь вас заблокировал'"
              />
              <template v-else-if="selectedChat.chatId">
                <UButton
                  v-if="activeCallForChat"
                  color="success"
                  variant="solid"
                  icon="i-lucide-phone-incoming"
                  label="Переподключиться"
                  :loading="startingCall"
                  @click="reconnectToCall"
                />
                <UButton
                  v-else
                  color="warning"
                  variant="soft"
                  icon="i-lucide-phone"
                  aria-label="Позвонить"
                  :loading="startingCall"
                  @click="callSelectedChat"
                />
              </template>
              <ChatOptionsMenu @open-search="isSearchOpen = !isSearchOpen" />
            </div>
          </div>
        </div>
      </template>
    </UCard>

    <div v-if="isSearchOpen && selectedChat" class="border-b border-gray-700 bg-[#0e1425] p-3">
      <div class="flex items-center gap-2">
        <UInput
          v-model="searchQuery"
          placeholder="Поиск по сообщениям этого чата"
          class="flex-1"
          icon="i-lucide-search"
          @keyup.enter="runSearch"
        />
        <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Закрыть поиск" @click="isSearchOpen = false" />
      </div>
      <div v-if="searchResults.length" class="mt-2 max-h-48 space-y-1 overflow-y-auto">
        <button
          v-for="r in searchResults"
          :key="r.id"
          type="button"
          class="block w-full rounded-lg border border-gray-700 bg-[#111a2e] px-3 py-2 text-left text-sm transition hover:border-warning-500 hover:bg-[#182238]"
          @click="jumpToMessage(r.id)"
        >
          <div class="text-xs font-medium" :class="isMine(r.senderId) ? 'text-blue-300' : 'text-warning-400'">
            {{ senderLabel(r.senderId) }}
          </div>
          <div class="text-gray-100">{{ r.content }}</div>
          <div class="text-[11px] text-gray-400">{{ formatTime(r.createdAt) }}</div>
        </button>
      </div>
      <div v-else-if="searchQuery.trim() && !isSearching" class="mt-2 text-sm text-gray-400">
        Ничего не найдено
      </div>
    </div>

    <div
      ref="scrollEl"
      class="msg-scroll min-w-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden bg-[#0b1220] bg-cover bg-center p-4"
      :style="selectedChat?.backgroundUrl ? { backgroundImage: `url(${apiBase()}${selectedChat.backgroundUrl})` } : {}"
    >
      <div v-if="!selectedChat" />
      <div v-else-if="!currentMessages.length" class="text-gray-400">
        здесь пока нет сообщений
      </div>
      <!-- max-width + mx-auto - иначе на широком окне пузыри прижимаются к самым краям,
           оставляя между ними (на разных сторонах) гигантский пустой промежуток, по которому
           тяжело читать переписку. Колонка той же ширины, что и в Telegram Desktop, держит
           сообщения компактно по центру независимо от того, насколько широк сам экран. -->
      <div v-else class="msg-column mx-auto min-w-0 space-y-2">
        <div
          v-for="msg in currentMessages"
          :key="msg.id || `${msg.chatId}-${msg.timestamp}`"
          class="msg-row flex w-full min-w-0"
          :class="isMine(msg.senderId) ? 'msg-mine' : 'msg-theirs'"
        >
          <div
            :data-msg-id="msg.id"
            class="min-w-0 max-w-[85%] w-fit rounded-2xl border px-3 py-2 transition-shadow"
            :class="[
              isMine(msg.senderId)
                ? 'rounded-br-md border-[#2b5cff] bg-[#2b5cff]/90'
                : 'rounded-bl-md border-gray-700 bg-[#111a2e]',
              highlightedMessageId === msg.id ? 'ring-2 ring-warning-400' : ''
            ]"
          >
            <div
              class="mb-0.5 text-xs font-medium"
              :class="isMine(msg.senderId) ? 'text-blue-100' : 'text-warning-400'"
            >
              {{ senderLabel(msg.senderId) }}
            </div>
            <div
              class="msg-text whitespace-pre-wrap break-all break-words text-gray-100 [overflow-wrap:anywhere]"
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

    <UModal v-model:open="isProfileOpen" title="Профиль">
      <template #content>
        <div v-if="selectedChat" class="flex flex-col items-center gap-3 p-6">
          <button
            type="button"
            class="rounded-full"
            aria-label="Открыть аватарку на весь экран"
            @click="isAvatarZoomed = true"
          >
            <img
              :src="selectedChat.avatar || '/ava.jpg'"
              class="h-32 w-32 rounded-full object-cover md:h-40 md:w-40"
              alt="avatar"
            >
          </button>
          <div class="text-center">
            <div class="text-xl font-semibold">{{ selectedChat.username }}</div>
            <div class="text-sm text-gray-400">@{{ selectedChat.userTag }}</div>
            <div v-if="partnerOnlineText" class="mt-1 flex items-center justify-center gap-2 text-sm">
              <span
                class="inline-block h-2.5 w-2.5 rounded-full"
                :class="selectedChat.partnerOnline ? 'bg-green-500' : 'bg-gray-500'"
              />
              <span :class="selectedChat.partnerOnline ? 'text-green-400' : 'text-gray-400'">{{ partnerOnlineText }}</span>
            </div>
          </div>
          <div
            v-if="selectedChat.partnerStatusText"
            class="w-full rounded-lg border border-warning-500/40 bg-warning-500/10 px-4 py-2 text-center text-sm italic text-warning-300"
          >
            {{ selectedChat.partnerStatusText }}
          </div>
          <div class="w-full rounded-lg border border-gray-700 px-4 py-3 text-sm text-gray-200">
            <div class="mb-1 text-xs uppercase tracking-wide text-gray-500">О себе</div>
            <div v-if="selectedChat.partnerBio" class="whitespace-pre-wrap break-words">{{ selectedChat.partnerBio }}</div>
            <div v-else class="text-gray-500">Пока ничего не написано</div>
          </div>
        </div>
      </template>
    </UModal>

    <div
      v-if="isAvatarZoomed && selectedChat"
      class="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/90 p-4"
      @click="isAvatarZoomed = false"
    >
      <img
        :src="selectedChat.avatar || '/ava.jpg'"
        class="max-h-full max-w-full rounded-lg object-contain"
        alt="avatar"
      >
    </div>

    <div
      v-if="selectedChat && (selectedChat.blockedByMe || selectedChat.blockedByPartner)"
      class="border-t border-gray-700 p-3 text-center text-sm text-gray-400"
    >
      {{ selectedChat.blockedByMe ? "Вы заблокировали этого пользователя - сообщения не доставляются." : "Этот пользователь заблокировал вас - сообщения не доставляются." }}
    </div>
    <form
      v-else-if="selectedChat"
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

<style scoped>
/* Раскладка зависит от ширины области сообщений, а не экрана:
   узко - свои справа, собеседник слева; очень широко - всё слева друг под другом, текст крупнее. */
.msg-scroll {
  container: msgs / inline-size;
}
.msg-column {
  max-width: 48rem;
}
.msg-row.msg-mine {
  justify-content: flex-end;
}
.msg-row.msg-theirs {
  justify-content: flex-start;
}
.msg-text {
  font-size: 0.875rem;
  line-height: 1.375;
}
@container msgs (min-width: 60rem) {
  .msg-column {
    max-width: 60rem;
  }
  .msg-row.msg-mine,
  .msg-row.msg-theirs {
    justify-content: flex-start;
  }
  .msg-text {
    font-size: 1.0625rem;
    line-height: 1.5;
  }
}
</style>

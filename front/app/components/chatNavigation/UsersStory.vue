<script setup lang="ts">
const props = defineProps({
  avatar: String,
  username: String,
  tag: String,
  lastMessage: String,
  lastStatus: String,
  lastMessageSenderId: String,
  unreadCount: { type: Number, default: 0 },
});

const emit = defineEmits(["select"])

const { user } = useUserState();

const normalizeId = (raw: unknown) =>
  typeof raw === "string" ? raw.trim().toLowerCase().replace(/-/g, "") : "";

// Последнее сообщение своё - показываем "Вы: ..." и статус доставки. Чужое - просто текст
// плюс бейдж "непрочитано", если ещё не открывали чат (см. markChatRead в useChats.ts).
const isMine = computed(() =>
  !!props.lastMessageSenderId
  && !!user.value?.id
  && normalizeId(props.lastMessageSenderId) === normalizeId(user.value.id)
);
</script>

<template>
  <div class="flex gap-3 p-3 hover:bg-gray-800 rounded cursor-pointer border-b border-gray-700" @click="emit('select')">
    <img :src="avatar || '/ava.jpg'" class="w-10 h-10 rounded-full">
    <div class="flex flex-col min-w-0 flex-1">
      <span :class="['flex items-center justify-between gap-2', !isMine && unreadCount > 0 ? 'font-bold text-white' : 'font-semibold']">
        {{ username }}
        <UBadge v-if="!isMine && unreadCount > 0" class="shrink-0" size="xs" variant="solid" color="primary" :label="unreadCount > 9 ? '9+' : String(unreadCount)" />
      </span>
      <div class="flex items-center gap-2 min-w-0">
        <span :class="['text-sm truncate', !isMine && unreadCount > 0 ? 'text-gray-200 font-medium' : 'text-gray-400']">
          <template v-if="isMine">Вы: {{ lastMessage }}</template>
          <template v-else>{{ lastMessage }}</template>
        </span>
        <UBadge
          v-if="isMine && lastStatus"
          class="shrink-0"
          size="xs"
          variant="soft"
          color="neutral"
          :label="lastStatus"
        />
      </div>
    </div>
  </div>
</template>

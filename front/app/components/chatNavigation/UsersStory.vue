<script setup lang="ts">
defineProps({
  avatar: String,
  username: String,
  tag: String,
  lastMessage: String,
  lastStatus: String,
});

const emit = defineEmits(["select"])
</script>

<template>
  <div class="flex gap-3 p-3 hover:bg-gray-800 rounded cursor-pointer border-b border-gray-700" @click="emit('select')">
    <img :src="avatar || '/ava.jpg'" class="w-10 h-10 rounded-full">
    <div class="flex flex-col min-w-0 flex-1">
      <span class="font-semibold">{{ username }}</span>
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-sm text-gray-400 truncate">{{ lastMessage }}</span>
        <UBadge
          v-if="lastStatus"
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

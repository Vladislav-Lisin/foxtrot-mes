<script setup lang="ts">
defineProps({
  avatar: String,
  username: String,
  tag: String,
  lastMessage: String,
});

const emit = defineEmits(["select"])
</script>

<template>
  <div class="flex gap-3 p-3 hover:bg-gray-800 rounded cursor-pointer border-b border-gray-700" @click="emit('select')">
    <img :src="avatar" class="w-10 h-10 rounded-full">
    <div class="flex flex-col">
      <span class="font-semibold">{{ username }}</span>
      <span class="text-sm text-gray-400">{{ lastMessage }}</span>
    </div>
  </div>
</template>

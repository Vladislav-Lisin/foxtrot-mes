<script setup lang="ts">
import UserAccountSettings from "./SettingsPanel.vue";

const isSettingsOpen = ref(false);

defineProps({
  userID: String,
});
</script>

<template>
  <aside class="mt-auto shrink-0 border-t border-white/30 p-3 bg-[#0e1425]">
    <!-- Верхняя часть -->
    <div class="flex items-center gap-3">
      <img
        src="/ava.jpg"
        class="h-11 w-11 rounded-full object-cover"
        alt="avatar"
      >
      <div class="flex flex-col">
        <span class="font-semibold">username</span>
        <span class="text-sm text-gray-400">userID </span>
      </div>
    </div>

    <UButton
      class="mt-3 h-7 w-full justify-center"
      variant="subtle"
      color="warning"
      label="Настройки"
      @click="isSettingsOpen = true"
    />

    <UModal
      v-model:open="isSettingsOpen"
      :ui="{ content: 'max-w-4xl w-full h-[600px]' }"
    >
      <template #content>
        <UserAccountSettings @close="isSettingsOpen = false" />
      </template>
    </UModal>
  </aside>
</template>

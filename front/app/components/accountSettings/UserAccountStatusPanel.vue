<script setup lang="ts">
import SettingsPanel from "./SettingsPanel.vue";

const isSettingsOpen = ref(false);
const { user } = useUserState();
const { startStandaloneCall } = useCall();
const toast = useToast();
const startingCall = ref(false);

defineProps({
  userID: String,
});

// Встреча без общего чата (как в Zoom) - joinExistingCall на /call/[callId]
// принимает любой валидный callId, так что ссылка на комнату и есть "ссылка на конференцию".
const startConference = async () => {
  startingCall.value = true;
  try {
    const call = await startStandaloneCall();
    const link = `${location.origin}/call/${call.callId}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.add({ title: "Конференция создана", description: "Ссылка скопирована в буфер обмена", color: "success" });
    } catch {
      toast.add({ title: "Конференция создана", description: link, color: "success" });
    }
    await navigateTo(`/call/${call.callId}`);
  } catch (e) {
    toast.add({
      title: "Не удалось начать конференцию",
      description: e instanceof Error ? e.message : String(e),
      color: "error",
    });
  } finally {
    startingCall.value = false;
  }
};
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
        <span class="font-semibold">{{ user?.username }}</span>
        <span class="text-sm text-gray-400"> @{{ user?.tag }} </span>
      </div>
    </div>

    <UButton
      class="mt-3 h-7 w-full justify-center"
      variant="subtle"
      color="primary"
      icon="i-lucide-video"
      label="Начать конференцию"
      :loading="startingCall"
      @click="startConference"
    />

    <UButton
      class="mt-2 h-7 w-full justify-center"
      variant="subtle"
      color="warning"
      label="Настройки"
      @click="isSettingsOpen = true"
    />

    <UModal
      v-model:open="isSettingsOpen"
      :ui="{ content: 'max-w-4xl w-full h-[80vh] overflow-hidden flex flex-col' }"
    >
      <template #content>
        <SettingsPanel @close="isSettingsOpen = false" />
      </template>
    </UModal>
  </aside>
</template>

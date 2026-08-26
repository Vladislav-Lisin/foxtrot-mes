<script setup lang="ts">
import UserAccountStatusPanel from "~/components/accountSettings/UserAccountStatusPanel.vue";
import DialogWindow from "~/components/chat/DialogWindow.vue";
import ChatSidebar from "~/components/chatNavigation/ChatSidebar.vue";
import { navigateTo } from "#app";

const { user, isAuthReady } = useUserState();
const isSidebarOpen = ref(false);

const closeSidebar = () => {
  isSidebarOpen.value = false;
};

const openSidebar = () => {
  isSidebarOpen.value = true;
};

watch(
  () => isAuthReady.value,
  (ready) => {
    if (!ready) return;

    if (!user.value) {
      navigateTo("/authorization");
    }
  },
  { immediate: true }
);

watch(
  () => user.value?.id,
  () => {
    isSidebarOpen.value = false;
  }
);
</script>

<template>
  <div class="relative flex h-[calc(100vh-3rem)] overflow-hidden bg-[#0b1220]">
    <div
      v-if="isSidebarOpen"
      class="absolute inset-0 z-30 bg-black/50 md:hidden"
      @click="closeSidebar"
    />

    <aside
      class="absolute inset-y-0 left-0 z-40 flex w-[min(85vw,24rem)] max-w-[24rem] flex-col border-r border-gray-700 bg-[#0e1425] transition-transform duration-200 md:static md:z-auto md:w-auto md:max-w-[26rem] md:min-w-[18rem] md:flex-[0_0_22%] md:translate-x-0"
      :class="isSidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex items-center justify-between border-b border-gray-700 px-4 py-3 md:hidden">
        <span class="text-sm font-semibold text-white">Навигация</span>
        <UButton
          color="warning"
          variant="ghost"
          icon="i-lucide-x"
          aria-label="Закрыть панель"
          @click="closeSidebar"
        />
      </div>

      <ChatSidebar class="flex-1" @chat-selected="closeSidebar" />
      <UserAccountStatusPanel />
    </aside>

    <DialogWindow
      class="relative min-w-0 flex-1"
      :show-sidebar-toggle="true"
      @open-sidebar="openSidebar"
    />
  </div>
</template>

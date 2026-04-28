<script setup lang="ts">
import UserAccountStatusPanel from "~/components/accountSettings/UserAccountStatusPanel.vue";
import DialogWindow from "~/components/chat/DialogWindow.vue";
import ChatSidebar from "~/components/chatNavigation/ChatSidebar.vue";
import { navigateTo } from "#app";

const { user, isAuthReady } = useUserState();

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
</script>

<template>
  <div class="flex h-[calc(100vh-3rem)] overflow-hidden">
    <aside class="flex-[0_0_22%] min-w-[18rem] max-w-[26rem] flex flex-col border-r border-gray-700">
      <ChatSidebar class="flex-1" />
      <UserAccountStatusPanel />
    </aside>

    <DialogWindow class="flex-1" />
  </div>
</template>

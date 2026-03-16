<script setup lang="ts">
import UserAccountStatusPanel from "~/components/accountSettings/UserAccountStatusPanel.vue";
import DialogWindow from "~/components/chat/DialogWindow.vue";
import ChatSidebar from "~/components/chatNavigation/ChatSidebar.vue";
</script>

<template>
  <div class="flex h-[calc(100vh-3rem)] overflow-hidden">
    <aside class="w-64 flex flex-col border-r border-gray-700">
      <ChatSidebar class="flex-1" />
      <UserAccountStatusPanel />
    </aside>
    <DialogWindow class="flex-1" />
  </div>
</template>

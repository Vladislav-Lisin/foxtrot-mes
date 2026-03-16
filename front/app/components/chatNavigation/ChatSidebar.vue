<script setup>
import UserList from "./UserList.vue";
import ChatFilteringPanel from "./ChatFilteringPanel.vue";
</script>

<template>
  <aside class="w-64 p-4 gap-4 flex flex-col border-r border-gray-700 bg-[#0e1425]">
    <ChatFilteringPanel />
    <UserList />
  </aside>
</template>

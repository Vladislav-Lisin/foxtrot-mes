<script setup>
import UserList from "./UserList.vue";
</script>

<template>
  <aside class="w-64 p-4 gap-4 h-screen flex flex-col border-r border-gray-700">
    <ChatFilteringPanel />
    <UserList />
  </aside>
</template>

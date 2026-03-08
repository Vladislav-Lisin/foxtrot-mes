<script setup>
import UsersStory from "./UsersStory.vue";

const { filteredChats } = useChats();
</script>

<template>
  <UsersStory
    v-for="chat in filteredChats"
    :key="chat.id"
    :avatar="chat.avatar"
    :username="chat.username"
    :lastMessage="chat.lastMessage"
  />
</template>

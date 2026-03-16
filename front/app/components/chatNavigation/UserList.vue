<script setup>
import UsersStory from "./UsersStory.vue";

const { filteredChats, selectChat } = useChats();
</script>

<template>
  <UsersStory
    v-for="chat in filteredChats"
    :key="chat.id"
    :avatar="chat.avatar"
    :tag="chat.userTag"
    :username="chat.username"
    :last-message="chat.lastMessage"
    @select="selectChat(chat)"
  />
</template>

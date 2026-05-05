<script setup lang="ts">
import UsersStory from "./UsersStory.vue";
import CommunityCreationForm from "../communities/CommunityCreationForm.vue";

const { filteredChats, activeFilter, selectChat } = useChats();
const isCreateCommunity = ref(false);
</script>

<template>
  <UButton
    v-if="activeFilter === 'servers'"
    label="Создать сообщество"
    color="warning"
    variant="soft"
    class="justify-center"
    @click="isCreateCommunity = true"
  />
  <UModal
    v-model:open="isCreateCommunity"
    :ui="{ content: 'max-w-2xl w-full max-h-[80vh]' }"
  >
    <template #content>
      <CommunityCreationForm @close="isCreateCommunity = false" />
    </template>
  </UModal>

  <UsersStory
    v-for="chat in filteredChats"
    :key="chat.chatId ?? chat.partnerId"
    :avatar="chat.avatar"
    :tag="chat.userTag"
    :username="chat.username"
    :last-message="chat.lastMessage"
    @select="selectChat(chat)"
  />
</template>

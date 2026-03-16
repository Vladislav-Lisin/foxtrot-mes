<script setup lg="ts">
const { selectedChat } = useChats();
</script>

<template>
  <div class="flex flex-col h-full">
    <UCard variant="outline" class="w-full rounded-none">
      <template #header>
        <div v-if="selectedChat" class="flex gap-3 items-center">
          <img :src="selectedChat.avatar" class="w-10 h-10 rounded-full" >

          <div class="flex flex-col">
            <span class="text-xl">{{ selectedChat.username }}</span>
            <span class="text-sm text-gray-400">{{
              selectedChat.userTag
            }}</span>
          </div>

          <UButton
            class="ml-auto rounded-full"
            icon="i-lucide-phone"
            size="md"
            color="warning"
            variant="ghost"
            @click="emit('close')"
          />
        </div>
      </template>
    </UCard>

    <UCard class="mt-auto rounded-none">
      <UInput type="text" variant="ghost" placeholder="Введите сообщение" />
    </UCard>
  </div>
</template>

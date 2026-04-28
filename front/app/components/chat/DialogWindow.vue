<script setup lg="ts">
const { selectedChat } = useChats();
</script>

<template>
  <div class="flex flex-col h-full">
    <UCard variant="outline" class="w-full rounded-none">
      <template #header>
        <div v-if="selectedChat" class="flex gap-3 items-center">
          <UUser
            :name="selectedChat.username"
            :description="selectedChat.userTag"
            :avatar="{
              src: selectedChat.avatar
            }"
            chip
            size="xl"
          />
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
    <UChatPalette>
      <UChatMessages />

      <template #prompt>
        <div class="flex items-center gap-2 w-full">
          <!-- Кнопка прикрепления -->
          <UFileUpload
            variant="button"
            icon="i-lucide-paperclip"
            size="lg"
            :ui="{
              base: 'border-0 shadow-none text-warning px-4 py-3'
            }"
          />

          <!-- Поле ввода -->
          <UChatPrompt placeholder="Сообщение" class="flex-1 rounded-none" />
        </div>
      </template>
    </UChatPalette>
  </div>
</template>

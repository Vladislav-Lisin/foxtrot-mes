<script setup>
const { activeFilter } = useChats();
</script>

<template>
  <UInput
    icon="i-lucide-search"
    size="md"
    variant="outline"
    placeholder="Поиск по id..."
  />
  <UFieldGroup orientation="horizontal">
    <UButton
      class="flex-1 justify-center"
      color="warning"
      label="Все"
      :variant="activeFilter === 'all' ? 'subtle' : 'outline'"
      @click="activeFilter = 'all'"
    />
    <UButton
      class="flex-1 justify-center"
      color="warning"
      label="Личные"
      :variant="activeFilter === 'personal' ? 'subtle' : 'outline'"
      @click="activeFilter = 'personal'"
    />
    <UButton
      class="flex-1 justify-center"
      color="warning"
      label="Сервера"
      :variant="activeFilter === 'servers' ? 'subtle' : 'outline'"
      @click="activeFilter = 'servers'"
    />
  </UFieldGroup>
</template>

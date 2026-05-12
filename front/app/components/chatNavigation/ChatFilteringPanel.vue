<script setup lang="ts">
const { activeFilter, searchTag, searchChat } = useChats();
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

const trySearchOnEnter = () => {
  if (!searchTag.value.trim()) return;
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  searchChat();
};

watch(searchTag, (value) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!value.trim()) {
    searchTimeout = null;
    return;
  }

  searchTimeout = setTimeout(() => {
    searchChat();
  }, 300);
});
</script>

<template>
  <UInput
    icon="i-lucide-search"
    size="md"
    variant="outline"
    v-model="searchTag"
    placeholder="Поиск по тегу (можно с @)"
    @keyup.enter="trySearchOnEnter()"
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

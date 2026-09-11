<script setup lang="ts">
const { activeFilter, searchTag, searchChat } = useChats();
let searchTimeout: ReturnType<typeof setTimeout> | null = null;

// "@тег" - точный поиск по бэкенду среди всех пользователей платформы (см. searchChat).
// Без "@" - обычное имя, ищем только среди уже существующих чатов - это чисто локальный
// фильтр (см. filteredChats в useChats.ts), к бэкенду вообще не обращаемся.
const trySearchOnEnter = () => {
  if (!searchTag.value.trim().startsWith("@")) return;
  if (searchTimeout) {
    clearTimeout(searchTimeout);
    searchTimeout = null;
  }
  searchChat();
};

watch(searchTag, (value) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  if (!value.trim().startsWith("@")) {
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
    placeholder="Поиск по имени, @тег - по всем пользователям"
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

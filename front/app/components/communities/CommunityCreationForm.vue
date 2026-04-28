<script setup lang="ts">
const emit = defineEmits(["close"]);
const name = ref("");
const items = ref(["Открытое", "Закрытое"]);
</script>

<template>
  <UCard class="w-full rounded-none">
    <template #header>
      <div class="flex flex-col items-center gap-2">
        <NuxtImg
          src="/communicationInAClearing.png"
          class="w-full max-w-xs h-auto mt-10"
        />
        <UText class="font-sofia text-xl font-semibold" align="center">
          Создание сообщества
        </UText>
      </div>
      <div class="absolute top-3 right-3">
        <UButton
          class="rounded-full h-8 w-8"
          icon="i-lucide-x"
          size="md"
          color="warning"
          variant="soft"
          @click="emit('close')"
        />
      </div>
    </template>
  </UCard>
  <div class="w-full max-w-md mx-auto pt-4">
    <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-4 items-center">
      <UText>Введите название сообщества:</UText>
      <UInput v-model="name" />

      <UText>Выберите тип сообщества:</UText>
      <URadioGroup
        indicator="end"
        size="xs"
        orientation="horizontal"
        variant="table"
        default-value="Открытое"
        :items="items"
      />
    </div>
    <div class="flex justify-center mt-7 mb-6">
      <UButton label="Создать сообщество" size="lg" />
    </div>
  </div>
</template>

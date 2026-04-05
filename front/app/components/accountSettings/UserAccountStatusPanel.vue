<script setup lang="ts">
import UserAccountSettings from "./SettingsPanel.vue";

type WeatherData = {
  name: string
  main: {
    temp: number
  }
  weather: {
    description: string
  }[]
};

const isSettingsOpen = ref(false);
const isWeatherOpen = ref(false);

const weather = ref<WeatherData | null>(null);

const loadWeather = async () => {
  weather.value = null;

  const data = await $fetch<WeatherData>("/api/weather");
  weather.value = data;
};

defineProps({
  userID: String,
});
</script>

<template>
  <aside class="mt-auto shrink-0 border-t border-white/30 p-3 bg-[#0e1425]">
    <!-- Верхняя часть -->
    <div class="flex items-center gap-3">
      <img
        src="/ava.jpg"
        class="h-11 w-11 rounded-full object-cover"
        alt="avatar"
      >
      <div class="flex flex-col">
        <span class="font-semibold">username</span>
        <span class="text-sm text-gray-400">userID </span>
      </div>
    </div>

    <UButton
      class="mt-3 h-7 w-full justify-center"
      variant="subtle"
      color="warning"
      label="Настройки"
      @click="isSettingsOpen = true"
    />
    <UButton
      class="mt-2 h-7 w-full justify-center"
      label="Погода"
      @click="isWeatherOpen = true; loadWeather()"
    />

    <UModal v-model:open="isSettingsOpen">
      <template #content>
        <UserAccountSettings @close="isSettingsOpen = false" />
      </template>
    </UModal>

    <UModal
      v-model:open="isSettingsOpen"
      :ui="{ content: 'max-w-4xl w-full h-[600px]' }"
    >
      <template #content>
        <UserAccountSettings @close="isSettingsOpen = false" />
      </template>
    </UModal>

    <UModal v-model:open="isWeatherOpen">
      <template #content>
        <div class="p-5 text-white">
          <div v-if="weather">
            <p>Город: {{ weather.name }}</p>
            <p>Температура: {{ weather.main.temp }} °C</p>
          </div>
        </div>
      </template>
    </UModal>
  </aside>
</template>

<script setup lang="ts">
type Tile = {
  key: string
  videoTrack?: MediaStreamTrack
  audioTrack?: MediaStreamTrack
  label: string
  isLocal?: boolean
  isScreen?: boolean
  speaking?: boolean
}

const { activeCall, participants, connecting, reconnecting, reconnectFailed, myGroup, localTracks, screenSharing, micEnabled, cameraEnabled } = useCall();
const { user } = useUserState();
const { chatPreviews } = useChats();
const toast = useToast();

const copyCallLink = async () => {
  if (!activeCall.value) return;
  const link = `${location.origin}/call/${activeCall.value.callId}`;
  try {
    await navigator.clipboard.writeText(link);
    toast.add({ title: "Ссылка скопирована", color: "success" });
  } catch {
    toast.add({ title: "Не удалось скопировать ссылку", description: link, color: "error" });
  }
};

// Явный фильтр себя, помимо фикса на источнике (см. useCall.ts onSpeakingChanged) - себя
// показывает отдельный "self-camera"/"self-screen" тайл ниже (свои localTracks), а не запись
// из participants.value. Держим этот фильтр как последний рубеж: если ЛЮБОЙ push-эвент от
// сервера когда-либо ещё создаст себе запись здесь (сейчас или в будущем при новом эвенте) -
// в списке участников она всё равно никогда не всплывёт вторым тайлом "я же, но с другим лейблом".
const participantList = computed(() => Object.values(participants.value).filter(p => p.userId !== user.value?.id));

// Резолвим имя только по уже известным партнёрам из чатов - для звонков без общего
// чата (standalone-встречи) полноценного справочника пользователей у клиента нет,
// не тянем ради этого новый бэкенд-эндпоинт. Фолбэк - короткий, а не полный UUID.
const participantLabel = (userId: string) => {
  const known = chatPreviews.value.find(p => p.partnerId === userId);
  return known?.username ?? `Участник ${userId.slice(0, 8)}`;
};

// Единый список тайлов для обоих режимов сетки. localTracks сам по себе не reactive
// (см. useCall.ts) - явно тянем micEnabled/cameraEnabled/screenSharing как зависимости,
// чтобы Vue пересчитывал список при каждом их изменении.
const allTiles = computed<Tile[]>(() => {
  void micEnabled.value;
  void cameraEnabled.value;
  void screenSharing.value;

  const tiles: Tile[] = [
    {
      key: "self-camera",
      videoTrack: localTracks.camera,
      audioTrack: localTracks.audio,
      label: `${user.value?.username ?? "Вы"} (вы)`,
      isLocal: true,
    },
  ];
  if (localTracks.screen) {
    // audioTrack тут - собственный звук демонстрации, но тайл всё равно muted (см. is-local
    // в ParticipantTile.vue) - не заставляем слушать самих себя, просто для единообразия.
    tiles.push({ key: "self-screen", videoTrack: localTracks.screen, audioTrack: localTracks.screenAudio, label: `${user.value?.username ?? "Вы"} - экран`, isLocal: true, isScreen: true });
  }
  for (const p of participantList.value) {
    tiles.push({ key: `${p.userId}-camera`, videoTrack: p.tracks.camera, audioTrack: p.tracks.audio, label: participantLabel(p.userId), speaking: p.speaking });
    if (p.tracks.screen) {
      tiles.push({ key: `${p.userId}-screen`, videoTrack: p.tracks.screen, audioTrack: p.tracks.screenAudio, label: `${participantLabel(p.userId)} - экран`, isScreen: true });
    }
  }
  return tiles;
});

// Spotlight: как только кто угодно (включая нас) включает демонстрацию экрана, раскладка
// автоматически переключается - показ на весь доступный размер, остальные участники
// сносятся в узкую полосу (сбоку на широких экранах, снизу горизонтальной прокруткой на
// телефоне). Явной кнопки "включить" не нужно - это и есть "автоматически на весь экран".
const spotlightTile = computed(() => allTiles.value.find(t => t.isScreen) ?? null);
const sideTiles = computed(() => {
  const spotlightKey = spotlightTile.value?.key;
  return spotlightKey ? allTiles.value.filter(t => t.key !== spotlightKey) : [];
});

// Динамическая сетка (режим без демонстрации экрана) - заполняет всё доступное
// пространство под тайлы (тайловый WM, а не мелкие фиксированные квадратики), число
// колонок пересчитывается от реального числа тайлов, grid-auto-rows: 1fr растягивает
// строки на всю оставшуюся высоту.
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${Math.ceil(Math.sqrt(allTiles.value.length)) || 1}, minmax(0, 1fr))`,
}));

// Полноэкранный режим на весь монитор (Fullscreen API) - поверх авто-spotlight'а, для
// докладчика, который хочет буквально on-screen presentation. iOS Safari не поддерживает
// requestFullscreen на произвольных элементах - кнопка просто не сработает там, без крэша.
const spotlightEl = ref<HTMLElement | null>(null);
const isFullscreen = ref(false);

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement;
};

onMounted(() => {
  document.addEventListener("fullscreenchange", onFullscreenChange);
});
onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", onFullscreenChange);
});

const toggleFullscreen = async () => {
  if (!spotlightEl.value?.requestFullscreen) return;
  try {
    if (!document.fullscreenElement) {
      await spotlightEl.value.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    console.error("Fullscreen toggle failed:", e);
  }
};
</script>

<template>
  <div class="flex h-full flex-col bg-[#0b1220]">
    <div v-if="connecting" class="flex flex-1 items-center justify-center text-gray-400">
      Подключение...
    </div>

    <div v-else-if="spotlightTile" class="flex min-h-0 flex-1 flex-col-reverse gap-1 overflow-hidden p-1 sm:flex-row">
      <div class="flex flex-none gap-1 overflow-x-auto sm:w-40 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto">
        <div v-for="tile in sideTiles" :key="tile.key" class="h-20 w-32 flex-none sm:h-24 sm:w-full">
          <CallParticipantTile
            :video-track="tile.videoTrack"
            :audio-track="tile.audioTrack"
            :label="tile.label"
            :is-local="tile.isLocal"
            :is-screen="tile.isScreen"
            :speaking="tile.speaking"
          />
        </div>
      </div>

      <div ref="spotlightEl" class="relative min-h-0 min-w-0 flex-1 bg-black">
        <CallParticipantTile
          :video-track="spotlightTile.videoTrack"
          :audio-track="spotlightTile.audioTrack"
          :label="spotlightTile.label"
          :is-local="spotlightTile.isLocal"
          is-screen
        />
        <UButton
          :icon="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
          size="sm"
          variant="solid"
          color="neutral"
          class="absolute right-3 top-3"
          :aria-label="isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'"
          @click="toggleFullscreen"
        />
      </div>
    </div>

    <div v-else class="grid min-h-0 flex-1 auto-rows-fr gap-1 overflow-hidden p-1" :style="gridStyle">
      <CallParticipantTile
        v-for="tile in allTiles"
        :key="tile.key"
        :video-track="tile.videoTrack"
        :audio-track="tile.audioTrack"
        :label="tile.label"
        :is-local="tile.isLocal"
        :is-screen="tile.isScreen"
        :speaking="tile.speaking"
      />
    </div>

    <div v-if="reconnecting" class="flex items-center justify-center gap-2 bg-yellow-500/10 px-4 py-2 text-sm text-yellow-400">
      <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
      Связь прервалась - переподключаемся...
    </div>
    <div v-else-if="reconnectFailed" class="flex items-center justify-center gap-2 bg-red-500/10 px-4 py-2 text-sm text-red-400">
      <UIcon name="i-lucide-wifi-off" class="h-4 w-4" />
      Не удалось переподключиться. Проверьте сеть и выйдите/зайдите в звонок заново.
    </div>

    <div v-if="activeCall" class="flex items-center justify-center gap-2 px-4 pb-1">
      <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-link" label="Скопировать ссылку на звонок" @click="copyCallLink" />
    </div>
    <div v-if="myGroup" class="px-4 pb-2 text-center text-sm text-gray-400">
      Ваша группа: <UBadge :label="myGroup" variant="soft" />
    </div>

    <CallControls />
  </div>
</template>

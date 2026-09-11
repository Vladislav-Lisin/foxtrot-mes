<script setup lang="ts">
const props = defineProps<{
  videoTrack?: MediaStreamTrack
  audioTrack?: MediaStreamTrack
  label: string
  isLocal?: boolean
  isScreen?: boolean
  speaking?: boolean
}>();

const mediaEl = ref<HTMLVideoElement | HTMLAudioElement | null>(null);

// iOS Safari блокирует автовоспроизведение MediaStream-элементов, если непосредственно
// перед .play() не было "живого" пользовательского жеста - атрибут autoplay один этого не
// гарантирует, особенно для <audio>/<video>, у которых srcObject выставлен уже ПОСЛЕ
// монтирования через JS (а не статически при загрузке страницы). play() тогда молча
// реджектится (NotAllowedError), и звук/видео собеседника не идёт вообще, пока пользователь
// сам что-нибудь не нажмёт - например, свой микрофон, потому что getUserMedia() сам по себе
// уже требует пользовательский жест и заодно "разблокирует" автоплей на всей странице.
// Именно поэтому баг выглядел как "звук появляется только после того, как я тоже включил
// микрофон" - совпадение по жесту, а не что-то в сигнализации. Ждём СЛЕДУЮЩЕЕ касание где
// угодно на странице и пробуем снова - тогда для разблокировки достаточно любого тапа, а не
// обязательно именно кнопки микрофона.
const retryPlayOnGesture = () => {
  mediaEl.value?.play().catch(() => {});
};

const attach = () => {
  if (!mediaEl.value) return;
  const tracks = [props.videoTrack, props.audioTrack].filter((t): t is MediaStreamTrack => !!t);
  mediaEl.value.srcObject = tracks.length ? new MediaStream(tracks) : null;
  if (!tracks.length) return;
  mediaEl.value.play().catch(() => {
    document.addEventListener("pointerdown", retryPlayOnGesture, { once: true });
  });
};

onMounted(attach);
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", retryPlayOnGesture);
});
// flush: "post" - иначе это классическая ловушка Vue: по умолчанию watch выполняется ДО
// обновления DOM ("pre"). Когда audioTrack становится доступен раньше videoTrack (только
// микрофон, без камеры), <audio v-else-if> ещё не смонтирован в момент срабатывания
// колбэка - mediaEl.value всё ещё null (от предыдущего v-if), attach() тихо выходит по
// раннему return, и звук никогда не подключается. С "post" колбэк видит уже обновлённый
// DOM/ref. Именно поэтому раньше звук "появлялся" только когда добавлялось видео (камера/
// демонстрация) - тогда onMounted нового <video>-элемента срабатывал уже после монтирования
// и разово подхватывал оба трека сразу.
watch(() => [props.videoTrack, props.audioTrack], attach, { flush: "post" });
</script>

<template>
  <div
    class="relative flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border bg-[#111a2e]"
    :class="speaking ? 'border-yellow-400' : 'border-gray-700'"
  >
    <video
      v-if="videoTrack"
      ref="mediaEl"
      autoplay
      playsinline
      :muted="isLocal"
      class="h-full w-full"
      :class="isScreen ? 'bg-black object-contain' : 'object-cover'"
    />
    <audio
      v-else-if="audioTrack"
      ref="mediaEl"
      autoplay
      :muted="isLocal"
    />
    <div v-if="!videoTrack" class="flex flex-col items-center gap-2 text-gray-400">
      <UIcon name="i-lucide-user-round" class="h-10 w-10" />
    </div>

    <div class="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-xs text-gray-100">
      {{ label }}
    </div>
    <UIcon
      v-if="!isScreen"
      :name="audioTrack ? 'i-lucide-mic' : 'i-lucide-mic-off'"
      class="absolute right-2 top-2 h-4 w-4"
      :class="audioTrack ? 'text-gray-300' : 'text-red-400'"
    />
  </div>
</template>

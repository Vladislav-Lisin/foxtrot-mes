<script setup lang="ts">
const {
  micEnabled, cameraEnabled, screenSharing, myGroup, groupHotkeys,
  toggleMic, toggleCamera, toggleScreenShare, switchGroup, leaveActiveCall, endActiveCall, activeCall,
} = useCall();

const { user } = useUserState();
const isOwner = computed(() => activeCall.value?.ownerId === user.value?.id);

const groupOptions = computed(() =>
  Object.entries(groupHotkeys)
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, group]) => ({ key, group }))
);

const groupColor = (group: string) => {
  if (group === "green") return "success";
  if (group === "blue") return "info";
  if (group === "red") return "error";
  return "warning";
};

const leaving = ref(false);
const ending = ref(false);

const handleLeave = async () => {
  leaving.value = true;
  try {
    await leaveActiveCall();
    await navigateTo("/user/panel");
  } finally {
    leaving.value = false;
  }
};

const handleEnd = async () => {
  ending.value = true;
  try {
    await endActiveCall();
    await navigateTo("/user/panel");
  } finally {
    ending.value = false;
  }
};
</script>

<template>
  <div class="flex flex-wrap items-center justify-center gap-3 border-t border-gray-700 bg-[#0e1425] p-4">
    <UButton
      :color="micEnabled ? 'warning' : 'neutral'"
      variant="soft"
      :icon="micEnabled ? 'i-lucide-mic' : 'i-lucide-mic-off'"
      aria-label="Микрофон"
      @click="toggleMic"
    />
    <UButton
      :color="cameraEnabled ? 'warning' : 'neutral'"
      variant="soft"
      :icon="cameraEnabled ? 'i-lucide-video' : 'i-lucide-video-off'"
      aria-label="Камера"
      @click="toggleCamera"
    />
    <UButton
      :color="screenSharing ? 'warning' : 'neutral'"
      variant="soft"
      icon="i-lucide-monitor-up"
      aria-label="Демонстрация экрана"
      @click="toggleScreenShare"
    />

    <div class="mx-2 flex items-center gap-1">
      <UButton
        v-for="opt in groupOptions"
        :key="opt.key"
        size="xs"
        :variant="myGroup === opt.group ? 'solid' : 'outline'"
        :color="groupColor(opt.group)"
        :label="opt.key"
        @click="switchGroup(opt.group)"
      />
      <UButton
        size="xs"
        :variant="myGroup === null ? 'solid' : 'outline'"
        color="neutral"
        label="0"
        @click="switchGroup(null)"
      />
    </div>

    <UButton
      color="error"
      variant="soft"
      icon="i-lucide-phone-off"
      label="Выйти"
      :loading="leaving"
      @click="handleLeave"
    />
    <UButton
      v-if="isOwner"
      color="error"
      variant="solid"
      icon="i-lucide-square"
      label="Завершить для всех"
      :loading="ending"
      @click="handleEnd"
    />
  </div>
</template>

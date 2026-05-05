<script setup lang="ts">
import ProfileSettings from "./ProfileSettings.vue";
import SupportPanel from "./SupportPanel.vue";

const activeSettings = ref('account');
const emit = defineEmits(["close"]);
</script>

<template>
  <div class="flex justify-end p-2 shrink-0">
    <UButton
      class="rounded-full"
      icon="i-lucide-x"
      size="md"
      color="warning"
      variant="soft"
      @click="emit('close')"
    />
  </div>
  <div class="flex flex-col md:flex-row flex-1 overflow-hidden">
    <UCard class="md:flex-[0_0_22%] md:min-w-[16rem] md:max-w-[22rem] rounded-none">
      <UFieldGroup class="flex flex-col gap-2">
        <UButton
          icon="i-lucide-user-pen"
          class="text-md"
          label="Настройки профиля"
          color="neutral"
          variant="ghost"
          @click="activeSettings = 'account'"
        />
        <UButton
          icon="i-lucide-mail-question-mark"
          class="text-md"
          label="Служба поддержки"
          color="neutral"
          variant="ghost"
          @click="activeSettings = 'support'"
        />
      </UFieldGroup>
    </UCard>
    <UCard class="flex-1 rounded-none overflow-y-auto overflow-x-hidden">
      <ProfileSettings v-if="activeSettings === 'account'" />
      <SupportPanel v-else-if="activeSettings === 'support'" />
    </UCard>
  </div>
</template>

<script setup lang="ts">
import ProfileSettings from "./ProfileSettings.vue";
import SupportPanel from "./SupportPanel.vue";

const avatarSrc = ref("/ava.jpg");
const firstName = ref("Vladislav");
const lastName = ref("Lisin");
const userTag = ref("lis12");
const activeSettings = ref('account');

const emit = defineEmits(["close"]);
</script>

<template>
  <div class="flex justify-end p-2">
    <UButton
      class="rounded-full"
      icon="i-lucide-x"
      size="md"
      color="warning"
      variant="soft"
      @click="emit('close')"
    />
  </div>
  <div class="flex flex-col md:flex-row h-full overflow-hidden">
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
    <UCard class="flex-1 rounded-none overflow-y-auto">
      <ProfileSettings
        v-if="activeSettings === 'account'"
        :avatar="avatarSrc"
        :first-name="firstName"
        :last-name="lastName"
        :user-tag="userTag"
      />
      <SupportPanel v-else-if="activeSettings === 'support'" />
    </UCard>
  </div>
</template>

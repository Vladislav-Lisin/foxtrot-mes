<script setup lang="ts">
import { useUserState } from "~/composables/userState";
import { updateUserSettings } from "~/api/settings";

const { user, setUser } = useUserState();

const emit = defineEmits(["close", "save"]);

const firstName = ref("");
const lastName = ref("");
const userTag = ref("");
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);

watch(
  user,
  (value) => {
    firstName.value = value?.username ?? "";
    lastName.value = "";
    userTag.value = value?.tag ?? "";
  },
  { immediate: true }
);

async function saveProfile() {
  if (!user.value) return;

  isSaving.value = true;
  errorMessage.value = null;

  try {
    const result = await updateUserSettings({
      username: firstName.value.trim(),
      tag: userTag.value.trim(),
    });

    setUser({
      ...user.value,
      username: result.username,
      tag: result.tag,
    });

    emit("save", {
      firstName: firstName.value,
      lastName: lastName.value,
      tag: userTag.value,
    });
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : "Не удалось сохранить настройки пользователя";
    console.error(error);
  } finally {
    isSaving.value = false;
  }
}
</script>

<template>
  <div class="flex gap-3 p-4 flex-col items-center w-full">
    <img
      :src="user?.avatarUrl"
      class="w-28 h-28 md:w-40 md:h-40 rounded-full object-cover"
      alt="avatar"
    >

    <UFileUpload>
      <UButton variant="ghost" color="warning" label="Изменить фотографию" />
    </UFileUpload>

    <UFieldGroup orientation="vertical" class="w-70">
      <UInput
        v-model="firstName"
        size="xl"
        variant="outline"
        placeholder="Имя"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Укажите имя для Вашего профиля.
      </p>

      <UInput
        class="mt-2"
        v-model="userTag"
        size="xl"
        variant="outline"
        placeholder="ID пользователя"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Придумайте @tag для Вашего профиля.
      </p>
    </UFieldGroup>

    <UButton
      class="w-full max-w-70 justify-center"
      color="warning"
      label="Готово"
      variant="subtle"
      :disabled="isSaving"
      @click="saveProfile"
    />

    <p v-if="errorMessage" class="mt-3 text-sm text-red-400">
      {{ errorMessage }}
    </p>
  </div>
</template>

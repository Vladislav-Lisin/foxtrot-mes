<script setup lang="ts">
import { useUserState } from "~/composables/userState";
import { updateUserSettings, uploadAvatar, resetAvatar } from "~/api/settings";
import { apiBase } from "~/api/apiBase";

const { user, setUser } = useUserState();

const emit = defineEmits(["close", "save"]);

const firstName = ref("");
const lastName = ref("");
const userTag = ref("");
const statusText = ref("");
const bio = ref("");
const isSaving = ref(false);
const errorMessage = ref<string | null>(null);

const avatarFile = ref<File | null>(null);
const avatarInput = ref<HTMLInputElement | null>(null);
const isUploadingAvatar = ref(false);

const onAvatarPicked = (event: Event) => {
  const input = event.target as HTMLInputElement;
  avatarFile.value = input.files?.[0] ?? null;
  input.value = ""; // чтобы можно было выбрать тот же файл повторно
};

// avatarUrl с бэкенда - относительный путь ("/uploads/..."), как и фон чата - добавляем
// apiBase сами; внешние ссылки (старые/будущие) трогать не нужно, они уже абсолютные.
const avatarSrc = computed(() => {
  const url = user.value?.avatarUrl;
  if (!url) return "/ava.jpg";
  return url.startsWith("/") ? `${apiBase()}${url}` : url;
});

watch(avatarFile, async (file) => {
  if (!file) return;
  isUploadingAvatar.value = true;
  errorMessage.value = null;
  try {
    const result = await uploadAvatar(file);
    if (user.value) setUser({ ...user.value, avatarUrl: result.avatarUrl });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Не удалось загрузить аватарку";
  } finally {
    isUploadingAvatar.value = false;
    avatarFile.value = null;
  }
});

const handleResetAvatar = async () => {
  isUploadingAvatar.value = true;
  errorMessage.value = null;
  try {
    const result = await resetAvatar();
    if (user.value) setUser({ ...user.value, avatarUrl: result.avatarUrl });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Не удалось сбросить аватарку";
  } finally {
    isUploadingAvatar.value = false;
  }
};

watch(
  user,
  (value) => {
    firstName.value = value?.username ?? "";
    lastName.value = "";
    userTag.value = value?.tag ?? "";
    statusText.value = value?.statusText ?? "";
    bio.value = value?.bio ?? "";
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
      statusText: statusText.value.trim(),
      bio: bio.value.trim(),
    });

    setUser({
      ...user.value,
      username: result.username,
      tag: result.tag,
      statusText: result.statusText,
      bio: result.bio,
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
    <input
      ref="avatarInput"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/gif"
      class="hidden"
      @change="onAvatarPicked"
    >

    <button
      type="button"
      class="group relative rounded-full"
      :disabled="isUploadingAvatar"
      aria-label="Сменить аватарку"
      @click="avatarInput?.click()"
    >
      <img
        :src="avatarSrc"
        class="w-28 h-28 md:w-40 md:h-40 rounded-full object-cover"
        alt="avatar"
      >
      <span class="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-sm text-white opacity-0 transition group-hover:opacity-100">
        Сменить фото
      </span>
    </button>

    <div class="flex items-center gap-2">
      <UButton
        variant="ghost"
        color="warning"
        label="Изменить фотографию"
        :loading="isUploadingAvatar"
        @click="avatarInput?.click()"
      />
      <UButton
        v-if="user?.avatarUrl"
        variant="ghost"
        color="neutral"
        label="Сбросить"
        :loading="isUploadingAvatar"
        @click="handleResetAvatar"
      />
    </div>

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

      <UInput
        class="mt-2"
        v-model="statusText"
        size="xl"
        variant="outline"
        placeholder="Статус, например: в отпуске до 15 числа"
        maxlength="100"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Виден всем рядом с вашим именем, даже без захода в профиль. Оставьте пустым, чтобы убрать.
      </p>

      <UInput
        class="mt-2"
        v-model="bio"
        size="xl"
        variant="outline"
        placeholder="О себе"
        maxlength="200"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Постоянное описание профиля - видно в мини-профиле собеседника.
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

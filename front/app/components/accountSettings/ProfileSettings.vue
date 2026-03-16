<script setup lang="ts">
interface Props {
  avatar: string
  firstName: string
  lastName: string
  userTag: string
}

const props = defineProps<Props>();

const emit = defineEmits(["close", "save"]);

// локальное состояние (для редактирования)
const firstName = ref(props.firstName);
const lastName = ref(props.lastName);
const userTag = ref(props.userTag);

function saveProfile() {
  emit("save", {
    firstName: firstName.value,
    lastName: lastName.value,
    tag: userTag.value,
  });
}
</script>

<template>
  <div class="flex gap-3 p-4 flex-col items-center w-full">
    <img
      :src="props.avatar"
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

      <UInput
        v-model="lastName"
        size="xl"
        variant="outline"
        placeholder="Фамилия"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Укажите имя и фамилию для Вашего профиля.
      </p>

      <UInput
        class="mt-2"
        v-model="userTag"
        size="xl"
        variant="outline"
        placeholder="ID пользователя"
      />

      <p class="text-gray-400 mt-1 text-sm">
        Придумайте уникальный ID вашего профиля.
      </p>
    </UFieldGroup>

    <UButton
      class="w-full max-w-70 justify-center"
      color="warning"
      label="Готово"
      variant="subtle"
      @click="saveProfile"
    />
  </div>
</template>

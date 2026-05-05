<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { loginUser } from "~/api/auth";
import { useUserState } from "~/composables/userState";

const { setUser } = useUserState();

const fields: AuthFormField[] = [
  {
    name: "email",
    type: "email",
    label: "Email",
    placeholder: "Введите email",
    required: true,
  },
  {
    name: "password",
    label: "Пароль",
    type: "password",
    placeholder: "Введите пароль",
    required: true,
  },
];

const schema = z.object({
  email: z.email("Некорректный email"),
  password: z
    .string("Необходимо ввести корректный пароль")
    .min(8, "Должно быть не меньше 8 символов"),
});

type Schema = z.output<typeof schema>;
const loading = ref(false);
const error = ref("");

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  try {
    loading.value = true;
    error.value = "";

    const result = await loginUser({
      email: payload.data.email,
      password: payload.data.password,
    });

    setUser(result.user ?? result);

    // успех → редирект
    navigateTo("/user/panel");
  } catch (e: unknown) {
    if (e instanceof Error) {
      error.value = e.message
    } else {
      error.value = "Ошибка регистрации"
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md bg-[#0e1425]">
      <UAuthForm
        :schema="schema"
        title="Авторизация"
        description="Войдите в свой аккаунт"
        icon="i-lucide-door-open"
        :fields="fields"
        :submit="{
          label: 'Войти',
          color: 'warning'
        }"
        @submit="onSubmit"
      />
    </UPageCard>
  </div>
</template>

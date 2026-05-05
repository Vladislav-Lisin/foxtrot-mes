<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";
import { registerUser } from "~/api/auth";
import { useUserState } from "~/composables/userState";

const { setUser } = useUserState();

const fields: AuthFormField[] = [
  {
    name: "username",
    type: "text",
    label: "Username",
    placeholder: "Введите username",
    required: true,
  },
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
  {
    name: "repassword",
    label: "Повторите пароль",
    type: "password",
    placeholder: "Введите пароль повторно",
    required: true,
  },
];

const schema = z
  .object({
    username: z.string().min(3, "Минимум 3 символа"),
    email: z.string().email("Некорректный email"),
    password: z.string().min(8, "Минимум 8 символов"),
    repassword: z.string(),
  })
  .refine(data => data.password === data.repassword, {
    message: "Пароли не совпадают",
    path: ["repassword"],
  });

type Schema = z.output<typeof schema>;

const loading = ref(false);
const error = ref("");

async function onSubmit(payload: FormSubmitEvent<Schema>) {
  try {
    loading.value = true;
    error.value = "";

    const result = await registerUser({
      username: payload.data.username,
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
        title="Регистрация"
        description="Создайте аккаунт"
        icon="i-lucide-user"
        :fields="fields"
        :submit="{
          label: loading ? 'Загрузка...' : 'Зарегистрироваться',
          color: 'warning',
          disabled: loading
        }"
        @submit="onSubmit"
      />

      <!-- ошибка -->
      <p v-if="error" class="text-red-500 mt-2 text-center">
        {{ error }}
      </p>
    </UPageCard>
  </div>
</template>

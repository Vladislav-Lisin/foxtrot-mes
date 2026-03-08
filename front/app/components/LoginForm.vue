<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent, AuthFormField } from "@nuxt/ui";

const toast = useToast();

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

const providers = [
  {
    label: "Google",
    icon: "i-simple-icons-google",
    onClick: () => {
      toast.add({ title: "Google", description: "Login with Google" });
    },
  },
  {
    label: "GitHub",
    icon: "i-simple-icons-github",
    onClick: () => {
      toast.add({ title: "GitHub", description: "Login with GitHub" });
    },
  },
];

const schema = z.object({
  email: z.email("Некорректный email"),
  password: z
    .string("Необходимо ввести корректный пароль")
    .min(8, "Должно быть не меньше 8 символов"),
});

type Schema = z.output<typeof schema>;

function onSubmit(payload: FormSubmitEvent<Schema>) {
  console.log("Submitted", payload);
  navigateTo('/user/panel')
}
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-4 p-4">
    <UPageCard class="w-full max-w-md bg-[#0e1425]">
      <UAuthForm
        :schema="schema"
        title="Авторизация"
        description="Войдите в свой аккаунт"
        icon="i-lucide-user"
        :fields="fields"
        :providers="providers"
        :submit="{
          label: 'Войти',
          color: 'warning'
        }"
        @submit="onSubmit"
      />
      <div class="flex justify-center">
        <UButton class="w-full justify-center" to="/registration" color="warning" variant="outline" label="Зарегистрироваться" />
      </div>
    </UPageCard>
  </div>
</template>

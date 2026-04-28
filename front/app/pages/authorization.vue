<script setup lang="ts">
const items = [
  {
    label: 'Авторизация',
    icon: 'i-lucide-door-open',
    slot: 'authorization'
  },
  {
    label: 'Регистрация',
    icon: 'i-lucide-user',
    slot: 'registration'
  }
]
</script>

<template>
  <div class="max-w-md mx-auto mt-4">
    <UTabs :items="items" color="warning">
      <template #authorization>
        <LoginForm />
      </template>

      <template #registration>
        <RegistrationForm />
      </template>
    </UTabs>
  </div>
</template>

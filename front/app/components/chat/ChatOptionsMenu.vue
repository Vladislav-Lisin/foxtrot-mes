<script setup lang="ts">
const emit = defineEmits<{
  openSearch: []
}>();

const { selectedChat, uploadBackground, resetBackground, blockPartner, unblockPartner, deleteChatForMe, deleteChatForEveryone } = useChats();
const toast = useToast();

const fileInput = ref<HTMLInputElement | null>(null);
const isDeleteModalOpen = ref(false);
const busy = ref(false);

const triggerBackgroundPicker = () => {
  fileInput.value?.click();
};

const onFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // тот же файл можно будет выбрать повторно
  if (!file) return;

  busy.value = true;
  try {
    await uploadBackground(file);
    toast.add({ title: "Фон чата обновлён", color: "success" });
  } catch (e) {
    toast.add({ title: "Не удалось загрузить фон", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    busy.value = false;
  }
};

const handleResetBackground = async () => {
  busy.value = true;
  try {
    await resetBackground();
    toast.add({ title: "Фон чата сброшен", color: "success" });
  } catch (e) {
    toast.add({ title: "Не удалось сбросить фон", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    busy.value = false;
  }
};

const handleToggleBlock = async () => {
  busy.value = true;
  try {
    if (selectedChat.value?.blockedByMe) {
      await unblockPartner();
      toast.add({ title: "Пользователь разблокирован", color: "success" });
    } else {
      await blockPartner();
      toast.add({ title: "Пользователь заблокирован", color: "success" });
    }
  } catch (e) {
    toast.add({ title: "Не удалось изменить блокировку", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    busy.value = false;
  }
};

const handleDeleteForMe = async () => {
  busy.value = true;
  try {
    await deleteChatForMe();
    isDeleteModalOpen.value = false;
    toast.add({ title: "Чат удалён у вас", color: "success" });
  } catch (e) {
    toast.add({ title: "Не удалось удалить чат", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    busy.value = false;
  }
};

const handleDeleteForEveryone = async () => {
  busy.value = true;
  try {
    await deleteChatForEveryone();
    isDeleteModalOpen.value = false;
    toast.add({ title: "Чат удалён для всех", color: "success" });
  } catch (e) {
    toast.add({ title: "Не удалось удалить чат", description: e instanceof Error ? e.message : String(e), color: "error" });
  } finally {
    busy.value = false;
  }
};

const menuItems = computed(() => [[
  { label: "Сменить фон чата", icon: "i-lucide-image", onSelect: triggerBackgroundPicker },
  ...(selectedChat.value?.backgroundUrl
    ? [{ label: "Сбросить фон чата", icon: "i-lucide-image-off", onSelect: handleResetBackground }]
    : []),
  { label: "Поиск по сообщениям", icon: "i-lucide-search", onSelect: () => emit("openSearch") },
], [
  selectedChat.value?.blockedByMe
    ? { label: "Разблокировать", icon: "i-lucide-circle-check", onSelect: handleToggleBlock }
    : { label: "Заблокировать", icon: "i-lucide-circle-slash", color: "error" as const, onSelect: handleToggleBlock },
  { label: "Удалить чат", icon: "i-lucide-trash-2", color: "error" as const, onSelect: () => (isDeleteModalOpen.value = true) },
]]);
</script>

<template>
  <div>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    >

    <UDropdownMenu :items="menuItems" :content="{ align: 'end' }">
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-ellipsis-vertical"
        aria-label="Меню чата"
        :loading="busy"
      />
    </UDropdownMenu>

    <UModal v-model:open="isDeleteModalOpen" title="Удалить чат">
      <template #content>
        <div class="flex flex-col gap-4 p-4">
          <p class="text-sm text-gray-300">
            Чат с <b>{{ selectedChat?.username }}</b> будет удалён. Выберите, как именно:
          </p>
          <div>
            <UButton
              label="Удалить только у меня"
              color="neutral"
              variant="soft"
              block
              :loading="busy"
              @click="handleDeleteForMe"
            />
            <p class="mt-1 text-xs text-gray-400">
              Собеседник ничего не теряет - чат и сообщения остаются у него.
            </p>
          </div>
          <div>
            <UButton
              label="Удалить для всех"
              color="error"
              variant="solid"
              block
              :loading="busy"
              @click="handleDeleteForEveryone"
            />
            <p class="mt-1 text-xs text-red-400">
              Необратимо стирает переписку с обеих сторон.
            </p>
          </div>
          <UButton label="Отмена" color="neutral" variant="ghost" block @click="isDeleteModalOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>

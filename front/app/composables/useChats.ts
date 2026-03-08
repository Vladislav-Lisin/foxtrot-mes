export interface Chat {
  id: number
  username: string
  type: string
  lastMessage: string
  avatar: string
}

export const useChats = () => {
  const chats = ref<Chat[]>([
    {
      id: 1,
      username: 'Алексей',
      type: 'personal',
      lastMessage: 'Привет, как дела?',
      avatar: 'https://i.pravatar.cc/40?img=1'
    },
    {
      id: 2,
      username: 'Foxtrot Dev',
      type: 'servers',
      lastMessage: 'Новый коммит в репозитории',
      avatar: 'https://i.pravatar.cc/40?img=2'
    },
    {
      id: 3,
      username: 'Мария',
      type: 'personal',
      lastMessage: 'Отправь файл пожалуйста',
      avatar: 'https://i.pravatar.cc/40?img=3'
    }
  ])
  const activeFilter = useState('chatFilter', () => 'all')

  const filteredChats = computed(() => {
    if (activeFilter.value === 'all') return chats.value
    return chats.value.filter(c => c.type === activeFilter.value)
  })

  return {
    chats,
    activeFilter,
    filteredChats
  }
}

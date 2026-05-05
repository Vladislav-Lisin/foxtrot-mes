import type { StompSubscription } from "@stomp/stompjs"
import { createPrivateChat, findChatByTag, getChatHistory } from "~/api/chats"
import type { ChatFinderResponse, ChatMessage, ChatPreviewDTO, SendMessageRequest } from "~/types/chat"

export type ChatFilter = "all" | "personal" | "servers"

export type ChatPreviewUI = {
  partnerId: string
  chatId: string | null
  userTag: string
  username: string
  avatar: string | null
  type: "personal"
  lastMessage: string
  lastMessageAt: string | null
  alreadyExists: boolean
}

function normalizeTagForRequest(tag: string) {
  const t = tag.trim()
  if (!t) return ""
  return t.startsWith("@") ? t.slice(1) : t
}

function sortPreviews(list: ChatPreviewUI[]) {
  return [...list].sort((a, b) => {
    const atA = a.lastMessageAt ? Date.parse(a.lastMessageAt) : -Infinity
    const atB = b.lastMessageAt ? Date.parse(b.lastMessageAt) : -Infinity
    return atB - atA
  })
}

function upsertPreview(list: ChatPreviewUI[], incoming: ChatPreviewUI) {
  const idx = list.findIndex((p) => {
    if (incoming.chatId && p.chatId) return p.chatId === incoming.chatId
    return p.partnerId === incoming.partnerId
  })
  const next = idx >= 0
    ? [...list.slice(0, idx), { ...list[idx], ...incoming }, ...list.slice(idx + 1)]
    : [incoming, ...list]
  return sortPreviews(next)
}

function dtoToPreview(dto: ChatPreviewDTO): ChatPreviewUI {
  return {
    partnerId: dto.partner.id,
    chatId: dto.chatId,
    userTag: dto.partner.tag,
    username: dto.partner.username,
    avatar: dto.partner.avatarUrl ?? null,
    type: "personal",
    lastMessage: dto.lastMessage ?? "",
    lastMessageAt: dto.lastMessageAt ?? null,
    alreadyExists: true,
  }
}

function finderToPreview(dto: ChatFinderResponse): ChatPreviewUI {
  return {
    partnerId: dto.partner.id,
    chatId: dto.chatId,
    userTag: dto.partner.tag,
    username: dto.partner.username,
    avatar: dto.partner.avatarUrl ?? null,
    type: "personal",
    lastMessage: dto.alreadyExists ? (dto.lastMessage ?? "") : "здесь пока нет сообщений",
    lastMessageAt: dto.lastMessageAt ?? null,
    alreadyExists: dto.alreadyExists,
  }
}

function decodeMessageContent(content: unknown): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    try {
      return new TextDecoder().decode(new Uint8Array(content as number[]))
    } catch {
      return ""
    }
  }
  return ""
}

function canonicalUserId(raw: unknown) {
  if (typeof raw !== "string") return ""
  const s = raw.trim().toLowerCase()
  if (!s) return ""
  return s.replace(/-/g, "")
}

export const useChats = () => {
  const { token, user } = useUserState()

  const chatPreviews = useState<ChatPreviewUI[]>("chatPreviews", () => [])
  const activeFilter = useState<ChatFilter>("chatFilter", () => "all")
  const selectedChat = useState<ChatPreviewUI | null>("selectedChat", () => null)
  const searchTag = useState<string>("chatSearchTag", () => "")
  const isSearching = useState<boolean>("chatSearchLoading", () => false)
  const lastSearchedTag = useState<string>("chatLastSearchedTag", () => "")

  // messages per chatId
  const messagesByChatId = useState<Record<string, ChatMessage[]>>("chatMessagesById", () => ({}))
  const isWsConnected = useState<boolean>("wsConnected", () => false)
  const pendingOutbox = useState<Record<string, string>>("chatPendingOutbox", () => ({}))

  const chatTopicSub = useState<StompSubscription | null>("chatTopicSub", () => null)

  const filteredChats = computed(() => {
    const list = chatPreviews.value
    if (activeFilter.value === "all") return list
    return list.filter((c) => c.type === activeFilter.value)
  })

  const currentMessages = computed(() => {
    const chatId = selectedChat.value?.chatId
    if (!chatId) return []
    return messagesByChatId.value[chatId] ?? []
  })

  const loadHistory = async (chatId: string) => {
    const response = await getChatHistory(chatId, 0, 50)
    const content = response.history?.content ?? []
    // backend returns DESC order; UI usually needs ASC
    const normalized = [...content]
      .reverse()
      .map((m) => ({
        id: m.id,
        chatId,
        senderId: m.senderId,
        content: decodeMessageContent(m.content),
        timestamp: m.createdAt,
        status: (m.status as ChatMessage["status"]) ?? "SENT",
      }))

    messagesByChatId.value = {
      ...messagesByChatId.value,
      [chatId]: normalized,
    }
  }

  const connectWsIfNeeded = async () => {
    if (!process.client) return
    if (!token.value) return

    const socket = useChatSocket()
    await socket.ensureConnected({
      accessToken: token.value,
      handlers: {
        onConnectedChange: (v) => (isWsConnected.value = v),
        onPreview: (dto) => {
          chatPreviews.value = upsertPreview(chatPreviews.value, dtoToPreview(dto))
        },
        onPersonalStatus: (msg) => {
          // backend sends DELIVERED to sender with full message fields,
          // and READ as status-only payload (no id).
          const chatId = msg.chatId
          if (!chatId) return
          const list = messagesByChatId.value[chatId] ?? []

          if (msg.id) {
            messagesByChatId.value = {
              ...messagesByChatId.value,
              [chatId]: list.map((m) => (m.id === msg.id ? { ...m, status: msg.status } : m)),
            }
            return
          }

          if (msg.status === "READ") {
            messagesByChatId.value = {
              ...messagesByChatId.value,
              [chatId]: list.map((m) => ({ ...m, status: "READ" })),
            }
          }
        },
      },
    })
  }

  const disconnectWs = async () => {
    if (!process.client) return
    const socket = useChatSocket()
    chatTopicSub.value?.unsubscribe()
    chatTopicSub.value = null
    await socket.disconnect()
    isWsConnected.value = false
  }

  if (process.client) {
    watch(
      () => token.value,
      async (t) => {
        if (!t) {
          await disconnectWs()
          return
        }
        await connectWsIfNeeded()
      },
      { immediate: true }
    )
  }

  const openChatSubscription = async (chatId: string) => {
    if (!process.client) return
    await connectWsIfNeeded()
    const socket = useChatSocket()
    await socket.waitUntilConnected()

    chatTopicSub.value?.unsubscribe()
    chatTopicSub.value = null

    const sub = socket.subscribeChat(chatId, (msg) => {
      // merge echo with optimistic message if possible
      const myIdCanon = canonicalUserId(user.value?.id)
      const senderCanon = canonicalUserId(msg.senderId)

      if (myIdCanon && senderCanon === myIdCanon) {
        const list = messagesByChatId.value[chatId] ?? []
        const optimisticIdx = list.findIndex(
          (m) =>
            !!m.id &&
              m.id.startsWith("temp-") &&
              pendingOutbox.value[m.id] === (msg.content ?? "")
        )
        if (optimisticIdx >= 0) {
          const tempId = list[optimisticIdx].id!
          const { [tempId]: _, ...rest } = pendingOutbox.value
          pendingOutbox.value = rest

          const replaced = [...list]
          replaced[optimisticIdx] = {
            ...msg,
          }
          messagesByChatId.value = { ...messagesByChatId.value, [chatId]: replaced }
        } else {
          messagesByChatId.value = {
            ...messagesByChatId.value,
            [chatId]: [...list, msg],
          }
        }
      } else {
        // append message if belongs to current chat
        messagesByChatId.value = {
          ...messagesByChatId.value,
          [chatId]: [...(messagesByChatId.value[chatId] ?? []), msg],
        }
      }

      // local preview update
      const preview = chatPreviews.value.find((p) => p.chatId === chatId)
      if (preview) {
        chatPreviews.value = upsertPreview(chatPreviews.value, {
          ...preview,
          lastMessage: msg.content ?? "",
          lastMessageAt: new Date().toISOString(),
          alreadyExists: true,
        })
      }
    })

    if (!sub) {
      console.error("[ws] Failed to subscribe to chat topic:", chatId)
      throw new Error("Failed to subscribe to chat topic")
    }

    chatTopicSub.value = sub
  }

  const selectChat = async (chat: ChatPreviewUI) => {
    selectedChat.value = chat

    if (!chat.chatId) {
      chatTopicSub.value?.unsubscribe()
      chatTopicSub.value = null
      return
    }

    await loadHistory(chat.chatId)
    await openChatSubscription(chat.chatId)
  }

  const searchChat = async () => {
    const tag = normalizeTagForRequest(searchTag.value)
    if (!tag) return
    if (isSearching.value) return

    // When user searches a different tag, clear old previews
    if (lastSearchedTag.value && lastSearchedTag.value !== tag) {
      chatPreviews.value = []
      selectedChat.value = null
      chatTopicSub.value?.unsubscribe()
      chatTopicSub.value = null
      messagesByChatId.value = {}
    }

    isSearching.value = true

    try {
      const dto = await findChatByTag(tag)
      lastSearchedTag.value = tag
      const preview = finderToPreview(dto)
      chatPreviews.value = upsertPreview(chatPreviews.value, preview)
      await selectChat(preview)
    } finally {
      isSearching.value = false
    }
  }

  const ensurePrivateChatCreated = async () => {
    const chat = selectedChat.value
    if (!chat) return
    if (chat.chatId) return

    const dto = await createPrivateChat(chat.partnerId)
    const preview = finderToPreview(dto)
    chatPreviews.value = upsertPreview(chatPreviews.value, preview)
    await selectChat(preview)
  }

  const sendMessage = async (content: string) => {
    if (!process.client) return
    if (!token.value) throw new Error("no access token")

    if (!selectedChat.value) throw new Error("chat is not selected")
    if (!selectedChat.value.chatId) {
      await ensurePrivateChatCreated()
    }

    const chatId = selectedChat.value?.chatId
    if (!chatId) throw new Error("chatId is null (чат ещё не создан)")

    // optimistic bubble
    const tempId = `temp-${Date.now()}`
    const myId = user.value?.id
    const optimistic: ChatMessage = {
      id: tempId,
      clientTempId: tempId,
      chatId,
      senderId: myId ?? undefined,
      content,
      timestamp: Date.now(),
      status: "SENT",
    }
    pendingOutbox.value = { ...pendingOutbox.value, [tempId]: content }
    messagesByChatId.value = {
      ...messagesByChatId.value,
      [chatId]: [...(messagesByChatId.value[chatId] ?? []), optimistic],
    }
    const preview = chatPreviews.value.find((p) => p.chatId === chatId)
    if (preview) {
      chatPreviews.value = upsertPreview(chatPreviews.value, {
        ...preview,
        lastMessage: content,
        lastMessageAt: new Date().toISOString(),
        alreadyExists: true,
      })
    }

    const socket = useChatSocket()
    const payload: SendMessageRequest = { chatId, content }
    await connectWsIfNeeded()
    await socket.waitUntilConnected()
    await socket.send("/app/chat", payload)
  }

  const markChatRead = async () => {
    const chatId = selectedChat.value?.chatId
    if (!process.client) return
    if (!chatId) return
    const socket = useChatSocket()
    await connectWsIfNeeded()
    await socket.waitUntilConnected()
    await socket.send("/app/read", { chatId })
  }

  return {
    chatPreviews,
    activeFilter,
    filteredChats,
    selectedChat,
    currentMessages,
    messagesByChatId,
    isWsConnected,
    isSearching,
    searchTag,
    searchChat,
    selectChat,
    ensurePrivateChatCreated,
    sendMessage,
    markChatRead,
    connectWsIfNeeded,
  }
}

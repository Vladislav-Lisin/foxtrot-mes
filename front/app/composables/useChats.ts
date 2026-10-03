import type { StompSubscription } from "@stomp/stompjs"
import { apiBase, mediaUrl } from "~/api/apiBase"
import { fetchMe } from "~/api/auth"
import {
  createPrivateChat,
  findChatByTag,
  getAllChatsPreview,
  getChatHistory,
  searchChatMessages as searchChatMessagesApi,
  uploadChatBackground as uploadChatBackgroundApi,
  resetChatBackground as resetChatBackgroundApi,
  blockChatPartner as blockChatPartnerApi,
  unblockChatPartner as unblockChatPartnerApi,
  deleteChatForMe as deleteChatForMeApi,
  deleteChatForEveryone as deleteChatForEveryoneApi
} from "~/api/chats"
import type {
  ChatFinderResponse,
  ChatMessage,
  ChatPreviewDTO,
  MessageStatus,
  SendMessageRequest
} from "~/types/chat"

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
  /** Статус последнего сообщения текущего пользователя (из WS / локально при отправке) */
  lastOutgoingStatus?: MessageStatus | null
  alreadyExists: boolean
  unreadCount: number
  /** Кто прислал lastMessage - для "Вы: ..." в списке чатов у отправителя */
  lastMessageSenderId?: string | null
  /** null, если собеседники заблокировали друг друга (см. ChatPreviewDTO) */
  partnerOnline?: boolean | null
  partnerStatusText?: string | null
  partnerBio?: string | null
  backgroundUrl?: string | null
  blockedByMe?: boolean
  blockedByPartner?: boolean
}

function normalizeTagForRequest(tag: string) {
  const t = tag.replace(/\s+/g, "").trim()
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

  if (idx >= 0) {
    const existing = list[idx]!
    const merged = { ...existing, ...incoming }

    if (
      existing.lastOutgoingStatus
      && incoming.lastOutgoingStatus == null
      && incoming.lastMessage === existing.lastMessage
    ) {
      merged.lastOutgoingStatus = existing.lastOutgoingStatus
    }

    const next = [...list.slice(0, idx), merged, ...list.slice(idx + 1)]
    return sortPreviews(next)
  }

  return sortPreviews([incoming, ...list])
}

function dtoToPreview(dto: ChatPreviewDTO): ChatPreviewUI {
  const status = dto.status ?? (dto as ChatPreviewDTO & { lastMessageStatus?: MessageStatus }).lastMessageStatus ?? null

  return {
    partnerId: dto.partner.id,
    chatId: dto.chatId,
    userTag: dto.partner.tag,
    username: dto.partner.username,
    avatar: mediaUrl(dto.partner.avatarUrl),
    type: "personal",
    lastMessage: dto.lastMessage ?? "",
    lastMessageAt: dto.lastMessageAt ?? null,
    lastOutgoingStatus: status,
    alreadyExists: true,
    unreadCount: dto.unreadCount ?? 0,
    lastMessageSenderId: dto.lastMessageSenderId ?? null,
    partnerOnline: dto.partner.online ?? null,
    partnerStatusText: dto.partner.statusText ?? null,
    partnerBio: dto.partner.bio ?? null,
    backgroundUrl: dto.backgroundUrl ?? null,
    blockedByMe: dto.blockedByMe ?? false,
    blockedByPartner: dto.blockedByPartner ?? false,
  }
}

function finderToPreview(dto: ChatFinderResponse): ChatPreviewUI {
  return {
    partnerId: dto.partner.id,
    chatId: dto.chatId,
    userTag: dto.partner.tag,
    username: dto.partner.username,
    avatar: mediaUrl(dto.partner.avatarUrl),
    type: "personal",
    lastMessage: dto.alreadyExists ? (dto.lastMessage ?? "") : "здесь пока нет сообщений",
    lastMessageAt: dto.lastMessageAt ?? null,
    alreadyExists: dto.alreadyExists,
    unreadCount: 0,
    lastMessageSenderId: null,
    partnerOnline: dto.partner.online ?? null,
    partnerStatusText: dto.partner.statusText ?? null,
    partnerBio: dto.partner.bio ?? null,
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

let chatRealtimeWatchersStarted = false
let latestSearchRequestId = 0

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
    let list = chatPreviews.value
    if (activeFilter.value !== "all") {
      list = list.filter(c => c.type === activeFilter.value)
    }

    // Поиск по @тегу - отдельный сценарий (см. searchChat): точный запрос к бэкенду среди
    // ВСЕХ пользователей платформы, для старта чата с новым человеком - подменяет
    // chatPreviews целиком, сюда не попадает. Без "@" - обычное имя, ищем только среди уже
    // существующих чатов, локально и мгновенно, без похода на бэкенд.
    const query = searchTag.value.trim()
    if (query && !query.startsWith("@")) {
      const needle = query.toLowerCase()
      list = list.filter(c => c.username.toLowerCase().includes(needle))
    }

    return list
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
      .map(m => ({
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

  const loadUserChatPreviews = async () => {
    if (!import.meta.client) return
    if (!token.value) return

    try {
      const previews = await getAllChatsPreview()
      chatPreviews.value = sortPreviews(previews.map(dtoToPreview))
    } catch (error) {
      console.error("Failed to load user chat previews:", error)
    }
  }

  const connectWsIfNeeded = async () => {
    if (!import.meta.client) return
    if (!token.value) return

    const socket = useChatSocket()
    await socket.ensureConnected({
      accessToken: token.value,
      baseHttpUrl: apiBase(),
      handlers: {
        onConnectedChange: v => (isWsConnected.value = v),
        onPreview: (dto) => {
          chatPreviews.value = upsertPreview(chatPreviews.value, dtoToPreview(dto))
        },
        onPersonalStatus: (msg) => {
          // backend sends DELIVERED to sender with full message fields,
          // and READ as status-only payload (no id).
          const chatId = msg.chatId
          if (!chatId) return
          const list = messagesByChatId.value[chatId] ?? []
          const myCanon = canonicalUserId(user.value?.id)

          if (msg.id) {
            messagesByChatId.value = {
              ...messagesByChatId.value,
              [chatId]: list.map(m => (m.id === msg.id ? { ...m, status: msg.status } : m)),
            }
            const senderCanon = canonicalUserId(msg.senderId)
            if (
              msg.status
              && myCanon
              && senderCanon
              && senderCanon === myCanon
            ) {
              const p = chatPreviews.value.find(c => c.chatId === chatId)
              if (p) {
                chatPreviews.value = upsertPreview(chatPreviews.value, {
                  ...p,
                  lastOutgoingStatus: msg.status as MessageStatus,
                })
              }
            }
            return
          }

          if (msg.status === "READ") {
            messagesByChatId.value = {
              ...messagesByChatId.value,
              [chatId]: list.map(m => ({ ...m, status: "READ" })),
            }
            const p = chatPreviews.value.find(c => c.chatId === chatId)
            if (p && myCanon) {
              const lastOutgoing = [...list].reverse().find(m => canonicalUserId(m.senderId) === myCanon)
              if (lastOutgoing) {
                chatPreviews.value = upsertPreview(chatPreviews.value, {
                  ...p,
                  lastOutgoingStatus: "READ",
                })
              }
            }
          }
        },
        onCallNotification: (notification) => {
          useCall().handleIncomingCallNotification(notification)
        },
        onTokenExpired: async () => {
          // Token was refreshed, reconnect WebSocket
          await connectWsIfNeeded()
        },
      },
    })
  }

  const disconnectWs = async () => {
    if (!import.meta.client) return
    const socket = useChatSocket()
    chatTopicSub.value?.unsubscribe()
    chatTopicSub.value = null
    await socket.disconnect()
    isWsConnected.value = false
  }

  const resetChatUiForAccountSwitch = async () => {
    if (!import.meta.client) return

    chatPreviews.value = []
    selectedChat.value = null
    messagesByChatId.value = {}
    pendingOutbox.value = {}
    searchTag.value = ""
    lastSearchedTag.value = ""
    chatTopicSub.value?.unsubscribe()
    chatTopicSub.value = null

    await disconnectWs()
  }

  const startRealtimeWatchersOnce = () => {
    if (!import.meta.client || chatRealtimeWatchersStarted) return
    chatRealtimeWatchersStarted = true

    watch(
      () => canonicalUserId(user.value?.id),
      async (id, prevId) => {
        // prevId пустой значит либо "оба раза не залогинены" (нечего сбрасывать), либо
        // САМОЕ ПЕРВОЕ появление user.value в этой сессии - a это не переключение аккаунта,
        // а обычный логин. token.value заполняется синхронно из localStorage ДО того, как
        // user.value придёт из fetchMe() (см. auth-init.client.ts) - токен-вотчер ниже уже
        // успевает загрузить previews к этому моменту, а старый guard (`!id && !prevId`)
        // всё равно считал это "сменой аккаунта" и стирал их сразу после загрузки.
        if (!prevId) return
        if (id !== prevId) {
          await resetChatUiForAccountSwitch()
          if (token.value) await connectWsIfNeeded()
        }
      }
    )

    watch(
      () => token.value,
      async (t) => {
        if (!t) {
          await resetChatUiForAccountSwitch()
          return
        }
        await loadUserChatPreviews()
        await connectWsIfNeeded()
      },
      { immediate: true }
    )

    watch(
      () => searchTag.value,
      async (tag) => {
        const normalized = normalizeTagForRequest(tag)
        if (!normalized) {
          latestSearchRequestId += 1
          isSearching.value = false
        }

        if (!normalized && lastSearchedTag.value) {
          lastSearchedTag.value = ""
          await loadUserChatPreviews()
        }
      }
    )

    const route = useRoute()
    watch(
      () => route.path,
      async (path) => {
        if (path === "/authorization" || path.startsWith("/authorization/")) {
          await resetChatUiForAccountSwitch()
          if (token.value) await connectWsIfNeeded()
        }
      }
    )
  }

  startRealtimeWatchersOnce()

  const openChatSubscription = async (chatId: string) => {
    if (!import.meta.client) return
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
          m =>
            !!m.id
            && m.id.startsWith("temp-")
            && pendingOutbox.value[m.id] === (msg.content ?? "")
        )
        if (optimisticIdx >= 0) {
          const optimisticMessage = list[optimisticIdx]!
          const tempId = optimisticMessage.id!
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
      const preview = chatPreviews.value.find(p => p.chatId === chatId)
      if (preview) {
        const myCanon = canonicalUserId(user.value?.id)
        const senderCanon = canonicalUserId(msg.senderId)
        const isOutgoing
          = !!myCanon && !!senderCanon && senderCanon === myCanon
        chatPreviews.value = upsertPreview(chatPreviews.value, {
          ...preview,
          lastMessage: msg.content ?? "",
          lastMessageAt: new Date().toISOString(),
          ...(isOutgoing && msg.status
            ? { lastOutgoingStatus: msg.status as MessageStatus }
            : {}),
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

    const requestId = ++latestSearchRequestId

    // Clear old previews immediately whenever a search is performed,
    // so only the search result is shown.
    chatPreviews.value = []
    selectedChat.value = null
    chatTopicSub.value?.unsubscribe()
    chatTopicSub.value = null
    isSearching.value = true

    try {
      const dto = await findChatByTag(tag)
      if (requestId !== latestSearchRequestId) return

      lastSearchedTag.value = tag
      chatPreviews.value = [finderToPreview(dto)]
    } catch (error) {
      if (requestId !== latestSearchRequestId) return

      lastSearchedTag.value = tag
      chatPreviews.value = []
      console.error("Search failed or chat not found:", error)
    } finally {
      if (requestId === latestSearchRequestId) {
        isSearching.value = false
      }
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
    if (!import.meta.client) return
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
    const preview = chatPreviews.value.find(p => p.chatId === chatId)
    if (preview) {
      chatPreviews.value = upsertPreview(chatPreviews.value, {
        ...preview,
        lastMessage: content,
        lastMessageAt: new Date().toISOString(),
        lastOutgoingStatus: "SENT",
        alreadyExists: true,
        lastMessageSenderId: myId ?? null,
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
    if (!import.meta.client) return
    if (!chatId) return

    // Бэкенд шлёт READ-статус только остальным участникам (см. ChatWebSocketController.readMessage) -
    // себе самому обновлённый preview не прилетает, поэтому счётчик обнуляем оптимистично тут же.
    const preview = chatPreviews.value.find(p => p.chatId === chatId)
    if (preview && preview.unreadCount > 0) {
      chatPreviews.value = upsertPreview(chatPreviews.value, { ...preview, unreadCount: 0 })
    }

    const socket = useChatSocket()
    await connectWsIfNeeded()
    await socket.waitUntilConnected()
    await socket.send("/app/read", { chatId })
  }

  // Применяет изменение и к selectedChat (если это он), и к записи в списке чатов -
  // иначе шапка открытого чата и список слева после действия разошлись бы до следующей
  // полной перезагрузки превью.
  const applyToSelectedAndPreview = (chatId: string, patch: Partial<ChatPreviewUI>) => {
    if (selectedChat.value?.chatId === chatId) {
      selectedChat.value = { ...selectedChat.value, ...patch }
    }
    const preview = chatPreviews.value.find(p => p.chatId === chatId)
    if (preview) {
      chatPreviews.value = upsertPreview(chatPreviews.value, { ...preview, ...patch })
    }
  }

  const removeChatFromState = (chatId: string) => {
    chatPreviews.value = chatPreviews.value.filter(p => p.chatId !== chatId)
    if (selectedChat.value?.chatId === chatId) selectedChat.value = null
  }

  const requireSelectedChatId = () => {
    const chatId = selectedChat.value?.chatId
    if (!chatId) throw new Error("chat is not selected")
    return chatId
  }

  const uploadBackground = async (file: File) => {
    const chatId = requireSelectedChatId()
    const { backgroundUrl } = await uploadChatBackgroundApi(chatId, file)
    applyToSelectedAndPreview(chatId, { backgroundUrl })
  }

  const resetBackground = async () => {
    const chatId = requireSelectedChatId()
    await resetChatBackgroundApi(chatId)
    applyToSelectedAndPreview(chatId, { backgroundUrl: null })
  }

  const blockPartner = async () => {
    const chatId = requireSelectedChatId()
    await blockChatPartnerApi(chatId)
    applyToSelectedAndPreview(chatId, { blockedByMe: true, partnerOnline: null })
  }

  const unblockPartner = async () => {
    const chatId = requireSelectedChatId()
    await unblockChatPartnerApi(chatId)
    applyToSelectedAndPreview(chatId, { blockedByMe: false })
  }

  const deleteChatForMe = async () => {
    const chatId = requireSelectedChatId()
    await deleteChatForMeApi(chatId)
    removeChatFromState(chatId)
  }

  const deleteChatForEveryone = async () => {
    const chatId = requireSelectedChatId()
    await deleteChatForEveryoneApi(chatId)
    removeChatFromState(chatId)
  }

  const searchMessagesInChat = async (query: string, page = 0, size = 20) => {
    const chatId = requireSelectedChatId()
    return searchChatMessagesApi(chatId, query, page, size)
  }

  // Фоновое обновление без перезагрузки страницы: heartbeat (fetchMe сам по себе обновляет
  // lastSeen на бэке) + тихо подтягиваем поля собеседников (онлайн, статус, аватарка, фон,
  // блокировка). Сообщения и непрочитанные не трогаем - ими управляет WebSocket.
  const refreshPresence = async () => {
    if (!import.meta.client || !token.value) return

    const startedAt = Date.now()
    const me = await fetchMe()
    const { setUser, userWrittenSince } = useUserState()
    if (me && !userWrittenSince(startedAt)) {
      setUser({ ...me, statusText: me.statusText ?? null })
    }

    // Во время активного поиска по тегу список специально подменён результатом поиска -
    // не трогаем, иначе он бы перезатирался.
    if (lastSearchedTag.value || isSearching.value) return

    const fresh = await getAllChatsPreview()
    const freshByChatId = new Map(fresh.map(dto => [dto.chatId, dto]))

    chatPreviews.value = chatPreviews.value.map((p) => {
      const dto = p.chatId ? freshByChatId.get(p.chatId) : undefined
      if (!dto) return p
      const f = dtoToPreview(dto)
      return {
        ...p,
        username: f.username,
        userTag: f.userTag,
        avatar: f.avatar,
        partnerOnline: f.partnerOnline,
        partnerStatusText: f.partnerStatusText,
        partnerBio: f.partnerBio,
        backgroundUrl: f.backgroundUrl,
        blockedByMe: f.blockedByMe,
        blockedByPartner: f.blockedByPartner,
      }
    })

    const sel = selectedChat.value
    if (sel?.chatId) {
      const updated = chatPreviews.value.find(p => p.chatId === sel.chatId)
      if (updated) {
        selectedChat.value = {
          ...sel,
          username: updated.username,
          userTag: updated.userTag,
          avatar: updated.avatar,
          partnerOnline: updated.partnerOnline,
          partnerStatusText: updated.partnerStatusText,
          backgroundUrl: updated.backgroundUrl,
          blockedByMe: updated.blockedByMe,
          blockedByPartner: updated.blockedByPartner,
        }
      }
    }
  }

  return {
    refreshPresence,
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
    resetChatUiForAccountSwitch,
    uploadBackground,
    resetBackground,
    blockPartner,
    unblockPartner,
    deleteChatForMe,
    deleteChatForEveryone,
    searchMessagesInChat,
  }
}

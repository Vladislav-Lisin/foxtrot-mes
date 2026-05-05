import SockJS from "sockjs-client"
import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs"
import type { ChatMessage, ChatPreviewDTO } from "~/types/chat"

type ChatSocketHandlers = {
  onPreview: (dto: ChatPreviewDTO) => void
  onPersonalStatus: (msg: ChatMessage) => void
  onConnectedChange?: (connected: boolean) => void
}

let client: Client | null = null
let connected = false
let activeToken: string | null = null
let previewsSub: StompSubscription | null = null
let personalSub: StompSubscription | null = null
let currentHandlers: ChatSocketHandlers | null = null

function safeJson<T>(frame: IMessage): T | null {
  try {
    return JSON.parse(frame.body) as T
  } catch {
    return null
  }
}

export const useChatSocket = () => {
  const reconnectUserQueues = () => {
    if (!client) return
    const handlers = currentHandlers
    if (!handlers) return

    previewsSub?.unsubscribe()
    personalSub?.unsubscribe()

    previewsSub = client.subscribe("/user/queue/chats", (frame) => {
      const dto = safeJson<ChatPreviewDTO>(frame)
      if (dto) handlers.onPreview(dto)
    })

    personalSub = client.subscribe("/user/queue/messages", (frame) => {
      const msg = safeJson<ChatMessage>(frame)
      if (msg) handlers.onPersonalStatus(msg)
    })
  }

  const ensureConnected = async (params: {
    accessToken: string
    baseHttpUrl?: string // default http://localhost:8080
    handlers: ChatSocketHandlers
  }) => {
    const baseHttpUrl = params.baseHttpUrl ?? "http://localhost:8080"

    // if token changed -> hard reconnect
    if (client && activeToken && activeToken !== params.accessToken) {
      await disconnect()
    }

    activeToken = params.accessToken
    currentHandlers = params.handlers

    if (client?.connected) return client

    if (!client) {
      client = new Client({
        webSocketFactory: () => new SockJS(`${baseHttpUrl}/ws`),
        reconnectDelay: 2000,
        heartbeatIncoming: 10000,
        heartbeatOutgoing: 10000,
        connectHeaders: {
          Authorization: `Bearer ${params.accessToken}`,
        },
        debug: () => {},
        onConnect: () => {
          connected = true
          currentHandlers?.onConnectedChange?.(true)
          reconnectUserQueues()
        },
        onDisconnect: () => {
          connected = false
          currentHandlers?.onConnectedChange?.(false)
        },
        onStompError: (frame) => {
          console.error("[stomp] broker error", frame?.headers, frame?.body)
        },
        onWebSocketClose: () => {
          connected = false
          currentHandlers?.onConnectedChange?.(false)
        },
      })
    } else {
      // update headers before (re)connect attempt
      client.connectHeaders = { Authorization: `Bearer ${params.accessToken}` }
    }

    client.activate()
    return client
  }

  const disconnect = async () => {
    previewsSub?.unsubscribe()
    personalSub?.unsubscribe()
    previewsSub = null
    personalSub = null
    connected = false
    activeToken = null
    if (client) {
      await client.deactivate()
      client = null
    }
    currentHandlers = null
  }

  const subscribeChat = (chatId: string, onMessage: (msg: ChatMessage) => void) => {
    if (!client?.connected) return null
    return client.subscribe(`/topic/chat/${chatId}`, (frame) => {
      const msg = safeJson<ChatMessage>(frame)
      if (msg) onMessage(msg)
    })
  }

  const waitUntilConnected = async (timeoutMs = 5000) => {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (client?.connected) return client
      await new Promise((r) => setTimeout(r, 50))
    }
    throw new Error(`WebSocket not connected within ${timeoutMs}ms`)
  }

  const send = async (destination: string, body: unknown) => {
    await waitUntilConnected()
    client!.publish({ destination, body: JSON.stringify(body) })
  }

  return {
    ensureConnected,
    disconnect,
    subscribeChat,
    send,
    waitUntilConnected,
    get connected() {
      return connected
    },
    get stompConnected() {
      return !!client?.connected
    },
  }
}

export type UserResponse = {
  id: string
  username: string
  tag: string
  avatarUrl: string | null
}

export type ChatFinderResponse = {
  chatId: string | null
  partner: UserResponse
  alreadyExists: boolean
  lastMessage: string | null
  lastMessageAt: string | null
}

export type ChatPreviewDTO = {
  chatId: string
  partner: UserResponse
  lastMessage: string | null
  lastMessageAt: string | null
}

export type MessageStatus = "SENT" | "DELIVERED" | "READ"

export type ChatMessage = {
  id?: string
  chatId: string
  senderId?: string
  content?: string
  timestamp?: number | string
  status?: MessageStatus
}

export type SendMessageRequest = {
  chatId: string
  content: string
}

export type ReadMessageRequest = {
  chatId: string
}


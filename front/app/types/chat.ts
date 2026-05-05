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
  clientTempId?: string
}

export type SendMessageRequest = {
  chatId: string
  content: string
}

export type ReadMessageRequest = {
  chatId: string
}

export type ChatHistoryMessage = {
  id: string
  senderId: string
  content: string | number[] | null
  createdAt: string
  status: MessageStatus | string
  isDeleted: boolean
}

export type GetChatHistoryResponse = {
  history: {
    content: ChatHistoryMessage[]
    totalElements: number
    totalPages: number
    number: number
    size: number
    first: boolean
    last: boolean
  }
}


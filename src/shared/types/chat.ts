export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
}

export interface Conversation {
  id: string
  title: string
  repositoryId: string | null
  createdAt: string
  updatedAt: string
}

import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChatMessage, Conversation } from '@shared/types/chat'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const messagesByConversation = ref<Record<string, ChatMessage[]>>({})
  const isGenerating = ref(false)
  const currentRequestId = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)

  const activeConversation = computed(
    () => conversations.value.find((item) => item.id === activeConversationId.value) ?? null
  )

  const activeMessages = computed(() => {
    const id = activeConversationId.value
    return id ? (messagesByConversation.value[id] ?? []) : []
  })

  function createConversation(repositoryId: string | null = null): Conversation {
    const timestamp = new Date().toISOString()
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      title: '新会话',
      repositoryId,
      createdAt: timestamp,
      updatedAt: timestamp
    }

    conversations.value = [conversation, ...conversations.value]
    messagesByConversation.value[conversation.id] = []
    activeConversationId.value = conversation.id
    errorMessage.value = null
    return conversation
  }

  function selectConversation(id: string): void {
    activeConversationId.value = id
    errorMessage.value = null
  }

  function setGenerating(generating: boolean, requestId: string | null = null): void {
    isGenerating.value = generating
    currentRequestId.value = generating ? requestId : null
  }

  function setError(message: string | null): void {
    errorMessage.value = message
  }

  return {
    conversations,
    activeConversationId,
    messagesByConversation,
    isGenerating,
    currentRequestId,
    errorMessage,
    activeConversation,
    activeMessages,
    createConversation,
    selectConversation,
    setGenerating,
    setError
  }
})

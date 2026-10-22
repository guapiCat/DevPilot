import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ChatEvent, ChatMessage, ChatMessageStatus, Conversation } from '@shared/types/chat'
import { desktopApi } from '@renderer/services/desktop-api'
import { toErrorMessage } from '@renderer/utils/errors'

interface PendingRun {
  requestId: string
  conversationId: string
  assistantMessageId: string
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const activeConversationId = ref<string | null>(null)
  const messagesByConversation = ref<Record<string, ChatMessage[]>>({})
  const isGenerating = ref(false)
  const generatingConversationId = ref<string | null>(null)
  const currentRequestId = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)
  const retryConversationId = ref<string | null>(null)
  const isCreatingConversation = ref(false)
  const initialized = ref(false)

  let pending: PendingRun | null = null
  let selectToken = 0

  const activeConversation = computed(
    () => conversations.value.find((item) => item.id === activeConversationId.value) ?? null
  )

  const activeMessages = computed(() => {
    const id = activeConversationId.value
    return id ? (messagesByConversation.value[id] ?? []) : []
  })

  const isGeneratingInActiveConversation = computed(
    () => isGenerating.value && generatingConversationId.value === activeConversationId.value
  )

  const canRetry = computed(() => retryConversationId.value !== null && !isGenerating.value)

  function messagesOf(conversationId: string): ChatMessage[] {
    return messagesByConversation.value[conversationId] ?? []
  }

  function setMessages(conversationId: string, messages: ChatMessage[]): void {
    messagesByConversation.value[conversationId] = messages
  }

  function patchMessage(
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>
  ): void {
    const messages = messagesOf(conversationId)
    const index = messages.findIndex((message) => message.id === messageId)
    if (index === -1) return

    messages[index] = { ...messages[index], ...patch }
  }

  function markStatus(conversationId: string, messageId: string, status: ChatMessageStatus): void {
    patchMessage(conversationId, messageId, { status })
  }

  function beginRun(run: PendingRun): void {
    pending = run
    isGenerating.value = true
    generatingConversationId.value = run.conversationId
    currentRequestId.value = run.requestId
  }

  function endRun(requestId: string): void {
    if (currentRequestId.value !== requestId) return
    pending = null
    isGenerating.value = false
    generatingConversationId.value = null
    currentRequestId.value = null
  }

  function handleEvent(event: ChatEvent): void {
    if (event.type === 'started') return

    if (!pending || pending.requestId !== event.requestId) return
    const run = pending

    if (event.type === 'text_delta') {
      const message = messagesOf(run.conversationId).find(
        (item) => item.id === run.assistantMessageId
      )
      if (!message) return
      patchMessage(run.conversationId, run.assistantMessageId, {
        content: message.content + event.text,
        status: 'streaming'
      })
      return
    }

    if (event.type === 'completed') {
      setMessages(
        run.conversationId,
        messagesOf(run.conversationId).map((item) =>
          item.id === run.assistantMessageId ? event.assistantMessage : item
        )
      )
      endRun(event.requestId)
      void refreshConversations()
      return
    }

    if (event.type === 'cancelled') {
      markStatus(run.conversationId, run.assistantMessageId, 'cancelled')
      endRun(event.requestId)
      return
    }

    const placeholder = messagesOf(run.conversationId).find(
      (item) => item.id === run.assistantMessageId
    )
    if (!placeholder || !placeholder.content.trim()) {
      setMessages(
        run.conversationId,
        messagesOf(run.conversationId).filter((item) => item.id !== run.assistantMessageId)
      )
    } else {
      markStatus(run.conversationId, run.assistantMessageId, 'error')
    }

    errorMessage.value = event.message
    retryConversationId.value = event.conversationId
    endRun(event.requestId)
    void refreshConversations()
  }

  function setError(message: string | null): void {
    errorMessage.value = message
  }

  async function refreshConversations(): Promise<void> {
    try {
      conversations.value = await desktopApi.chat.listConversations()
    } catch (error) {
      errorMessage.value = toErrorMessage(error)
    }
  }

  async function initialize(): Promise<void> {
    if (initialized.value) return
    initialized.value = true
    desktopApi.chat.onEvent(handleEvent)

    await refreshConversations()
    if (!activeConversationId.value && conversations.value.length > 0) {
      await selectConversation(conversations.value[0].id)
    }
  }

  async function createConversation(repositoryId: string | null = null): Promise<Conversation> {
    isCreatingConversation.value = true
    errorMessage.value = null
    retryConversationId.value = null

    try {
      const conversation = await desktopApi.chat.createConversation(repositoryId)
      conversations.value = [
        conversation,
        ...conversations.value.filter((item) => item.id !== conversation.id)
      ]
      messagesByConversation.value[conversation.id] = []
      activeConversationId.value = conversation.id
      return conversation
    } finally {
      isCreatingConversation.value = false
    }
  }

  async function selectConversation(id: string): Promise<void> {
    selectToken += 1
    const token = selectToken
    activeConversationId.value = id
    errorMessage.value = null
    retryConversationId.value = null

    if (id in messagesByConversation.value) return

    try {
      const messages = await desktopApi.chat.getMessages(id)
      if (token !== selectToken) return
      setMessages(id, messages)
    } catch (error) {
      if (token === selectToken) errorMessage.value = toErrorMessage(error)
    }
  }

  async function ensureConversation(repositoryId: string | null): Promise<Conversation> {
    return activeConversation.value ?? (await createConversation(repositoryId))
  }

  async function sendMessage(content: string, repositoryId: string | null = null): Promise<void> {
    const value = content.trim()
    if (!value || isGenerating.value) return

    let conversation: Conversation
    try {
      conversation = await ensureConversation(repositoryId)
    } catch (error) {
      errorMessage.value = toErrorMessage(error)
      return
    }

    errorMessage.value = null
    retryConversationId.value = null

    const requestId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const userMessage: ChatMessage = {
      id: `local-user-${requestId}`,
      role: 'user',
      content: value,
      createdAt
    }
    const assistantMessageId = `local-assistant-${requestId}`

    setMessages(conversation.id, [
      ...messagesOf(conversation.id),
      userMessage,
      { id: assistantMessageId, role: 'assistant', content: '', createdAt, status: 'streaming' }
    ])
    beginRun({ requestId, conversationId: conversation.id, assistantMessageId })

    try {
      const result = await desktopApi.chat.send({
        requestId,
        conversationId: conversation.id,
        content: value
      })
      patchMessage(conversation.id, userMessage.id, result.userMessage)
    } catch (error) {
      setMessages(
        conversation.id,
        messagesOf(conversation.id).filter(
          (item) => item.id !== userMessage.id && item.id !== assistantMessageId
        )
      )
      endRun(requestId)
      errorMessage.value = toErrorMessage(error)
    }
  }

  async function retryLast(): Promise<void> {
    if (isGenerating.value) return
    const conversationId = retryConversationId.value ?? activeConversationId.value
    if (!conversationId) return

    const requestId = crypto.randomUUID()
    const assistantMessageId = `local-assistant-${requestId}`
    const createdAt = new Date().toISOString()

    errorMessage.value = null
    retryConversationId.value = null
    setMessages(conversationId, [
      ...messagesOf(conversationId),
      { id: assistantMessageId, role: 'assistant', content: '', createdAt, status: 'streaming' }
    ])
    beginRun({ requestId, conversationId, assistantMessageId })

    try {
      await desktopApi.chat.retry({ requestId, conversationId })
    } catch (error) {
      setMessages(
        conversationId,
        messagesOf(conversationId).filter((item) => item.id !== assistantMessageId)
      )
      endRun(requestId)
      errorMessage.value = toErrorMessage(error)
    }
  }

  async function cancelGeneration(): Promise<void> {
    const requestId = currentRequestId.value
    if (!requestId) return

    try {
      await desktopApi.chat.cancel(requestId)
    } catch {
      // 取消失败不阻塞界面，终态事件会结束当前请求。
    }
  }

  return {
    conversations,
    activeConversationId,
    messagesByConversation,
    isGenerating,
    generatingConversationId,
    currentRequestId,
    errorMessage,
    retryConversationId,
    isCreatingConversation,
    activeConversation,
    activeMessages,
    isGeneratingInActiveConversation,
    canRetry,
    setError,
    initialize,
    refreshConversations,
    createConversation,
    selectConversation,
    sendMessage,
    retryLast,
    cancelGeneration
  }
})

import { randomUUID } from 'node:crypto'
import {
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_REQUEST_TIMEOUT_MS,
  DEFAULT_CONVERSATION_TITLE,
  MAX_CHAT_OUTPUT_TOKENS,
  MODEL_CONNECTION_TEST_TIMEOUT_MS
} from '@shared/constants/app'
import type {
  AiConnectionTestResult,
  CancelChatResult,
  ChatEvent,
  ChatMessage,
  Conversation,
  RetryChatInput,
  RetryChatResult,
  SendChatInput,
  SendChatResult
} from '@shared/types/chat'
import type { ErrorCode } from '@shared/types/ipc'
import { createDeepSeekAdapter, resolveAiConfig } from '../ai/model-manager'
import { ModelAdapterError } from '../ai/model-error'
import type { ModelAdapter } from '../ai/model-adapter'
import { buildModelMessages } from '../ai/prompt-builder'
import type { ChatStore } from '../database/chat.store'
import type { ResolvedAiConfig } from './settings.service'
import { repositoryService } from './repository.service'
import { ServiceError } from '../utils/service-error'

export type ChatEventSink = (event: ChatEvent) => void

interface ChatRun {
  requestId: string
  conversationId: string
  controller: AbortController
  abortReason: 'user' | 'timeout' | null
  sink: ChatEventSink
  silent: boolean
}

export interface RepositoryLocator {
  (repositoryId: string): { name: string } | null
}

export interface ChatServiceOptions {
  adapterFactory?: (config: ResolvedAiConfig) => ModelAdapter
  timeoutMs?: number
  connectionTimeoutMs?: number
  now?: () => Date
  env?: NodeJS.ProcessEnv
  locateRepository?: RepositoryLocator
}

const MAX_REMEMBERED_REQUESTS = 200

function defaultLocateRepository(repositoryId: string): { name: string } | null {
  const repository = repositoryService.list().find((item) => item.id === repositoryId)
  return repository ? { name: repository.name } : null
}

export class ChatService {
  private store: ChatStore | null = null
  private activeRun: ChatRun | null = null
  private readonly rememberedRequests = new Set<string>()
  private readonly rememberedOrder: string[] = []

  private readonly adapterFactory: (config: ResolvedAiConfig) => ModelAdapter
  private readonly timeoutMs: number
  private readonly connectionTimeoutMs: number
  private readonly now: () => Date
  private readonly env: NodeJS.ProcessEnv
  private readonly locateRepository: RepositoryLocator

  constructor(options: ChatServiceOptions = {}) {
    this.adapterFactory = options.adapterFactory ?? createDeepSeekAdapter
    this.timeoutMs = options.timeoutMs ?? CHAT_REQUEST_TIMEOUT_MS
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? MODEL_CONNECTION_TEST_TIMEOUT_MS
    this.now = options.now ?? (() => new Date())
    this.env = options.env ?? process.env
    this.locateRepository = options.locateRepository ?? defaultLocateRepository
  }

  initialize(store: ChatStore | null): void {
    this.store = store
  }

  listConversations(): Conversation[] {
    return this.requireStore().listConversations()
  }

  createConversation(repositoryId: string | null): Conversation {
    const store = this.requireStore()

    if (repositoryId && !this.locateRepository(repositoryId)) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库不存在或尚未登记')
    }

    const timestamp = this.now().toISOString()
    return store.insertConversation({
      id: randomUUID(),
      title: DEFAULT_CONVERSATION_TITLE,
      repositoryId,
      createdAt: timestamp,
      updatedAt: timestamp
    })
  }

  getMessages(conversationId: string): ChatMessage[] {
    const store = this.requireStore()
    this.requireConversation(conversationId)
    return store.listMessages(conversationId)
  }

  send(input: SendChatInput, sink: ChatEventSink): SendChatResult {
    const store = this.requireStore()
    this.assertStartable(input.requestId)
    const config = resolveAiConfig(this.env)
    const conversation = this.requireConversation(input.conversationId)

    let userMessage: ChatMessage
    try {
      userMessage = store.appendUserMessage(
        conversation.id,
        input.content,
        this.now().toISOString()
      )
    } catch {
      throw new ServiceError('DATABASE_ERROR', '消息保存失败，请稍后重试')
    }

    this.rememberRequest(input.requestId)
    this.startRun(input.requestId, conversation.id, sink, config)

    return {
      requestId: input.requestId,
      conversationId: conversation.id,
      userMessage
    }
  }

  retry(input: RetryChatInput, sink: ChatEventSink): RetryChatResult {
    const store = this.requireStore()
    this.assertStartable(input.requestId)
    const config = resolveAiConfig(this.env)
    const conversation = this.requireConversation(input.conversationId)

    const hasUserMessage = store
      .listMessages(conversation.id)
      .some((message) => message.role === 'user')
    if (!hasUserMessage) {
      throw new ServiceError('VALIDATION_ERROR', '当前会话没有可重试的消息')
    }

    this.rememberRequest(input.requestId)
    this.startRun(input.requestId, conversation.id, sink, config)

    return { requestId: input.requestId, conversationId: conversation.id }
  }

  cancel(requestId: string): CancelChatResult {
    const run = this.activeRun
    if (!run || run.requestId !== requestId) return { cancelled: false }

    run.abortReason = run.abortReason ?? 'user'
    run.controller.abort()
    return { cancelled: true }
  }

  cancelAll(): void {
    const run = this.activeRun
    if (!run) return

    run.abortReason = run.abortReason ?? 'user'
    run.silent = true
    run.controller.abort()
  }

  async testConnection(): Promise<AiConnectionTestResult> {
    const config = resolveAiConfig(this.env)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.connectionTimeoutMs)
    const startedAt = Date.now()

    try {
      const adapter = this.adapterFactory(config)
      for await (const event of adapter.stream({
        messages: [{ role: 'user', content: '请只回复 OK。' }],
        signal: controller.signal,
        maxTokens: 8
      })) {
        void event
        if (controller.signal.aborted) break
      }

      if (controller.signal.aborted) {
        throw new ServiceError('MODEL_REQUEST_FAILED', '模型连接超时，请检查网络或配置')
      }

      return { model: config.model, latencyMs: Date.now() - startedAt }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ServiceError('MODEL_REQUEST_FAILED', '模型连接超时，请检查网络或配置')
      }
      if (error instanceof ModelAdapterError) {
        throw new ServiceError(error.code, error.message)
      }
      if (error instanceof ServiceError) throw error
      throw new ServiceError('MODEL_REQUEST_FAILED', '连接模型服务失败，请稍后重试')
    } finally {
      clearTimeout(timer)
    }
  }

  private startRun(
    requestId: string,
    conversationId: string,
    sink: ChatEventSink,
    config: ResolvedAiConfig
  ): void {
    const run: ChatRun = {
      requestId,
      conversationId,
      controller: new AbortController(),
      abortReason: null,
      sink,
      silent: false
    }

    this.activeRun = run
    this.emit(run, { type: 'started', requestId, conversationId, assistantMessageId: randomUUID() })
    void this.execute(run, config)
  }

  private async execute(run: ChatRun, config: ResolvedAiConfig): Promise<void> {
    const startedAt = Date.now()
    const timer = setTimeout(() => {
      run.abortReason = run.abortReason ?? 'timeout'
      run.controller.abort()
    }, this.timeoutMs)

    let text = ''
    let usage: { inputTokens?: number; outputTokens?: number } | null = null
    let terminal: ChatEvent = this.errorEvent(
      run,
      'MODEL_REQUEST_FAILED',
      '模型请求失败，请稍后重试'
    )

    try {
      const store = this.requireStore()
      const conversation = this.requireConversation(run.conversationId)
      const messages = buildModelMessages(
        store.listRecentMessages(conversation.id, CHAT_HISTORY_MAX_MESSAGES),
        { repositoryName: this.repositoryName(conversation.repositoryId) }
      )

      const adapter = this.adapterFactory(config)
      for await (const event of adapter.stream({
        messages,
        signal: run.controller.signal,
        maxTokens: MAX_CHAT_OUTPUT_TOKENS
      })) {
        if (run.controller.signal.aborted) break

        if (event.type === 'text_delta' && event.text) {
          text += event.text
          this.emit(run, {
            type: 'text_delta',
            requestId: run.requestId,
            conversationId: run.conversationId,
            text: event.text
          })
        } else if (event.type === 'usage') {
          usage = { inputTokens: event.inputTokens, outputTokens: event.outputTokens }
        }
      }

      if (run.abortReason === 'user') {
        terminal = this.cancelledEvent(run)
      } else if (run.abortReason === 'timeout') {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型响应超时，请重试')
      } else if (!text.trim()) {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型未返回内容')
      } else {
        const assistantMessage = store.appendAssistantMessage(
          conversation.id,
          text,
          this.now().toISOString()
        )
        terminal = {
          type: 'completed',
          requestId: run.requestId,
          conversationId: run.conversationId,
          assistantMessage
        }
      }
    } catch (error) {
      if (run.abortReason === 'user') {
        terminal = this.cancelledEvent(run)
      } else if (run.abortReason === 'timeout') {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型响应超时，请重试')
      } else if (error instanceof ModelAdapterError) {
        terminal = this.errorEvent(run, error.code, error.message)
      } else if (error instanceof ServiceError) {
        terminal = this.errorEvent(run, error.code, error.message)
      } else {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型请求失败，请稍后重试')
      }

      console.warn(
        `[chat] 请求失败 requestId=${run.requestId} code=${terminal.type === 'error' ? terminal.code : 'UNKNOWN'}`
      )
    } finally {
      clearTimeout(timer)
      if (this.activeRun === run) this.activeRun = null

      const duration = Date.now() - startedAt
      if (terminal.type === 'completed') {
        console.info(
          `[chat] 完成 requestId=${run.requestId} 耗时=${duration}ms 输入=${usage?.inputTokens ?? '-'} 输出=${usage?.outputTokens ?? '-'}`
        )
      }

      this.emit(run, terminal)
    }
  }

  private repositoryName(repositoryId: string | null): string | null {
    if (!repositoryId) return null
    return this.locateRepository(repositoryId)?.name ?? null
  }

  private requireStore(): ChatStore {
    if (!this.store) {
      throw new ServiceError('DATABASE_ERROR', '数据库不可用，无法保存会话')
    }
    return this.store
  }

  private requireConversation(conversationId: string): Conversation {
    const conversation = this.requireStore().findConversation(conversationId)
    if (!conversation) {
      throw new ServiceError('CONVERSATION_NOT_FOUND', '会话不存在，请刷新后重试')
    }
    return conversation
  }

  private assertStartable(requestId: string): void {
    if (this.activeRun) {
      throw new ServiceError('VALIDATION_ERROR', '当前已有生成中的请求，请先停止')
    }
    if (this.rememberedRequests.has(requestId)) {
      throw new ServiceError('VALIDATION_ERROR', '请求 ID 已使用，请重试')
    }
  }

  private rememberRequest(requestId: string): void {
    this.rememberedRequests.add(requestId)
    this.rememberedOrder.push(requestId)

    if (this.rememberedOrder.length > MAX_REMEMBERED_REQUESTS) {
      const oldest = this.rememberedOrder.shift()
      if (oldest) this.rememberedRequests.delete(oldest)
    }
  }

  private emit(run: ChatRun, event: ChatEvent): void {
    if (run.silent) return

    try {
      run.sink(event)
    } catch {
      // 窗口可能已关闭；事件发送失败不影响主进程收尾。
    }
  }

  private cancelledEvent(run: ChatRun): ChatEvent {
    return {
      type: 'cancelled',
      requestId: run.requestId,
      conversationId: run.conversationId
    }
  }

  private errorEvent(run: ChatRun, code: ErrorCode, message: string): ChatEvent {
    return {
      type: 'error',
      requestId: run.requestId,
      conversationId: run.conversationId,
      code,
      message
    }
  }
}

export const chatService = new ChatService()

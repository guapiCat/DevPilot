import { randomUUID } from 'node:crypto'
import {
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_REQUEST_TIMEOUT_MS,
  DEFAULT_CONVERSATION_TITLE,
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
import { runAgent, type AgentLimits } from '../ai/agent-runner'
import { createDefaultToolRegistry } from '../ai/tools'
import { testAdapterConnection } from '../ai/connection-test'
import { createModelAdapter, resolveAiConfig } from '../ai/model-manager'
import { ModelAdapterError } from '../ai/model-error'
import type { ModelAdapter } from '../ai/model-adapter'
import { buildModelMessages } from '../ai/prompt-builder'
import type { EditProposalService, ToolRegistry } from '../ai/tools/tool-registry'
import type { ChatStore } from '../database/chat.store'
import { editService } from './edit.service'
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
  configProvider?: () => ResolvedAiConfig
  timeoutMs?: number
  connectionTimeoutMs?: number
  now?: () => Date
  env?: NodeJS.ProcessEnv
  locateRepository?: RepositoryLocator
  toolRegistry?: ToolRegistry
  editService?: EditProposalService | null
  agentLimits?: Partial<AgentLimits>
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
  private configProvider: () => ResolvedAiConfig
  private readonly timeoutMs: number
  private readonly connectionTimeoutMs: number
  private readonly now: () => Date
  private readonly env: NodeJS.ProcessEnv
  private readonly locateRepository: RepositoryLocator
  private readonly toolRegistry: ToolRegistry | null
  private readonly editService: EditProposalService | null
  private readonly agentLimits: Partial<AgentLimits>

  constructor(options: ChatServiceOptions = {}) {
    this.adapterFactory = options.adapterFactory ?? createModelAdapter
    this.timeoutMs = options.timeoutMs ?? CHAT_REQUEST_TIMEOUT_MS
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? MODEL_CONNECTION_TEST_TIMEOUT_MS
    this.now = options.now ?? (() => new Date())
    this.env = options.env ?? process.env
    this.configProvider = options.configProvider ?? (() => resolveAiConfig(this.env))
    this.locateRepository = options.locateRepository ?? defaultLocateRepository
    this.toolRegistry = options.toolRegistry ?? null
    this.editService = options.editService ?? null
    this.agentLimits = options.agentLimits ?? {}
  }

  initialize(store: ChatStore | null): void {
    this.store = store
  }

  setConfigProvider(provider: () => ResolvedAiConfig): void {
    this.configProvider = provider
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

  deleteConversation(conversationId: string): void {
    const store = this.requireStore()
    this.requireConversation(conversationId)

    if (this.activeRun?.conversationId === conversationId) {
      throw new ServiceError('VALIDATION_ERROR', '当前会话正在生成，请先停止生成')
    }

    try {
      store.deleteConversation(conversationId)
    } catch {
      throw new ServiceError('DATABASE_ERROR', '会话删除失败，请稍后重试')
    }
  }

  send(input: SendChatInput, sink: ChatEventSink): SendChatResult {
    const store = this.requireStore()
    this.assertStartable(input.requestId)
    const config = this.configProvider()
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
    const config = this.configProvider()
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
    const config = this.configProvider()
    return testAdapterConnection(config, {
      adapterFactory: this.adapterFactory,
      timeoutMs: this.connectionTimeoutMs
    })
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

    let usage: { inputTokens?: number; outputTokens?: number } | null = null
    let terminal: ChatEvent = this.errorEvent(
      run,
      'MODEL_REQUEST_FAILED',
      '模型请求失败，请稍后重试'
    )

    try {
      const store = this.requireStore()
      const conversation = this.requireConversation(run.conversationId)
      const toolsEnabled = Boolean(
        this.toolRegistry && conversation.repositoryId && config.toolsEnabled
      )
      const messages = buildModelMessages(
        store.listRecentMessages(conversation.id, CHAT_HISTORY_MAX_MESSAGES),
        {
          repositoryName: this.repositoryName(conversation.repositoryId),
          toolsEnabled
        }
      )

      const adapter = this.adapterFactory(config)
      const result = await runAgent({
        adapter,
        registry: toolsEnabled ? this.toolRegistry : null,
        repositoryId: conversation.repositoryId,
        conversationId: conversation.id,
        runId: run.requestId,
        editService: toolsEnabled ? this.editService : null,
        messages,
        signal: run.controller.signal,
        limits: this.agentLimits,
        callbacks: {
          onTextDelta: (delta) => {
            this.emit(run, {
              type: 'text_delta',
              requestId: run.requestId,
              conversationId: run.conversationId,
              text: delta
            })
          },
          onToolStarted: (call) => {
            this.emit(run, {
              type: 'tool_started',
              requestId: run.requestId,
              conversationId: run.conversationId,
              toolCallId: call.id,
              name: call.name,
              argsSummary: call.argsSummary
            })
          },
          onToolFinished: (record) => {
            console.info(
              `[tool] ${record.name} status=${record.status} duration=${record.durationMs}ms`
            )
            this.emit(run, {
              type: 'tool_finished',
              requestId: run.requestId,
              conversationId: run.conversationId,
              toolCallId: record.id,
              name: record.name,
              status: record.status,
              summary: record.summary,
              durationMs: record.durationMs
            })
          },
          onEditProposed: (proposal) => {
            this.emit(run, {
              type: 'edit_proposed',
              requestId: run.requestId,
              conversationId: run.conversationId,
              editSessionId: proposal.editSessionId,
              fileEditId: proposal.fileEditId,
              relativePath: proposal.relativePath,
              operation: proposal.operation
            })
          },
          onUsage: () => undefined
        }
      })

      usage = result.usage

      if (run.abortReason === 'user') {
        terminal = this.cancelledEvent(run)
      } else if (run.abortReason === 'timeout') {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型响应超时，请重试')
      } else if (result.stopped) {
        terminal = this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型请求已中止，请重试')
      } else if (!result.answerText.trim()) {
        terminal = result.roundLimitReached
          ? this.errorEvent(
              run,
              'TOOL_EXECUTION_FAILED',
              '工具调用轮数或次数已达上限，模型未能给出最终回答'
            )
          : this.errorEvent(run, 'MODEL_REQUEST_FAILED', '模型未返回内容')
      } else {
        const assistantMessage = store.appendAssistantMessage(
          conversation.id,
          result.text,
          this.now().toISOString(),
          result.toolCalls
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

export const chatService = new ChatService({
  toolRegistry: createDefaultToolRegistry(),
  editService
})

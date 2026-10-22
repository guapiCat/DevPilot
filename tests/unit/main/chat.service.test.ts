import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '@main/database/database'
import { ChatStore } from '@main/database/chat.store'
import { ModelAdapterError } from '@main/ai/model-error'
import type { ModelAdapter, ModelEvent, ModelStreamRequest } from '@main/ai/model-adapter'
import { ChatService, type ChatEventSink } from '@main/services/chat.service'
import { ServiceError } from '@main/utils/service-error'
import type { ChatEvent } from '@shared/types/chat'

const CONFIGURED_ENV = { DEEPSEEK_API_KEY: 'sk-test-only' }

type StreamBehavior = (request: ModelStreamRequest) => AsyncIterable<ModelEvent>

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let db: Database.Database
let store: ChatStore

function createAdapter(behavior: StreamBehavior, requests?: ModelStreamRequest[]): ModelAdapter {
  return {
    stream(request) {
      requests?.push(request)
      return behavior(request)
    }
  }
}

function textDelta(text: string): ModelEvent {
  return { type: 'text_delta', text }
}

function failingStream(error: unknown): AsyncIterable<ModelEvent> {
  return {
    [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(error) })
  }
}

function hangingStream(request: ModelStreamRequest): AsyncIterable<ModelEvent> {
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        await onceAborted(request.signal)
        return { done: true, value: undefined }
      }
    })
  }
}

function onceAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

function createSink(): {
  events: ChatEvent[]
  sink: ChatEventSink
  waitFor: (predicate: (event: ChatEvent) => boolean) => Promise<ChatEvent>
} {
  const events: ChatEvent[] = []
  const waiters: Array<{
    predicate: (event: ChatEvent) => boolean
    resolve: (event: ChatEvent) => void
  }> = []

  const sink: ChatEventSink = (event) => {
    events.push(event)
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].predicate(event)) {
        waiters[index].resolve(event)
        waiters.splice(index, 1)
      }
    }
  }

  const waitFor = (predicate: (event: ChatEvent) => boolean): Promise<ChatEvent> => {
    const existing = events.find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve) => waiters.push({ predicate, resolve }))
  }

  return { events, sink, waitFor }
}

function createService(
  behavior: StreamBehavior,
  options: { timeoutMs?: number } = {}
): ChatService {
  const service = new ChatService({
    adapterFactory: () => createAdapter(behavior),
    env: CONFIGURED_ENV,
    ...options
  })
  service.initialize(store)
  return service
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devpilot-chat-service-'))
  tempDirs.push(directory)
  db = openDatabase(directory)
  openDatabases.push(db)
  store = new ChatStore(db)
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ChatService 正常对话', () => {
  it('流式返回文本并在完成后持久化 assistant 消息', async () => {
    const service = createService(async function* () {
      yield textDelta('你')
      yield textDelta('好')
      yield { type: 'usage', inputTokens: 3, outputTokens: 2 }
    })
    const conversation = service.createConversation(null)
    const { events, sink, waitFor } = createSink()

    const result = service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '你好' },
      sink
    )
    const completed = await waitFor((event) => event.type === 'completed')

    expect(events.map((event) => event.type)).toEqual([
      'started',
      'text_delta',
      'text_delta',
      'completed'
    ])
    expect(completed.type).toBe('completed')
    if (completed.type === 'completed') {
      expect(completed.assistantMessage.content).toBe('你好')
    }

    const messages = store.listMessages(conversation.id)
    expect(messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(messages[0].content).toBe('你好')
    expect(messages[1].content).toBe('你好')
    expect(messages[0].id).toBe(result.userMessage.id)
  })

  it('首条消息生成会话标题', async () => {
    const service = createService(async function* () {
      yield textDelta('ok')
    })
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    service.send(
      {
        requestId: crypto.randomUUID(),
        conversationId: conversation.id,
        content: '  如何排查登录问题？  '
      },
      sink
    )
    await waitFor((event) => event.type === 'completed')

    expect(store.findConversation(conversation.id)?.title).toBe('如何排查登录问题？')
  })

  it('retry 不重复写入用户消息', async () => {
    const requests: ModelStreamRequest[] = []
    const service = new ChatService({
      adapterFactory: () =>
        createAdapter(async function* () {
          yield textDelta('回答')
        }, requests),
      env: CONFIGURED_ENV
    })
    service.initialize(store)

    const conversation = service.createConversation(null)
    const first = createSink()
    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      first.sink
    )
    await first.waitFor((event) => event.type === 'completed')

    const second = createSink()
    service.retry({ requestId: crypto.randomUUID(), conversationId: conversation.id }, second.sink)
    await second.waitFor((event) => event.type === 'completed')

    const messages = store.listMessages(conversation.id)
    expect(messages.filter((message) => message.role === 'user')).toHaveLength(1)
    expect(messages.filter((message) => message.role === 'assistant')).toHaveLength(2)
    expect(requests).toHaveLength(2)
    expect(requests[1].messages.at(-1)).toEqual({ role: 'assistant', content: '回答' })
  })

  it('没有用户消息的会话不可重试', () => {
    const service = createService(async function* () {
      yield textDelta('ok')
    })
    const conversation = service.createConversation(null)
    const { sink } = createSink()

    expect(() =>
      service.retry({ requestId: crypto.randomUUID(), conversationId: conversation.id }, sink)
    ).toThrowError(ServiceError)
  })
})

describe('ChatService 取消与超时', () => {
  it('用户取消后不持久化部分文本', async () => {
    const service = createService(async function* (request) {
      yield textDelta('部分')
      await onceAborted(request.signal)
    })
    const conversation = service.createConversation(null)
    const { events, sink, waitFor } = createSink()

    const requestId = crypto.randomUUID()
    service.send({ requestId, conversationId: conversation.id, content: '问题' }, sink)
    await waitFor((event) => event.type === 'text_delta')

    expect(service.cancel(requestId)).toEqual({ cancelled: true })
    const cancelled = await waitFor((event) => event.type === 'cancelled')

    expect(cancelled.type).toBe('cancelled')
    expect(events.some((event) => event.type === 'completed')).toBe(false)

    const messages = store.listMessages(conversation.id)
    expect(messages.map((message) => message.role)).toEqual(['user'])
  })

  it('超时后发送错误事件且不落库', async () => {
    const service = createService(
      async function* (request) {
        yield textDelta('部分')
        await onceAborted(request.signal)
      },
      { timeoutMs: 20 }
    )
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      sink
    )
    const error = await waitFor((event) => event.type === 'error')

    expect(error.type).toBe('error')
    if (error.type === 'error') {
      expect(error.code).toBe('MODEL_REQUEST_FAILED')
      expect(error.message).toBe('模型响应超时，请重试')
    }
    expect(store.listMessages(conversation.id).map((message) => message.role)).toEqual(['user'])
  })

  it('cancelAll 中止请求且不发送终态事件', async () => {
    const service = createService(async function* (request) {
      yield textDelta('部分')
      await onceAborted(request.signal)
    })
    const conversation = service.createConversation(null)
    const { events, sink, waitFor } = createSink()

    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      sink
    )
    await waitFor((event) => event.type === 'text_delta')

    service.cancelAll()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(events.map((event) => event.type)).toEqual(['started', 'text_delta'])
    expect(store.listMessages(conversation.id).map((message) => message.role)).toEqual(['user'])
  })
})

describe('ChatService 错误映射', () => {
  it('适配层错误码原样向上传递', async () => {
    const service = createService(() =>
      failingStream(
        new ModelAdapterError('MODEL_CONFIG_ERROR', 'API Key 无效或无权访问该模型', 401)
      )
    )
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      sink
    )
    const error = await waitFor((event) => event.type === 'error')

    expect(error.type).toBe('error')
    if (error.type === 'error') {
      expect(error.code).toBe('MODEL_CONFIG_ERROR')
      expect(error.message).toBe('API Key 无效或无权访问该模型')
    }
  })

  it('未知异常统一映射为 MODEL_REQUEST_FAILED', async () => {
    const service = createService(() => failingStream(new Error('socket closed')))
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      sink
    )
    const error = await waitFor((event) => event.type === 'error')

    expect(error.type).toBe('error')
    if (error.type === 'error') {
      expect(error.code).toBe('MODEL_REQUEST_FAILED')
      expect(error.message).toBe('模型请求失败，请稍后重试')
    }
  })

  it('空输出视为请求失败', async () => {
    const service = createService(async function* () {
      yield { type: 'usage', inputTokens: 1, outputTokens: 0 }
    })
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    service.send(
      { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
      sink
    )
    const error = await waitFor((event) => event.type === 'error')

    expect(error.type).toBe('error')
    if (error.type === 'error') {
      expect(error.message).toBe('模型未返回内容')
    }
    expect(store.listMessages(conversation.id).map((message) => message.role)).toEqual(['user'])
  })

  it('未配置 Key 时不写入用户消息', () => {
    const service = new ChatService({
      adapterFactory: () => createAdapter(() => failingStream(new Error('unused'))),
      env: {}
    })
    service.initialize(store)
    const conversation = service.createConversation(null)
    const { sink } = createSink()

    try {
      service.send(
        { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '问题' },
        sink
      )
      expect.unreachable('应抛出配置错误')
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceError)
      expect((error as ServiceError).code).toBe('MODEL_CONFIG_ERROR')
    }

    expect(store.listMessages(conversation.id)).toEqual([])
  })
})

describe('ChatService 请求约束', () => {
  it('拒绝并发请求', async () => {
    const service = createService(async function* (request) {
      yield textDelta('部分')
      await onceAborted(request.signal)
    })
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    const requestId = crypto.randomUUID()
    service.send({ requestId, conversationId: conversation.id, content: '第一个' }, sink)
    await waitFor((event) => event.type === 'text_delta')

    expect(() =>
      service.send(
        { requestId: crypto.randomUUID(), conversationId: conversation.id, content: '第二个' },
        sink
      )
    ).toThrowError(/当前已有生成中的请求/)

    service.cancel(requestId)
    await waitFor((event) => event.type === 'cancelled')
  })

  it('拒绝重复使用 requestId', async () => {
    const service = createService(async function* () {
      yield textDelta('ok')
    })
    const conversation = service.createConversation(null)
    const { sink, waitFor } = createSink()

    const requestId = crypto.randomUUID()
    service.send({ requestId, conversationId: conversation.id, content: '问题' }, sink)
    await waitFor((event) => event.type === 'completed')

    expect(() =>
      service.send({ requestId, conversationId: conversation.id, content: '重复' }, sink)
    ).toThrowError(/请求 ID 已使用/)

    expect(store.listMessages(conversation.id).map((message) => message.content)).toEqual([
      '问题',
      'ok'
    ])
  })

  it('未初始化数据库时拒绝发送', () => {
    const service = new ChatService({
      adapterFactory: () => createAdapter(() => failingStream(new Error('unused'))),
      env: CONFIGURED_ENV
    })
    const { sink } = createSink()

    expect(() =>
      service.send(
        {
          requestId: crypto.randomUUID(),
          conversationId: crypto.randomUUID(),
          content: '问题'
        },
        sink
      )
    ).toThrowError(/数据库不可用/)
  })
})

describe('ChatService.testConnection', () => {
  it('成功时返回模型与耗时', async () => {
    const service = createService(async function* () {
      yield textDelta('OK')
    })

    await expect(service.testConnection()).resolves.toMatchObject({ model: 'deepseek-chat' })
    const result = await service.testConnection()
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it('适配层错误映射为 ServiceError', async () => {
    const service = createService(() =>
      failingStream(
        new ModelAdapterError('MODEL_CONFIG_ERROR', 'API Key 无效或无权访问该模型', 401)
      )
    )

    await expect(service.testConnection()).rejects.toMatchObject({
      code: 'MODEL_CONFIG_ERROR',
      message: 'API Key 无效或无权访问该模型'
    })
  })

  it('超时后返回连接超时错误', async () => {
    const service = new ChatService({
      adapterFactory: () => createAdapter(hangingStream),
      env: CONFIGURED_ENV,
      connectionTimeoutMs: 20
    })
    service.initialize(store)

    await expect(service.testConnection()).rejects.toMatchObject({
      code: 'MODEL_REQUEST_FAILED',
      message: '模型连接超时，请检查网络或配置'
    })
  })
})

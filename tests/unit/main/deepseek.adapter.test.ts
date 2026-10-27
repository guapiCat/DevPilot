import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEvent } from '@main/ai/model-adapter'
import { ModelAdapterError, extractHttpStatus, toModelAdapterError } from '@main/ai/model-error'

const streamMock = vi.hoisted(() => vi.fn())
const bindToolsMock = vi.hoisted(() => vi.fn())

vi.mock('@langchain/deepseek', () => ({
  ChatDeepSeek: class {
    bindTools(...args: unknown[]): unknown {
      bindToolsMock(...args)
      return this
    }

    stream(...args: unknown[]): unknown {
      return streamMock(...args)
    }
  },
}))

const { DeepSeekAdapter, normalizeContent } = await import('@main/ai/deepseek.adapter')

beforeEach(() => {
  streamMock.mockReset()
  bindToolsMock.mockReset()
})

describe('normalizeContent', () => {
  it('处理字符串内容', () => {
    expect(normalizeContent('hello')).toBe('hello')
  })

  it('只拼接文本块，忽略其他块', () => {
    expect(
      normalizeContent([
        { type: 'text', text: '你' },
        { type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
        { type: 'text', text: '好' },
      ]),
    ).toBe('你好')
  })

  it('忽略不支持的内容类型', () => {
    expect(normalizeContent(null)).toBe('')
    expect(normalizeContent(42)).toBe('')
    expect(normalizeContent([{ type: 'text' }, { text: 'x' }])).toBe('')
  })
})

describe('HTTP 错误映射', () => {
  it('从 status / cause / response 提取状态码', () => {
    expect(extractHttpStatus({ status: 401 })).toBe(401)
    expect(extractHttpStatus({ cause: { status: 429 } })).toBe(429)
    expect(extractHttpStatus({ response: { status: 503 } })).toBe(503)
    expect(extractHttpStatus(new Error('network'))).toBeUndefined()
  })

  it('把认证与配置错误映射为 MODEL_CONFIG_ERROR', () => {
    expect(toModelAdapterError({ status: 401 }).code).toBe('MODEL_CONFIG_ERROR')
    expect(toModelAdapterError({ status: 403 }).code).toBe('MODEL_CONFIG_ERROR')
    expect(toModelAdapterError({ status: 404 }).code).toBe('MODEL_CONFIG_ERROR')
  })

  it('把限流、服务端与网络错误映射为 MODEL_REQUEST_FAILED', () => {
    expect(toModelAdapterError({ status: 429 }).code).toBe('MODEL_REQUEST_FAILED')
    expect(toModelAdapterError({ status: 500 }).code).toBe('MODEL_REQUEST_FAILED')
    expect(toModelAdapterError(new Error('fetch failed')).code).toBe('MODEL_REQUEST_FAILED')
  })

  it('保留已有的 ModelAdapterError', () => {
    const original = new ModelAdapterError('MODEL_CONFIG_ERROR', 'config', 401)
    expect(toModelAdapterError(original)).toBe(original)
  })
})

describe('DeepSeekAdapter', () => {
  function createAdapter(): InstanceType<typeof DeepSeekAdapter> {
    return new DeepSeekAdapter({
      apiKey: 'sk-test-only',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
    })
  }

  it('把文本块与 usage 转换为内部事件', async () => {
    streamMock.mockImplementation(async function* () {
      yield { content: '你', usage_metadata: undefined }
      yield {
        content: '好',
        usage_metadata: { input_tokens: 12, output_tokens: 3, total_tokens: 15 },
      }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'text_delta', text: '你' },
      { type: 'text_delta', text: '好' },
      { type: 'usage', inputTokens: 12, outputTokens: 3 },
    ])
  })

  it('取消后停止产出事件', async () => {
    const controller = new AbortController()
    streamMock.mockImplementation(async function* () {
      yield { content: 'first', usage_metadata: undefined }
      controller.abort()
      yield { content: 'second', usage_metadata: undefined }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    })) {
      events.push(event)
    }

    expect(events).toEqual([{ type: 'text_delta', text: 'first' }])
  })

  it('有工具时绑定 OpenAI 风格的工具定义', async () => {
    streamMock.mockImplementation(async function* () {
      yield { content: 'ok' }
    })

    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      tools: [
        {
          name: 'read_file',
          description: '读取文件',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      ],
    })) {
      void event
    }

    expect(bindToolsMock).toHaveBeenCalledWith([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '读取文件',
          parameters: { type: 'object', properties: { path: { type: 'string' } } },
        },
      },
    ])
  })

  it('聚合流式工具调用分片并在流结束后产出完整调用', async () => {
    streamMock.mockImplementation(async function* () {
      yield {
        content: '',
        tool_call_chunks: [{ index: 0, id: 'call_1', name: 'read_file', args: '{"pa' }],
      }
      yield { content: '', tool_call_chunks: [{ index: 0, args: 'th":"src/a.ts"}' }] }
      yield {
        content: '',
        tool_call_chunks: [{ index: 1, id: 'call_2', name: 'search_code', args: '{"query":"TODO"}' }],
      }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      tools: [{ name: 'read_file', description: 'd', parameters: { type: 'object' } }],
    })) {
      events.push(event)
    }

    expect(events).toEqual([
      { type: 'tool_call', id: 'call_1', name: 'read_file', arguments: { path: 'src/a.ts' } },
      { type: 'tool_call', id: 'call_2', name: 'search_code', arguments: { query: 'TODO' } },
    ])
  })

  it('非法参数 JSON 解析为 null，缺失 id 时生成新 id', async () => {
    streamMock.mockImplementation(async function* () {
      yield { content: '', tool_call_chunks: [{ index: 0, name: 'read_file', args: '{broken' }] }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      tools: [{ name: 'read_file', description: 'd', parameters: { type: 'object' } }],
    })) {
      events.push(event)
    }

    expect(events).toHaveLength(1)
    const call = events[0]
    expect(call.type).toBe('tool_call')
    if (call.type !== 'tool_call') return
    expect(call.name).toBe('read_file')
    expect(call.arguments).toBeNull()
    expect(call.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('把 assistant 工具调用与 tool 结果转换为 LangChain 消息', async () => {
    streamMock.mockImplementation(async function* () {
      yield { content: 'done' }
    })

    for await (const event of createAdapter().stream({
      messages: [
        {
          role: 'assistant',
          content: '',
          toolCalls: [{ id: 'call_1', name: 'read_file', arguments: { path: 'src/a.ts' } }],
        },
        {
          role: 'tool',
          content: '<tool_result>ok</tool_result>',
          toolCallId: 'call_1',
          toolName: 'read_file',
        },
      ],
      signal: new AbortController().signal,
    })) {
      void event
    }

    const messages = streamMock.mock.calls[0][0] as unknown[]
    expect(messages[0]).toBeInstanceOf(AIMessage)
    expect((messages[0] as AIMessage).tool_calls).toEqual([
      { id: 'call_1', name: 'read_file', args: { path: 'src/a.ts' }, type: 'tool_call' },
    ])
    expect(messages[1]).toBeInstanceOf(ToolMessage)
    expect((messages[1] as ToolMessage).tool_call_id).toBe('call_1')
  })

  it('取消时吞掉底层中止异常，其他异常转换为稳定错误', async () => {
    const controller = new AbortController()
    streamMock.mockImplementation(() => {
      controller.abort()
      return {
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error('aborted')) }),
      }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: controller.signal,
    })) {
      events.push(event)
    }
    expect(events).toEqual([])

    streamMock.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(Object.assign(new Error('unauthorized'), { status: 401 })),
      }),
    }))

    await expect(async () => {
      for await (const event of createAdapter().stream({
        messages: [{ role: 'user', content: 'hi' }],
        signal: new AbortController().signal,
      })) {
        void event
      }
    }).rejects.toMatchObject({ code: 'MODEL_CONFIG_ERROR' })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModelEvent } from '@main/ai/model-adapter'

const openAiStreamMock = vi.hoisted(() => vi.fn())
const openAiBindToolsMock = vi.hoisted(() => vi.fn())
const openAiConstructorMock = vi.hoisted(() => vi.fn())
const deepSeekStreamMock = vi.hoisted(() => vi.fn())
const deepSeekConstructorMock = vi.hoisted(() => vi.fn())

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class {
    constructor(options: unknown) {
      openAiConstructorMock(options)
    }

    bindTools(...args: unknown[]): unknown {
      openAiBindToolsMock(...args)
      return this
    }

    stream(...args: unknown[]): unknown {
      return openAiStreamMock(...args)
    }
  },
}))

vi.mock('@langchain/deepseek', () => ({
  ChatDeepSeek: class {
    constructor(options: unknown) {
      deepSeekConstructorMock(options)
    }

    bindTools(): unknown {
      return this
    }

    stream(...args: unknown[]): unknown {
      return deepSeekStreamMock(...args)
    }
  },
}))

const { OpenAiChatAdapter } = await import('@main/ai/openai.adapter')
const { createModelAdapter } = await import('@main/ai/model-manager')

beforeEach(() => {
  openAiStreamMock.mockReset()
  openAiBindToolsMock.mockReset()
  openAiConstructorMock.mockReset()
  deepSeekStreamMock.mockReset()
  deepSeekConstructorMock.mockReset()
})

function createAdapter(apiKey = 'sk-test-only'): InstanceType<typeof OpenAiChatAdapter> {
  return new OpenAiChatAdapter({
    apiKey,
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  })
}

describe('OpenAiChatAdapter', () => {
  it('用档案的模型、地址与 Key 构造 ChatOpenAI', async () => {
    openAiStreamMock.mockImplementation(async function* () {
      yield { content: 'ok' }
    })

    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    })) {
      void event
    }

    expect(openAiConstructorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test-only',
        model: 'gpt-4o-mini',
        streaming: true,
        configuration: { baseURL: 'https://api.openai.com/v1' },
      }),
    )
  })

  it('空 Key 使用占位值以支持 Ollama 等本地服务', async () => {
    openAiStreamMock.mockImplementation(async function* () {
      yield { content: 'ok' }
    })

    for await (const event of createAdapter('').stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    })) {
      void event
    }

    expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'not-needed' }))
  })

  it('转换文本块与 usage', async () => {
    openAiStreamMock.mockImplementation(async function* () {
      yield { content: '你' }
      yield {
        content: [
          { type: 'text', text: '好' },
          { type: 'image_url', image_url: { url: 'https://example.com/x.png' } },
        ],
      }
      yield { content: '', usage_metadata: { input_tokens: 5, output_tokens: 2 } }
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
      { type: 'usage', inputTokens: 5, outputTokens: 2 },
    ])
  })

  it('有工具时绑定 OpenAI 风格定义并聚合工具调用', async () => {
    openAiStreamMock.mockImplementation(async function* () {
      yield {
        content: '',
        tool_call_chunks: [{ index: 0, id: 'call_1', name: 'read_file', args: '{"path":"src/a.ts"}' }],
      }
    })

    const events: ModelEvent[] = []
    for await (const event of createAdapter().stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
      tools: [{ name: 'read_file', description: '读取文件', parameters: { type: 'object' } }],
    })) {
      events.push(event)
    }

    expect(openAiBindToolsMock).toHaveBeenCalledWith([
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: '读取文件',
          parameters: { type: 'object' },
        },
      },
    ])
    expect(events).toEqual([{ type: 'tool_call', id: 'call_1', name: 'read_file', arguments: { path: 'src/a.ts' } }])
  })

  it('HTTP 认证错误映射为 MODEL_CONFIG_ERROR', async () => {
    openAiStreamMock.mockImplementation(() => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(Object.assign(new Error('unauthorized'), { status: 401 })),
      }),
    }))

    await expect(async () => {
      for await (const event of createAdapter('bad-key').stream({
        messages: [{ role: 'user', content: 'hi' }],
        signal: new AbortController().signal,
      })) {
        void event
      }
    }).rejects.toMatchObject({ code: 'MODEL_CONFIG_ERROR' })
  })
})

describe('createModelAdapter', () => {
  it('按 provider 分派 DeepSeek 与 OpenAI 兼容适配器', async () => {
    deepSeekStreamMock.mockImplementation(async function* () {
      yield { content: 'deepseek' }
    })
    openAiStreamMock.mockImplementation(async function* () {
      yield { content: 'openai' }
    })

    const deepseek = createModelAdapter({
      provider: 'deepseek',
      apiKey: 'sk-deepseek',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      toolsEnabled: true,
    })
    const compatible = createModelAdapter({
      provider: 'openai-compatible',
      apiKey: 'sk-openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      toolsEnabled: true,
    })

    for await (const event of deepseek.stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    })) {
      expect(event).toEqual({ type: 'text_delta', text: 'deepseek' })
    }
    for await (const event of compatible.stream({
      messages: [{ role: 'user', content: 'hi' }],
      signal: new AbortController().signal,
    })) {
      expect(event).toEqual({ type: 'text_delta', text: 'openai' })
    }

    expect(deepSeekConstructorMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'deepseek-chat' }))
    expect(openAiConstructorMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o-mini' }))
  })
})

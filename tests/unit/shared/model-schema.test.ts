import { describe, expect, it } from 'vitest'
import {
  isAllowedModelBaseUrl,
  modelBaseUrlSchema,
  modelProfileIdInputSchema,
  modelProfileInputSchema,
  testModelProfileInputSchema,
} from '@shared/schemas/model'

const VALID_PROFILE = {
  name: 'DeepSeek',
  provider: 'deepseek',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-test-only',
  toolsEnabled: true,
}

describe('Base URL 规则', () => {
  it('允许 https 地址', () => {
    expect(isAllowedModelBaseUrl('https://api.openai.com/v1')).toBe(true)
  })

  it('仅允许本地回环使用 http', () => {
    expect(isAllowedModelBaseUrl('http://localhost:11434/v1')).toBe(true)
    expect(isAllowedModelBaseUrl('http://127.0.0.1:11434/v1')).toBe(true)
    expect(isAllowedModelBaseUrl('http://[::1]:11434/v1')).toBe(true)
  })

  it('拒绝远程 http 与带凭据的地址', () => {
    expect(isAllowedModelBaseUrl('http://api.example.com/v1')).toBe(false)
    expect(isAllowedModelBaseUrl('https://user:pass@api.example.com/v1')).toBe(false)
    expect(isAllowedModelBaseUrl('not-a-url')).toBe(false)
  })

  it('schema 去除首尾空白并校验长度', () => {
    expect(modelBaseUrlSchema.parse('  https://api.example.com/v1  ')).toBe('https://api.example.com/v1')
    expect(modelBaseUrlSchema.safeParse('').success).toBe(false)
    expect(modelBaseUrlSchema.safeParse(`https://example.com/${'a'.repeat(2048)}`).success).toBe(false)
  })
})

describe('modelProfileInputSchema', () => {
  it('接受合法输入并去除字符串首尾空白', () => {
    const result = modelProfileInputSchema.parse({
      ...VALID_PROFILE,
      name: '  DeepSeek  ',
      apiKey: '  sk-test-only  ',
    })

    expect(result.name).toBe('DeepSeek')
    expect(result.apiKey).toBe('sk-test-only')
  })

  it('允许省略 apiKey 与 id', () => {
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, apiKey: undefined }).success).toBe(true)
  })

  it('拒绝未知 provider 与超出长度的字段', () => {
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, provider: 'anthropic' }).success).toBe(false)
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, name: 'a'.repeat(41) }).success).toBe(false)
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, model: 'm'.repeat(121) }).success).toBe(false)
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, apiKey: 'k'.repeat(4097) }).success).toBe(false)
  })

  it('id 必须为 uuid，且拒绝多余字段', () => {
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, id: 'not-a-uuid' }).success).toBe(false)
    expect(modelProfileInputSchema.safeParse({ ...VALID_PROFILE, extra: true }).success).toBe(false)
  })
})

describe('testModelProfileInputSchema', () => {
  it('允许 profileId 或 apiKey 单独出现', () => {
    const base = {
      provider: 'openai-compatible',
      model: 'qwen-plus',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    }

    expect(
      testModelProfileInputSchema.safeParse({
        ...base,
        profileId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true)
    expect(testModelProfileInputSchema.safeParse({ ...base, apiKey: 'sk-test' }).success).toBe(true)
  })

  it('拒绝非法 profileId', () => {
    expect(
      testModelProfileInputSchema.safeParse({
        profileId: 'bad',
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
      }).success,
    ).toBe(false)
  })
})

describe('modelProfileIdInputSchema', () => {
  it('要求 uuid', () => {
    expect(
      modelProfileIdInputSchema.safeParse({
        profileId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true)
    expect(modelProfileIdInputSchema.safeParse({ profileId: 'bad' }).success).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { readAiConfigValues } from '@main/services/settings.service'

describe('readAiConfigValues', () => {
  it('仅在配置 Key 时返回完整配置', () => {
    expect(readAiConfigValues({})).toBeNull()
    expect(readAiConfigValues({ DEEPSEEK_API_KEY: '   ' })).toBeNull()
  })

  it('使用默认模型与地址并去除首尾空白', () => {
    expect(
      readAiConfigValues({
        DEEPSEEK_API_KEY: '  sk-test-only  ',
        DEEPSEEK_MODEL: ' deepseek-reasoner ',
        DEEPSEEK_BASE_URL: ' https://example.com/v1 ',
      }),
    ).toEqual({
      provider: 'deepseek',
      apiKey: 'sk-test-only',
      model: 'deepseek-reasoner',
      baseUrl: 'https://example.com/v1',
      toolsEnabled: true,
    })

    expect(readAiConfigValues({ DEEPSEEK_API_KEY: 'sk-test-only' })).toEqual({
      provider: 'deepseek',
      apiKey: 'sk-test-only',
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      toolsEnabled: true,
    })
  })
})

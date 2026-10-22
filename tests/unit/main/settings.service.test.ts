import { describe, expect, it } from 'vitest'
import { readAiConfigStatus } from '@main/services/settings.service'

describe('readAiConfigStatus', () => {
  it('未配置 Key 时返回默认模型和未配置状态', () => {
    expect(readAiConfigStatus({})).toEqual({
      configured: false,
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      source: 'none'
    })
  })

  it('配置 Key 后标记为环境变量来源，且不返回 Key 本身', () => {
    const status = readAiConfigStatus({
      DEEPSEEK_API_KEY: 'sk-test-only',
      DEEPSEEK_MODEL: 'deepseek-reasoner'
    })

    expect(status.configured).toBe(true)
    expect(status.source).toBe('env')
    expect(status.model).toBe('deepseek-reasoner')
    expect(JSON.stringify(status)).not.toContain('sk-test-only')
  })

  it('空白 Key 视为未配置', () => {
    const status = readAiConfigStatus({ DEEPSEEK_API_KEY: '   ' })
    expect(status.configured).toBe(false)
    expect(status.source).toBe('none')
  })
})

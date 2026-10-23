import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AiConfigStatus } from '@shared/types/app'

const mocks = vi.hoisted(() => ({
  getAiConfigStatus: vi.fn(),
  activateModelProfile: vi.fn()
}))

vi.mock('@renderer/services/desktop-api', () => ({
  desktopApi: {
    settings: {
      getAiConfigStatus: mocks.getAiConfigStatus,
      activateModelProfile: mocks.activateModelProfile
    },
    chat: {}
  }
}))

import { useChatStore } from '@renderer/stores/chat'

function makeStatus(overrides: Partial<AiConfigStatus> = {}): AiConfigStatus {
  return {
    configured: true,
    source: 'profile',
    provider: 'deepseek',
    model: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com',
    toolsEnabled: true,
    activeProfileId: 'profile-a',
    profiles: [
      {
        id: 'profile-a',
        name: 'DeepSeek',
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        toolsEnabled: true,
        hasApiKey: true,
        isActive: true,
        updatedAt: '2026-10-23T00:00:00.000Z'
      },
      {
        id: 'profile-b',
        name: 'Ollama',
        provider: 'openai-compatible',
        model: 'qwen2.5:7b',
        baseUrl: 'http://127.0.0.1:11434/v1',
        toolsEnabled: false,
        hasApiKey: false,
        isActive: false,
        updatedAt: '2026-10-23T00:00:00.000Z'
      }
    ],
    envConfigured: true,
    secretStorageAvailable: true,
    ...overrides
  }
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill
  })
  return { promise, resolve }
}

describe('chat store 模型配置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('loadAiConfig 保存完整状态并同步可用性', async () => {
    const store = useChatStore()
    mocks.getAiConfigStatus.mockResolvedValue(makeStatus())

    await store.loadAiConfig()

    expect(store.aiStatus?.activeProfileId).toBe('profile-a')
    expect(store.aiStatus?.profiles).toHaveLength(2)
    expect(store.aiConfigured).toBe(true)
    expect(store.aiConfigLoading).toBe(false)
  })

  it('未配置时 aiConfigured 为 false', async () => {
    const store = useChatStore()
    mocks.getAiConfigStatus.mockResolvedValue(
      makeStatus({ configured: false, source: 'none', activeProfileId: null, profiles: [] })
    )

    await store.loadAiConfig()

    expect(store.aiStatus?.source).toBe('none')
    expect(store.aiConfigured).toBe(false)
  })

  it('读取失败时保持默认可用并记录错误', async () => {
    const store = useChatStore()
    mocks.getAiConfigStatus.mockRejectedValue(new Error('读取失败'))

    await store.loadAiConfig()

    expect(store.aiStatus).toBeNull()
    expect(store.aiConfigured).toBe(true)
    expect(store.errorMessage).toBe('读取失败')
  })

  it('activateModelProfile 用返回状态更新当前档案', async () => {
    const store = useChatStore()
    mocks.getAiConfigStatus.mockResolvedValue(makeStatus())
    await store.loadAiConfig()

    const switched = makeStatus({
      activeProfileId: 'profile-b',
      model: 'qwen2.5:7b',
      provider: 'openai-compatible',
      baseUrl: 'http://127.0.0.1:11434/v1',
      toolsEnabled: false
    })
    mocks.activateModelProfile.mockResolvedValue(switched)

    const status = await store.activateModelProfile('profile-b')

    expect(mocks.activateModelProfile).toHaveBeenCalledWith('profile-b')
    expect(status.activeProfileId).toBe('profile-b')
    expect(store.aiStatus?.activeProfileId).toBe('profile-b')
    expect(store.aiStatus?.toolsEnabled).toBe(false)
  })

  it('激活失败时抛出且不改变当前档案', async () => {
    const store = useChatStore()
    mocks.getAiConfigStatus.mockResolvedValue(makeStatus())
    await store.loadAiConfig()
    mocks.activateModelProfile.mockRejectedValue(new Error('切换失败'))

    await expect(store.activateModelProfile('profile-b')).rejects.toThrow('切换失败')

    expect(store.aiStatus?.activeProfileId).toBe('profile-a')
  })

  it('慢速读取不会覆盖已完成的切换', async () => {
    const store = useChatStore()
    const slow = deferred<AiConfigStatus>()
    mocks.getAiConfigStatus.mockReturnValue(slow.promise)

    const loading = store.loadAiConfig()

    const switched = makeStatus({ activeProfileId: 'profile-b' })
    mocks.activateModelProfile.mockResolvedValue(switched)
    await store.activateModelProfile('profile-b')

    slow.resolve(makeStatus())
    await loading

    expect(store.aiStatus?.activeProfileId).toBe('profile-b')
  })
})

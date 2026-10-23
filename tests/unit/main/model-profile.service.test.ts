import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '@main/database/database'
import { ModelProfileStore } from '@main/database/model-profile.store'
import { ModelProfileService } from '@main/services/model-profile.service'
import type { SecretCipher } from '@main/security/secret-cipher'
import type { ModelProfileInput } from '@shared/types/model'

class FakeCipher implements SecretCipher {
  constructor(private readonly available = true) {}

  isAvailable(): boolean {
    return this.available
  }

  encrypt(plain: string): string {
    return `enc:${Buffer.from(plain, 'utf8').toString('base64')}`
  }

  decrypt(cipher: string): string {
    if (!cipher.startsWith('enc:')) throw new Error('invalid cipher')
    return Buffer.from(cipher.slice(4), 'base64').toString('utf8')
  }
}

const DEEPSEEK_INPUT: ModelProfileInput = {
  name: 'DeepSeek',
  provider: 'deepseek',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  apiKey: 'sk-deepseek',
  toolsEnabled: true
}

const COMPAT_INPUT: ModelProfileInput = {
  name: 'Ollama',
  provider: 'openai-compatible',
  model: 'qwen2.5:7b',
  baseUrl: 'http://127.0.0.1:11434/v1',
  apiKey: '',
  toolsEnabled: false
}

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let db: Database.Database
let store: ModelProfileStore

function createService(
  options: {
    cipher?: SecretCipher
    env?: Record<string, string | undefined>
    useStore?: boolean
  } = {}
): ModelProfileService {
  return new ModelProfileService({
    store: options.useStore === false ? null : store,
    cipher: options.cipher ?? new FakeCipher(),
    env: options.env ?? {}
  })
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devpilot-model-service-'))
  tempDirs.push(directory)
  db = openDatabase(directory)
  openDatabases.push(db)
  store = new ModelProfileStore(db)
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ModelProfileService 档案管理', () => {
  it('首个档案自动激活且摘要不泄漏密钥或密文', () => {
    const service = createService()
    const status = service.save(DEEPSEEK_INPUT)

    expect(status.source).toBe('profile')
    expect(status.activeProfileId).not.toBeNull()
    expect(status.configured).toBe(true)
    expect(status.profiles).toHaveLength(1)
    expect(status.profiles[0]).toMatchObject({
      name: 'DeepSeek',
      provider: 'deepseek',
      hasApiKey: true,
      isActive: true
    })

    const serialized = JSON.stringify(status)
    expect(serialized).not.toContain('sk-deepseek')
    expect(serialized).not.toContain('enc:')
  })

  it('更新时留空 Key 保留原密文', () => {
    const service = createService()
    const created = service.save(DEEPSEEK_INPUT)
    const profileId = created.profiles[0].id

    service.save({
      id: profileId,
      ...DEEPSEEK_INPUT,
      name: 'DeepSeek 2',
      apiKey: '   '
    })

    const updated = service.getStatus().profiles[0]
    expect(updated).toMatchObject({ name: 'DeepSeek 2', hasApiKey: true })
    expect(service.resolveActive().apiKey).toBe('sk-deepseek')
  })

  it('DeepSeek 缺少 Key 时拒绝保存', () => {
    const service = createService()

    expect(() => service.save({ ...DEEPSEEK_INPUT, apiKey: '' })).toThrowError(
      /DeepSeek 模型需要填写 API Key/
    )
    expect(service.list()).toEqual([])
  })

  it('openai-compatible 允许空 Key 并用于本地模型', () => {
    const service = createService()
    const status = service.save(COMPAT_INPUT)

    expect(status.configured).toBe(true)
    expect(status.profiles[0].hasApiKey).toBe(false)
    expect(service.resolveActive()).toMatchObject({
      provider: 'openai-compatible',
      apiKey: '',
      model: 'qwen2.5:7b',
      toolsEnabled: false
    })
  })

  it('切换 active 档案并保留工具开关', () => {
    const service = createService()
    service.save(DEEPSEEK_INPUT)
    const status = service.save(COMPAT_INPUT)
    const compatId = status.profiles.find((item) => item.name === 'Ollama')?.id

    expect(compatId).toBeDefined()
    const activated = service.activate(compatId!)

    expect(activated.activeProfileId).toBe(compatId)
    expect(activated.toolsEnabled).toBe(false)
    expect(service.resolveActive().toolsEnabled).toBe(false)
  })

  it('切换到不存在的档案报 MODEL_PROFILE_NOT_FOUND', () => {
    const service = createService()

    expect(() => service.activate('11111111-1111-4111-8111-111111111111')).toThrowError(
      expect.objectContaining({ code: 'MODEL_PROFILE_NOT_FOUND' })
    )
    expect(() => service.remove('11111111-1111-4111-8111-111111111111')).toThrowError(
      expect.objectContaining({ code: 'MODEL_PROFILE_NOT_FOUND' })
    )
  })

  it('删除当前档案后回退到 .env 配置', () => {
    const service = createService({ env: { DEEPSEEK_API_KEY: 'sk-env' } })
    const created = service.save(DEEPSEEK_INPUT)
    const other = service.save({ ...COMPAT_INPUT, name: 'Ollama' })
    expect(other.profiles).toHaveLength(2)

    const removed = service.remove(created.profiles[0].id)

    expect(removed.profiles).toHaveLength(1)
    expect(removed.source).toBe('profile')
    expect(service.resolveActive()).toMatchObject({
      provider: 'openai-compatible',
      model: 'qwen2.5:7b'
    })

    const compatId = removed.activeProfileId!
    const empty = service.remove(compatId)
    expect(empty.source).toBe('env')
    expect(empty.activeProfileId).toBeNull()
    expect(service.resolveActive()).toMatchObject({
      provider: 'deepseek',
      apiKey: 'sk-env'
    })
  })

  it('超过档案数量上限时拒绝新增', () => {
    const service = createService()
    for (let index = 0; index < 20; index += 1) {
      service.save({ ...COMPAT_INPUT, name: `profile-${index}` })
    }

    expect(() => service.save({ ...COMPAT_INPUT, name: 'overflow' })).toThrowError(
      /最多只能保存 20 个模型档案/
    )
  })
})

describe('ModelProfileService .env 兜底与降级', () => {
  it('无档案时使用 .env 并标记来源', () => {
    const service = createService({
      env: { DEEPSEEK_API_KEY: 'sk-env', DEEPSEEK_MODEL: 'deepseek-reasoner' }
    })

    const status = service.getStatus()
    expect(status).toMatchObject({
      configured: true,
      source: 'env',
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      activeProfileId: null,
      envConfigured: true
    })
    expect(JSON.stringify(status)).not.toContain('sk-env')
    expect(service.resolveActive()).toMatchObject({ apiKey: 'sk-env' })
  })

  it('无档案且无 .env 时 resolveActive 报 MODEL_CONFIG_ERROR', () => {
    const service = createService()

    expect(service.getStatus()).toMatchObject({ configured: false, source: 'none' })
    expect(() => service.resolveActive()).toThrowError(
      expect.objectContaining({ code: 'MODEL_CONFIG_ERROR' })
    )
  })

  it('数据库不可用时状态回退 .env，写操作报 DATABASE_ERROR', () => {
    const service = createService({
      useStore: false,
      env: { DEEPSEEK_API_KEY: 'sk-env' }
    })

    expect(service.getStatus()).toMatchObject({ source: 'env', profiles: [] })
    expect(service.list()).toEqual([])
    expect(() => service.save(DEEPSEEK_INPUT)).toThrowError(
      expect.objectContaining({ code: 'DATABASE_ERROR' })
    )
  })
})

describe('ModelProfileService 密钥错误处理', () => {
  it('系统加密不可用时拒绝保存带 Key 的档案', () => {
    const service = createService({ cipher: new FakeCipher(false) })

    expect(() => service.save(DEEPSEEK_INPUT)).toThrowError(
      expect.objectContaining({ code: 'SECRET_STORAGE_UNAVAILABLE' })
    )
    expect(service.getStatus().secretStorageAvailable).toBe(false)
  })

  it('加密不可用时仍可保存无 Key 的兼容模型', () => {
    const service = createService({ cipher: new FakeCipher(false) })
    const status = service.save(COMPAT_INPUT)

    expect(status.profiles[0].hasApiKey).toBe(false)
  })

  it('密文无法解密时给出明确配置错误', () => {
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'broken',
      provider: 'deepseek',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKeyCipher: 'legacy-plaintext',
      toolsEnabled: true,
      isActive: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z'
    })
    const service = createService()

    expect(() => service.resolveActive()).toThrowError(
      expect.objectContaining({
        code: 'MODEL_CONFIG_ERROR',
        message: '已保存的 API Key 无法解密，请在设置中重新填写'
      })
    )
  })
})

describe('ModelProfileService.resolveDraft', () => {
  it('优先使用显式 Key，不落库', () => {
    const service = createService()
    const status = service.save(DEEPSEEK_INPUT)
    const profileId = status.profiles[0].id

    expect(
      service.resolveDraft({
        profileId,
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: 'sk-explicit'
      }).apiKey
    ).toBe('sk-explicit')
    expect(service.list()).toHaveLength(1)
  })

  it('留空时复用档案中已保存的密文', () => {
    const service = createService()
    const status = service.save(DEEPSEEK_INPUT)

    expect(
      service.resolveDraft({
        profileId: status.profiles[0].id,
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com',
        apiKey: '   '
      }).apiKey
    ).toBe('sk-deepseek')
  })

  it('DeepSeek 草稿缺少 Key 时报错，未知档案报 NOT_FOUND', () => {
    const service = createService()

    expect(() =>
      service.resolveDraft({
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com'
      })
    ).toThrowError(/DeepSeek 模型需要填写 API Key/)

    expect(() =>
      service.resolveDraft({
        profileId: '11111111-1111-4111-8111-111111111111',
        provider: 'deepseek',
        model: 'deepseek-chat',
        baseUrl: 'https://api.deepseek.com'
      })
    ).toThrowError(expect.objectContaining({ code: 'MODEL_PROFILE_NOT_FOUND' }))
  })
})

import { randomUUID } from 'node:crypto'
import { MAX_MODEL_PROFILES } from '@shared/constants/app'
import type { AiConfigStatus } from '@shared/types/app'
import type {
  ModelProfileInput,
  ModelProfileSummary,
  ModelProviderKind,
  TestModelProfileInput,
} from '@shared/types/model'
import type { ModelProfileRecord, ModelProfileStore } from '../database/model-profile.store'
import type { SecretCipher } from '../security/secret-cipher'
import { ServiceError } from '../utils/service-error'
import {
  readAiConfigValues,
  readEnvBaseUrl,
  readEnvModelName,
  type EnvLike,
  type ResolvedAiConfig,
} from './settings.service'

export interface ModelProfileServiceOptions {
  store?: ModelProfileStore | null
  cipher: SecretCipher
  env?: EnvLike
  now?: () => Date
  idFactory?: () => string
}

function toSummary(record: ModelProfileRecord): ModelProfileSummary {
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    model: record.model,
    baseUrl: record.baseUrl,
    toolsEnabled: record.toolsEnabled,
    hasApiKey: Boolean(record.apiKeyCipher),
    isActive: record.isActive,
    updatedAt: record.updatedAt,
  }
}

export class ModelProfileService {
  private store: ModelProfileStore | null
  private readonly cipher: SecretCipher
  private readonly env: EnvLike
  private readonly now: () => Date
  private readonly idFactory: () => string

  constructor(options: ModelProfileServiceOptions) {
    this.store = options.store ?? null
    this.cipher = options.cipher
    this.env = options.env ?? process.env
    this.now = options.now ?? (() => new Date())
    this.idFactory = options.idFactory ?? randomUUID
  }

  initialize(store: ModelProfileStore | null): void {
    this.store = store
    this.store?.activateLatestIfNone()
  }

  list(): ModelProfileSummary[] {
    return this.store ? this.store.list().map(toSummary) : []
  }

  getStatus(): AiConfigStatus {
    const store = this.store
    const active = store?.getActive()
    const profiles = store ? store.list().map(toSummary) : []
    const envConfigured = readAiConfigValues(this.env) !== null

    const provider: ModelProviderKind | null = active ? active.provider : envConfigured ? 'deepseek' : null
    const configured = active ? (active.provider === 'deepseek' ? Boolean(active.apiKeyCipher) : true) : envConfigured

    return {
      configured,
      source: active ? 'profile' : envConfigured ? 'env' : 'none',
      provider,
      model: active?.model ?? readEnvModelName(this.env),
      baseUrl: active?.baseUrl ?? readEnvBaseUrl(this.env),
      toolsEnabled: active ? active.toolsEnabled : envConfigured,
      activeProfileId: active?.id ?? null,
      profiles,
      envConfigured,
      secretStorageAvailable: this.cipher.isAvailable(),
    }
  }

  save(input: ModelProfileInput): AiConfigStatus {
    const store = this.requireStore()
    const existing = input.id ? store.findById(input.id) : undefined
    if (input.id && !existing) {
      throw new ServiceError('MODEL_PROFILE_NOT_FOUND', '模型档案不存在，请刷新后重试')
    }

    const apiKeyCipher = this.resolveCipherForSave(input, existing?.apiKeyCipher ?? null)
    const timestamp = this.now().toISOString()

    if (existing) {
      store.update({
        ...existing,
        name: input.name,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl,
        apiKeyCipher,
        toolsEnabled: input.toolsEnabled,
        updatedAt: timestamp,
      })
    } else {
      if (store.count() >= MAX_MODEL_PROFILES) {
        throw new ServiceError('VALIDATION_ERROR', `最多只能保存 ${MAX_MODEL_PROFILES} 个模型档案`)
      }

      store.insert({
        id: this.idFactory(),
        name: input.name,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl,
        apiKeyCipher,
        toolsEnabled: input.toolsEnabled,
        isActive: store.count() === 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
    }

    return this.getStatus()
  }

  remove(profileId: string): AiConfigStatus {
    const store = this.requireStore()
    if (!store.findById(profileId)) {
      throw new ServiceError('MODEL_PROFILE_NOT_FOUND', '模型档案不存在，请刷新后重试')
    }

    store.remove(profileId)
    return this.getStatus()
  }

  activate(profileId: string): AiConfigStatus {
    const store = this.requireStore()
    if (!store.findById(profileId)) {
      throw new ServiceError('MODEL_PROFILE_NOT_FOUND', '模型档案不存在，请刷新后重试')
    }

    store.setActive(profileId)
    return this.getStatus()
  }

  resolveActive(): ResolvedAiConfig {
    const active = this.store?.getActive()
    if (active) {
      const apiKey = this.decryptKey(active.apiKeyCipher)
      if (active.provider === 'deepseek' && !apiKey) {
        throw new ServiceError('MODEL_CONFIG_ERROR', 'DeepSeek 档案缺少 API Key，请在设置中补充')
      }

      return {
        provider: active.provider,
        apiKey,
        model: active.model,
        baseUrl: active.baseUrl,
        toolsEnabled: active.toolsEnabled,
        profileId: active.id,
      }
    }

    const envConfig = readAiConfigValues(this.env)
    if (envConfig) return envConfig

    throw new ServiceError(
      'MODEL_CONFIG_ERROR',
      '未配置模型服务，请在设置页新增模型，或在 .env 中配置 DEEPSEEK_API_KEY',
    )
  }

  resolveDraft(input: TestModelProfileInput): ResolvedAiConfig {
    const explicitKey = input.apiKey?.trim()
    let apiKey = explicitKey ?? ''

    if (!apiKey && input.profileId) {
      const existing = this.store?.findById(input.profileId)
      if (!existing) {
        throw new ServiceError('MODEL_PROFILE_NOT_FOUND', '模型档案不存在，请刷新后重试')
      }
      apiKey = this.decryptKey(existing.apiKeyCipher)
    }

    if (input.provider === 'deepseek' && !apiKey) {
      throw new ServiceError('MODEL_CONFIG_ERROR', 'DeepSeek 模型需要填写 API Key')
    }

    return {
      provider: input.provider,
      apiKey,
      model: input.model,
      baseUrl: input.baseUrl,
      toolsEnabled: false,
    }
  }

  private resolveCipherForSave(input: ModelProfileInput, existingCipher: string | null): string | null {
    const apiKey = input.apiKey?.trim()

    if (!apiKey) {
      if (input.provider === 'deepseek' && !existingCipher) {
        throw new ServiceError('MODEL_CONFIG_ERROR', 'DeepSeek 模型需要填写 API Key')
      }
      return existingCipher
    }

    if (!this.cipher.isAvailable()) {
      throw new ServiceError('SECRET_STORAGE_UNAVAILABLE', '系统凭据加密不可用，无法安全保存 API Key；可改用 .env 配置')
    }

    return this.cipher.encrypt(apiKey)
  }

  private decryptKey(cipher: string | null): string {
    if (!cipher) return ''

    try {
      return this.cipher.decrypt(cipher)
    } catch {
      throw new ServiceError('MODEL_CONFIG_ERROR', '已保存的 API Key 无法解密，请在设置中重新填写')
    }
  }

  private requireStore(): ModelProfileStore {
    if (!this.store) {
      throw new ServiceError('DATABASE_ERROR', '数据库不可用，无法保存模型档案')
    }
    return this.store
  }
}

let instance: ModelProfileService | null = null

export function initModelProfileService(options: ModelProfileServiceOptions): ModelProfileService {
  instance = new ModelProfileService(options)
  return instance
}

export function getModelProfileService(): ModelProfileService {
  if (!instance) {
    throw new ServiceError('INTERNAL_ERROR', '模型配置服务尚未初始化')
  }
  return instance
}

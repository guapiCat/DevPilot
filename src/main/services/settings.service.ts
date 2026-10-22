import {
  AI_CONFIG_ENV,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL
} from '@shared/constants/app'
import type { AiConfigStatus } from '@shared/types/app'

export type EnvLike = Record<string, string | undefined>

export interface ResolvedAiConfig {
  apiKey: string
  model: string
  baseUrl: string
}

/**
 * 仅主进程使用；返回 API Key 本身。调用方不得把它写入 Renderer、日志或数据库。
 */
export function readAiConfigValues(env: EnvLike): ResolvedAiConfig | null {
  const apiKey = env[AI_CONFIG_ENV.apiKey]?.trim()
  if (!apiKey) return null

  return {
    apiKey,
    model: env[AI_CONFIG_ENV.model]?.trim() || DEFAULT_DEEPSEEK_MODEL,
    baseUrl: env[AI_CONFIG_ENV.baseUrl]?.trim() || DEFAULT_DEEPSEEK_BASE_URL
  }
}

/**
 * 只返回配置状态，绝不返回 API Key 本身。
 */
export function readAiConfigStatus(env: EnvLike): AiConfigStatus {
  const model = env[AI_CONFIG_ENV.model]?.trim() || DEFAULT_DEEPSEEK_MODEL
  const baseUrl = env[AI_CONFIG_ENV.baseUrl]?.trim() || DEFAULT_DEEPSEEK_BASE_URL
  const configured = Boolean(env[AI_CONFIG_ENV.apiKey]?.trim())

  return {
    configured,
    model,
    baseUrl,
    source: configured ? 'env' : 'none'
  }
}

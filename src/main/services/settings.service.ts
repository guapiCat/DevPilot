import {
  AI_CONFIG_ENV,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL
} from '@shared/constants/app'

export type EnvLike = Record<string, string | undefined>

export interface ResolvedAiConfig {
  provider: 'deepseek' | 'openai-compatible'
  apiKey: string
  model: string
  baseUrl: string
  toolsEnabled: boolean
  profileId?: string
}

/**
 * 仅主进程使用；返回 API Key 本身。调用方不得把它写入 Renderer、日志或数据库。
 */
export function readAiConfigValues(env: EnvLike): ResolvedAiConfig | null {
  const apiKey = env[AI_CONFIG_ENV.apiKey]?.trim()
  if (!apiKey) return null

  return {
    provider: 'deepseek',
    apiKey,
    model: env[AI_CONFIG_ENV.model]?.trim() || DEFAULT_DEEPSEEK_MODEL,
    baseUrl: env[AI_CONFIG_ENV.baseUrl]?.trim() || DEFAULT_DEEPSEEK_BASE_URL,
    toolsEnabled: true
  }
}

export function readEnvModelName(env: EnvLike): string {
  return env[AI_CONFIG_ENV.model]?.trim() || DEFAULT_DEEPSEEK_MODEL
}

export function readEnvBaseUrl(env: EnvLike): string {
  return env[AI_CONFIG_ENV.baseUrl]?.trim() || DEFAULT_DEEPSEEK_BASE_URL
}

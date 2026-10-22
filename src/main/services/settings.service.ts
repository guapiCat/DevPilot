import {
  AI_CONFIG_ENV,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL
} from '@shared/constants/app'
import type { AiConfigStatus } from '@shared/types/app'

export type EnvLike = Record<string, string | undefined>

/**
 * 只返回配置状态，绝不返回 API Key 本身。
 */
export function readAiConfigStatus(env: EnvLike): AiConfigStatus {
  const apiKey = env[AI_CONFIG_ENV.apiKey]?.trim()
  const model = env[AI_CONFIG_ENV.model]?.trim() || DEFAULT_DEEPSEEK_MODEL
  const baseUrl = env[AI_CONFIG_ENV.baseUrl]?.trim() || DEFAULT_DEEPSEEK_BASE_URL

  return {
    configured: Boolean(apiKey),
    model,
    baseUrl,
    source: apiKey ? 'env' : 'none'
  }
}

import {
  readAiConfigValues,
  type EnvLike,
  type ResolvedAiConfig
} from '../services/settings.service'
import { ServiceError } from '../utils/service-error'
import { DeepSeekAdapter } from './deepseek.adapter'
import type { ModelAdapter } from './model-adapter'
import { OpenAiChatAdapter } from './openai.adapter'

export function resolveAiConfig(env: EnvLike): ResolvedAiConfig {
  const config = readAiConfigValues(env)
  if (!config) {
    throw new ServiceError(
      'MODEL_CONFIG_ERROR',
      '未配置模型服务，请在设置页新增模型，或在 .env 中配置 DEEPSEEK_API_KEY'
    )
  }
  return config
}

export function createModelAdapter(config: ResolvedAiConfig): ModelAdapter {
  return config.provider === 'deepseek'
    ? new DeepSeekAdapter(config)
    : new OpenAiChatAdapter(config)
}

export function createDeepSeekAdapter(config: ResolvedAiConfig): ModelAdapter {
  return new DeepSeekAdapter(config)
}

import {
  readAiConfigValues,
  type EnvLike,
  type ResolvedAiConfig
} from '../services/settings.service'
import { ServiceError } from '../utils/service-error'
import { DeepSeekAdapter } from './deepseek.adapter'
import type { ModelAdapter } from './model-adapter'

export function resolveAiConfig(env: EnvLike): ResolvedAiConfig {
  const config = readAiConfigValues(env)
  if (!config) {
    throw new ServiceError('MODEL_CONFIG_ERROR', '未配置 DeepSeek API Key，请在设置页查看配置方式')
  }
  return config
}

export function createDeepSeekAdapter(config: ResolvedAiConfig): ModelAdapter {
  return new DeepSeekAdapter(config)
}

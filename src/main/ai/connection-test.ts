import { MODEL_CONNECTION_TEST_TIMEOUT_MS } from '@shared/constants/app'
import type { AiConnectionTestResult } from '@shared/types/chat'
import type { ResolvedAiConfig } from '../services/settings.service'
import { ServiceError } from '../utils/service-error'
import { ModelAdapterError } from './model-error'
import { createModelAdapter } from './model-manager'
import type { ModelAdapter } from './model-adapter'

export interface ConnectionTestOptions {
  adapterFactory?: (config: ResolvedAiConfig) => ModelAdapter
  timeoutMs?: number
}

export async function testAdapterConnection(
  config: ResolvedAiConfig,
  options: ConnectionTestOptions = {}
): Promise<AiConnectionTestResult> {
  const adapterFactory = options.adapterFactory ?? createModelAdapter
  const timeoutMs = options.timeoutMs ?? MODEL_CONNECTION_TEST_TIMEOUT_MS
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const adapter = adapterFactory(config)
    for await (const event of adapter.stream({
      messages: [{ role: 'user', content: '请只回复 OK。' }],
      signal: controller.signal,
      maxTokens: 8
    })) {
      void event
      if (controller.signal.aborted) break
    }

    if (controller.signal.aborted) {
      throw new ServiceError('MODEL_REQUEST_FAILED', '模型连接超时，请检查网络或配置')
    }

    return { model: config.model, latencyMs: Date.now() - startedAt }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ServiceError('MODEL_REQUEST_FAILED', '模型连接超时，请检查网络或配置')
    }
    if (error instanceof ModelAdapterError) {
      throw new ServiceError(error.code, error.message)
    }
    if (error instanceof ServiceError) throw error
    throw new ServiceError('MODEL_REQUEST_FAILED', '连接模型服务失败，请稍后重试')
  } finally {
    clearTimeout(timer)
  }
}

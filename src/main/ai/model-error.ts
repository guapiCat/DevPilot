export type ModelErrorCode = 'MODEL_CONFIG_ERROR' | 'MODEL_REQUEST_FAILED'

export class ModelAdapterError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string,
    readonly httpStatus?: number
  ) {
    super(message)
    this.name = 'ModelAdapterError'
  }
}

function readStatus(value: unknown, depth: number): number | undefined {
  if (depth > 3 || value === null || typeof value !== 'object') return undefined

  const record = value as Record<string, unknown>
  for (const key of ['status', 'statusCode']) {
    const candidate = record[key]
    if (typeof candidate === 'number' && candidate >= 100 && candidate <= 599) {
      return candidate
    }
  }

  return (
    readStatus(record.cause, depth + 1) ??
    readStatus(record.response, depth + 1) ??
    readStatus(record.error, depth + 1)
  )
}

export function extractHttpStatus(error: unknown): number | undefined {
  return readStatus(error, 0)
}

export function toModelAdapterError(error: unknown): ModelAdapterError {
  if (error instanceof ModelAdapterError) return error

  const status = extractHttpStatus(error)

  if (status === 401 || status === 403) {
    return new ModelAdapterError('MODEL_CONFIG_ERROR', 'API Key 无效或无权访问该模型', status)
  }

  if (status === 404) {
    return new ModelAdapterError('MODEL_CONFIG_ERROR', '模型或 Base URL 不存在，请检查配置', status)
  }

  if (status === 429) {
    return new ModelAdapterError('MODEL_REQUEST_FAILED', '请求过于频繁，请稍后重试', status)
  }

  if (status !== undefined && status >= 500) {
    return new ModelAdapterError('MODEL_REQUEST_FAILED', '模型服务暂时不可用，请稍后重试', status)
  }

  return new ModelAdapterError('MODEL_REQUEST_FAILED', '无法连接模型服务，请检查网络或 Base URL')
}

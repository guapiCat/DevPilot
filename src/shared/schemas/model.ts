import { z } from 'zod'
import {
  MAX_API_KEY_LENGTH,
  MAX_MODEL_BASE_URL_LENGTH,
  MAX_MODEL_ID_LENGTH,
  MAX_MODEL_PROFILE_NAME_LENGTH,
} from '../constants/app'

export const modelProviderKindSchema = z.enum(['deepseek', 'openai-compatible'])

export type ModelProviderKindInput = z.infer<typeof modelProviderKindSchema>

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export function isAllowedModelBaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (!url.hostname || url.username || url.password) return false
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname)
  } catch {
    return false
  }
}

export const modelBaseUrlSchema = z
  .string()
  .trim()
  .min(1, 'Base URL 不能为空')
  .max(MAX_MODEL_BASE_URL_LENGTH, 'Base URL 过长')
  .refine(isAllowedModelBaseUrl, 'Base URL 必须使用 https（本地 localhost 可用 http）')

export const modelIdSchema = z.string().trim().min(1, '模型 ID 不能为空').max(MAX_MODEL_ID_LENGTH, '模型 ID 过长')

const modelProfileNameSchema = z
  .string()
  .trim()
  .min(1, '档案名称不能为空')
  .max(MAX_MODEL_PROFILE_NAME_LENGTH, '档案名称过长')

const apiKeySchema = z.string().trim().max(MAX_API_KEY_LENGTH, 'API Key 过长').optional()

export const modelProfileInputSchema = z.strictObject({
  id: z.string().uuid('档案 ID 不合法').optional(),
  name: modelProfileNameSchema,
  provider: modelProviderKindSchema,
  model: modelIdSchema,
  baseUrl: modelBaseUrlSchema,
  apiKey: apiKeySchema,
  toolsEnabled: z.boolean(),
})

export type ModelProfileInputPayload = z.infer<typeof modelProfileInputSchema>

export const testModelProfileInputSchema = z.strictObject({
  profileId: z.string().uuid('档案 ID 不合法').optional(),
  provider: modelProviderKindSchema,
  model: modelIdSchema,
  baseUrl: modelBaseUrlSchema,
  apiKey: apiKeySchema,
})

export type TestModelProfileInputPayload = z.infer<typeof testModelProfileInputSchema>

export const modelProfileIdInputSchema = z.strictObject({
  profileId: z.string().uuid('档案 ID 不合法'),
})

export type ModelProfileIdInputPayload = z.infer<typeof modelProfileIdInputSchema>

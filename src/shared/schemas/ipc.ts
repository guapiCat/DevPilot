import { z } from 'zod'
import { MAX_PING_MESSAGE_LENGTH, MAX_RELATIVE_PATH_LENGTH } from '../constants/app'
import { isSafeRelativePath } from '../utils/path'

export const pingInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(MAX_PING_MESSAGE_LENGTH, `消息不能超过 ${MAX_PING_MESSAGE_LENGTH} 个字符`)
})

export type PingInput = z.infer<typeof pingInputSchema>

export const repositoryIdInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法')
})

export type RepositoryIdInput = z.infer<typeof repositoryIdInputSchema>

export const fileReadInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: z
    .string()
    .trim()
    .min(1, '文件路径不能为空')
    .max(MAX_RELATIVE_PATH_LENGTH, '文件路径过长')
    .refine(isSafeRelativePath, '文件路径不合法')
})

export type FileReadInput = z.infer<typeof fileReadInputSchema>

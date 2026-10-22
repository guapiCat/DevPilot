import { z } from 'zod'
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_FILE_WRITE_BYTES,
  MAX_PING_MESSAGE_LENGTH,
  MAX_RELATIVE_PATH_LENGTH
} from '../constants/app'
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

const relativePathSchema = z
  .string()
  .trim()
  .min(1, '文件路径不能为空')
  .max(MAX_RELATIVE_PATH_LENGTH, '文件路径过长')
  .refine(isSafeRelativePath, '文件路径不合法')

export const fileReadInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: relativePathSchema
})

export type FileReadInput = z.infer<typeof fileReadInputSchema>

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export const fileWriteInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: relativePathSchema,
  content: z.string().max(MAX_FILE_WRITE_BYTES, '文件内容超过 1 MB 写入上限'),
  expectedHash: z.string().regex(SHA256_HEX_PATTERN, '文件哈希不合法')
})

export type FileWriteInput = z.infer<typeof fileWriteInputSchema>

export const gitDiffInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: relativePathSchema
})

export type GitDiffInput = z.infer<typeof gitDiffInputSchema>

const requestIdSchema = z.string().uuid('请求 ID 不合法')
const conversationIdSchema = z.string().uuid('会话 ID 不合法')

export const chatCreateConversationInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法').nullable()
})

export type ChatCreateConversationInput = z.infer<typeof chatCreateConversationInputSchema>

export const chatGetMessagesInputSchema = z.object({
  conversationId: conversationIdSchema
})

export type ChatGetMessagesInput = z.infer<typeof chatGetMessagesInputSchema>

export const chatDeleteConversationInputSchema = z.object({
  conversationId: conversationIdSchema
})

export type ChatDeleteConversationInput = z.infer<typeof chatDeleteConversationInputSchema>

export const chatSendInputSchema = z.object({
  requestId: requestIdSchema,
  conversationId: conversationIdSchema,
  content: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(MAX_CHAT_MESSAGE_LENGTH, `消息不能超过 ${MAX_CHAT_MESSAGE_LENGTH} 个字符`)
})

export type ChatSendInput = z.infer<typeof chatSendInputSchema>

export const chatRetryInputSchema = z.object({
  requestId: requestIdSchema,
  conversationId: conversationIdSchema
})

export type ChatRetryInput = z.infer<typeof chatRetryInputSchema>

export const chatCancelInputSchema = z.object({
  requestId: requestIdSchema
})

export type ChatCancelInput = z.infer<typeof chatCancelInputSchema>

import { z } from 'zod'
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_FILE_WRITE_BYTES,
  MAX_GIT_BRANCH_NAME_LENGTH,
  MAX_GIT_COMMIT_MESSAGE_LENGTH,
  MAX_GIT_LOG_ENTRIES,
  MAX_GIT_PATHSPEC_CHARS,
  MAX_GIT_STAGE_PATHS,
  MAX_PING_MESSAGE_LENGTH,
  MAX_RELATIVE_PATH_LENGTH,
} from '../constants/app'
import { isSafeBranchName, isSafeGitPath } from '../utils/git'
import { isSafeRelativePath } from '../utils/path'

export const pingInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(MAX_PING_MESSAGE_LENGTH, `消息不能超过 ${MAX_PING_MESSAGE_LENGTH} 个字符`),
})

export type PingInput = z.infer<typeof pingInputSchema>

export const repositoryIdInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
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
  relativePath: relativePathSchema,
})

export type FileReadInput = z.infer<typeof fileReadInputSchema>

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/

export const fileWriteInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: relativePathSchema,
  content: z.string().max(MAX_FILE_WRITE_BYTES, '文件内容超过 1 MB 写入上限'),
  expectedHash: z.string().regex(SHA256_HEX_PATTERN, '文件哈希不合法'),
})

export type FileWriteInput = z.infer<typeof fileWriteInputSchema>

export const gitDiffInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  relativePath: relativePathSchema,
})

export type GitDiffInput = z.infer<typeof gitDiffInputSchema>

const gitPathSchema = z
  .string()
  .min(1, '文件路径不能为空')
  .max(MAX_RELATIVE_PATH_LENGTH, '文件路径过长')
  .refine(isSafeGitPath, '文件路径不合法')

export const gitPathsInputSchema = z
  .object({
    repositoryId: z.string().uuid('仓库 ID 不合法'),
    all: z.boolean().optional(),
    paths: z.array(gitPathSchema).min(1, '请至少选择一个文件').max(MAX_GIT_STAGE_PATHS).optional(),
  })
  .superRefine((value, context) => {
    if (value.all === true) {
      if (value.paths) {
        context.addIssue({
          code: 'custom',
          path: ['paths'],
          message: '全部操作不能同时指定文件路径',
        })
      }
      return
    }

    if (!value.paths || value.paths.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['paths'],
        message: '请至少选择一个文件',
      })
      return
    }

    const chars = value.paths.reduce((total, path) => total + path.length, 0)
    if (chars > MAX_GIT_PATHSPEC_CHARS) {
      context.addIssue({
        code: 'custom',
        path: ['paths'],
        message: '文件路径总长度超过上限',
      })
    }
  })

export type GitPathsInput = z.infer<typeof gitPathsInputSchema>

const gitBranchNameSchema = z
  .string()
  .min(1, '分支名不能为空')
  .max(MAX_GIT_BRANCH_NAME_LENGTH, '分支名过长')
  .refine(isSafeBranchName, '分支名不合法')

export const gitCommitInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  message: z
    .string()
    .trim()
    .min(1, '提交信息不能为空')
    .max(MAX_GIT_COMMIT_MESSAGE_LENGTH, `提交信息不能超过 ${MAX_GIT_COMMIT_MESSAGE_LENGTH} 个字符`)
    .refine((message) => !message.includes('\0'), '提交信息不合法'),
})

export type GitCommitInput = z.infer<typeof gitCommitInputSchema>

export const gitCreateBranchInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  branchName: gitBranchNameSchema,
  checkout: z.boolean().optional(),
})

export type GitCreateBranchInput = z.infer<typeof gitCreateBranchInputSchema>

export const gitSwitchBranchInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  branchName: gitBranchNameSchema,
})

export type GitSwitchBranchInput = z.infer<typeof gitSwitchBranchInputSchema>

export const gitLogInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  limit: z.number().int().min(1).max(MAX_GIT_LOG_ENTRIES).optional(),
  skip: z.number().int().min(0).max(1_000_000).optional(),
})

export type GitLogInput = z.infer<typeof gitLogInputSchema>

const COMMIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/

export const gitCommitDetailInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法'),
  sha: z.string().regex(COMMIT_SHA_PATTERN, '提交 SHA 不合法'),
})

export type GitCommitDetailInput = z.infer<typeof gitCommitDetailInputSchema>

const requestIdSchema = z.string().uuid('请求 ID 不合法')
const conversationIdSchema = z.string().uuid('会话 ID 不合法')

export const chatCreateConversationInputSchema = z.object({
  repositoryId: z.string().uuid('仓库 ID 不合法').nullable(),
})

export type ChatCreateConversationInput = z.infer<typeof chatCreateConversationInputSchema>

export const chatGetMessagesInputSchema = z.object({
  conversationId: conversationIdSchema,
})

export type ChatGetMessagesInput = z.infer<typeof chatGetMessagesInputSchema>

export const chatDeleteConversationInputSchema = z.object({
  conversationId: conversationIdSchema,
})

export type ChatDeleteConversationInput = z.infer<typeof chatDeleteConversationInputSchema>

export const chatSendInputSchema = z.object({
  requestId: requestIdSchema,
  conversationId: conversationIdSchema,
  content: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(MAX_CHAT_MESSAGE_LENGTH, `消息不能超过 ${MAX_CHAT_MESSAGE_LENGTH} 个字符`),
})

export type ChatSendInput = z.infer<typeof chatSendInputSchema>

export const chatRetryInputSchema = z.object({
  requestId: requestIdSchema,
  conversationId: conversationIdSchema,
})

export type ChatRetryInput = z.infer<typeof chatRetryInputSchema>

export const chatCancelInputSchema = z.object({
  requestId: requestIdSchema,
})

export type ChatCancelInput = z.infer<typeof chatCancelInputSchema>

export const editListPendingInputSchema = z.object({
  conversationId: conversationIdSchema,
})

export type EditListPendingInput = z.infer<typeof editListPendingInputSchema>

const editSessionIdSchema = z.string().uuid('编辑会话 ID 不合法')
const fileEditIdSchema = z.string().uuid('文件编辑 ID 不合法')

export const editFileInputSchema = z.object({
  editSessionId: editSessionIdSchema,
  fileEditId: fileEditIdSchema,
})

export type EditFileInput = z.infer<typeof editFileInputSchema>

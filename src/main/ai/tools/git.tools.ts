import { z } from 'zod'
import { MAX_RELATIVE_PATH_LENGTH, MAX_TOOL_OUTPUT_CHARS } from '@shared/constants/app'
import type { GitDiffResult, GitStatus } from '@shared/types/git'
import { gitService } from '@main/services/git.service'
import { toToolError } from './errors'
import { capText, toPosixRelative } from './output'
import { containsHighRiskSecret, isSensitivePath } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

interface GitProvider {
  getStatus(repositoryId: string): Promise<GitStatus>
  getDiff(repositoryId: string, relativePath: string): Promise<GitDiffResult>
}

const statusSchema = z.strictObject({})

const diffSchema = z.strictObject({
  path: z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH),
})

function formatChangePath(status: GitStatus['changes'][number]): string {
  return status.oldRelativePath ? `${status.oldRelativePath} -> ${status.relativePath}` : status.relativePath
}

export function createGitStatusTool(git: GitProvider = gitService): ToolDefinition<typeof statusSchema> {
  return {
    name: 'get_git_status',
    description: '查看当前仓库的 Git 分支与工作区变更列表（文件路径与状态码），不返回文件内容。',
    schema: statusSchema,
    summarizeArgs: () => '查看 Git 工作区状态',
    async execute(_args, context) {
      let status: GitStatus
      try {
        status = await git.getStatus(context.repositoryId)
      } catch (error) {
        throw toToolError(error)
      }

      const lines = [
        '# Git 状态',
        `分支: ${status.branch ?? '(分离 HEAD 或未命名分支)'}`,
        `变更: ${status.changes.length} 项${status.truncated ? '（已截断）' : ''}`,
      ]

      if (status.changes.length === 0) {
        lines.push('(工作区干净，没有未提交的变更)')
      } else {
        for (const change of status.changes) {
          lines.push(`${change.indexCode}${change.worktreeCode} ${formatChangePath(change)}`)
        }
      }

      const capped = capText(lines.join('\n'), MAX_TOOL_OUTPUT_CHARS)
      return {
        content: capped.text,
        summary: `分支 ${status.branch ?? '(未知)'}，${status.changes.length} 项变更`,
        truncated: capped.truncated || status.truncated,
      }
    },
  }
}

export function createGitDiffTool(git: GitProvider = gitService): ToolDefinition<typeof diffSchema> {
  return {
    name: 'get_git_diff',
    description: '查看当前仓库中某个文件相对 HEAD 的未提交差异（含未跟踪文件全文）。敏感文件会被拒绝。',
    schema: diffSchema,
    summarizeArgs: (args) => toPosixRelative(args.path),
    async execute(args, context) {
      const relativePath = toPosixRelative(args.path)

      if (isSensitivePath(relativePath)) {
        throw new ToolExecutionError('SENSITIVE_FILE', '该文件被识别为敏感文件，拒绝展示差异')
      }

      let result: GitDiffResult
      try {
        result = await git.getDiff(context.repositoryId, relativePath)
      } catch (error) {
        throw toToolError(error)
      }

      if (containsHighRiskSecret(result.diff)) {
        throw new ToolExecutionError('SENSITIVE_FILE', '差异内容疑似包含密钥，已阻断')
      }

      const header = `# Git Diff: ${relativePath}`
      const body = result.diff.trim() ? result.diff : '该文件当前没有未提交的差异（可能已提交或没有变更）。'
      const note = result.truncated ? '\n[差异过大，已按 512 KB 截断]' : ''
      const capped = capText(`${header}\n${body}${note}`, MAX_TOOL_OUTPUT_CHARS)

      return {
        content: capped.text,
        summary: body.startsWith('该文件') ? '无未提交差异' : `${relativePath} 的未提交差异`,
        truncated: capped.truncated || result.truncated,
      }
    },
  }
}

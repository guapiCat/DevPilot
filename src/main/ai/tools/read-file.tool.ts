import { z } from 'zod'
import { MAX_RELATIVE_PATH_LENGTH, MAX_TOOL_OUTPUT_CHARS, MAX_TOOL_READ_LINES } from '@shared/constants/app'
import type { FileContent } from '@shared/types/repository'
import { fileService } from '@main/services/file.service'
import { toToolError } from './errors'
import { capText } from './output'
import { normalizeToolPath } from './path-args'
import { containsHighRiskSecret, isSensitivePath } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

interface FileReader {
  read(repositoryId: string, relativePath: string): Promise<FileContent>
}

const schema = z.strictObject({
  path: z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH),
  startLine: z.number().int().min(1).optional(),
  endLine: z.number().int().min(1).optional(),
})

function splitLines(content: string): string[] {
  const lines = content.split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line))
}

export function createReadFileTool(files: FileReader = fileService): ToolDefinition<typeof schema> {
  return {
    name: 'read_file',
    description:
      '读取当前仓库中一个 UTF-8 文本文件的内容，返回带行号的代码。path 为仓库内的 POSIX 相对路径，不要传绝对路径。可用 startLine/endLine 指定行区间（单次最多 ' +
      `${MAX_TOOL_READ_LINES} 行）。.env、私钥、证书、凭证等敏感文件会被拒绝。`,
    schema,
    summarizeArgs: (args) => {
      const path = normalizeToolPath(args.path) ?? args.path
      if (args.startLine === undefined && args.endLine === undefined) {
        return path
      }
      return `${path}（第 ${args.startLine ?? 1}-${args.endLine ?? '末'} 行）`
    },
    async execute(args, context) {
      const relativePath = normalizeToolPath(args.path)
      if (!relativePath) {
        throw new ToolExecutionError('INVALID_ARGUMENTS', '请提供仓库内的相对文件路径，根目录不能作为文件读取')
      }

      if (isSensitivePath(relativePath)) {
        throw new ToolExecutionError('SENSITIVE_FILE', '该文件被识别为敏感文件，禁止读取')
      }

      const startLine = args.startLine ?? 1
      if (args.endLine !== undefined && args.endLine < startLine) {
        throw new ToolExecutionError('INVALID_ARGUMENTS', 'endLine 不能小于 startLine')
      }

      let file: FileContent
      try {
        file = await files.read(context.repositoryId, relativePath)
      } catch (error) {
        throw toToolError(error)
      }

      if (containsHighRiskSecret(file.content)) {
        throw new ToolExecutionError('SENSITIVE_FILE', '文件内容疑似包含密钥，已阻断')
      }

      const lines = splitLines(file.content)
      const total = lines.length

      if (total === 0) {
        return {
          content: `# 文件: ${relativePath}（共 0 行）\n(文件为空)`,
          summary: `${relativePath} 共 0 行`,
          truncated: false,
        }
      }

      const effectiveStart = Math.min(startLine, total)
      const requestedEnd = Math.min(args.endLine ?? total, total)
      const effectiveEnd = Math.min(requestedEnd, effectiveStart + MAX_TOOL_READ_LINES - 1)
      const body = lines
        .slice(effectiveStart - 1, effectiveEnd)
        .map((line, index) => `${effectiveStart + index}: ${line}`)
        .join('\n')

      const rangeTruncated = effectiveEnd < requestedEnd
      const header = [
        `# 文件: ${relativePath}（共 ${total} 行）`,
        `# 行范围: ${effectiveStart}-${effectiveEnd}${
          rangeTruncated ? `（已截断，单次最多 ${MAX_TOOL_READ_LINES} 行）` : ''
        }`,
      ].join('\n')
      const capped = capText(`${header}\n${body}`, MAX_TOOL_OUTPUT_CHARS)

      return {
        content: capped.text,
        summary: `${relativePath} 第 ${effectiveStart}-${effectiveEnd} 行 / 共 ${total} 行`,
        truncated: capped.truncated || rangeTruncated,
      }
    },
  }
}

import { z } from 'zod'
import {
  MAX_EDIT_CREATE_CONTENT_CHARS,
  MAX_EDIT_NEW_TEXT_CHARS,
  MAX_EDIT_OLD_TEXT_CHARS,
  MAX_RELATIVE_PATH_LENGTH,
} from '@shared/constants/app'
import { toToolError } from './errors'
import { normalizeToolPath } from './path-args'
import { isSensitivePath } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

const schema = z.strictObject({
  path: z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH),
  operation: z.enum(['modify', 'create']),
  oldText: z.string().max(MAX_EDIT_OLD_TEXT_CHARS).optional(),
  newText: z.string().max(MAX_EDIT_NEW_TEXT_CHARS).optional(),
  content: z.string().max(MAX_EDIT_CREATE_CONTENT_CHARS).optional(),
})

export function createProposeEditTool(): ToolDefinition<typeof schema> {
  return {
    name: 'propose_file_edit',
    description:
      '为当前仓库生成一个待用户审核的文件修改建议，不会立即写入磁盘。' +
      '修改已有文件时 operation=modify，并提供 oldText（必须在文件中只出现一次）与 newText；' +
      '新建文件时 operation=create，并提供完整 content。' +
      `每次调用只处理一个文件，oldText 不超过 ${MAX_EDIT_OLD_TEXT_CHARS} 字符，newText/content 不超过 ${MAX_EDIT_NEW_TEXT_CHARS} 字符。` +
      '修改前必须先读取文件确认内容；建议提交后需要用户在工作区 Diff 面板确认。',
    schema,
    summarizeArgs: (args) => {
      const path = normalizeToolPath(args.path) ?? args.path
      return `${args.operation === 'modify' ? '修改' : '新建'} ${path}`
    },
    async execute(args, context) {
      const relativePath = normalizeToolPath(args.path)
      if (!relativePath) {
        throw new ToolExecutionError('INVALID_ARGUMENTS', '请提供仓库内的相对文件路径')
      }

      if (isSensitivePath(relativePath)) {
        throw new ToolExecutionError('SENSITIVE_FILE', '该文件被识别为敏感文件，禁止修改')
      }

      if (args.operation === 'modify') {
        if (!args.oldText) {
          throw new ToolExecutionError('INVALID_ARGUMENTS', '修改文件需要提供 oldText')
        }
        if (args.newText === undefined) {
          throw new ToolExecutionError('INVALID_ARGUMENTS', '修改文件需要提供 newText')
        }
        if (args.content !== undefined) {
          throw new ToolExecutionError(
            'INVALID_ARGUMENTS',
            'operation=modify 时不要提供 content，请使用 oldText/newText',
          )
        }
      } else {
        if (args.content === undefined) {
          throw new ToolExecutionError('INVALID_ARGUMENTS', '新建文件需要提供 content')
        }
        if (args.oldText !== undefined || args.newText !== undefined) {
          throw new ToolExecutionError(
            'INVALID_ARGUMENTS',
            'operation=create 时不要提供 oldText/newText，请使用 content',
          )
        }
      }

      const { conversationId, runId, editService, onEditProposed } = context
      if (!conversationId || !runId || !editService) {
        throw new ToolExecutionError('TOOL_FAILED', '当前会话不支持修改建议')
      }
      if (context.signal.aborted) {
        throw new ToolExecutionError('TOOL_FAILED', '请求已停止')
      }

      let result
      try {
        result = await editService.propose({
          repositoryId: context.repositoryId,
          conversationId,
          runId,
          relativePath,
          operation: args.operation,
          oldText: args.oldText,
          newText: args.newText,
          content: args.content,
        })
      } catch (error) {
        throw toToolError(error)
      }

      onEditProposed?.({
        editSessionId: result.editSessionId,
        fileEditId: result.fileEditId,
        relativePath,
        operation: args.operation,
      })

      const operationLabel = args.operation === 'modify' ? '修改现有文件' : '新建文件'
      return {
        content: [
          '# 修改建议已提交审核',
          `文件: ${relativePath}`,
          `操作: ${operationLabel}`,
          '状态: 等待用户确认（尚未写入磁盘）',
          '用户会在左侧“变更与 Diff”面板查看差异并逐项应用或拒绝。',
          '重要：不要声称文件已修改、保存或生效；只有用户确认后才会写入。',
        ].join('\n'),
        summary: `${relativePath} 修改建议待审核`,
        truncated: false,
      }
    },
  }
}

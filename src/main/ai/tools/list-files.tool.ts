import type { Dirent } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { z } from 'zod'
import {
  IGNORED_DIRECTORY_NAMES,
  MAX_RELATIVE_PATH_LENGTH,
  MAX_TOOL_LIST_DEPTH,
  MAX_TOOL_LIST_ENTRIES,
  MAX_TOOL_OUTPUT_CHARS,
} from '@shared/constants/app'
import { isSafeRelativePath } from '@shared/utils/path'
import { repositoryService } from '@main/services/repository.service'
import { isPathInside } from '@main/utils/path-security'
import { toToolError } from './errors'
import { capText } from './output'
import { normalizeToolPath } from './path-args'
import { isSensitivePath } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

interface RootProvider {
  getRealRoot(repositoryId: string): string
}

const SKIPPED_DIRECTORIES = new Set<string>([
  ...IGNORED_DIRECTORY_NAMES,
  'dist',
  'out',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  'target',
  '__pycache__',
])

const schema = z.strictObject({
  path: z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH).optional(),
  depth: z.number().int().min(1).max(MAX_TOOL_LIST_DEPTH).optional(),
})

async function resolveDirectory(root: string, relativePath: string | undefined): Promise<string> {
  if (relativePath !== undefined && !isSafeRelativePath(relativePath)) {
    throw new ToolExecutionError('PATH_NOT_ALLOWED', '目录路径必须是仓库内的相对路径；查看根目录请省略 path 参数')
  }

  const candidate = relativePath ? resolve(root, ...relativePath.split(/[\\/]+/)) : root
  let target: string
  try {
    target = await realpath(candidate)
  } catch {
    throw new ToolExecutionError('FILE_NOT_FOUND', '目录不存在或不可访问')
  }

  if (!isPathInside(root, target)) {
    throw new ToolExecutionError('PATH_NOT_ALLOWED', '目录路径不在授权仓库范围内')
  }

  const info = await stat(target)
  if (!info.isDirectory()) {
    throw new ToolExecutionError('UNSUPPORTED_FILE', '目标不是目录')
  }

  return target
}

interface WalkState {
  lines: string[]
  count: number
  truncated: boolean
}

async function walk(
  directory: string,
  relativeDirectory: string,
  level: number,
  maxDepth: number,
  state: WalkState,
  signal: AbortSignal,
): Promise<void> {
  if (level > maxDepth) return

  let entries: Dirent[]
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return
  }

  entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1
    }
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })

  for (const dirent of entries) {
    if (signal.aborted) {
      throw new ToolExecutionError('TOOL_FAILED', '工具执行已取消')
    }

    if (state.count >= MAX_TOOL_LIST_ENTRIES) {
      state.truncated = true
      return
    }

    // 跳过符号链接，避免暴露仓库外部目标。
    if (dirent.isSymbolicLink()) continue

    const relativePath = relativeDirectory ? `${relativeDirectory}/${dirent.name}` : dirent.name

    if (isSensitivePath(relativePath)) continue

    const isDirectory = dirent.isDirectory()
    if (isDirectory && SKIPPED_DIRECTORIES.has(dirent.name)) continue

    state.count += 1
    state.lines.push(`${'  '.repeat(level - 1)}${dirent.name}${isDirectory ? '/' : ''}`)

    if (isDirectory && level < maxDepth) {
      await walk(resolve(directory, dirent.name), relativePath, level + 1, maxDepth, state, signal)
    }
  }
}

export function createListFilesTool(repositories: RootProvider = repositoryService): ToolDefinition<typeof schema> {
  return {
    name: 'list_files',
    description:
      '列出当前仓库中的文件和目录（相对路径）。path 指定起始目录（默认为仓库根目录，使用 POSIX 相对路径，不要传绝对路径），depth 指定最大深度（1-3，默认 2）。会自动忽略 .git、node_modules、构建产物和敏感文件。',
    schema,
    summarizeArgs: (args) => {
      const path = normalizeToolPath(args.path)
      return path ? `列出 ${path}（深度 ${args.depth ?? 2}）` : `列出仓库根目录（深度 ${args.depth ?? 2}）`
    },
    async execute(args, context) {
      const root = repositories.getRealRoot(context.repositoryId)
      const requestedPath = normalizeToolPath(args.path)
      const directory = await resolveDirectory(root, requestedPath)
      const depth = args.depth ?? 2
      const state: WalkState = { lines: [], count: 0, truncated: false }

      try {
        await walk(directory, '', 1, depth, state, context.signal)
      } catch (error) {
        throw toToolError(error)
      }

      const target = requestedPath ?? '.'
      const header = `# 目录: ${target}（深度 ${depth}）`
      const body = state.lines.length > 0 ? state.lines.join('\n') : '(目录为空)'
      const capped = capText(`${header}\n${body}`, MAX_TOOL_OUTPUT_CHARS)

      return {
        content: capped.text,
        summary: `列出 ${state.count} 项${state.truncated ? '（已截断）' : ''}`,
        truncated: capped.truncated || state.truncated,
      }
    },
  }
}

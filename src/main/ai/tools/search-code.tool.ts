import { spawn } from 'node:child_process'
import { z } from 'zod'
import {
  MAX_RELATIVE_PATH_LENGTH,
  MAX_SEARCH_FILES,
  MAX_SEARCH_MATCHES,
  MAX_SEARCH_MATCHES_PER_FILE,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_RAW_BYTES,
  MAX_SEARCH_SNIPPET_CHARS,
  MAX_TOOL_OUTPUT_CHARS,
  RG_COMMAND_TIMEOUT_MS
} from '@shared/constants/app'
import { isSafeRelativePath } from '@shared/utils/path'
import { repositoryService } from '@main/services/repository.service'
import { toToolError } from './errors'
import { capText, clampText, toPosixRelative } from './output'
import { normalizeToolPath } from './path-args'
import { isSensitivePath, redactSecretSnippet } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

interface RootProvider {
  getRealRoot(repositoryId: string): string
}

export type SearchMode = 'literal' | 'regex'

export interface SearchMatch {
  path: string
  line: number
  text: string
}

export interface ParsedSearchResult {
  matches: SearchMatch[]
  fileCount: number
  truncated: boolean
}

const schema = z.strictObject({
  query: z.string().min(1).max(MAX_SEARCH_QUERY_LENGTH),
  path: z.string().min(1).max(MAX_RELATIVE_PATH_LENGTH).optional(),
  mode: z.enum(['literal', 'regex']).optional()
})

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readTextField(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  return typeof value.text === 'string' ? value.text : undefined
}

export function buildSearchArgs(query: string, scope: string, mode: SearchMode): string[] {
  return [
    '--no-config',
    '--json',
    '--color=never',
    '--max-columns',
    '500',
    '--max-filesize',
    '1M',
    '--max-count',
    String(MAX_SEARCH_MATCHES_PER_FILE),
    ...(mode === 'literal' ? ['-F'] : []),
    '-e',
    query,
    '--glob',
    '!**/.git/**',
    '--glob',
    '!**/node_modules/**',
    '--glob',
    '!**/dist/**',
    '--glob',
    '!**/out/**',
    '--glob',
    '!**/build/**',
    '--',
    scope
  ]
}

export function parseRgJson(stdout: string): ParsedSearchResult {
  const matches: SearchMatch[] = []
  const perFile = new Map<string, number>()
  let truncated = false

  for (const rawLine of stdout.split('\n')) {
    if (!rawLine) continue

    let event: unknown
    try {
      event = JSON.parse(rawLine)
    } catch {
      continue
    }
    if (!isObject(event) || event.type !== 'match' || !isObject(event.data)) continue

    const data = event.data
    const rawPath = readTextField(data.path)
    const lineText = readTextField(data.lines)
    if (!rawPath || lineText === undefined) continue

    const relativePath = toPosixRelative(rawPath)
    if (isSensitivePath(relativePath)) continue

    if (matches.length >= MAX_SEARCH_MATCHES) {
      truncated = true
      break
    }

    const current = perFile.get(relativePath) ?? 0
    if (current === 0 && perFile.size >= MAX_SEARCH_FILES) {
      truncated = true
      continue
    }
    if (current >= MAX_SEARCH_MATCHES_PER_FILE) {
      truncated = true
      continue
    }

    const snippet = redactSecretSnippet(
      clampText(lineText.replace(/\r?\n$/, ''), MAX_SEARCH_SNIPPET_CHARS)
    )
    perFile.set(relativePath, current + 1)
    matches.push({
      path: relativePath,
      line: typeof data.line_number === 'number' ? data.line_number : 0,
      text: snippet
    })
  }

  return { matches, fileCount: perFile.size, truncated }
}

function runSearch(
  cwd: string,
  args: string[],
  signal: AbortSignal
): Promise<{ stdout: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn('rg', args, { cwd, shell: false, windowsHide: true })
    const stdoutChunks: Buffer[] = []
    let stdoutSize = 0
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, RG_COMMAND_TIMEOUT_MS)

    function settle(action: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      action()
    }

    function onAbort(): void {
      child.kill()
      settle(() => reject(new ToolExecutionError('SEARCH_FAILED', '搜索已取消')))
    }

    child.stdin.end()
    signal.addEventListener('abort', onAbort, { once: true })

    if (signal.aborted) {
      child.kill()
      settle(() => reject(new ToolExecutionError('SEARCH_FAILED', '搜索已取消')))
      return
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length
      if (stdoutSize > MAX_SEARCH_RAW_BYTES) {
        child.kill()
        settle(() => reject(new ToolExecutionError('SEARCH_FAILED', '搜索结果超过上限，已中止')))
        return
      }
      stdoutChunks.push(chunk)
    })
    // 必须消费 stderr，避免子进程因管道阻塞。
    child.stderr.on('data', () => undefined)

    child.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        settle(() =>
          reject(
            new ToolExecutionError(
              'RG_NOT_AVAILABLE',
              '未检测到 ripgrep（rg），请安装并确保 rg 在 PATH 中'
            )
          )
        )
        return
      }
      settle(() => reject(new ToolExecutionError('SEARCH_FAILED', '搜索命令执行失败')))
    })

    child.on('close', (code) => {
      if (settled) return
      if (timedOut) {
        settle(() => reject(new ToolExecutionError('SEARCH_FAILED', '搜索超时，请缩小搜索范围')))
        return
      }
      settle(() =>
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          exitCode: code ?? -1
        })
      )
    })
  })
}

export function createSearchCodeTool(
  repositories: RootProvider = repositoryService
): ToolDefinition<typeof schema> {
  return {
    name: 'search_code',
    description:
      '使用 ripgrep 在当前仓库中搜索文本或正则表达式，返回文件名、行号和匹配片段。path 限定搜索目录（默认为整个仓库，使用 POSIX 相对路径，不要传绝对路径），mode 为 literal（默认）或 regex。结果有数量上限，可能被截断。',
    schema,
    summarizeArgs: (args) => {
      const path = normalizeToolPath(args.path)
      const scope = path ? ` @ ${path}` : ''
      const mode = args.mode === 'regex' ? '（正则）' : ''
      return `"${clampText(args.query, 60)}"${mode}${scope}`
    },
    async execute(args, context) {
      if (context.signal.aborted) {
        throw new ToolExecutionError('SEARCH_FAILED', '搜索已取消')
      }

      const requestedPath = normalizeToolPath(args.path)
      if (requestedPath !== undefined) {
        if (!isSafeRelativePath(requestedPath)) {
          throw new ToolExecutionError(
            'PATH_NOT_ALLOWED',
            '搜索路径必须是仓库内的相对路径；搜索整个仓库请省略 path 参数'
          )
        }
        if (isSensitivePath(requestedPath)) {
          throw new ToolExecutionError('SENSITIVE_FILE', '该路径被识别为敏感目录，禁止搜索')
        }
      }

      const root = repositories.getRealRoot(context.repositoryId)
      const scope = requestedPath ?? '.'
      const mode = args.mode ?? 'literal'

      let result: { stdout: string; exitCode: number }
      try {
        result = await runSearch(root, buildSearchArgs(args.query, scope, mode), context.signal)
      } catch (error) {
        throw toToolError(error)
      }

      if (result.exitCode === 1) {
        return {
          content: `# 搜索: "${args.query}"\n未找到匹配内容。`,
          summary: '未找到匹配',
          truncated: false
        }
      }

      if (result.exitCode !== 0) {
        throw new ToolExecutionError('SEARCH_FAILED', '搜索失败，请确认搜索路径是否存在')
      }

      const parsed = parseRgJson(result.stdout)
      const modeLabel = mode === 'regex' ? '正则' : '字面量'
      const header = [
        `# 搜索: "${args.query}"（${modeLabel}）`,
        `匹配 ${parsed.matches.length} 条，涉及 ${parsed.fileCount} 个文件${
          parsed.truncated ? '（结果已截断）' : ''
        }`
      ].join('\n')
      const body =
        parsed.matches.length > 0
          ? parsed.matches.map((match) => `${match.path}:${match.line}: ${match.text}`).join('\n')
          : '未找到匹配内容。'
      const capped = capText(`${header}\n${body}`, MAX_TOOL_OUTPUT_CHARS)

      return {
        content: capped.text,
        summary: `${parsed.matches.length} 条匹配 / ${parsed.fileCount} 个文件`,
        truncated: capped.truncated || parsed.truncated
      }
    }
  }
}

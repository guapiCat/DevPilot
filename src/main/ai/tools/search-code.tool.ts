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
  RG_COMMAND_TIMEOUT_MS,
} from '@shared/constants/app'
import { isSafeRelativePath } from '@shared/utils/path'
import { repositoryService } from '@main/services/repository.service'
import { toToolError } from './errors'
import { capText, clampText, toPosixRelative } from './output'
import { normalizeToolPath } from './path-args'
import { resolveRgCommand } from './rg-path'
import { isSensitivePath, redactSecretSnippet } from './sensitive'
import { ToolExecutionError, type ToolDefinition } from './tool-registry'

interface RootProvider {
  getRealRoot(repositoryId: string): string
}

export type SearchMode = 'literal' | 'regex'
export type SearchCase = 'smart' | 'sensitive' | 'insensitive'

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
  mode: z.enum(['literal', 'regex']).optional(),
  // smart：查询全小写时忽略大小写，含大写时区分大小写（rg 默认行为更贴近 IDE 搜索）。
  case: z.enum(['smart', 'sensitive', 'insensitive']).optional(),
})

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readTextField(value: unknown): string | undefined {
  if (!isObject(value)) return undefined
  return typeof value.text === 'string' ? value.text : undefined
}

// 锁文件、压缩产物与生成目录在真实仓库中容易产生上万条匹配，
// 会把 ripgrep 的原始 JSON 输出迅速推到上限，默认排除。
const IGNORED_GLOBS: readonly string[] = [
  '!**/.git/**',
  '!**/node_modules/**',
  '!**/dist/**',
  '!**/out/**',
  '!**/build/**',
  '!**/coverage/**',
  '!**/vendor/**',
  '!**/target/**',
  '!**/Pods/**',
  '!**/__pycache__/**',
  '!**/venv/**',
  '!**/package-lock.json',
  '!**/npm-shrinkwrap.json',
  '!**/pnpm-lock.yaml',
  '!**/yarn.lock',
  '!**/bun.lockb',
  '!**/bun.lock',
  '!**/Cargo.lock',
  '!**/poetry.lock',
  '!**/Pipfile.lock',
  '!**/composer.lock',
  '!**/Gemfile.lock',
  '!**/go.sum',
  '!**/*.min.js',
  '!**/*.min.css',
  '!**/*.map',
]

export function buildSearchArgs(
  query: string,
  scope: string,
  mode: SearchMode,
  caseMode: SearchCase = 'smart',
): string[] {
  const caseFlag = caseMode === 'insensitive' ? '-i' : caseMode === 'sensitive' ? '-s' : '-S'

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
    caseFlag,
    ...(mode === 'literal' ? ['-F'] : []),
    '-e',
    query,
    ...IGNORED_GLOBS.flatMap((glob) => ['--glob', glob]),
    '--',
    scope,
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

    const snippet = redactSecretSnippet(clampText(lineText.replace(/\r?\n$/, ''), MAX_SEARCH_SNIPPET_CHARS))
    perFile.set(relativePath, current + 1)
    matches.push({
      path: relativePath,
      line: typeof data.line_number === 'number' ? data.line_number : 0,
      text: snippet,
    })
  }

  return { matches, fileCount: perFile.size, truncated }
}

function runSearch(
  cwd: string,
  args: string[],
  signal: AbortSignal,
  maxRawBytes: number,
): Promise<{ stdout: string; exitCode: number; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn(resolveRgCommand(), args, { cwd, shell: false, windowsHide: true })
    const stdoutChunks: Buffer[] = []
    let stdoutSize = 0
    let settled = false
    let timedOut = false
    // 超限后等待 close 再返回，避免调用方在子进程仍持有目录句柄时清理工作区。
    let truncatedByLimit = false

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
      if (settled || truncatedByLimit) return
      // 原始输出超限时保留已收到的部分，交给解析层裁剪成截断结果；
      // 末尾不完整的 JSON 行由 parseRgJson 跳过，不再让整次搜索失败。
      // 终止子进程后由 close 事件返回，确保进程已退出。
      if (stdoutSize + chunk.length > maxRawBytes) {
        truncatedByLimit = true
        child.kill()
        return
      }
      stdoutSize += chunk.length
      stdoutChunks.push(chunk)
    })
    // 必须消费 stderr，避免子进程因管道阻塞。
    child.stderr.on('data', () => undefined)

    child.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        settle(() =>
          reject(new ToolExecutionError('RG_NOT_AVAILABLE', '未检测到 ripgrep（rg），请安装并确保 rg 在 PATH 中')),
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
          exitCode: truncatedByLimit ? 0 : (code ?? -1),
          truncated: truncatedByLimit,
        }),
      )
    })
  })
}

export function createSearchCodeTool(
  repositories: RootProvider = repositoryService,
  options: { maxRawBytes?: number } = {},
): ToolDefinition<typeof schema> {
  const maxRawBytes = options.maxRawBytes ?? MAX_SEARCH_RAW_BYTES

  return {
    name: 'search_code',
    description:
      '使用内置 ripgrep 在当前仓库中搜索文本或正则表达式，返回按文件分组的文件名、行号和匹配片段。path 限定搜索目录（默认为整个仓库，使用 POSIX 相对路径，不要传绝对路径），mode 为 literal（默认）或 regex，case 默认 smart（查询全小写时忽略大小写，含大写时区分大小写）。结果有数量上限，可能被截断。',
    schema,
    summarizeArgs: (args) => {
      const path = normalizeToolPath(args.path)
      const scope = path ? ` @ ${path}` : ''
      const mode = args.mode === 'regex' ? '（正则）' : ''
      const caseLabel =
        args.case === 'insensitive' ? '（忽略大小写）' : args.case === 'sensitive' ? '（区分大小写）' : ''
      return `"${clampText(args.query, 60)}"${mode}${caseLabel}${scope}`
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
            '搜索路径必须是仓库内的相对路径；搜索整个仓库请省略 path 参数',
          )
        }
        if (isSensitivePath(requestedPath)) {
          throw new ToolExecutionError('SENSITIVE_FILE', '该路径被识别为敏感目录，禁止搜索')
        }
      }

      const root = repositories.getRealRoot(context.repositoryId)
      const scope = requestedPath ?? '.'
      const mode = args.mode ?? 'literal'
      const caseMode = args.case ?? 'smart'

      let result: { stdout: string; exitCode: number; truncated: boolean }
      try {
        result = await runSearch(root, buildSearchArgs(args.query, scope, mode, caseMode), context.signal, maxRawBytes)
      } catch (error) {
        throw toToolError(error)
      }

      if (result.exitCode === 1) {
        return {
          content: `# 搜索: "${args.query}"\n未找到匹配内容。`,
          summary: '未找到匹配',
          truncated: false,
        }
      }

      if (result.exitCode !== 0) {
        throw new ToolExecutionError('SEARCH_FAILED', '搜索失败，请确认搜索路径是否存在')
      }

      const parsed = parseRgJson(result.stdout)
      const truncated = parsed.truncated || result.truncated
      const modeLabel = mode === 'regex' ? '正则' : '字面量'
      const caseLabel =
        caseMode === 'insensitive' ? '忽略大小写' : caseMode === 'sensitive' ? '区分大小写' : '智能大小写'
      const header = [
        `# 搜索: "${args.query}"（${modeLabel}，${caseLabel}）`,
        `匹配 ${parsed.matches.length} 条，涉及 ${parsed.fileCount} 个文件${
          truncated ? '（结果已截断，仅包含部分匹配；请用 path 缩小范围或使用更精确的查询）' : ''
        }`,
      ].join('\n')
      const grouped = new Map<string, SearchMatch[]>()
      for (const match of parsed.matches) {
        const list = grouped.get(match.path)
        if (list) list.push(match)
        else grouped.set(match.path, [match])
      }
      const body =
        parsed.matches.length > 0
          ? [...grouped.entries()]
              .map(([path, matches]) =>
                [`## ${path}`, ...matches.map((match) => `${match.line}: ${match.text}`)].join('\n'),
              )
              .join('\n\n')
          : truncated
            ? '搜索输出过大，未能解析出完整匹配结果。请限定 path 或使用更精确的查询。'
            : '未找到匹配内容。'
      const capped = capText(`${header}\n${body}`, MAX_TOOL_OUTPUT_CHARS)

      return {
        content: capped.text,
        summary: `${parsed.matches.length} 条匹配 / ${parsed.fileCount} 个文件${truncated ? '（已截断）' : ''}`,
        truncated: capped.truncated || truncated,
      }
    },
  }
}

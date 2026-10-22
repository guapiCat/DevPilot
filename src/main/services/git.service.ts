import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import {
  GIT_COMMAND_TIMEOUT_MS,
  MAX_GIT_DIFF_BYTES,
  MAX_GIT_OUTPUT_BYTES,
  MAX_GIT_STATUS_ENTRIES
} from '@shared/constants/app'
import type { GitDiffResult, GitFileChange, GitFileStatus, GitStatus } from '@shared/types/git'
import { isSafeRelativePath } from '@shared/utils/path'
import { ServiceError } from '../utils/service-error'
import { fileService } from './file.service'
import type { FileService } from './file.service'
import { repositoryService } from './repository.service'
import type { RepositoryService } from './repository.service'

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])

interface GitRunOptions {
  acceptedExitCodes?: number[]
}

interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

function runGit(
  cwd: string,
  args: string[],
  options: GitRunOptions = {}
): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      shell: false
    })

    const acceptedExitCodes = options.acceptedExitCodes ?? [0]
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutSize = 0
    let stderrSize = 0
    let settled = false
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, GIT_COMMAND_TIMEOUT_MS)

    function settle(action: () => void): void {
      if (settled) return
      settled = true
      clearTimeout(timer)
      action()
    }

    child.stdin.end()

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutSize += chunk.length
      if (stdoutSize > MAX_GIT_OUTPUT_BYTES) {
        child.kill()
        settle(() => reject(new ServiceError('GIT_OUTPUT_TOO_LARGE', 'Git 输出超过上限，无法展示')))
        return
      }
      stdoutChunks.push(chunk)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrSize >= 64 * 1024) return
      stderrSize += chunk.length
      stderrChunks.push(chunk)
    })

    child.on('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        settle(() =>
          reject(
            new ServiceError('GIT_NOT_AVAILABLE', '未检测到 Git，请先安装并确保 git 在 PATH 中')
          )
        )
        return
      }
      settle(() => reject(new ServiceError('GIT_COMMAND_FAILED', 'Git 操作失败，请稍后重试')))
    })

    child.on('close', (code) => {
      if (settled) return

      if (timedOut) {
        settle(() => reject(new ServiceError('GIT_TIMEOUT', 'Git 操作超时，请稍后重试')))
        return
      }

      const exitCode = code ?? -1
      const stdout = Buffer.concat(stdoutChunks).toString('utf8')
      const stderr = Buffer.concat(stderrChunks).toString('utf8')

      if (exitCode !== 0 && !acceptedExitCodes.includes(exitCode)) {
        console.error(`[git] 命令失败，退出码 ${exitCode}`)
        if (/not a git repository/i.test(stderr)) {
          settle(() =>
            reject(new ServiceError('NOT_A_GIT_REPOSITORY', '当前目录不是可用的 Git 仓库'))
          )
          return
        }
        settle(() =>
          reject(new ServiceError('GIT_COMMAND_FAILED', 'Git 操作失败，请确认仓库状态后重试'))
        )
        return
      }

      settle(() => resolve({ stdout, stderr, exitCode }))
    })
  })
}

function toGitFileStatus(indexCode: string, worktreeCode: string): GitFileStatus {
  const pair = `${indexCode}${worktreeCode}`

  if (indexCode === '?' && worktreeCode === '?') return 'untracked'
  if (CONFLICT_PAIRS.has(pair)) return 'conflicted'
  if (pair.includes('R') || pair.includes('C')) return 'renamed'
  if (pair.includes('A')) return 'added'
  if (pair.includes('D')) return 'deleted'
  if (pair.includes('M') || pair.includes('T')) return 'modified'
  return 'unknown'
}

function parseStatus(stdout: string): { changes: GitFileChange[]; truncated: boolean } {
  const tokens = stdout.split('\0')
  const changes: GitFileChange[] = []
  let truncated = false

  for (let index = 0; index < tokens.length; index += 1) {
    const entry = tokens[index]
    if (!entry || entry.length < 4) continue

    if (changes.length >= MAX_GIT_STATUS_ENTRIES) {
      truncated = true
      break
    }

    const indexCode = entry[0]
    const worktreeCode = entry[1]
    let oldRelativePath: string | undefined

    if (indexCode === 'R' || indexCode === 'C' || worktreeCode === 'R' || worktreeCode === 'C') {
      oldRelativePath = tokens[index + 1] || undefined
      index += 1
    }

    changes.push({
      relativePath: entry.slice(3),
      oldRelativePath,
      status: toGitFileStatus(indexCode, worktreeCode),
      staged: indexCode !== ' ' && indexCode !== '?',
      indexCode,
      worktreeCode
    })
  }

  return { changes, truncated }
}

function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  if (Buffer.byteLength(diff, 'utf8') <= MAX_GIT_DIFF_BYTES) {
    return { diff, truncated: false }
  }

  const limited = Buffer.from(diff, 'utf8').subarray(0, MAX_GIT_DIFF_BYTES).toString('utf8')
  const lastNewline = limited.lastIndexOf('\n')
  return {
    diff: lastNewline > 0 ? limited.slice(0, lastNewline) : limited,
    truncated: true
  }
}

export class GitService {
  constructor(
    private readonly repositories: RepositoryService = repositoryService,
    private readonly files: FileService = fileService
  ) {}

  async getStatus(repositoryId: string): Promise<GitStatus> {
    const root = await this.resolveRoot(repositoryId)

    const { stdout } = await runGit(root, [
      '--no-optional-locks',
      'status',
      '--porcelain=v1',
      '-z',
      '--untracked-files=all'
    ])

    const { changes, truncated } = parseStatus(stdout)
    return {
      repositoryId,
      branch: await this.readBranch(root),
      changes,
      truncated
    }
  }

  async getDiff(repositoryId: string, relativePath: string): Promise<GitDiffResult> {
    if (!isSafeRelativePath(relativePath)) {
      throw new ServiceError('PATH_NOT_ALLOWED', '文件路径不在授权仓库范围内')
    }

    const root = await this.resolveRoot(repositoryId)
    const head = await runGit(
      root,
      ['--no-optional-locks', 'rev-parse', '--verify', '--quiet', 'HEAD'],
      { acceptedExitCodes: [0, 1, 128] }
    )
    const base = head.stdout.trim() ? 'HEAD' : EMPTY_TREE_SHA

    let diff = (
      await runGit(root, [
        '--no-optional-locks',
        'diff',
        '--no-color',
        '--no-ext-diff',
        base,
        '--',
        relativePath
      ])
    ).stdout

    if (!diff.trim()) {
      const status = await runGit(root, [
        '--no-optional-locks',
        'status',
        '--porcelain=v1',
        '-z',
        '--',
        relativePath
      ])

      if (status.stdout.startsWith('??')) {
        diff = await this.buildUntrackedDiff(repositoryId, relativePath)
      }
    }

    const limited = truncateDiff(diff)
    return {
      repositoryId,
      relativePath,
      diff: limited.diff,
      truncated: limited.truncated
    }
  }

  private async resolveRoot(repositoryId: string): Promise<string> {
    const root = this.repositories.getRealRoot(repositoryId)

    let info
    try {
      info = await stat(root)
    } catch {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库目录已不存在')
    }

    if (!info.isDirectory()) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库目录已不存在')
    }

    return root
  }

  private async readBranch(root: string): Promise<string | null> {
    try {
      const { stdout } = await runGit(root, ['--no-optional-locks', 'branch', '--show-current'])
      return stdout.trim() || null
    } catch {
      return null
    }
  }

  private async buildUntrackedDiff(repositoryId: string, relativePath: string): Promise<string> {
    const file = await this.files.read(repositoryId, relativePath)
    const lines = file.content.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }

    const header = [
      `diff --git a/${relativePath} b/${relativePath}`,
      'new file mode 100644',
      '--- /dev/null',
      `+++ b/${relativePath}`
    ]

    if (lines.length === 0) {
      return header.join('\n')
    }

    return [...header, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join(
      '\n'
    )
  }
}

export const gitService = new GitService()

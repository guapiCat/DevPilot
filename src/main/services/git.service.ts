import { spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import {
  DEFAULT_GIT_LOG_LIMIT,
  GIT_COMMAND_TIMEOUT_MS,
  GIT_NETWORK_COMMAND_TIMEOUT_MS,
  GIT_WRITE_COMMAND_TIMEOUT_MS,
  MAX_GIT_BRANCHES,
  MAX_GIT_COMMIT_BODY_LENGTH,
  MAX_GIT_COMMIT_MESSAGE_LENGTH,
  MAX_GIT_DIFF_BYTES,
  MAX_GIT_LOG_ENTRIES,
  MAX_GIT_OUTPUT_BYTES,
  MAX_GIT_PATHSPEC_CHARS,
  MAX_GIT_STAGE_PATHS,
  MAX_GIT_STATUS_ENTRIES,
} from '@shared/constants/app'
import type {
  GitBranch,
  GitBranchList,
  GitCommitDetail,
  GitCommitFileChange,
  GitCommitResult,
  GitDiffResult,
  GitFileChange,
  GitFileStatus,
  GitHeadState,
  GitLogEntry,
  GitLogResult,
  GitRemoteStatus,
  GitStatus,
} from '@shared/types/git'
import { isSafeBranchName, isSafeGitPath, isSafeRemoteName } from '@shared/utils/git'
import { isSafeRelativePath } from '@shared/utils/path'
import { ServiceError } from '../utils/service-error'
import { fileService } from './file.service'
import type { FileService } from './file.service'
import { classifyGitFailure } from './git-errors'
import { repositoryService } from './repository.service'
import type { RepositoryService } from './repository.service'

const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904'
const CONFLICT_PAIRS = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'])
const COMMIT_SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const LOG_FIELD_SEPARATOR = '\x1f'
const LOG_FORMAT = '%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%s%x1f%b'

const NETWORK_ENV: NodeJS.ProcessEnv = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  SSH_ASKPASS_REQUIRE: 'never',
  GIT_ALLOW_PROTOCOL: 'https:ssh:file',
}

export interface GitPathsInput {
  all?: boolean
  paths?: string[]
}

export interface GitLogOptions {
  limit?: number
  skip?: number
}

interface GitRunOptions {
  acceptedExitCodes?: number[]
  timeoutMs?: number
  env?: NodeJS.ProcessEnv
  operation?: string
}

interface GitCommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

function runGit(cwd: string, args: string[], options: GitRunOptions = {}): Promise<GitCommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: options.env ? { ...process.env, ...options.env } : process.env,
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
    }, options.timeoutMs ?? GIT_COMMAND_TIMEOUT_MS)

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
        settle(() => reject(new ServiceError('GIT_NOT_AVAILABLE', '未检测到 Git，请先安装并确保 git 在 PATH 中')))
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
        const failure = classifyGitFailure(stderr || stdout)
        console.error(`[git] ${options.operation ?? 'command'} 失败：exit=${exitCode} code=${failure.code}`)
        settle(() => reject(new ServiceError(failure.code, failure.message)))
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
      worktreeCode,
    })
  }

  return { changes, truncated }
}

function mapNameStatusCode(code: string): GitFileStatus {
  switch (code) {
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
    case 'C':
      return 'renamed'
    case 'M':
    case 'T':
      return 'modified'
    case 'U':
      return 'conflicted'
    default:
      return 'unknown'
  }
}

function parseNameStatus(stdout: string): GitCommitFileChange[] {
  const tokens = stdout.split('\0')
  const files: GitCommitFileChange[] = []

  for (let index = 0; index < tokens.length; index += 1) {
    const statusToken = tokens[index]
    if (!statusToken) continue

    const code = statusToken[0]

    if (code === 'R' || code === 'C') {
      const oldRelativePath = tokens[(index += 1)]
      const relativePath = tokens[(index += 1)]
      if (oldRelativePath && relativePath) {
        files.push({ relativePath, oldRelativePath, status: 'renamed' })
      }
      continue
    }

    const relativePath = tokens[(index += 1)]
    if (relativePath) {
      files.push({ relativePath, status: mapNameStatusCode(code) })
    }
  }

  return files
}

function parseLogEntry(record: string): GitLogEntry | null {
  const fields = record.split(LOG_FIELD_SEPARATOR)
  if (fields.length < 7) return null

  const [sha, shortSha, authorName, authorEmail, authorTime, subject] = fields
  let body = fields.slice(6).join(LOG_FIELD_SEPARATOR).trimEnd()
  if (body.length > MAX_GIT_COMMIT_BODY_LENGTH) {
    body = body.slice(0, MAX_GIT_COMMIT_BODY_LENGTH)
  }

  return {
    sha,
    shortSha,
    authorName,
    authorEmail,
    authorTime: Number(authorTime) || 0,
    subject,
    body,
  }
}

function truncateDiff(diff: string): { diff: string; truncated: boolean } {
  if (Buffer.byteLength(diff, 'utf8') <= MAX_GIT_DIFF_BYTES) {
    return { diff, truncated: false }
  }

  const limited = Buffer.from(diff, 'utf8').subarray(0, MAX_GIT_DIFF_BYTES).toString('utf8')
  const lastNewline = limited.lastIndexOf('\n')
  return {
    diff: lastNewline > 0 ? limited.slice(0, lastNewline) : limited,
    truncated: true,
  }
}

export class GitService {
  constructor(
    private readonly repositories: RepositoryService = repositoryService,
    private readonly files: FileService = fileService,
  ) {}

  async getStatus(repositoryId: string): Promise<GitStatus> {
    const root = await this.resolveRoot(repositoryId)

    const { stdout } = await runGit(
      root,
      ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      { operation: 'status' },
    )

    const { changes, truncated } = parseStatus(stdout)
    const branch = await this.readBranch(root)
    const hasHead = await this.hasHead(root)

    let headState: GitHeadState = 'attached'
    if (!hasHead) headState = 'unborn'
    else if (!branch) headState = 'detached'

    return {
      repositoryId,
      branch,
      headState,
      changes,
      truncated,
    }
  }

  async getDiff(repositoryId: string, relativePath: string): Promise<GitDiffResult> {
    if (!isSafeRelativePath(relativePath)) {
      throw new ServiceError('PATH_NOT_ALLOWED', '文件路径不在授权仓库范围内')
    }

    const root = await this.resolveRoot(repositoryId)
    const head = await runGit(root, ['--no-optional-locks', 'rev-parse', '--verify', '--quiet', 'HEAD'], {
      acceptedExitCodes: [0, 1, 128],
      operation: 'diff',
    })
    const base = head.stdout.trim() ? 'HEAD' : EMPTY_TREE_SHA

    let diff = (
      await runGit(root, ['--no-optional-locks', 'diff', '--no-color', '--no-ext-diff', base, '--', relativePath], {
        operation: 'diff',
      })
    ).stdout

    if (!diff.trim()) {
      const status = await runGit(root, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--', relativePath], {
        operation: 'diff',
      })

      if (status.stdout.startsWith('??')) {
        diff = await this.buildUntrackedDiff(repositoryId, relativePath)
      }
    }

    const limited = truncateDiff(diff)
    return {
      repositoryId,
      relativePath,
      diff: limited.diff,
      truncated: limited.truncated,
    }
  }

  async listBranches(repositoryId: string): Promise<GitBranchList> {
    const root = await this.resolveRoot(repositoryId)

    const { stdout } = await runGit(
      root,
      [
        '--no-optional-locks',
        'for-each-ref',
        '--sort=-committerdate',
        '--format=%(refname:short)%00%(objectname:short)%00%(HEAD)%00%(upstream:short)%00%(committerdate:iso-strict)%00%(subject)',
        'refs/heads',
      ],
      { operation: 'branches' },
    )

    const branches: GitBranch[] = []

    for (const line of stdout.split('\n')) {
      if (!line) continue
      const [name, commit, headMark, upstream, updatedAt, subject] = line.split('\0')
      if (!name) continue

      branches.push({
        name,
        current: headMark === '*',
        commit: commit || null,
        upstream: upstream || null,
        subject: subject || null,
        updatedAt: updatedAt || null,
      })
    }

    const current = await this.readBranch(root)
    if (current && !branches.some((branch) => branch.name === current)) {
      branches.unshift({
        name: current,
        current: true,
        commit: null,
        upstream: null,
        subject: null,
        updatedAt: null,
      })
    }

    return {
      repositoryId,
      current,
      branches: branches.slice(0, MAX_GIT_BRANCHES),
      truncated: branches.length > MAX_GIT_BRANCHES,
    }
  }

  async getLog(repositoryId: string, options: GitLogOptions = {}): Promise<GitLogResult> {
    const root = await this.resolveRoot(repositoryId)
    const limit = Math.min(Math.max(options.limit ?? DEFAULT_GIT_LOG_LIMIT, 1), MAX_GIT_LOG_ENTRIES)
    const skip = Math.max(options.skip ?? 0, 0)

    if (!(await this.hasHead(root))) {
      return { repositoryId, entries: [], hasMore: false, truncated: false }
    }

    const { stdout } = await runGit(
      root,
      ['--no-optional-locks', 'log', '-z', `--max-count=${limit + 1}`, `--skip=${skip}`, `--format=${LOG_FORMAT}`],
      { operation: 'log' },
    )

    const records = stdout.split('\0').filter(Boolean)
    const entries: GitLogEntry[] = []

    for (const record of records.slice(0, limit)) {
      const entry = parseLogEntry(record)
      if (entry) entries.push(entry)
    }

    const hasMore = records.length > limit
    const bodyTruncated = entries.some(
      (entry) => entry.body.length > 0 && entry.body.length === MAX_GIT_COMMIT_BODY_LENGTH,
    )

    return {
      repositoryId,
      entries,
      hasMore,
      truncated: hasMore || bodyTruncated,
    }
  }

  async getCommit(repositoryId: string, sha: string): Promise<GitCommitDetail> {
    if (!COMMIT_SHA_PATTERN.test(sha)) {
      throw new ServiceError('VALIDATION_ERROR', '提交 SHA 不合法')
    }

    const root = await this.resolveRoot(repositoryId)

    const { stdout: metaOut } = await runGit(
      root,
      ['--no-optional-locks', 'log', '-1', '-z', `--format=${LOG_FORMAT}`, sha],
      { operation: 'commitDetail' },
    )
    const record = metaOut.split('\0').find(Boolean)
    const entry = record ? parseLogEntry(record) : null

    if (!entry) {
      throw new ServiceError('GIT_COMMIT_NOT_FOUND', '未找到指定的提交')
    }

    const { stdout: filesOut } = await runGit(
      root,
      [
        '--no-optional-locks',
        'diff-tree',
        '--root',
        '--first-parent',
        '-m',
        '-r',
        '-M',
        '--no-commit-id',
        '--name-status',
        '-z',
        sha,
      ],
      { operation: 'commitDetail' },
    )

    const { stdout: patchOut } = await runGit(
      root,
      ['--no-optional-locks', 'show', '--no-color', '--no-ext-diff', '--first-parent', '--format=', sha],
      { operation: 'commitDetail' },
    )

    const limited = truncateDiff(patchOut)

    return {
      repositoryId,
      sha: entry.sha,
      shortSha: entry.shortSha,
      authorName: entry.authorName,
      authorEmail: entry.authorEmail,
      authorTime: entry.authorTime,
      subject: entry.subject,
      body: entry.body,
      files: parseNameStatus(filesOut),
      diff: limited.diff,
      truncated: limited.truncated,
    }
  }

  async getRemoteStatus(repositoryId: string): Promise<GitRemoteStatus> {
    const root = await this.resolveRoot(repositoryId)
    const remotes = await this.listRemotes(root)
    const branch = await this.readBranch(root)

    let upstream: string | null = null
    let remoteName: string | null = null
    let remoteBranch: string | null = null
    let ahead = 0
    let behind = 0

    if (branch) {
      const info = await this.readUpstream(root, branch)
      if (info) {
        upstream = info.upstream
        remoteName = info.remote
        remoteBranch = info.branch

        const counts = await runGit(
          root,
          ['--no-optional-locks', 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'],
          { acceptedExitCodes: [0, 128], operation: 'remoteStatus' },
        )

        const match = counts.exitCode === 0 ? counts.stdout.trim().match(/^(\d+)\s+(\d+)$/) : null
        if (match) {
          behind = Number(match[1])
          ahead = Number(match[2])
        }
      }
    }

    return { repositoryId, remotes, upstream, remoteName, remoteBranch, ahead, behind }
  }

  async stage(repositoryId: string, input: GitPathsInput): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const args = ['--literal-pathspecs', 'add']

    if (input.all) {
      args.push('-A', '--')
    } else {
      args.push('--', ...this.validatePaths(input.paths))
    }

    await runGit(root, args, {
      timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
      operation: 'stage',
    })
  }

  async unstage(repositoryId: string, input: GitPathsInput): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const hasHead = await this.hasHead(root)

    if (hasHead) {
      const args = ['--literal-pathspecs', 'restore', '--staged', '--']
      if (input.all) args.push('.')
      else args.push(...this.validatePaths(input.paths))

      await runGit(root, args, {
        timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
        operation: 'unstage',
      })
      return
    }

    if (input.all) {
      const staged = await runGit(root, ['--no-optional-locks', 'ls-files', '--cached', '-z'], {
        timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
        operation: 'unstage',
      })
      const files = staged.stdout.split('\0').filter(Boolean)
      if (files.length === 0) return

      await runGit(root, ['--literal-pathspecs', 'rm', '--cached', '-r', '-q', '--', ...files], {
        timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
        operation: 'unstage',
      })
      return
    }

    await runGit(
      root,
      ['--literal-pathspecs', 'rm', '--cached', '-r', '-q', '--', ...this.validatePaths(input.paths)],
      { timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS, operation: 'unstage' },
    )
  }

  async commit(repositoryId: string, message: string): Promise<GitCommitResult> {
    const root = await this.resolveRoot(repositoryId)
    const trimmed = message.trim()

    if (!trimmed) {
      throw new ServiceError('VALIDATION_ERROR', '提交信息不能为空')
    }
    if (trimmed.length > MAX_GIT_COMMIT_MESSAGE_LENGTH) {
      throw new ServiceError('VALIDATION_ERROR', '提交信息过长')
    }
    if (trimmed.includes('\0')) {
      throw new ServiceError('VALIDATION_ERROR', '提交信息不合法')
    }

    await runGit(root, ['-c', 'commit.gpgsign=false', 'commit', '-m', trimmed], {
      timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
      operation: 'commit',
    })

    const { stdout: shaOut } = await runGit(root, ['--no-optional-locks', 'rev-parse', 'HEAD'], {
      operation: 'commit',
    })
    const { stdout: shortOut } = await runGit(root, ['--no-optional-locks', 'rev-parse', '--short', 'HEAD'], {
      operation: 'commit',
    })

    return {
      repositoryId,
      sha: shaOut.trim(),
      shortSha: shortOut.trim(),
    }
  }

  async createBranch(repositoryId: string, branchName: string, checkout: boolean): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const name = this.validateBranchName(branchName)

    if (checkout) {
      await runGit(root, ['switch', '-c', name], {
        timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
        operation: 'createBranch',
      })
      return
    }

    await runGit(root, ['branch', '--', name], {
      timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
      operation: 'createBranch',
    })
  }

  async switchBranch(repositoryId: string, branchName: string): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const name = this.validateBranchName(branchName)

    await runGit(root, ['switch', '--', name], {
      timeoutMs: GIT_WRITE_COMMAND_TIMEOUT_MS,
      operation: 'switchBranch',
    })
  }

  async fetch(repositoryId: string): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const branch = await this.readBranch(root)
    const remote = await this.resolveRemote(root, branch)

    await runGit(root, ['fetch', '--no-tags', '--no-recurse-submodules', remote], {
      timeoutMs: GIT_NETWORK_COMMAND_TIMEOUT_MS,
      env: NETWORK_ENV,
      operation: 'fetch',
    })
  }

  async pull(repositoryId: string): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const branch = await this.readBranch(root)

    if (!branch) {
      throw new ServiceError('GIT_NO_UPSTREAM', '当前处于分离 HEAD 状态，无法拉取')
    }

    const upstream = await this.readUpstream(root, branch)
    if (!upstream) {
      throw new ServiceError('GIT_NO_UPSTREAM', '当前分支没有可用的上游分支')
    }

    await runGit(root, ['pull', '--ff-only', '--no-recurse-submodules', upstream.remote, upstream.branch], {
      timeoutMs: GIT_NETWORK_COMMAND_TIMEOUT_MS,
      env: NETWORK_ENV,
      operation: 'pull',
    })
  }

  async push(repositoryId: string): Promise<void> {
    const root = await this.resolveRoot(repositoryId)
    const branch = await this.readBranch(root)

    if (!branch) {
      throw new ServiceError('GIT_NO_UPSTREAM', '当前处于分离 HEAD 状态，无法推送')
    }

    const upstream = await this.readUpstream(root, branch)

    if (upstream) {
      await runGit(root, ['push', '--porcelain', upstream.remote, `HEAD:${upstream.branch}`], {
        timeoutMs: GIT_NETWORK_COMMAND_TIMEOUT_MS,
        env: NETWORK_ENV,
        operation: 'push',
      })
      return
    }

    const remote = await this.resolveRemote(root, branch)
    await runGit(root, ['push', '--porcelain', '--set-upstream', remote, 'HEAD'], {
      timeoutMs: GIT_NETWORK_COMMAND_TIMEOUT_MS,
      env: NETWORK_ENV,
      operation: 'push',
    })
  }

  private validatePaths(paths: string[] | undefined): string[] {
    if (!paths || paths.length === 0) {
      throw new ServiceError('VALIDATION_ERROR', '请至少选择一个文件')
    }
    if (paths.length > MAX_GIT_STAGE_PATHS) {
      throw new ServiceError('VALIDATION_ERROR', '暂存文件数量超过上限')
    }

    let chars = 0
    for (const path of paths) {
      if (!isSafeGitPath(path)) {
        throw new ServiceError('PATH_NOT_ALLOWED', '文件路径不在授权仓库范围内')
      }
      chars += path.length
    }

    if (chars > MAX_GIT_PATHSPEC_CHARS) {
      throw new ServiceError('VALIDATION_ERROR', '文件路径总长度超过上限')
    }

    return paths
  }

  private validateBranchName(branchName: string): string {
    if (!isSafeBranchName(branchName)) {
      throw new ServiceError('VALIDATION_ERROR', '分支名不合法')
    }
    return branchName
  }

  private async listRemotes(root: string): Promise<string[]> {
    const { stdout } = await runGit(root, ['--no-optional-locks', 'remote'], {
      operation: 'remoteStatus',
    })

    return [
      ...new Set(
        stdout
          .split('\n')
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    ].filter(isSafeRemoteName)
  }

  private async resolveRemote(root: string, branch: string | null): Promise<string> {
    const upstream = branch ? await this.readUpstream(root, branch) : null
    if (upstream) return upstream.remote

    const remotes = await this.listRemotes(root)
    if (remotes.includes('origin')) return 'origin'
    if (remotes.length === 1) return remotes[0]

    throw new ServiceError('GIT_NO_REMOTE', '当前仓库未配置可用的远端')
  }

  private async readUpstream(
    root: string,
    branch: string,
  ): Promise<{ upstream: string; remote: string; branch: string } | null> {
    const { stdout } = await runGit(
      root,
      [
        '--no-optional-locks',
        'for-each-ref',
        '--format=%(upstream:short)%00%(upstream:remotename)',
        `refs/heads/${branch}`,
      ],
      { operation: 'remoteStatus' },
    )

    const line = stdout.split('\n').find(Boolean)
    if (!line) return null

    const [upstream, remote] = line.split('\0')
    if (!upstream || !remote || !isSafeRemoteName(remote)) return null

    return {
      upstream,
      remote,
      branch: upstream.startsWith(`${remote}/`) ? upstream.slice(remote.length + 1) : upstream,
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

  private async hasHead(root: string): Promise<boolean> {
    const result = await runGit(root, ['--no-optional-locks', 'rev-parse', '--verify', '--quiet', 'HEAD'], {
      acceptedExitCodes: [0, 1, 128],
      operation: 'headState',
    })
    return result.exitCode === 0 && Boolean(result.stdout.trim())
  }

  private async readBranch(root: string): Promise<string | null> {
    try {
      const { stdout } = await runGit(root, ['--no-optional-locks', 'branch', '--show-current'], {
        operation: 'branch',
      })
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
      `+++ b/${relativePath}`,
    ]

    if (lines.length === 0) {
      return header.join('\n')
    }

    return [...header, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join('\n')
  }
}

export const gitService = new GitService()

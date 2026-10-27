import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileService } from '@main/services/file.service'
import { GitService } from '@main/services/git.service'
import { RepositoryService } from '@main/services/repository.service'

export interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

const tempDirs: string[] = []

export async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

export async function cleanupTempDirs(): Promise<void> {
  for (const directory of tempDirs.splice(0)) {
    await removeDirectoryWithRetry(directory)
  }
}

async function removeDirectoryWithRetry(directory: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true })
      return
    } catch (error) {
      // Windows 上刚退出的 git 子进程可能短暂持有目录句柄。
      if (attempt >= 5) throw error
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)))
    }
  }
}

export function runGit(cwd: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.autocrlf=false', ...args], {
      cwd,
      windowsHide: true,
      shell: false,
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? -1 }))
  })
}

export async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit(cwd, args)
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${result.stderr}`)
  }
  return result.stdout
}

export async function initRepository(path: string, commit = true): Promise<void> {
  await git(path, 'init', '-q')
  await git(path, 'config', 'user.name', 'DevPilot Test')
  await git(path, 'config', 'user.email', 'devpilot@example.com')
  await git(path, 'config', 'commit.gpgsign', 'false')

  if (commit) {
    await writeFile(join(path, 'file.txt'), 'line1\nline2\n')
    await writeFile(join(path, 'remove.txt'), 'to be removed\n')
    await git(path, 'add', '.')
    await git(path, 'commit', '-q', '-m', 'init')
  }
}

export interface GitFixture {
  repositories: RepositoryService
  service: GitService
  repositoryId: string
  repositoryPath: string
}

export async function createGitFixture(options: { commit?: boolean } = {}): Promise<GitFixture> {
  const repositoryPath = await createTempDir('devpilot-git-')
  await initRepository(repositoryPath, options.commit ?? true)

  const repositories = new RepositoryService()
  const service = new GitService(repositories, new FileService(repositories))
  const repositoryId = (await repositories.register(repositoryPath)).id

  return { repositories, service, repositoryId, repositoryPath }
}

export async function createBareRemote(): Promise<string> {
  const remotePath = await createTempDir('devpilot-remote-')
  await git(remotePath, 'init', '--bare', '-q')
  return remotePath
}

export function toGitPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function toFileUrl(path: string): string {
  return `file:///${toGitPath(path).replace(/^\//, '')}`
}

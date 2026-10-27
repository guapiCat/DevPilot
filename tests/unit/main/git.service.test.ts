import { spawn } from 'node:child_process'
import { mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_GIT_DIFF_BYTES } from '@shared/constants/app'
import { FileService } from '@main/services/file.service'
import { GitService } from '@main/services/git.service'
import { RepositoryService } from '@main/services/repository.service'

interface GitResult {
  stdout: string
  stderr: string
  exitCode: number
}

const tempDirs: string[] = []
let repositories: RepositoryService
let service: GitService
let repositoryId: string
let repositoryPath: string

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function runGit(cwd: string, args: string[]): Promise<GitResult> {
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

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await runGit(cwd, args)
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} 失败：${result.stderr}`)
  }
  return result.stdout
}

async function initRepository(path: string, commit: boolean): Promise<void> {
  await git(path, 'init', '-q')
  await git(path, 'config', 'user.name', 'DevPilot Test')
  await git(path, 'config', 'user.email', 'devpilot@example.com')
  await git(path, 'config', 'commit.gpgsign', 'false')

  if (commit) {
    await git(path, 'add', '.')
    await git(path, 'commit', '-q', '-m', 'init')
  }
}

beforeEach(async () => {
  repositoryPath = await createTempDir('devpilot-git-')
  await writeFile(join(repositoryPath, 'file.txt'), 'line1\nline2\n')
  await writeFile(join(repositoryPath, 'remove.txt'), 'to be removed\n')
  await initRepository(repositoryPath, true)

  repositories = new RepositoryService()
  service = new GitService(repositories, new FileService(repositories))
  repositoryId = (await repositories.register(repositoryPath)).id
})

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('GitService.getStatus', () => {
  it('返回当前分支与工作区修改', async () => {
    const expectedBranch = (await git(repositoryPath, 'branch', '--show-current')).trim()
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')

    const status = await service.getStatus(repositoryId)

    expect(status.repositoryId).toBe(repositoryId)
    expect(status.branch).toBe(expectedBranch)
    expect(status.truncated).toBe(false)
    expect(status.changes).toContainEqual(
      expect.objectContaining({
        relativePath: 'file.txt',
        status: 'modified',
        staged: false,
      }),
    )
  })

  it('标记已暂存的新增文件', async () => {
    await writeFile(join(repositoryPath, 'added.txt'), 'new file\n')
    await git(repositoryPath, 'add', 'added.txt')

    const status = await service.getStatus(repositoryId)

    expect(status.changes).toContainEqual(
      expect.objectContaining({
        relativePath: 'added.txt',
        status: 'added',
        staged: true,
      }),
    )
  })

  it('标记未跟踪文件', async () => {
    await writeFile(join(repositoryPath, 'untracked.txt'), 'hello\n')

    const status = await service.getStatus(repositoryId)

    expect(status.changes).toContainEqual(
      expect.objectContaining({
        relativePath: 'untracked.txt',
        status: 'untracked',
        staged: false,
      }),
    )
  })

  it('解析换名变更的旧路径', async () => {
    await rename(join(repositoryPath, 'file.txt'), join(repositoryPath, 'renamed.txt'))
    await git(repositoryPath, 'add', '-A')

    const status = await service.getStatus(repositoryId)
    const change = status.changes.find((item) => item.relativePath === 'renamed.txt')

    expect(change).toMatchObject({
      status: 'renamed',
      oldRelativePath: 'file.txt',
      staged: true,
    })
  })

  it('未初始化的目录返回 NOT_A_GIT_REPOSITORY', async () => {
    const plainPath = await createTempDir('devpilot-plain-')
    const plainRepository = await repositories.register(plainPath)

    await expect(service.getStatus(plainRepository.id)).rejects.toMatchObject({
      code: 'NOT_A_GIT_REPOSITORY',
    })
  })

  it('未登记的仓库返回 REPOSITORY_NOT_FOUND', async () => {
    await expect(service.getStatus('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_FOUND',
    })
  })
})

describe('GitService.getDiff', () => {
  it('返回已跟踪文件相对 HEAD 的统一 Diff', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')

    const diff = await service.getDiff(repositoryId, 'file.txt')

    expect(diff.repositoryId).toBe(repositoryId)
    expect(diff.relativePath).toBe('file.txt')
    expect(diff.truncated).toBe(false)
    expect(diff.diff).toContain('-line2')
    expect(diff.diff).toContain('+changed')
  })

  it('为未跟踪文件生成新增 Diff', async () => {
    await writeFile(join(repositoryPath, 'untracked.txt'), 'hello\nworld\n')

    const diff = await service.getDiff(repositoryId, 'untracked.txt')

    expect(diff.diff).toContain('new file mode 100644')
    expect(diff.diff).toContain('+hello')
    expect(diff.diff).toContain('+world')
  })

  it('展示删除文件的 Diff', async () => {
    await unlink(join(repositoryPath, 'remove.txt'))

    const diff = await service.getDiff(repositoryId, 'remove.txt')

    expect(diff.diff).toContain('-to be removed')
  })

  it('尚无提交的仓库以空树为基线', async () => {
    const unbornPath = await createTempDir('devpilot-unborn-')
    await writeFile(join(unbornPath, 'first.txt'), 'first line\n')
    await initRepository(unbornPath, false)
    await git(unbornPath, 'add', 'first.txt')
    const unbornRepository = await repositories.register(unbornPath)

    const diff = await service.getDiff(unbornRepository.id, 'first.txt')

    expect(diff.diff).toContain('+first line')
  })

  it('截断超过 512 KB 的 Diff', async () => {
    await writeFile(join(repositoryPath, 'big.txt'), 'small\n')
    await git(repositoryPath, 'add', 'big.txt')
    await git(repositoryPath, 'commit', '-q', '-m', 'add big file')
    await writeFile(join(repositoryPath, 'big.txt'), `${'a'.repeat(600 * 1024)}\n`)

    const diff = await service.getDiff(repositoryId, 'big.txt')

    expect(diff.truncated).toBe(true)
    expect(Buffer.byteLength(diff.diff, 'utf8')).toBeLessThanOrEqual(MAX_GIT_DIFF_BYTES)
  })

  it('拒绝路径穿越', async () => {
    await expect(service.getDiff(repositoryId, '../outside.txt')).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED',
    })
  })

  it('未登记的仓库返回 REPOSITORY_NOT_FOUND', async () => {
    await expect(service.getDiff('00000000-0000-4000-8000-000000000000', 'file.txt')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_FOUND',
    })
  })
})

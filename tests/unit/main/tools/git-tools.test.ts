import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createGitDiffTool, createGitStatusTool } from '@main/ai/tools/git.tools'
import type { ToolContext } from '@main/ai/tools/tool-registry'
import { FileService } from '@main/services/file.service'
import { GitService } from '@main/services/git.service'
import { RepositoryService } from '@main/services/repository.service'

const tempDirs: string[] = []
let root: string
let repositoryId: string
let git: GitService
let statusTool: ReturnType<typeof createGitStatusTool>
let diffTool: ReturnType<typeof createGitDiffTool>
let context: ToolContext

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.autocrlf=false', ...args], {
      cwd,
      windowsHide: true,
      shell: false
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
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`git ${args.join(' ')} 失败：${stderr}`))
    })
  })
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'devpilot-gittool-'))
  tempDirs.push(root)
  await writeFile(join(root, 'file.txt'), 'line1\nline2\n')
  await runGit(root, ['init', '-q'])
  await runGit(root, ['config', 'user.name', 'DevPilot Test'])
  await runGit(root, ['config', 'user.email', 'devpilot@example.com'])
  await runGit(root, ['config', 'commit.gpgsign', 'false'])
  await runGit(root, ['add', '.'])
  await runGit(root, ['commit', '-q', '-m', 'init'])

  const repositories = new RepositoryService()
  git = new GitService(repositories, new FileService(repositories))
  repositoryId = (await repositories.register(root)).id
  statusTool = createGitStatusTool(git)
  diffTool = createGitDiffTool(git)
  context = { repositoryId, signal: new AbortController().signal }
})

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('get_git_status 工具', () => {
  it('干净仓库返回分支与零变更', async () => {
    const result = await statusTool.execute({}, context)

    expect(result.content).toContain('# Git 状态')
    expect(result.content).toContain('变更: 0 项')
    expect(result.content).toContain('工作区干净')
    expect(result.summary).toContain('0 项变更')
  })

  it('展示修改与未跟踪文件的路径和状态码', async () => {
    await writeFile(join(root, 'file.txt'), 'line1\nchanged\n')
    await writeFile(join(root, 'new.txt'), 'new\n')

    const result = await statusTool.execute({}, context)

    expect(result.content).toContain(' M file.txt')
    expect(result.content).toContain('?? new.txt')
    expect(result.content).toContain('变更: 2 项')
    expect(result.content).not.toContain('changed')
  })

  it('非 Git 仓库映射为 NOT_A_GIT_REPOSITORY', async () => {
    const plain = await mkdtemp(join(tmpdir(), 'devpilot-plain-'))
    tempDirs.push(plain)
    const repositories = new RepositoryService()
    const plainId = (await repositories.register(plain)).id
    const tool = createGitStatusTool(new GitService(repositories, new FileService(repositories)))

    await expect(
      tool.execute({}, { repositoryId: plainId, signal: new AbortController().signal })
    ).rejects.toMatchObject({ code: 'NOT_A_GIT_REPOSITORY' })
  })
})

describe('get_git_diff 工具', () => {
  it('返回未提交的差异', async () => {
    await writeFile(join(root, 'file.txt'), 'line1\nchanged\n')

    const result = await diffTool.execute({ path: 'file.txt' }, context)

    expect(result.content).toContain('# Git Diff: file.txt')
    expect(result.content).toContain('-line2')
    expect(result.content).toContain('+changed')
    expect(result.truncated).toBe(false)
  })

  it('无差异时给出明确说明', async () => {
    const result = await diffTool.execute({ path: 'file.txt' }, context)

    expect(result.content).toContain('没有未提交的差异')
    expect(result.summary).toBe('无未提交差异')
  })

  it('阻断敏感路径与包含密钥的差异', async () => {
    await expect(diffTool.execute({ path: '.env' }, context)).rejects.toMatchObject({
      code: 'SENSITIVE_FILE'
    })

    await writeFile(join(root, 'file.txt'), 'token sk-abcdefghijklmnopqrstuvwx\n')
    await expect(diffTool.execute({ path: 'file.txt' }, context)).rejects.toMatchObject({
      code: 'SENSITIVE_FILE'
    })
  })

  it('拒绝路径穿越', async () => {
    await expect(diffTool.execute({ path: '../outside.txt' }, context)).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED'
    })
  })
})

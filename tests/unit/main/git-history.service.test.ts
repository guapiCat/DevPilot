import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupTempDirs, createGitFixture, git, type GitFixture } from './git-test-utils'

let fixture: GitFixture
let repositoryId: string
let repositoryPath: string

beforeEach(async () => {
  fixture = await createGitFixture()
  repositoryId = fixture.repositoryId
  repositoryPath = fixture.repositoryPath
})

afterEach(async () => {
  await cleanupTempDirs()
})

async function commitFile(name: string, content: string, message: string): Promise<void> {
  await writeFile(join(repositoryPath, name), content)
  await git(repositoryPath, 'add', name)
  await git(repositoryPath, 'commit', '-q', '-m', message)
}

describe('GitService.getStatus headState', () => {
  it('区分 attached / detached / unborn', async () => {
    expect((await fixture.service.getStatus(repositoryId)).headState).toBe('attached')

    await git(repositoryPath, 'checkout', '--detach')
    expect((await fixture.service.getStatus(repositoryId)).headState).toBe('detached')

    await git(repositoryPath, 'checkout', '-')

    await cleanupTempDirs()
    fixture = await createGitFixture({ commit: false })
    repositoryId = fixture.repositoryId
    expect((await fixture.service.getStatus(repositoryId)).headState).toBe('unborn')
  })
})

describe('GitService.listBranches', () => {
  it('列出本地分支并标记当前分支', async () => {
    const current = (await git(repositoryPath, 'branch', '--show-current')).trim()
    await git(repositoryPath, 'branch', 'feature')

    const result = await fixture.service.listBranches(repositoryId)

    expect(result.repositoryId).toBe(repositoryId)
    expect(result.current).toBe(current)
    expect(result.truncated).toBe(false)
    expect(result.branches.map((branch) => branch.name).sort()).toEqual([current, 'feature'].sort())
    expect(result.branches.find((branch) => branch.name === current)?.current).toBe(true)
    expect(result.branches.find((branch) => branch.name === 'feature')?.current).toBe(false)
  })

  it('无提交的仓库合成当前分支', async () => {
    await cleanupTempDirs()
    fixture = await createGitFixture({ commit: false })
    repositoryId = fixture.repositoryId
    repositoryPath = fixture.repositoryPath
    const current = (await git(repositoryPath, 'branch', '--show-current')).trim()

    const result = await fixture.service.listBranches(repositoryId)

    expect(result.current).toBe(current)
    expect(result.branches).toEqual([expect.objectContaining({ name: current, current: true, commit: null })])
  })
})

describe('GitService.getLog', () => {
  it('按时间倒序返回提交并支持分页', async () => {
    await commitFile('a.txt', 'a\n', 'third')
    await commitFile('b.txt', 'b\n', 'fourth')

    const firstPage = await fixture.service.getLog(repositoryId, { limit: 2 })
    expect(firstPage.entries).toHaveLength(2)
    expect(firstPage.entries[0].subject).toBe('fourth')
    expect(firstPage.entries[1].subject).toBe('third')
    expect(firstPage.hasMore).toBe(true)

    const secondPage = await fixture.service.getLog(repositoryId, { limit: 2, skip: 2 })
    expect(secondPage.entries.map((entry) => entry.subject)).toEqual(['init'])
    expect(secondPage.hasMore).toBe(false)
  })

  it('返回提交的完整字段与正文', async () => {
    await writeFile(join(repositoryPath, 'body.txt'), 'body\n')
    await git(repositoryPath, 'add', 'body.txt')
    await git(repositoryPath, 'commit', '-q', '-m', 'subject line', '-m', 'body line one\nbody line two')

    const result = await fixture.service.getLog(repositoryId, { limit: 1 })
    const entry = result.entries[0]

    expect(entry.sha).toMatch(/^[a-f0-9]{40}$/)
    expect(entry.shortSha.length).toBeGreaterThanOrEqual(7)
    expect(entry.authorName).toBe('DevPilot Test')
    expect(entry.authorEmail).toBe('devpilot@example.com')
    expect(entry.authorTime).toBeGreaterThan(0)
    expect(entry.subject).toBe('subject line')
    expect(entry.body).toContain('body line one')
    expect(entry.body).toContain('body line two')
  })

  it('无提交的仓库返回空历史', async () => {
    await cleanupTempDirs()
    fixture = await createGitFixture({ commit: false })
    repositoryId = fixture.repositoryId

    const result = await fixture.service.getLog(repositoryId)

    expect(result.entries).toEqual([])
    expect(result.hasMore).toBe(false)
    expect(result.truncated).toBe(false)
  })
})

describe('GitService.getCommit', () => {
  it('返回元信息、文件列表与 Diff', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await git(repositoryPath, 'commit', '-q', '-am', 'update file')
    const sha = (await git(repositoryPath, 'rev-parse', 'HEAD')).trim()

    const detail = await fixture.service.getCommit(repositoryId, sha)

    expect(detail.sha).toBe(sha)
    expect(detail.subject).toBe('update file')
    expect(detail.files).toContainEqual(expect.objectContaining({ relativePath: 'file.txt', status: 'modified' }))
    expect(detail.diff).toContain('-line2')
    expect(detail.diff).toContain('+changed')
    expect(detail.truncated).toBe(false)
  })

  it('支持根提交', async () => {
    const rootSha = (await git(repositoryPath, 'rev-list', '--max-parents=0', 'HEAD')).trim()

    const detail = await fixture.service.getCommit(repositoryId, rootSha)

    expect(detail.files).toContainEqual(expect.objectContaining({ relativePath: 'file.txt', status: 'added' }))
    expect(detail.files).toContainEqual(expect.objectContaining({ relativePath: 'remove.txt', status: 'added' }))
    expect(detail.diff).toContain('new file mode')
  })

  it('解析重命名的文件列表', async () => {
    await rename(join(repositoryPath, 'file.txt'), join(repositoryPath, 'renamed.txt'))
    await git(repositoryPath, 'add', '-A')
    await git(repositoryPath, 'commit', '-q', '-m', 'rename file')
    const sha = (await git(repositoryPath, 'rev-parse', 'HEAD')).trim()

    const detail = await fixture.service.getCommit(repositoryId, sha)

    expect(detail.files).toContainEqual({
      relativePath: 'renamed.txt',
      oldRelativePath: 'file.txt',
      status: 'renamed',
    })
  })

  it('合并提交按 first-parent 展示文件与 Diff', async () => {
    await git(repositoryPath, 'checkout', '-q', '-b', 'side')
    await commitFile('side.txt', 'side\n', 'side commit')
    const base = (await git(repositoryPath, 'rev-parse', 'HEAD')).trim()
    await git(repositoryPath, 'checkout', '-q', '-')
    await commitFile('main.txt', 'main\n', 'main commit')
    await git(repositoryPath, 'merge', '-q', '--no-ff', 'side', '-m', 'merge side')
    const sha = (await git(repositoryPath, 'rev-parse', 'HEAD')).trim()

    const detail = await fixture.service.getCommit(repositoryId, sha)

    expect(base).toMatch(/^[a-f0-9]{40}$/)
    expect(detail.files).toEqual([expect.objectContaining({ relativePath: 'side.txt', status: 'added' })])
    expect(detail.diff).toContain('side.txt')
  })

  it('未知 SHA 返回 GIT_COMMIT_NOT_FOUND，非法 SHA 返回 VALIDATION_ERROR', async () => {
    await expect(fixture.service.getCommit(repositoryId, 'f'.repeat(40))).rejects.toMatchObject({
      code: 'GIT_COMMIT_NOT_FOUND',
    })
    await expect(fixture.service.getCommit(repositoryId, 'abc')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })
})

describe('GitService.getRemoteStatus', () => {
  it('无远端时返回空状态', async () => {
    const result = await fixture.service.getRemoteStatus(repositoryId)

    expect(result.repositoryId).toBe(repositoryId)
    expect(result.remotes).toEqual([])
    expect(result.upstream).toBeNull()
    expect(result.remoteName).toBeNull()
    expect(result.remoteBranch).toBeNull()
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })

  it('分离 HEAD 时不报告上游', async () => {
    await git(repositoryPath, 'checkout', '--detach')

    const result = await fixture.service.getRemoteStatus(repositoryId)

    expect(result.upstream).toBeNull()
    expect(result.ahead).toBe(0)
    expect(result.behind).toBe(0)
  })
})

import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  cleanupTempDirs,
  createBareRemote,
  createGitFixture,
  createTempDir,
  git,
  toFileUrl,
  type GitFixture,
} from './git-test-utils'

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

async function currentBranch(): Promise<string> {
  return (await git(repositoryPath, 'branch', '--show-current')).trim()
}

async function setupRemote(): Promise<{ remoteUrl: string; clonePath: string }> {
  const remoteUrl = toFileUrl(await createBareRemote())
  await git(repositoryPath, 'remote', 'add', 'origin', remoteUrl)
  await git(repositoryPath, 'push', '-q', '--set-upstream', 'origin', 'HEAD')

  const clonePath = await createTempDir('devpilot-clone-')
  await git(clonePath, 'clone', '-q', remoteUrl, '.')
  await git(clonePath, 'config', 'user.name', 'Clone User')
  await git(clonePath, 'config', 'user.email', 'clone@example.com')
  await git(clonePath, 'config', 'commit.gpgsign', 'false')

  return { remoteUrl, clonePath }
}

async function commitLocally(name: string, content: string, message: string): Promise<void> {
  await writeFile(join(repositoryPath, name), content)
  await fixture.service.stage(repositoryId, { paths: [name] })
  await fixture.service.commit(repositoryId, message)
}

async function commitInClone(clonePath: string, name: string, message: string): Promise<void> {
  await writeFile(join(clonePath, name), `${name}\n`)
  await git(clonePath, 'add', name)
  await git(clonePath, 'commit', '-q', '-m', message)
  await git(clonePath, 'push', '-q', 'origin', 'HEAD')
}

describe('GitService.push', () => {
  it('首次推送设置上游分支', async () => {
    const barePath = await createBareRemote()
    await git(repositoryPath, 'remote', 'add', 'origin', toFileUrl(barePath))
    const branch = await currentBranch()
    await commitLocally('pushed.txt', 'pushed\n', 'local commit')

    await fixture.service.push(repositoryId)

    expect((await git(repositoryPath, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}')).trim()).toBe(
      `origin/${branch}`,
    )
    expect((await git(barePath, 'rev-parse', `refs/heads/${branch}`)).trim()).toMatch(/^[a-f0-9]{40}$/)

    const status = await fixture.service.getRemoteStatus(repositoryId)
    expect(status.upstream).toBe(`origin/${branch}`)
    expect(status.remoteName).toBe('origin')
    expect(status.remoteBranch).toBe(branch)
    expect(status.ahead).toBe(0)
    expect(status.behind).toBe(0)
  })

  it('推送后 ahead 计数归零', async () => {
    await setupRemote()
    await commitLocally('local.txt', 'local\n', 'local only')

    const before = await fixture.service.getRemoteStatus(repositoryId)
    expect(before.ahead).toBe(1)
    expect(before.behind).toBe(0)

    await fixture.service.push(repositoryId)

    const after = await fixture.service.getRemoteStatus(repositoryId)
    expect(after.ahead).toBe(0)
  })

  it('拒绝非快进推送', async () => {
    const { clonePath } = await setupRemote()
    await commitInClone(clonePath, 'remote.txt', 'remote commit')
    await commitLocally('local.txt', 'local\n', 'local commit')

    await expect(fixture.service.push(repositoryId)).rejects.toMatchObject({
      code: 'GIT_NON_FAST_FORWARD',
    })
  })

  it('分离 HEAD 时无法推送', async () => {
    await setupRemote()
    await git(repositoryPath, 'checkout', '--detach')

    await expect(fixture.service.push(repositoryId)).rejects.toMatchObject({
      code: 'GIT_NO_UPSTREAM',
    })
  })
})

describe('GitService.fetch', () => {
  it('拉取远端提交后显示 behind', async () => {
    const { clonePath } = await setupRemote()
    await commitInClone(clonePath, 'remote.txt', 'remote commit')

    await fixture.service.fetch(repositoryId)

    const status = await fixture.service.getRemoteStatus(repositoryId)
    expect(status.behind).toBe(1)
    expect(status.ahead).toBe(0)
  })
})

describe('GitService.pull', () => {
  it('快进拉取远端提交', async () => {
    const { clonePath } = await setupRemote()
    await commitInClone(clonePath, 'remote.txt', 'remote commit')

    await fixture.service.pull(repositoryId)

    const status = await fixture.service.getRemoteStatus(repositoryId)
    expect(status.behind).toBe(0)
    expect((await git(repositoryPath, 'log', '-1', '--format=%s')).trim()).toBe('remote commit')
  })

  it('拒绝覆盖本地未提交修改', async () => {
    const { clonePath } = await setupRemote()
    await writeFile(join(clonePath, 'file.txt'), 'line1\nfrom clone\n')
    await git(clonePath, 'commit', '-q', '-am', 'remote edits file')
    await git(clonePath, 'push', '-q', 'origin', 'HEAD')
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nlocal edit\n')

    await expect(fixture.service.pull(repositoryId)).rejects.toMatchObject({
      code: 'GIT_WORKTREE_DIRTY',
    })
    expect(await readFile(join(repositoryPath, 'file.txt'), 'utf8')).toContain('local edit')
  })
})

describe('GitService 远端错误', () => {
  it('无远端时 fetch/push 返回 GIT_NO_REMOTE，pull 返回 GIT_NO_UPSTREAM', async () => {
    await expect(fixture.service.fetch(repositoryId)).rejects.toMatchObject({
      code: 'GIT_NO_REMOTE',
    })
    await expect(fixture.service.push(repositoryId)).rejects.toMatchObject({
      code: 'GIT_NO_REMOTE',
    })
    await expect(fixture.service.pull(repositoryId)).rejects.toMatchObject({
      code: 'GIT_NO_UPSTREAM',
    })
  })
})

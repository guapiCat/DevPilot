import { rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_GIT_COMMIT_MESSAGE_LENGTH, MAX_GIT_PATHSPEC_CHARS, MAX_GIT_STAGE_PATHS } from '@shared/constants/app'
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

describe('GitService.stage', () => {
  it('暂存单个修改文件', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')

    await fixture.service.stage(repositoryId, { paths: ['file.txt'] })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes).toContainEqual(
      expect.objectContaining({ relativePath: 'file.txt', staged: true, indexCode: 'M' }),
    )
  })

  it('暂存全部变更（修改、删除、未跟踪）', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await writeFile(join(repositoryPath, 'new.txt'), 'new\n')
    await unlink(join(repositoryPath, 'remove.txt'))

    await fixture.service.stage(repositoryId, { all: true })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes.every((change) => change.staged)).toBe(true)
    expect(status.changes).toContainEqual(
      expect.objectContaining({ relativePath: 'new.txt', status: 'added', staged: true }),
    )
    expect(status.changes).toContainEqual(
      expect.objectContaining({ relativePath: 'remove.txt', status: 'deleted', staged: true }),
    )
  })

  it('同时暂存重命名的新旧路径', async () => {
    await rename(join(repositoryPath, 'file.txt'), join(repositoryPath, 'renamed.txt'))

    await fixture.service.stage(repositoryId, { paths: ['file.txt', 'renamed.txt'] })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes).toContainEqual(
      expect.objectContaining({
        relativePath: 'renamed.txt',
        oldRelativePath: 'file.txt',
        status: 'renamed',
        staged: true,
      }),
    )
  })

  it('拒绝路径穿越、pathspec magic 与空路径', async () => {
    for (const input of [
      { paths: ['../outside.txt'] },
      { paths: ['C:\\Windows\\win.ini'] },
      { paths: [':(glob)*'] },
      { paths: [] },
    ]) {
      await expect(fixture.service.stage(repositoryId, input)).rejects.toMatchObject({
        code: input.paths.length === 0 ? 'VALIDATION_ERROR' : 'PATH_NOT_ALLOWED',
      })
    }
  })

  it('拒绝超过数量与字符预算的路径列表', async () => {
    const tooMany = Array.from({ length: MAX_GIT_STAGE_PATHS + 1 }, (_, index) => `f${index}.ts`)
    await expect(fixture.service.stage(repositoryId, { paths: tooMany })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })

    const perPath = Math.ceil((MAX_GIT_PATHSPEC_CHARS + 1) / MAX_GIT_STAGE_PATHS) + 1
    const tooLong = Array.from({ length: MAX_GIT_STAGE_PATHS }, () => 'a'.repeat(perPath))
    await expect(fixture.service.stage(repositoryId, { paths: tooLong })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    })
  })

  it('索引被占用时映射为 GIT_INDEX_LOCKED', async () => {
    await writeFile(join(repositoryPath, '.git', 'index.lock'), '')
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')

    await expect(fixture.service.stage(repositoryId, { paths: ['file.txt'] })).rejects.toMatchObject({
      code: 'GIT_INDEX_LOCKED',
    })
  })
})

describe('GitService.unstage', () => {
  it('取消暂存单个文件', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await fixture.service.stage(repositoryId, { paths: ['file.txt'] })

    await fixture.service.unstage(repositoryId, { paths: ['file.txt'] })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes).toContainEqual(expect.objectContaining({ relativePath: 'file.txt', staged: false }))
  })

  it('取消暂存全部文件', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await writeFile(join(repositoryPath, 'new.txt'), 'new\n')
    await fixture.service.stage(repositoryId, { all: true })

    await fixture.service.unstage(repositoryId, { all: true })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes.some((change) => change.staged)).toBe(false)
  })

  it('未跟踪文件取消暂存后仍保留在工作区', async () => {
    await writeFile(join(repositoryPath, 'new.txt'), 'new\n')
    await fixture.service.stage(repositoryId, { paths: ['new.txt'] })
    await fixture.service.unstage(repositoryId, { paths: ['new.txt'] })

    const status = await fixture.service.getStatus(repositoryId)
    expect(status.changes).toContainEqual(
      expect.objectContaining({ relativePath: 'new.txt', status: 'untracked', staged: false }),
    )
  })
})

describe('GitService.commit', () => {
  it('提交已暂存文件并返回 SHA', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await fixture.service.stage(repositoryId, { paths: ['file.txt'] })

    const result = await fixture.service.commit(repositoryId, '  feat: update file  ')

    expect(result.repositoryId).toBe(repositoryId)
    expect(result.sha).toMatch(/^[a-f0-9]{40}$/)
    expect(result.shortSha.length).toBeGreaterThanOrEqual(7)
    expect((await git(repositoryPath, 'log', '-1', '--format=%s')).trim()).toBe('feat: update file')
  })

  it('只提交已暂存内容，不自动暂存工作区修改', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nunstaged\n')

    await expect(fixture.service.commit(repositoryId, 'should fail')).rejects.toMatchObject({
      code: 'GIT_NOTHING_TO_COMMIT',
    })
  })

  it('拒绝空、超长与含 NUL 的提交信息', async () => {
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\nchanged\n')
    await fixture.service.stage(repositoryId, { paths: ['file.txt'] })

    for (const message of ['   ', 'a'.repeat(MAX_GIT_COMMIT_MESSAGE_LENGTH + 1), 'a\0b']) {
      await expect(fixture.service.commit(repositoryId, message)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      })
    }
  })

  it('分离 HEAD 上允许提交', async () => {
    await git(repositoryPath, 'checkout', '--detach')
    await writeFile(join(repositoryPath, 'file.txt'), 'line1\ndetached\n')
    await fixture.service.stage(repositoryId, { paths: ['file.txt'] })

    const result = await fixture.service.commit(repositoryId, 'detached commit')
    const status = await fixture.service.getStatus(repositoryId)

    expect(result.sha).toMatch(/^[a-f0-9]{40}$/)
    expect(status.headState).toBe('detached')
  })

  it('尚无提交的仓库支持首次提交', async () => {
    await cleanupTempDirs()
    fixture = await createGitFixture({ commit: false })
    repositoryId = fixture.repositoryId
    repositoryPath = fixture.repositoryPath
    await writeFile(join(repositoryPath, 'first.txt'), 'first\n')

    await fixture.service.stage(repositoryId, { paths: ['first.txt'] })
    await fixture.service.unstage(repositoryId, { paths: ['first.txt'] })
    await fixture.service.stage(repositoryId, { paths: ['first.txt'] })
    const result = await fixture.service.commit(repositoryId, 'first commit')

    const status = await fixture.service.getStatus(repositoryId)
    expect(result.sha).toMatch(/^[a-f0-9]{40}$/)
    expect(status.headState).toBe('attached')
    expect(status.changes).toHaveLength(0)
  })
})

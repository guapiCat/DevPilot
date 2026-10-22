import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '@main/database/database'
import { RepositoryStore } from '@main/database/repository.store'
import { RepositoryService } from '@main/services/repository.service'

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let repositoryPath: string
let service: RepositoryService

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

beforeEach(async () => {
  repositoryPath = await createTempDir('devpilot-repo-')
  service = new RepositoryService()

  await mkdir(join(repositoryPath, '.git'))
  await mkdir(join(repositoryPath, 'node_modules'))
  await mkdir(join(repositoryPath, 'src', 'utils'), { recursive: true })
  await mkdir(join(repositoryPath, 'docs'))

  await writeFile(join(repositoryPath, 'src', 'index.ts'), 'export const value = 1\n')
  await writeFile(join(repositoryPath, 'src', 'utils', 'a.ts'), 'export {}\n')
  await writeFile(join(repositoryPath, 'docs', 'README.md'), '# docs\n')
  await writeFile(join(repositoryPath, 'node_modules', 'pkg.js'), 'ignored\n')
  await writeFile(join(repositoryPath, '.git', 'config'), 'ignored\n')
})

afterEach(async () => {
  for (const database of openDatabases.splice(0)) {
    if (database.open) database.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('RepositoryService.register', () => {
  it('登记目录并识别 Git 仓库', async () => {
    const summary = await service.register(repositoryPath)

    expect(summary.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(summary.name).toBe(basename(repositoryPath))
    expect(summary.isGitRepository).toBe(true)
    expect(service.list().map((item) => item.id)).toEqual([summary.id])
  })

  it('同一目录重复登记时复用已有仓库 ID', async () => {
    const first = await service.register(repositoryPath)
    const second = await service.register(repositoryPath)

    expect(second.id).toBe(first.id)
    expect(service.list()).toHaveLength(1)
  })

  it('拒绝不存在的目录', async () => {
    await expect(service.register(join(repositoryPath, 'missing'))).rejects.toMatchObject({
      code: 'VALIDATION_ERROR'
    })
  })
})

describe('RepositoryService.getTree', () => {
  it('返回排序后的文件树并忽略 .git 与 node_modules', async () => {
    const summary = await service.register(repositoryPath)
    const tree = await service.getTree(summary.id)

    expect(tree.truncated).toBe(false)
    expect(tree.nodes.map((node) => node.name)).toEqual(['docs', 'src'])

    const sourceNode = tree.nodes.find((node) => node.name === 'src')
    expect(sourceNode?.type).toBe('directory')
    expect(sourceNode?.children?.map((node) => node.name)).toEqual(['utils', 'index.ts'])
    expect(sourceNode?.children?.[0].relativePath).toBe('src/utils')
  })

  it('未登记的仓库返回 REPOSITORY_NOT_FOUND', async () => {
    await expect(service.getTree('00000000-0000-4000-8000-000000000000')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_FOUND'
    })
  })

  it('仓库目录被删除后返回 REPOSITORY_NOT_FOUND', async () => {
    const summary = await service.register(repositoryPath)
    await rm(repositoryPath, { recursive: true, force: true })

    await expect(service.getTree(summary.id)).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_FOUND'
    })
  })
})

describe('RepositoryService 持久化', () => {
  function openTestDatabase(directory: string): Database.Database {
    const database = openDatabase(directory)
    openDatabases.push(database)
    return database
  }

  it('登记写入数据库并在重启后恢复', async () => {
    const databaseDirectory = await createTempDir('devpilot-db-')
    const database = openTestDatabase(databaseDirectory)

    const first = new RepositoryService()
    first.initialize(new RepositoryStore(database))
    const summary = await first.register(repositoryPath)

    expect(new RepositoryStore(database).findByPath(summary.path)?.id).toBe(summary.id)

    const restored = new RepositoryService()
    restored.initialize(new RepositoryStore(openTestDatabase(databaseDirectory)))

    expect(restored.list()).toEqual([
      expect.objectContaining({
        id: summary.id,
        name: summary.name,
        path: summary.path,
        isGitRepository: true
      })
    ])

    const again = await restored.register(repositoryPath)
    expect(again.id).toBe(summary.id)
    expect(restored.list()).toHaveLength(1)
  })

  it('重复登记同一目录刷新数据库更新时间', async () => {
    const databaseDirectory = await createTempDir('devpilot-db-')
    const database = openTestDatabase(databaseDirectory)
    const persisted = new RepositoryService()
    persisted.initialize(new RepositoryStore(database))

    const summary = await persisted.register(repositoryPath)
    const before = new RepositoryStore(database).findByPath(summary.path)?.updatedAt

    await new Promise((resolve) => setTimeout(resolve, 10))
    await persisted.register(repositoryPath)
    const after = new RepositoryStore(database).findByPath(summary.path)?.updatedAt

    expect(after).not.toBe(before)
    expect(new RepositoryStore(database).list()).toHaveLength(1)
  })
})

describe('RepositoryService.resolveFilePath', () => {
  it('解析仓库内文件路径', async () => {
    const summary = await service.register(repositoryPath)
    const resolved = await service.resolveFilePath(summary.id, 'src/index.ts')

    expect(await readFile(resolved, 'utf8')).toBe('export const value = 1\n')
  })

  it('拒绝路径穿越、绝对路径与盘符路径', async () => {
    const summary = await service.register(repositoryPath)

    for (const relativePath of [
      '../outside.txt',
      'src/../../outside.txt',
      '/etc/passwd',
      'C:\\Windows\\win.ini',
      '\\\\server\\share\\file.txt'
    ]) {
      await expect(service.resolveFilePath(summary.id, relativePath)).rejects.toMatchObject({
        code: 'PATH_NOT_ALLOWED'
      })
    }
  })

  it('拒绝不存在的文件', async () => {
    const summary = await service.register(repositoryPath)

    await expect(service.resolveFilePath(summary.id, 'missing.txt')).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND'
    })
  })

  it('拒绝通过符号链接/联结点逃逸到仓库外', async () => {
    const summary = await service.register(repositoryPath)
    const outside = await createTempDir('devpilot-outside-')
    await writeFile(join(outside, 'secret.txt'), 'secret\n')

    const linkPath = join(repositoryPath, 'linked')
    try {
      await symlink(outside, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    } catch {
      // 部分 Windows 环境不允许创建链接，此时跳过该断言。
      return
    }

    try {
      await expect(service.resolveFilePath(summary.id, 'linked/secret.txt')).rejects.toMatchObject({
        code: 'PATH_NOT_ALLOWED'
      })
    } finally {
      await rm(linkPath, { force: true })
    }
  })
})

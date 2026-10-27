import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { MAX_EDIT_FILES_PER_SESSION } from '@shared/constants/app'
import { EditStore } from '@main/database/edit.store'
import { openDatabase } from '@main/database/database'
import { EditService } from '@main/services/edit.service'
import { FileService } from '@main/services/file.service'
import { RepositoryService } from '@main/services/repository.service'

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []

let db: Database.Database
let store: EditStore
let service: EditService
let repositoryPath: string
let repositoryId: string
let conversationId: string

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function proposeModify(
  runId: string,
  oldText = 'const b = 2',
  newText = 'const b = 3',
): ReturnType<EditService['propose']> {
  return service.propose({
    repositoryId,
    conversationId,
    runId,
    relativePath: 'src/app.ts',
    operation: 'modify',
    oldText,
    newText,
  })
}

beforeEach(async () => {
  const root = await createTempDir('devpilot-edit-service-')
  repositoryPath = join(root, 'repo')
  await mkdir(join(repositoryPath, 'src'), { recursive: true })
  await mkdir(join(repositoryPath, 'many'), { recursive: true })
  await writeFile(join(repositoryPath, 'src', 'app.ts'), 'const a = 1\nconst b = 2\n')
  await writeFile(join(repositoryPath, 'dup.txt'), 'x\nx\n')

  const repositories = new RepositoryService()
  repositoryId = (await repositories.register(repositoryPath)).id
  const files = new FileService(repositories)

  db = openDatabase(join(root, 'db'))
  openDatabases.push(db)
  store = new EditStore(db)

  const now = new Date().toISOString()
  db.prepare('INSERT INTO repositories (id, name, path, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    repositoryId,
    'demo-repo',
    repositoryPath,
    now,
    now,
  )
  conversationId = crypto.randomUUID()
  db.prepare('INSERT INTO conversations (id, repository_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    conversationId,
    repositoryId,
    '测试会话',
    now,
    now,
  )

  let clock = Date.parse('2026-10-22T00:00:00.000Z')
  service = new EditService(repositories, files, () => new Date((clock += 1000)))
  service.initialize(store)
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('EditService.propose 修改文件', () => {
  it('生成基于唯一片段的完整建议内容', async () => {
    const result = await proposeModify('run-1')

    expect(result.file.operation).toBe('modify')
    expect(result.file.status).toBe('proposed')
    expect(result.file.originalContent).toBe('const a = 1\nconst b = 2\n')
    expect(result.file.proposedContent).toBe('const a = 1\nconst b = 3\n')

    expect(store.findFileEdit(result.fileEditId)?.relative_path).toBe('src/app.ts')
    expect(store.findSession(result.editSessionId)?.status).toBe('active')
  })

  it('oldText 未找到时返回 EDIT_CONFLICT', async () => {
    await expect(proposeModify('run-1', 'missing fragment')).rejects.toMatchObject({
      code: 'EDIT_CONFLICT',
    })
  })

  it('oldText 多次出现时返回 EDIT_CONFLICT', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'dup.txt',
        operation: 'modify',
        oldText: 'x',
        newText: 'y',
      }),
    ).rejects.toMatchObject({ code: 'EDIT_CONFLICT' })
  })

  it('建议内容与当前文件相同时拒绝', async () => {
    await expect(proposeModify('run-1', 'const b = 2', 'const b = 2')).rejects.toMatchObject({
      code: 'EDIT_CONFLICT',
    })
  })

  it('缺少 oldText 或 newText 时返回 VALIDATION_ERROR', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'src/app.ts',
        operation: 'modify',
        newText: 'x',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })

    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'src/app.ts',
        operation: 'modify',
        oldText: 'const b = 2',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })

  it('文件不存在时返回 FILE_NOT_FOUND', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'src/missing.ts',
        operation: 'modify',
        oldText: 'x',
        newText: 'y',
      }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
  })
})

describe('EditService.propose 新建文件', () => {
  it('生成 originalContent 为空的创建建议', async () => {
    const result = await service.propose({
      repositoryId,
      conversationId,
      runId: 'run-1',
      relativePath: 'src/new.ts',
      operation: 'create',
      content: 'export const x = 1\n',
    })

    expect(result.file.operation).toBe('create')
    expect(result.file.originalContent).toBeNull()
    expect(result.file.proposedContent).toBe('export const x = 1\n')
    expect(store.findFileEdit(result.fileEditId)?.original_hash).toBe('')
  })

  it('目标文件已存在时返回 FILE_ALREADY_EXISTS', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'src/app.ts',
        operation: 'create',
        content: 'x',
      }),
    ).rejects.toMatchObject({ code: 'FILE_ALREADY_EXISTS' })
  })

  it('父目录不存在时返回 FILE_NOT_FOUND', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'missing/new.ts',
        operation: 'create',
        content: 'x',
      }),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
  })

  it('缺少 content 时返回 VALIDATION_ERROR', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'src/new.ts',
        operation: 'create',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' })
  })
})

describe('EditService.propose 约束', () => {
  it('拒绝敏感文件', async () => {
    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: '.env',
        operation: 'create',
        content: 'SECRET=1',
      }),
    ).rejects.toMatchObject({ code: 'PATH_NOT_ALLOWED' })
  })

  it('同一次运行的建议归入同一个会话', async () => {
    const first = await proposeModify('run-1')
    const second = await service.propose({
      repositoryId,
      conversationId,
      runId: 'run-1',
      relativePath: 'src/new.ts',
      operation: 'create',
      content: 'export const y = 2\n',
    })

    expect(second.editSessionId).toBe(first.editSessionId)
    expect(service.getSession(first.editSessionId).files).toHaveLength(2)
  })

  it('不同运行创建不同的建议会话', async () => {
    const first = await proposeModify('run-1')
    const second = await proposeModify('run-2')

    expect(second.editSessionId).not.toBe(first.editSessionId)
  })

  it('同一会话内同一文件只允许一条待审核建议', async () => {
    await proposeModify('run-1', 'const a = 1', 'const a = 2')

    await expect(proposeModify('run-1', 'const b = 2', 'const b = 3')).rejects.toMatchObject({
      code: 'EDIT_CONFLICT',
    })
  })

  it('超过单会话文件上限时拒绝', async () => {
    for (let index = 0; index < MAX_EDIT_FILES_PER_SESSION; index += 1) {
      await service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: `many/f${index}.txt`,
        operation: 'create',
        content: `file ${index}`,
      })
    }

    await expect(
      service.propose({
        repositoryId,
        conversationId,
        runId: 'run-1',
        relativePath: 'many/one-too-many.txt',
        operation: 'create',
        content: 'x',
      }),
    ).rejects.toMatchObject({ code: 'EDIT_CONFLICT' })
  })

  it('未初始化存储时拒绝写入建议', async () => {
    service.initialize(null)

    await expect(proposeModify('run-1')).rejects.toMatchObject({ code: 'DATABASE_ERROR' })
  })
})

describe('EditService.applyFile', () => {
  it('应用修改建议后写入磁盘并结束会话', async () => {
    const proposal = await proposeModify('run-1')
    const result = await service.applyFile(proposal.editSessionId, proposal.fileEditId)

    expect(result.file.status).toBe('applied')
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.hadBom).toBe(false)
    expect(await readFile(join(repositoryPath, 'src', 'app.ts'), 'utf8')).toBe('const a = 1\nconst b = 3\n')
    expect(service.getSession(proposal.editSessionId).status).toBe('completed')
    expect(service.listPendingSessions(conversationId)).toEqual([])
  })

  it('应用新建建议后创建文件', async () => {
    const proposal = await service.propose({
      repositoryId,
      conversationId,
      runId: 'run-1',
      relativePath: 'src/new.ts',
      operation: 'create',
      content: 'export const x = 1\n',
    })

    const result = await service.applyFile(proposal.editSessionId, proposal.fileEditId)

    expect(result.file.status).toBe('applied')
    expect(await readFile(join(repositoryPath, 'src', 'new.ts'), 'utf8')).toBe('export const x = 1\n')
  })

  it('文件被外部修改后应用标记为过期', async () => {
    const proposal = await proposeModify('run-1')
    await writeFile(join(repositoryPath, 'src', 'app.ts'), 'external change\n')

    await expect(service.applyFile(proposal.editSessionId, proposal.fileEditId)).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    })

    const session = service.getSession(proposal.editSessionId)
    expect(session.status).toBe('active')
    expect(session.files[0].status).toBe('stale')

    const pending = service.listPendingSessions(conversationId)
    expect(pending).toHaveLength(1)
    expect(pending[0].files[0].status).toBe('stale')
  })

  it('新建目标被外部创建后应用标记为过期', async () => {
    const proposal = await service.propose({
      repositoryId,
      conversationId,
      runId: 'run-1',
      relativePath: 'src/late.ts',
      operation: 'create',
      content: 'proposed\n',
    })
    await writeFile(join(repositoryPath, 'src', 'late.ts'), 'external\n')

    await expect(service.applyFile(proposal.editSessionId, proposal.fileEditId)).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    })
    expect(service.getSession(proposal.editSessionId).files[0].status).toBe('stale')
  })

  it('多文件会话逐项应用，全部处理后结束', async () => {
    const first = await proposeModify('run-1')
    const second = await service.propose({
      repositoryId,
      conversationId,
      runId: 'run-1',
      relativePath: 'src/new.ts',
      operation: 'create',
      content: 'export const x = 1\n',
    })

    await service.applyFile(first.editSessionId, first.fileEditId)
    expect(service.getSession(first.editSessionId).status).toBe('active')

    await service.applyFile(second.editSessionId, second.fileEditId)
    expect(service.getSession(first.editSessionId).status).toBe('completed')
  })

  it('未知建议返回 EDIT_NOT_FOUND', async () => {
    const proposal = await proposeModify('run-1')

    await expect(service.applyFile(crypto.randomUUID(), proposal.fileEditId)).rejects.toMatchObject({
      code: 'EDIT_NOT_FOUND',
    })
    await expect(service.applyFile(proposal.editSessionId, crypto.randomUUID())).rejects.toMatchObject({
      code: 'EDIT_NOT_FOUND',
    })
  })

  it('已处理过的建议不能重复应用', async () => {
    const proposal = await proposeModify('run-1')
    await service.applyFile(proposal.editSessionId, proposal.fileEditId)

    await expect(service.applyFile(proposal.editSessionId, proposal.fileEditId)).rejects.toMatchObject({
      code: 'EDIT_CONFLICT',
    })
  })
})

describe('EditService.rejectFile', () => {
  it('拒绝后不写盘并结束会话', async () => {
    const proposal = await proposeModify('run-1')
    const rejected = service.rejectFile(proposal.editSessionId, proposal.fileEditId)

    expect(rejected.status).toBe('rejected')
    expect(await readFile(join(repositoryPath, 'src', 'app.ts'), 'utf8')).toBe('const a = 1\nconst b = 2\n')
    expect(service.getSession(proposal.editSessionId).status).toBe('completed')
    expect(service.listPendingSessions(conversationId)).toEqual([])
  })

  it('已应用的修改建议不能再拒绝', async () => {
    const proposal = await proposeModify('run-1')
    await service.applyFile(proposal.editSessionId, proposal.fileEditId)

    expect(() => service.rejectFile(proposal.editSessionId, proposal.fileEditId)).toThrowError()
  })
})

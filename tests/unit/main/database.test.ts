import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DATABASE_FILE_NAME, openDatabase, SCHEMA_VERSION } from '@main/database/database'
import { RepositoryStore } from '@main/database/repository.store'
import type Database from 'better-sqlite3'

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let databaseDirectory: string
let db: Database.Database

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

function open(): Database.Database {
  const instance = openDatabase(databaseDirectory)
  openDatabases.push(instance)
  return instance
}

function tableNames(instance: Database.Database): string[] {
  return instance
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name)
}

beforeEach(async () => {
  databaseDirectory = await createTempDir('devpilot-db-')
  db = open()
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('openDatabase', () => {
  it('在指定目录创建数据库并启用安全 PRAGMA', () => {
    expect(existsSync(join(databaseDirectory, DATABASE_FILE_NAME))).toBe(true)
    expect(db.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1)
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
  })

  it('创建基础表与索引', () => {
    expect(tableNames(db)).toEqual([
      'conversations',
      'edit_sessions',
      'file_edits',
      'messages',
      'model_profiles',
      'repositories',
    ])

    const indexes = db
      .prepare<[], { name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL ORDER BY name",
      )
      .all()
      .map((row) => row.name)

    expect(indexes).toEqual([
      'idx_conversations_repository',
      'idx_edit_sessions_conversation',
      'idx_edit_sessions_repository',
      'idx_file_edits_session',
      'idx_messages_conversation',
      'idx_model_profiles_updated_at',
      'idx_repositories_updated_at',
      'ux_model_profiles_active',
    ])
  })

  it('messages 表包含 tool_calls 列', () => {
    const columns = db
      .prepare<[], { name: string }>('PRAGMA table_info(messages)')
      .all()
      .map((row) => row.name)

    expect(columns).toContain('tool_calls')
  })

  it('从 v1 升级到最新版本保留已有消息', () => {
    db.prepare(
      `INSERT INTO conversations (id, repository_id, title, created_at, updated_at)
       VALUES ('c1', NULL, 'demo', 'now', 'now')`,
    ).run()
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('m1', 'c1', 'user', 'hello', 'now')`,
    ).run()

    db.exec('ALTER TABLE messages DROP COLUMN tool_calls;')
    db.exec('DROP TABLE model_profiles;')
    db.pragma('user_version = 1')

    for (const instance of openDatabases.splice(0)) {
      if (instance.open) instance.close()
    }

    const upgraded = open()
    expect(upgraded.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(upgraded.prepare('SELECT content FROM messages WHERE id = ?').get('m1')).toEqual({
      content: 'hello',
    })
    expect(
      upgraded
        .prepare<[], { name: string }>('PRAGMA table_info(messages)')
        .all()
        .map((row) => row.name),
    ).toContain('tool_calls')
    expect(tableNames(upgraded)).toContain('model_profiles')
  })

  it('重复打开时迁移幂等且保留数据', () => {
    const store = new RepositoryStore(db)
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'demo',
      path: 'F:\\demo',
      createdAt: '2026-10-22T00:00:00.000Z',
      updatedAt: '2026-10-22T00:00:00.000Z',
    })

    const reopened = open()

    expect(reopened.pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION)
    expect(new RepositoryStore(reopened).list()).toHaveLength(1)
  })
})

describe('RepositoryStore', () => {
  it('按更新时间倒序返回仓库并支持路径查找', () => {
    const store = new RepositoryStore(db)
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'older',
      path: 'F:\\older',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    store.insert({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'newer',
      path: 'F:\\Newer',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    })

    expect(store.list().map((record) => record.name)).toEqual(['newer', 'older'])
    expect(store.findByPath('f:\\newer')?.id).toBe('22222222-2222-4222-8222-222222222222')
    expect(store.findByPath('F:\\missing')).toBeUndefined()
  })

  it('touch 更新排序时间', () => {
    const store = new RepositoryStore(db)
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'older',
      path: 'F:\\older',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
    store.insert({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'newer',
      path: 'F:\\newer',
      createdAt: '2026-10-02T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    })

    store.touch('11111111-1111-4111-8111-111111111111', '2026-10-03T00:00:00.000Z')

    expect(store.list()[0].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('使用参数化 SQL，不执行名称中的 SQL 片段', () => {
    const store = new RepositoryStore(db)
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: "x'); DROP TABLE repositories; --",
      path: 'F:\\demo',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })

    expect(tableNames(db)).toContain('repositories')
    expect(store.list()[0].name).toBe("x'); DROP TABLE repositories; --")
  })
})

describe('数据库外键', () => {
  function insertRepository(store: RepositoryStore): void {
    store.insert({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'demo',
      path: 'F:\\demo',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    })
  }

  it('拒绝引用不存在的仓库', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO conversations (id, repository_id, title, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run('c1', '00000000-0000-4000-8000-000000000000', 't', 'now', 'now'),
    ).toThrow(/FOREIGN KEY/)
  })

  it('删除仓库时解除会话关联并级联删除编辑会话与文件编辑', () => {
    const store = new RepositoryStore(db)
    insertRepository(store)
    db.prepare(
      `INSERT INTO conversations (id, repository_id, title, created_at, updated_at)
       VALUES ('c1', '11111111-1111-4111-8111-111111111111', 't', 'now', 'now')`,
    ).run()
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES ('m1', 'c1', 'user', 'hello', 'now')`,
    ).run()
    db.prepare(
      `INSERT INTO edit_sessions (id, conversation_id, repository_id, status, created_at, updated_at)
       VALUES ('e1', 'c1', '11111111-1111-4111-8111-111111111111', 'proposed', 'now', 'now')`,
    ).run()
    db.prepare(
      `INSERT INTO file_edits (
         id, edit_session_id, relative_path, operation, original_content,
         proposed_content, original_hash, status, created_at, updated_at
       ) VALUES ('f1', 'e1', 'src/index.ts', 'modify', 'old', 'new', ?, 'proposed', 'now', 'now')`,
    ).run('a'.repeat(64))

    db.prepare('DELETE FROM repositories WHERE id = ?').run('11111111-1111-4111-8111-111111111111')

    expect(db.prepare('SELECT repository_id FROM conversations WHERE id = ?').get('c1')).toEqual({
      repository_id: null,
    })
    expect(db.prepare('SELECT COUNT(*) AS count FROM messages').get()).toEqual({ count: 1 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM edit_sessions').get()).toEqual({ count: 0 })
    expect(db.prepare('SELECT COUNT(*) AS count FROM file_edits').get()).toEqual({ count: 0 })
  })
})

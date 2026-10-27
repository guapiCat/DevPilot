import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type Database from 'better-sqlite3'
import { openDatabase } from '@main/database/database'
import { ModelProfileStore, type ModelProfileRecord } from '@main/database/model-profile.store'

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let db: Database.Database
let store: ModelProfileStore

function record(id: string, overrides: Partial<ModelProfileRecord> = {}): ModelProfileRecord {
  return {
    id,
    name: `profile-${id}`,
    provider: 'openai-compatible',
    baseUrl: 'https://api.example.com/v1',
    model: 'test-model',
    apiKeyCipher: null,
    toolsEnabled: true,
    isActive: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), 'devpilot-model-store-'))
  tempDirs.push(directory)
  db = openDatabase(directory)
  openDatabases.push(db)
  store = new ModelProfileStore(db)
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ModelProfileStore', () => {
  it('插入、读取与更新保留 is_active', () => {
    store.insert(record('a', { isActive: true, apiKeyCipher: 'cipher' }))
    store.update(record('a', { name: 'renamed', apiKeyCipher: 'cipher-2' }))

    const found = store.findById('a')
    expect(found).toMatchObject({
      name: 'renamed',
      apiKeyCipher: 'cipher-2',
      isActive: true,
      toolsEnabled: true,
    })
    expect(store.count()).toBe(1)
    expect(store.getActive()?.id).toBe('a')
  })

  it('同一时间只有一个 active 档案', () => {
    store.insert(record('a', { isActive: true }))
    store.insert(record('b', { isActive: true }))

    expect(store.list().filter((item) => item.isActive)).toHaveLength(1)
    expect(store.getActive()?.id).toBe('b')

    store.setActive('a')
    expect(store.getActive()?.id).toBe('a')
    expect(store.findById('b')?.isActive).toBe(false)
  })

  it('删除 active 档案后提升最近更新的剩余档案', () => {
    store.insert(record('old', { isActive: true, updatedAt: '2026-10-01T00:00:00.000Z' }))
    store.insert(record('newer', { updatedAt: '2026-10-03T00:00:00.000Z' }))
    store.insert(record('newest', { updatedAt: '2026-10-02T00:00:00.000Z' }))

    store.remove('old')

    expect(store.getActive()?.id).toBe('newer')
    expect(store.count()).toBe(2)
  })

  it('删除非 active 档案不改变当前选择', () => {
    store.insert(record('active', { isActive: true }))
    store.insert(record('other'))

    store.remove('other')

    expect(store.getActive()?.id).toBe('active')
  })

  it('删除最后一个档案后没有 active', () => {
    store.insert(record('only', { isActive: true }))
    store.remove('only')

    expect(store.getActive()).toBeUndefined()
    expect(store.count()).toBe(0)
  })

  it('activateLatestIfNone 只修复缺失 active 的异常数据', () => {
    store.insert(record('old', { updatedAt: '2026-10-01T00:00:00.000Z' }))
    store.insert(record('newer', { updatedAt: '2026-10-02T00:00:00.000Z' }))

    store.activateLatestIfNone()
    expect(store.getActive()?.id).toBe('newer')

    store.setActive('old')
    store.activateLatestIfNone()
    expect(store.getActive()?.id).toBe('old')
  })

  it('插入 active 档案失败时回滚，不破坏已有 active', () => {
    store.insert(
      record('existing', {
        isActive: true,
        provider: 'deepseek',
        apiKeyCipher: 'cipher',
      }),
    )

    expect(() => store.insert(record('existing', { isActive: true }))).toThrow()

    expect(store.getActive()?.id).toBe('existing')
    expect(store.count()).toBe(1)
  })

  it('list 按 active 优先、更新时间倒序排列', () => {
    store.insert(record('a', { updatedAt: '2026-10-01T00:00:00.000Z' }))
    store.insert(record('b', { isActive: true, updatedAt: '2026-10-02T00:00:00.000Z' }))
    store.insert(record('c', { updatedAt: '2026-10-03T00:00:00.000Z' }))

    expect(store.list().map((item) => item.id)).toEqual(['b', 'c', 'a'])
  })
})

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '@main/database/database'
import { ChatStore } from '@main/database/chat.store'
import type Database from 'better-sqlite3'

const tempDirs: string[] = []
const openDatabases: Database.Database[] = []
let databaseDirectory: string
let db: Database.Database
let store: ChatStore

async function createTempDir(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'devpilot-chat-'))
  tempDirs.push(directory)
  return directory
}

function open(): Database.Database {
  const instance = openDatabase(databaseDirectory)
  openDatabases.push(instance)
  return instance
}

function insertConversation(target: ChatStore, id: string, title: string, updatedAt: string): void {
  target.insertConversation({
    id,
    title,
    repositoryId: null,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt,
  })
}

beforeEach(async () => {
  databaseDirectory = await createTempDir()
  db = open()
  store = new ChatStore(db)
})

afterEach(async () => {
  for (const instance of openDatabases.splice(0)) {
    if (instance.open) instance.close()
  }
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('ChatStore 会话', () => {
  it('按更新时间倒序返回会话并支持查找', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', 'older', '2026-10-01T00:00:00.000Z')
    insertConversation(store, '22222222-2222-4222-8222-222222222222', 'newer', '2026-10-02T00:00:00.000Z')

    expect(store.listConversations().map((item) => item.title)).toEqual(['newer', 'older'])
    expect(store.findConversation('22222222-2222-4222-8222-222222222222')?.title).toBe('newer')
    expect(store.findConversation('33333333-3333-4333-8333-333333333333')).toBeUndefined()
  })

  it('按时间顺序返回消息，同一时间按插入顺序', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', 'demo', '2026-10-01T00:00:00.000Z')

    const first = store.appendUserMessage(
      '11111111-1111-4111-8111-111111111111',
      '第一个问题',
      '2026-10-01T00:00:01.000Z',
    )
    const second = store.appendAssistantMessage(
      '11111111-1111-4111-8111-111111111111',
      '第一个回答',
      '2026-10-01T00:00:02.000Z',
    )
    const third = store.appendUserMessage(
      '11111111-1111-4111-8111-111111111111',
      '第二个问题',
      '2026-10-01T00:00:03.000Z',
    )

    expect(store.listMessages('11111111-1111-4111-8111-111111111111').map((item) => item.id)).toEqual([
      first.id,
      second.id,
      third.id,
    ])
  })

  it('首条用户消息生成标题，后续消息不覆盖', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', '新会话', '2026-10-01T00:00:00.000Z')

    store.appendUserMessage(
      '11111111-1111-4111-8111-111111111111',
      '  如何\n排查   登录问题？  ',
      '2026-10-01T00:00:01.000Z',
    )

    expect(store.findConversation('11111111-1111-4111-8111-111111111111')?.title).toBe('如何 排查 登录问题？')

    store.appendUserMessage('11111111-1111-4111-8111-111111111111', '第二个问题', '2026-10-01T00:00:02.000Z')

    expect(store.findConversation('11111111-1111-4111-8111-111111111111')?.title).toBe('如何 排查 登录问题？')
  })

  it('标题按字符截断且更新时间随消息刷新', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', '新会话', '2026-10-01T00:00:00.000Z')

    store.appendUserMessage(
      '11111111-1111-4111-8111-111111111111',
      '这是一段很长很长的用户问题'.repeat(5),
      '2026-10-02T00:00:00.000Z',
    )

    const conversation = store.findConversation('11111111-1111-4111-8111-111111111111')
    expect([...(conversation?.title ?? '')]).toHaveLength(30)
    expect(conversation?.updatedAt).toBe('2026-10-02T00:00:00.000Z')
    expect(store.listConversations()[0].id).toBe('11111111-1111-4111-8111-111111111111')
  })

  it('listRecentMessages 返回最后 N 条并保持时间顺序', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', 'demo', '2026-10-01T00:00:00.000Z')

    for (let index = 0; index < 5; index += 1) {
      store.appendUserMessage(
        '11111111-1111-4111-8111-111111111111',
        `消息 ${index}`,
        `2026-10-01T00:00:0${index}.000Z`,
      )
    }

    const recent = store.listRecentMessages('11111111-1111-4111-8111-111111111111', 3)
    expect(recent.map((item) => item.content)).toEqual(['消息 2', '消息 3', '消息 4'])
  })

  it('assistant 消息保存工具调用摘要并可恢复', () => {
    const conversationId = '11111111-1111-4111-8111-111111111111'
    insertConversation(store, conversationId, 'demo', '2026-10-01T00:00:00.000Z')

    const toolCalls = [
      {
        id: 'call_1',
        name: 'read_file',
        argumentsSummary: 'src/a.ts:1-10',
        status: 'success' as const,
        summary: '读取 10/20 行',
        durationMs: 12,
      },
    ]
    const message = store.appendAssistantMessage(conversationId, '回答', '2026-10-01T00:00:01.000Z', toolCalls)

    expect(message.toolCalls).toEqual(toolCalls)
    expect(store.listMessages(conversationId)[0].toolCalls).toEqual(toolCalls)
    expect(store.listRecentMessages(conversationId, 5)[0].toolCalls).toEqual(toolCalls)
  })

  it('没有工具调用时不写入 tool_calls', () => {
    const conversationId = '11111111-1111-4111-8111-111111111111'
    insertConversation(store, conversationId, 'demo', '2026-10-01T00:00:00.000Z')

    const message = store.appendAssistantMessage(conversationId, '回答', '2026-10-01T00:00:01.000Z')

    expect(message.toolCalls).toBeUndefined()
    expect(
      db
        .prepare<[string], { tool_calls: string | null }>('SELECT tool_calls FROM messages WHERE id = ?')
        .get(message.id),
    ).toEqual({ tool_calls: null })
  })

  it('损坏的 tool_calls JSON 降级为 undefined', () => {
    const conversationId = '11111111-1111-4111-8111-111111111111'
    insertConversation(store, conversationId, 'demo', '2026-10-01T00:00:00.000Z')

    const message = store.appendAssistantMessage(conversationId, '回答', '2026-10-01T00:00:01.000Z')
    db.prepare('UPDATE messages SET tool_calls = ? WHERE id = ?').run('{broken', message.id)

    expect(store.listMessages(conversationId)[0].toolCalls).toBeUndefined()
  })

  it('删除会话时级联删除消息，其他会话不受影响', () => {
    const removedId = '11111111-1111-4111-8111-111111111111'
    const keptId = '22222222-2222-4222-8222-222222222222'
    insertConversation(store, removedId, 'removed', '2026-10-01T00:00:00.000Z')
    insertConversation(store, keptId, 'kept', '2026-10-02T00:00:00.000Z')
    store.appendUserMessage(removedId, '待删除问题', '2026-10-01T00:00:01.000Z')
    store.appendUserMessage(keptId, '保留问题', '2026-10-02T00:00:01.000Z')

    store.deleteConversation(removedId)

    expect(store.findConversation(removedId)).toBeUndefined()
    expect(store.listMessages(removedId)).toEqual([])
    expect(store.listConversations().map((item) => item.id)).toEqual([keptId])
    expect(store.listMessages(keptId)).toHaveLength(1)
  })

  it('跨重启保留会话与消息', async () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', 'demo', '2026-10-01T00:00:00.000Z')
    store.appendUserMessage('11111111-1111-4111-8111-111111111111', '持久化问题', '2026-10-01T00:00:01.000Z')

    for (const instance of openDatabases.splice(0)) {
      if (instance.open) instance.close()
    }

    const reopened = new ChatStore(open())
    expect(reopened.listConversations()).toHaveLength(1)
    expect(reopened.listMessages('11111111-1111-4111-8111-111111111111')[0].content).toBe('持久化问题')
  })

  it('使用参数化 SQL，不执行消息内容中的 SQL 片段', () => {
    insertConversation(store, '11111111-1111-4111-8111-111111111111', 'demo', '2026-10-01T00:00:00.000Z')

    store.appendUserMessage(
      '11111111-1111-4111-8111-111111111111',
      "x'); DROP TABLE messages; --",
      '2026-10-01T00:00:01.000Z',
    )

    expect(store.listMessages('11111111-1111-4111-8111-111111111111')).toHaveLength(1)
  })
})

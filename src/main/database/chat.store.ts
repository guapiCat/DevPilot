import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { DEFAULT_CONVERSATION_TITLE, MAX_CONVERSATION_TITLE_LENGTH } from '@shared/constants/app'
import type { ChatMessage, ChatRole, Conversation } from '@shared/types/chat'

export interface ConversationRecord {
  id: string
  title: string
  repositoryId: string | null
  createdAt: string
  updatedAt: string
}

interface ConversationRow {
  id: string
  repository_id: string | null
  title: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: string
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    repositoryId: row.repository_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    role: row.role as ChatRole,
    content: row.content,
    createdAt: row.created_at
  }
}

function buildTitle(content: string): string {
  const normalized = content.replace(/\s+/g, ' ').trim()
  if (!normalized) return DEFAULT_CONVERSATION_TITLE
  return [...normalized].slice(0, MAX_CONVERSATION_TITLE_LENGTH).join('')
}

export class ChatStore {
  constructor(private readonly db: Database.Database) {}

  listConversations(): Conversation[] {
    const rows = this.db
      .prepare<[], ConversationRow>(
        `SELECT id, repository_id, title, created_at, updated_at
         FROM conversations
         ORDER BY updated_at DESC, rowid DESC`
      )
      .all()

    return rows.map(toConversation)
  }

  findConversation(id: string): Conversation | undefined {
    const row = this.db
      .prepare<[string], ConversationRow>(
        `SELECT id, repository_id, title, created_at, updated_at
         FROM conversations
         WHERE id = ?`
      )
      .get(id)

    return row ? toConversation(row) : undefined
  }

  insertConversation(record: ConversationRecord): Conversation {
    this.db
      .prepare<[string, string | null, string, string, string]>(
        `INSERT INTO conversations (id, repository_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(record.id, record.repositoryId, record.title, record.createdAt, record.updatedAt)

    return {
      id: record.id,
      title: record.title,
      repositoryId: record.repositoryId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    }
  }

  listMessages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare<[string], MessageRow>(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at, rowid`
      )
      .all(conversationId)

    return rows.map(toMessage)
  }

  listRecentMessages(conversationId: string, limit: number): ChatMessage[] {
    const rows = this.db
      .prepare<[string, number], MessageRow>(
        `SELECT id, conversation_id, role, content, created_at
         FROM messages
         WHERE conversation_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?`
      )
      .all(conversationId, limit)

    return rows.reverse().map(toMessage)
  }

  appendUserMessage(conversationId: string, content: string, createdAt: string): ChatMessage {
    return this.db.transaction(() => {
      const { count } = this.db
        .prepare<[string], { count: number }>(
          `SELECT COUNT(*) AS count FROM messages
           WHERE conversation_id = ? AND role = 'user'`
        )
        .get(conversationId) ?? { count: 0 }

      if (count === 0) {
        this.db
          .prepare<[string, string]>('UPDATE conversations SET title = ? WHERE id = ?')
          .run(buildTitle(content), conversationId)
      }

      return this.insertMessage(conversationId, 'user', content, createdAt)
    })()
  }

  appendAssistantMessage(conversationId: string, content: string, createdAt: string): ChatMessage {
    return this.insertMessage(conversationId, 'assistant', content, createdAt)
  }

  private insertMessage(
    conversationId: string,
    role: ChatRole,
    content: string,
    createdAt: string
  ): ChatMessage {
    const message: ChatMessage = {
      id: randomUUID(),
      role,
      content,
      createdAt
    }

    this.db
      .prepare<[string, string, string, string, string]>(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(message.id, conversationId, role, content, createdAt)

    this.db
      .prepare<[string, string]>('UPDATE conversations SET updated_at = ? WHERE id = ?')
      .run(createdAt, conversationId)

    return message
  }
}

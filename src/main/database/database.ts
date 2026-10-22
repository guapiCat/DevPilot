import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export const DATABASE_FILE_NAME = 'devpilot.db'

type Migration = (db: Database.Database) => void

// 每个迁移只追加到数组末尾，已发布的迁移不得修改；user_version 记录当前版本。
const MIGRATIONS: readonly Migration[] = [
  (db) => {
    db.exec(`
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_repositories_updated_at ON repositories(updated_at DESC);

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_conversations_repository
        ON conversations(repository_id, updated_at DESC);

      CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

      CREATE TABLE edit_sessions (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_edit_sessions_conversation
        ON edit_sessions(conversation_id, updated_at DESC);

      CREATE INDEX idx_edit_sessions_repository
        ON edit_sessions(repository_id, updated_at DESC);

      CREATE TABLE file_edits (
        id TEXT PRIMARY KEY,
        edit_session_id TEXT NOT NULL REFERENCES edit_sessions(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        operation TEXT NOT NULL,
        original_content TEXT,
        proposed_content TEXT NOT NULL,
        original_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_file_edits_session ON file_edits(edit_session_id);
    `)
  },
  (db) => {
    // v2：为 assistant 消息保存工具调用摘要，供重新加载后展示；不保存工具输出正文。
    db.exec('ALTER TABLE messages ADD COLUMN tool_calls TEXT;')
  }
]

export const SCHEMA_VERSION = MIGRATIONS.length

function migrate(db: Database.Database): void {
  const current = db.pragma('user_version', { simple: true }) as number

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    db.transaction(() => {
      MIGRATIONS[version](db)
      db.pragma(`user_version = ${version + 1}`)
    })()
  }
}

export function openDatabase(directory: string, fileName = DATABASE_FILE_NAME): Database.Database {
  mkdirSync(directory, { recursive: true })

  const db = new Database(join(directory, fileName))
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    db.pragma('busy_timeout = 5000')
    migrate(db)
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

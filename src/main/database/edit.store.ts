import type Database from 'better-sqlite3'
import type { EditSession, EditSessionStatus, FileEdit, FileEditOperation, FileEditStatus } from '@shared/types/edit'

export interface EditSessionRow {
  id: string
  conversation_id: string | null
  repository_id: string
  status: string
  created_at: string
  updated_at: string
}

export interface FileEditRow {
  id: string
  edit_session_id: string
  relative_path: string
  operation: string
  original_content: string | null
  proposed_content: string
  original_hash: string
  status: string
  created_at: string
  updated_at: string
}

export interface EditSessionRecord {
  id: string
  conversationId: string | null
  repositoryId: string
  status: EditSessionStatus
  createdAt: string
  updatedAt: string
}

export interface FileEditRecord {
  id: string
  editSessionId: string
  relativePath: string
  operation: FileEditOperation
  originalContent: string | null
  proposedContent: string
  originalHash: string
  status: FileEditStatus
  createdAt: string
  updatedAt: string
}

function toFileEdit(row: FileEditRow): FileEdit {
  return {
    id: row.id,
    editSessionId: row.edit_session_id,
    relativePath: row.relative_path,
    operation: row.operation as FileEditOperation,
    status: row.status as FileEditStatus,
    originalContent: row.original_content,
    proposedContent: row.proposed_content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class EditStore {
  constructor(private readonly db: Database.Database) {}

  insertSession(record: EditSessionRecord): void {
    this.db
      .prepare<[string, string | null, string, string, string, string]>(
        `INSERT INTO edit_sessions (id, conversation_id, repository_id, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.conversationId, record.repositoryId, record.status, record.createdAt, record.updatedAt)
  }

  findSession(id: string): EditSessionRow | undefined {
    return this.db
      .prepare<[string], EditSessionRow>(
        `SELECT id, conversation_id, repository_id, status, created_at, updated_at
         FROM edit_sessions
         WHERE id = ?`,
      )
      .get(id)
  }

  listOpenSessions(conversationId: string): EditSession[] {
    const sessions = this.db
      .prepare<[string], EditSessionRow>(
        `SELECT s.id, s.conversation_id, s.repository_id, s.status, s.created_at, s.updated_at
         FROM edit_sessions s
         WHERE s.conversation_id = ?
           AND s.status = 'active'
           AND EXISTS (
             SELECT 1 FROM file_edits f
             WHERE f.edit_session_id = s.id AND f.status IN ('proposed', 'stale')
           )
         ORDER BY s.updated_at DESC, s.rowid DESC`,
      )
      .all(conversationId)

    return sessions.map((session) => ({
      id: session.id,
      conversationId: session.conversation_id,
      repositoryId: session.repository_id,
      status: session.status as EditSessionStatus,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      files: this.listFileEdits(session.id)
        .filter((file) => file.status === 'proposed' || file.status === 'stale')
        .map(toFileEdit),
    }))
  }

  listFileEdits(editSessionId: string): FileEditRow[] {
    return this.db
      .prepare<[string], FileEditRow>(
        `SELECT id, edit_session_id, relative_path, operation, original_content,
                proposed_content, original_hash, status, created_at, updated_at
         FROM file_edits
         WHERE edit_session_id = ?
         ORDER BY created_at, rowid`,
      )
      .all(editSessionId)
  }

  findFileEdit(id: string): FileEditRow | undefined {
    return this.db
      .prepare<[string], FileEditRow>(
        `SELECT id, edit_session_id, relative_path, operation, original_content,
                proposed_content, original_hash, status, created_at, updated_at
         FROM file_edits
         WHERE id = ?`,
      )
      .get(id)
  }

  findActiveFileEditByPath(editSessionId: string, relativePath: string): FileEditRow | undefined {
    return this.db
      .prepare<[string, string], FileEditRow>(
        `SELECT id, edit_session_id, relative_path, operation, original_content,
                proposed_content, original_hash, status, created_at, updated_at
         FROM file_edits
         WHERE edit_session_id = ? AND relative_path = ? COLLATE NOCASE
           AND status IN ('proposed', 'stale', 'applied')
         LIMIT 1`,
      )
      .get(editSessionId, relativePath)
  }

  countFileEdits(editSessionId: string): number {
    const row = this.db
      .prepare<[string], { count: number }>('SELECT COUNT(*) AS count FROM file_edits WHERE edit_session_id = ?')
      .get(editSessionId)

    return row?.count ?? 0
  }

  insertFileEdit(record: FileEditRecord): void {
    this.db
      .prepare<[string, string, string, string, string | null, string, string, string, string, string]>(
        `INSERT INTO file_edits (
           id, edit_session_id, relative_path, operation, original_content,
           proposed_content, original_hash, status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.editSessionId,
        record.relativePath,
        record.operation,
        record.originalContent,
        record.proposedContent,
        record.originalHash,
        record.status,
        record.createdAt,
        record.updatedAt,
      )
  }

  updateFileEditStatus(id: string, status: FileEditStatus, updatedAt: string): void {
    this.db
      .prepare<[string, string, string]>('UPDATE file_edits SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, updatedAt, id)
  }

  updateSessionStatus(id: string, status: EditSessionStatus, updatedAt: string): void {
    this.db
      .prepare<[string, string, string]>('UPDATE edit_sessions SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, updatedAt, id)
  }

  touchSession(id: string, updatedAt: string): void {
    this.db.prepare<[string, string]>('UPDATE edit_sessions SET updated_at = ? WHERE id = ?').run(updatedAt, id)
  }
}

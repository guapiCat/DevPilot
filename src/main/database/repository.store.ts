import type Database from 'better-sqlite3'

export interface RepositoryRecord {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
}

interface RepositoryRow {
  id: string
  name: string
  path: string
  created_at: string
  updated_at: string
}

function toRecord(row: RepositoryRow): RepositoryRecord {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class RepositoryStore {
  constructor(private readonly db: Database.Database) {}

  list(): RepositoryRecord[] {
    const rows = this.db
      .prepare<[], RepositoryRow>(
        'SELECT id, name, path, created_at, updated_at FROM repositories ORDER BY updated_at DESC',
      )
      .all()

    return rows.map(toRecord)
  }

  findByPath(path: string): RepositoryRecord | undefined {
    const row = this.db
      .prepare<[string], RepositoryRow>(
        `SELECT id, name, path, created_at, updated_at
         FROM repositories
         WHERE path = ? COLLATE NOCASE`,
      )
      .get(path)

    return row ? toRecord(row) : undefined
  }

  insert(record: RepositoryRecord): void {
    this.db
      .prepare<[string, string, string, string, string]>(
        `INSERT INTO repositories (id, name, path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.name, record.path, record.createdAt, record.updatedAt)
  }

  touch(id: string, updatedAt: string): void {
    this.db.prepare<[string, string]>('UPDATE repositories SET updated_at = ? WHERE id = ?').run(updatedAt, id)
  }

  delete(id: string): void {
    this.db.prepare<[string]>('DELETE FROM repositories WHERE id = ?').run(id)
  }
}

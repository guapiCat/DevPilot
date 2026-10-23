import type Database from 'better-sqlite3'
import type { ModelProviderKind } from '@shared/types/model'

export interface ModelProfileRecord {
  id: string
  name: string
  provider: ModelProviderKind
  baseUrl: string
  model: string
  apiKeyCipher: string | null
  toolsEnabled: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ModelProfileRow {
  id: string
  name: string
  provider: string
  base_url: string
  model: string
  api_key_cipher: string | null
  tools_enabled: number
  is_active: number
  created_at: string
  updated_at: string
}

const COLUMNS = `id, name, provider, base_url, model, api_key_cipher, tools_enabled, is_active, created_at, updated_at`

function toRecord(row: ModelProfileRow): ModelProfileRecord {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider as ModelProviderKind,
    baseUrl: row.base_url,
    model: row.model,
    apiKeyCipher: row.api_key_cipher,
    toolsEnabled: row.tools_enabled === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ModelProfileStore {
  constructor(private readonly db: Database.Database) {}

  count(): number {
    const row = this.db
      .prepare<[], { total: number }>('SELECT COUNT(*) AS total FROM model_profiles')
      .get()
    return row?.total ?? 0
  }

  list(): ModelProfileRecord[] {
    const rows = this.db
      .prepare<[], ModelProfileRow>(
        `SELECT ${COLUMNS}
         FROM model_profiles
         ORDER BY is_active DESC, updated_at DESC, rowid DESC`
      )
      .all()

    return rows.map(toRecord)
  }

  findById(id: string): ModelProfileRecord | undefined {
    const row = this.db
      .prepare<[string], ModelProfileRow>(`SELECT ${COLUMNS} FROM model_profiles WHERE id = ?`)
      .get(id)

    return row ? toRecord(row) : undefined
  }

  getActive(): ModelProfileRecord | undefined {
    const row = this.db
      .prepare<[], ModelProfileRow>(
        `SELECT ${COLUMNS} FROM model_profiles WHERE is_active = 1 LIMIT 1`
      )
      .get()

    return row ? toRecord(row) : undefined
  }

  insert(record: ModelProfileRecord): void {
    this.db.transaction(() => {
      if (record.isActive) this.deactivateAll()
      this.db
        .prepare<
          [string, string, string, string, string, string | null, number, number, string, string]
        >(
          `INSERT INTO model_profiles
             (id, name, provider, base_url, model, api_key_cipher, tools_enabled, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.name,
          record.provider,
          record.baseUrl,
          record.model,
          record.apiKeyCipher,
          record.toolsEnabled ? 1 : 0,
          record.isActive ? 1 : 0,
          record.createdAt,
          record.updatedAt
        )
    })()
  }

  update(record: ModelProfileRecord): void {
    this.db
      .prepare<[string, string, string, string, string | null, number, string, string]>(
        `UPDATE model_profiles
         SET name = ?, provider = ?, base_url = ?, model = ?, api_key_cipher = ?,
             tools_enabled = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        record.name,
        record.provider,
        record.baseUrl,
        record.model,
        record.apiKeyCipher,
        record.toolsEnabled ? 1 : 0,
        record.updatedAt,
        record.id
      )
  }

  remove(id: string): void {
    this.db.transaction(() => {
      const existing = this.findById(id)
      this.db.prepare<[string]>('DELETE FROM model_profiles WHERE id = ?').run(id)

      if (existing?.isActive) {
        const next = this.latest()
        if (next) this.activate(next.id)
      }
    })()
  }

  setActive(id: string): void {
    this.db.transaction(() => {
      this.deactivateAll()
      this.activate(id)
    })()
  }

  activateLatestIfNone(): void {
    this.db.transaction(() => {
      if (this.getActive()) return
      const next = this.latest()
      if (next) this.activate(next.id)
    })()
  }

  private latest(): ModelProfileRecord | undefined {
    const row = this.db
      .prepare<[], ModelProfileRow>(
        `SELECT ${COLUMNS}
         FROM model_profiles
         ORDER BY updated_at DESC, rowid DESC
         LIMIT 1`
      )
      .get()

    return row ? toRecord(row) : undefined
  }

  private deactivateAll(): void {
    this.db.prepare<[], never>('UPDATE model_profiles SET is_active = 0 WHERE is_active = 1').run()
  }

  private activate(id: string): void {
    this.db.prepare<[string]>('UPDATE model_profiles SET is_active = 1 WHERE id = ?').run(id)
  }
}

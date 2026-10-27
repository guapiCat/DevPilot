import { randomUUID } from 'node:crypto'
import { MAX_EDIT_FILES_PER_SESSION, MAX_FILE_WRITE_BYTES } from '@shared/constants/app'
import type { ApplyFileEditResult, EditSession, FileEdit, FileEditOperation, FileEditStatus } from '@shared/types/edit'
import type { FileContent, FileWriteResult } from '@shared/types/repository'
import type { EditStore, FileEditRow } from '../database/edit.store'
import { isSensitivePath } from '../ai/tools/sensitive'
import { ServiceError } from '../utils/service-error'
import { fileService, type FileService } from './file.service'
import { repositoryService, type RepositoryService } from './repository.service'

export interface ProposeFileEditInput {
  repositoryId: string
  conversationId: string
  runId: string
  relativePath: string
  operation: FileEditOperation
  oldText?: string
  newText?: string
  content?: string
}

export interface ProposeFileEditResult {
  editSessionId: string
  fileEditId: string
  file: FileEdit
}

interface RowsToView {
  id: string
  edit_session_id: string
  relative_path: string
  operation: string
  original_content: string | null
  proposed_content: string
  status: string
  created_at: string
  updated_at: string
}

const MAX_REMEMBERED_RUNS = 200

function toFileEditView(row: RowsToView): FileEdit {
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

function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = 0

  while (index <= haystack.length) {
    const found = haystack.indexOf(needle, index)
    if (found === -1) break
    count += 1
    index = found + needle.length
  }

  return count
}

function assertWritableContent(content: string): void {
  if (content.includes('\0')) {
    throw new ServiceError('UNSUPPORTED_FILE', '文件内容不能包含空字符')
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_WRITE_BYTES) {
    throw new ServiceError('FILE_TOO_LARGE', '建议内容超过 1 MB 写入上限')
  }
}

export class EditService {
  private store: EditStore | null = null
  private readonly sessionsByRun = new Map<string, string>()

  constructor(
    private readonly repositories: RepositoryService = repositoryService,
    private readonly files: FileService = fileService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  initialize(store: EditStore | null): void {
    this.store = store
    this.sessionsByRun.clear()
  }

  async propose(input: ProposeFileEditInput): Promise<ProposeFileEditResult> {
    const store = this.requireStore()
    const relativePath = input.relativePath.trim()

    if (!relativePath || isSensitivePath(relativePath)) {
      throw new ServiceError('PATH_NOT_ALLOWED', '该文件被识别为敏感文件，禁止修改')
    }

    let originalContent: string | null = null
    let originalHash = ''
    let proposedContent: string

    if (input.operation === 'modify') {
      const { oldText, newText } = input
      if (!oldText || newText === undefined) {
        throw new ServiceError('VALIDATION_ERROR', '修改文件需要同时提供 oldText 与 newText')
      }

      let file: FileContent
      try {
        file = await this.files.read(input.repositoryId, relativePath)
      } catch (error) {
        throw this.mapFileError(error)
      }

      const occurrences = countOccurrences(file.content, oldText)
      if (occurrences === 0) {
        throw new ServiceError('EDIT_CONFLICT', 'oldText 在文件中未找到，请先读取文件并提供完全一致的片段')
      }
      if (occurrences > 1) {
        throw new ServiceError('EDIT_CONFLICT', `oldText 在文件中出现 ${occurrences} 次，请提供更长且唯一的片段`)
      }

      const start = file.content.indexOf(oldText)
      proposedContent = file.content.slice(0, start) + newText + file.content.slice(start + oldText.length)
      if (proposedContent === file.content) {
        throw new ServiceError('EDIT_CONFLICT', '建议内容与当前文件相同')
      }

      originalContent = file.content
      originalHash = file.hash
    } else {
      if (input.content === undefined) {
        throw new ServiceError('VALIDATION_ERROR', '新建文件需要提供 content')
      }

      try {
        await this.repositories.resolveNewFilePath(input.repositoryId, relativePath)
      } catch (error) {
        throw this.mapFileError(error)
      }

      proposedContent = input.content
    }

    assertWritableContent(proposedContent)

    const sessionId = this.resolveSession(input)
    if (store.countFileEdits(sessionId) >= MAX_EDIT_FILES_PER_SESSION) {
      throw new ServiceError('EDIT_CONFLICT', `本次修改建议已达到 ${MAX_EDIT_FILES_PER_SESSION} 个文件上限`)
    }

    const duplicate = store.findActiveFileEditByPath(sessionId, relativePath)
    if (duplicate) {
      throw new ServiceError('EDIT_CONFLICT', '该文件已有待审核的修改建议，请在同一个 oldText/newText 中合并所有改动')
    }

    const timestamp = this.now().toISOString()
    const fileEdit: FileEdit = {
      id: randomUUID(),
      editSessionId: sessionId,
      relativePath,
      operation: input.operation,
      status: 'proposed',
      originalContent,
      proposedContent,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    store.insertFileEdit({
      id: fileEdit.id,
      editSessionId: sessionId,
      relativePath,
      operation: input.operation,
      originalContent,
      proposedContent,
      originalHash,
      status: 'proposed',
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    store.touchSession(sessionId, timestamp)

    return { editSessionId: sessionId, fileEditId: fileEdit.id, file: fileEdit }
  }

  listPendingSessions(conversationId: string): EditSession[] {
    return this.requireStore().listOpenSessions(conversationId)
  }

  getSession(editSessionId: string): EditSession {
    const store = this.requireStore()
    const session = store.findSession(editSessionId)
    if (!session) {
      throw new ServiceError('EDIT_NOT_FOUND', '修改建议不存在或已清理')
    }

    return {
      id: session.id,
      conversationId: session.conversation_id,
      repositoryId: session.repository_id,
      status: session.status as EditSession['status'],
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      files: store.listFileEdits(session.id).map(toFileEditView),
    }
  }

  async applyFile(editSessionId: string, fileEditId: string): Promise<ApplyFileEditResult> {
    const store = this.requireStore()
    const { session, file } = this.requirePendingFile(editSessionId, fileEditId)

    let write: FileWriteResult
    try {
      write =
        file.operation === 'create'
          ? await this.files.writeNew(session.repository_id, file.relative_path, file.proposed_content)
          : await this.files.write(session.repository_id, file.relative_path, file.proposed_content, file.original_hash)
    } catch (error) {
      if (this.isStaleError(error)) {
        this.markFileStatus(editSessionId, fileEditId, 'stale')
        throw new ServiceError('FILE_CHANGED', '文件已在磁盘上被外部修改，建议已标记为过期，请重新生成')
      }
      this.markFileStatus(editSessionId, fileEditId, 'failed')
      throw error
    }

    const updatedAt = this.now().toISOString()
    store.updateFileEditStatus(fileEditId, 'applied', updatedAt)
    this.settleSession(editSessionId, updatedAt)

    return {
      file: { ...toFileEditView(file), status: 'applied', updatedAt },
      hash: write.hash,
      size: write.size,
      hadBom: write.hadBom,
    }
  }

  rejectFile(editSessionId: string, fileEditId: string): FileEdit {
    const store = this.requireStore()
    const { file } = this.requirePendingFile(editSessionId, fileEditId)
    const updatedAt = this.now().toISOString()

    store.updateFileEditStatus(fileEditId, 'rejected', updatedAt)
    this.settleSession(editSessionId, updatedAt)

    return { ...toFileEditView(file), status: 'rejected', updatedAt }
  }

  private resolveSession(input: ProposeFileEditInput): string {
    const store = this.requireStore()
    const key = `${input.conversationId}:${input.runId}`
    const existing = this.sessionsByRun.get(key)
    if (existing && store.findSession(existing)) return existing

    const timestamp = this.now().toISOString()
    const id = randomUUID()
    store.insertSession({
      id,
      conversationId: input.conversationId,
      repositoryId: input.repositoryId,
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    this.sessionsByRun.set(key, id)
    if (this.sessionsByRun.size > MAX_REMEMBERED_RUNS) {
      const oldest = this.sessionsByRun.keys().next().value
      if (oldest) this.sessionsByRun.delete(oldest)
    }

    return id
  }

  private requirePendingFile(
    editSessionId: string,
    fileEditId: string,
  ): { session: NonNullable<ReturnType<EditStore['findSession']>>; file: FileEditRow } {
    const store = this.requireStore()
    const session = store.findSession(editSessionId)
    if (!session) {
      throw new ServiceError('EDIT_NOT_FOUND', '修改建议不存在或已清理')
    }

    const file = store.findFileEdit(fileEditId)
    if (!file || file.edit_session_id !== editSessionId) {
      throw new ServiceError('EDIT_NOT_FOUND', '文件修改建议不存在或已清理')
    }
    if (file.status !== 'proposed') {
      throw new ServiceError('EDIT_CONFLICT', '该修改建议已处理，请刷新后查看最新状态')
    }

    return { session, file }
  }

  private markFileStatus(editSessionId: string, fileEditId: string, status: FileEditStatus): void {
    const timestamp = this.now().toISOString()
    this.requireStore().updateFileEditStatus(fileEditId, status, timestamp)
    this.requireStore().touchSession(editSessionId, timestamp)
  }

  private settleSession(editSessionId: string, updatedAt: string): void {
    const store = this.requireStore()
    const hasPending = store
      .listFileEdits(editSessionId)
      .some((file) => file.status === 'proposed' || file.status === 'stale')

    store.updateSessionStatus(editSessionId, hasPending ? 'active' : 'completed', updatedAt)
  }

  private isStaleError(error: unknown): boolean {
    return error instanceof ServiceError && (error.code === 'FILE_CHANGED' || error.code === 'FILE_ALREADY_EXISTS')
  }

  private mapFileError(error: unknown): ServiceError {
    if (error instanceof ServiceError) return error
    return new ServiceError('INTERNAL_ERROR', '读取文件失败，请稍后重试')
  }

  private requireStore(): EditStore {
    if (!this.store) {
      throw new ServiceError('DATABASE_ERROR', '数据库不可用，无法保存修改建议')
    }
    return this.store
  }
}

export const editService = new EditService()

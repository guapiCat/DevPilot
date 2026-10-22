export type FileEditOperation = 'modify' | 'create'

export type FileEditStatus = 'proposed' | 'applied' | 'rejected' | 'stale' | 'failed'

export type EditSessionStatus = 'active' | 'completed'

export interface FileEdit {
  id: string
  editSessionId: string
  relativePath: string
  operation: FileEditOperation
  status: FileEditStatus
  originalContent: string | null
  proposedContent: string
  createdAt: string
  updatedAt: string
}

export interface EditSession {
  id: string
  conversationId: string | null
  repositoryId: string
  status: EditSessionStatus
  createdAt: string
  updatedAt: string
  files: FileEdit[]
}

export interface ApplyFileEditResult {
  file: FileEdit
  hash: string
  size: number
  hadBom: boolean
}

export interface AppliedFileEdit {
  relativePath: string
  operation: FileEditOperation
  hash: string
  size: number
  hadBom: boolean
}

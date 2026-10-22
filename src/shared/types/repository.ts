export interface RepositorySummary {
  id: string
  name: string
  path: string
  isGitRepository: boolean
  createdAt: string
  updatedAt: string
}

export interface FileTreeNode {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export interface FileTreeResult {
  repositoryId: string
  nodes: FileTreeNode[]
  truncated: boolean
}

export interface FileContent {
  repositoryId: string
  relativePath: string
  content: string
  size: number
  encoding: 'utf-8'
  hadBom: boolean
  hash: string
}

export interface FileWriteResult {
  repositoryId: string
  relativePath: string
  size: number
  hadBom: boolean
  hash: string
}

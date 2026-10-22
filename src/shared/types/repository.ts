export interface RepositorySummary {
  id: string
  name: string
  path: string
  createdAt: string
  updatedAt: string
}

export interface FileTreeNode {
  name: string
  relativePath: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

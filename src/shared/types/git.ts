export type GitFileStatus =
  'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'unknown'

export interface GitFileChange {
  relativePath: string
  oldRelativePath?: string
  status: GitFileStatus
  staged: boolean
  indexCode: string
  worktreeCode: string
}

export interface GitStatus {
  repositoryId: string
  branch: string | null
  changes: GitFileChange[]
  truncated: boolean
}

export interface GitDiffResult {
  repositoryId: string
  relativePath: string
  diff: string
  truncated: boolean
}

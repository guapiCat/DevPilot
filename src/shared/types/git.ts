export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted' | 'unknown'

export type GitHeadState = 'attached' | 'detached' | 'unborn'

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
  headState: GitHeadState
  changes: GitFileChange[]
  truncated: boolean
}

export interface GitDiffResult {
  repositoryId: string
  relativePath: string
  diff: string
  truncated: boolean
}

export interface GitBranch {
  name: string
  current: boolean
  commit: string | null
  upstream: string | null
  subject: string | null
  updatedAt: string | null
}

export interface GitBranchList {
  repositoryId: string
  current: string | null
  branches: GitBranch[]
  truncated: boolean
}

export interface GitLogEntry {
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  authorTime: number
  subject: string
  body: string
}

export interface GitLogResult {
  repositoryId: string
  entries: GitLogEntry[]
  hasMore: boolean
  truncated: boolean
}

export interface GitCommitFileChange {
  relativePath: string
  oldRelativePath?: string
  status: GitFileStatus
}

export interface GitCommitDetail {
  repositoryId: string
  sha: string
  shortSha: string
  authorName: string
  authorEmail: string
  authorTime: number
  subject: string
  body: string
  files: GitCommitFileChange[]
  diff: string
  truncated: boolean
}

export interface GitCommitResult {
  repositoryId: string
  sha: string
  shortSha: string
}

export interface GitRemoteStatus {
  repositoryId: string
  remotes: string[]
  upstream: string | null
  remoteName: string | null
  remoteBranch: string | null
  ahead: number
  behind: number
}

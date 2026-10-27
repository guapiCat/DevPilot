import type { ErrorCode } from '@shared/types/ipc'

interface GitFailure {
  code: ErrorCode
  message: string
}

const MESSAGES: Partial<Record<ErrorCode, string>> = {
  NOT_A_GIT_REPOSITORY: '当前目录不是可用的 Git 仓库',
  GIT_INDEX_LOCKED: 'Git 索引被其他进程占用，请稍后重试',
  GIT_IDENTITY_MISSING: '未配置 Git 用户信息，请先设置 user.name 和 user.email',
  GIT_NOTHING_TO_COMMIT: '没有已暂存的变更可提交',
  GIT_BRANCH_IN_USE: '该分支已被其他工作区检出，请先在对应工作区切换',
  GIT_BRANCH_EXISTS: '分支已存在，请换一个名称',
  GIT_WORKTREE_DIRTY: '工作区存在会被覆盖的变更，Git 拒绝执行该操作',
  GIT_CONFLICT: '存在未解决的冲突，请先处理冲突',
  GIT_NON_FAST_FORWARD: '远端包含新的提交，请先拉取后再推送',
  GIT_AUTH_REQUIRED: '远端鉴权失败，请先在系统凭据管理器中配置访问凭据',
  GIT_NETWORK_ERROR: '无法连接远端仓库，请检查网络后重试',
  GIT_NO_UPSTREAM: '当前分支没有可用的上游分支',
  GIT_NO_REMOTE: '当前仓库未配置可用的远端',
  GIT_HOOK_FAILED: 'Git 钩子执行失败，请检查提交或推送内容',
  GIT_REMOTE_REJECTED: '远端拒绝了本次操作',
  GIT_COMMIT_NOT_FOUND: '未找到指定的提交',
  GIT_BRANCH_NOT_FOUND: '分支不存在或不可用',
  GIT_COMMAND_FAILED: 'Git 操作失败，请确认仓库状态后重试',
}

const RULES: Array<{ pattern: RegExp; code: ErrorCode }> = [
  { pattern: /not a git repository/i, code: 'NOT_A_GIT_REPOSITORY' },
  {
    pattern: /index\.lock|another git process seems to be running|could not lock config file/i,
    code: 'GIT_INDEX_LOCKED',
  },
  {
    pattern: /author identity unknown|please tell me who you are|unable to auto-detect email address/i,
    code: 'GIT_IDENTITY_MISSING',
  },
  {
    pattern: /nothing to commit|no changes added to commit|nothing added to commit/i,
    code: 'GIT_NOTHING_TO_COMMIT',
  },
  { pattern: /already checked out at|is already checked out/i, code: 'GIT_BRANCH_IN_USE' },
  { pattern: /a branch named .* already exists|branch .* already exists/i, code: 'GIT_BRANCH_EXISTS' },
  {
    pattern:
      /local changes.*would be overwritten|would be overwritten by|please commit your changes or stash them|not possible to checkout/i,
    code: 'GIT_WORKTREE_DIRTY',
  },
  {
    pattern: /automatic merge failed|fix conflicts|unmerged|conflict \(content\)/i,
    code: 'GIT_CONFLICT',
  },
  {
    pattern:
      /non-fast-forward|not possible to fast-forward|fetch first|updates were rejected because the remote contains work|tip of your current branch is behind/i,
    code: 'GIT_NON_FAST_FORWARD',
  },
  {
    pattern:
      /authentication failed|could not read username|terminal prompts disabled|permission denied \(publickey\)|invalid username or password|access denied|http 401|http 403/i,
    code: 'GIT_AUTH_REQUIRED',
  },
  {
    pattern:
      /could not resolve host|failed to connect|connection timed out|connection refused|network is unreachable|ssl certificate problem|rpc failed|early eof|unable to access/i,
    code: 'GIT_NETWORK_ERROR',
  },
  {
    pattern: /no upstream branch|no tracking information for the current branch|has no upstream/i,
    code: 'GIT_NO_UPSTREAM',
  },
  {
    pattern:
      /no remote repository specified|no configured push destination|no configured remote|does not appear to be a git repository|no such remote/i,
    code: 'GIT_NO_REMOTE',
  },
  { pattern: /hook declined|pre-commit|commit-msg|pre-push|hook .* failed/i, code: 'GIT_HOOK_FAILED' },
  { pattern: /remote rejected|\[remote rejected\]/i, code: 'GIT_REMOTE_REJECTED' },
  {
    pattern: /unknown revision|bad revision|bad object|not a valid object name|invalid object name/i,
    code: 'GIT_COMMIT_NOT_FOUND',
  },
  {
    pattern: /invalid reference|did not match any file\(s\) known to git|no such branch/i,
    code: 'GIT_BRANCH_NOT_FOUND',
  },
]

export function classifyGitFailure(stderr: string): GitFailure {
  for (const rule of RULES) {
    if (rule.pattern.test(stderr)) {
      return {
        code: rule.code,
        message: MESSAGES[rule.code] ?? MESSAGES.GIT_COMMAND_FAILED!,
      }
    }
  }

  return {
    code: 'GIT_COMMAND_FAILED',
    message: MESSAGES.GIT_COMMAND_FAILED!,
  }
}

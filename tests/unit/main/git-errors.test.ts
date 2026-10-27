import { describe, expect, it } from 'vitest'
import { classifyGitFailure } from '@main/services/git-errors'

describe('classifyGitFailure', () => {
  const cases: Array<[string, string]> = [
    ['fatal: not a git repository (or any of the parent directories): .git', 'NOT_A_GIT_REPOSITORY'],
    ['fatal: Unable to create index.lock: File exists', 'GIT_INDEX_LOCKED'],
    ['*** Please tell me who you are.', 'GIT_IDENTITY_MISSING'],
    ['no changes added to commit (use "git add")', 'GIT_NOTHING_TO_COMMIT'],
    ["fatal: 'feature' is already checked out at '/tmp/wt'", 'GIT_BRANCH_IN_USE'],
    ["fatal: a branch named 'feature' already exists", 'GIT_BRANCH_EXISTS'],
    ['error: Your local changes to the following files would be overwritten by merge', 'GIT_WORKTREE_DIRTY'],
    ['error: Automatic merge failed; fix conflicts and then commit the result.', 'GIT_CONFLICT'],
    ['! [rejected] main -> main (fetch first)', 'GIT_NON_FAST_FORWARD'],
    ["fatal: Authentication failed for 'https://example.com/repo.git/'", 'GIT_AUTH_REQUIRED'],
    ['fatal: unable to access: Could not resolve host: example.com', 'GIT_NETWORK_ERROR'],
    ['fatal: The current branch main has no upstream branch.', 'GIT_NO_UPSTREAM'],
    ['fatal: No configured push destination.', 'GIT_NO_REMOTE'],
    ['husky - pre-commit hook exited with code 1', 'GIT_HOOK_FAILED'],
    ['! [remote rejected] main -> main (protected branch rules)', 'GIT_REMOTE_REJECTED'],
    ['fatal: bad object 0000000', 'GIT_COMMIT_NOT_FOUND'],
    ['fatal: invalid reference: nope', 'GIT_BRANCH_NOT_FOUND'],
    ['something unexpected happened', 'GIT_COMMAND_FAILED'],
  ]

  it.each(cases)('将 %s 映射为 %s', (stderr, code) => {
    expect(classifyGitFailure(stderr).code).toBe(code)
  })

  it('按优先级选择首个匹配规则', () => {
    expect(classifyGitFailure('fatal: not a git repository\nfatal: Unable to create index.lock').code).toBe(
      'NOT_A_GIT_REPOSITORY',
    )
  })

  it('未知错误使用固定兜底消息且不包含原始 stderr', () => {
    const result = classifyGitFailure('weird internal failure at C:\\secret\\path')
    expect(result.code).toBe('GIT_COMMAND_FAILED')
    expect(result.message).not.toContain('secret')
    expect(result.message).toBe('Git 操作失败，请确认仓库状态后重试')
  })

  it('所有已知错误返回固定的中文消息', () => {
    for (const [stderr, code] of cases) {
      const result = classifyGitFailure(stderr)
      expect(result.code).toBe(code)
      expect(result.message.length).toBeGreaterThan(0)
      expect(result.message).not.toContain(stderr)
    }
  })
})

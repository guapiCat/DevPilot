import { describe, expect, it } from 'vitest'
import {
  MAX_FILE_WRITE_BYTES,
  MAX_GIT_BRANCH_NAME_LENGTH,
  MAX_GIT_COMMIT_MESSAGE_LENGTH,
  MAX_GIT_LOG_ENTRIES,
  MAX_GIT_PATHSPEC_CHARS,
  MAX_GIT_STAGE_PATHS,
  MAX_PING_MESSAGE_LENGTH,
} from '@shared/constants/app'
import {
  fileWriteInputSchema,
  gitCommitDetailInputSchema,
  gitCommitInputSchema,
  gitCreateBranchInputSchema,
  gitDiffInputSchema,
  gitLogInputSchema,
  gitPathsInputSchema,
  gitSwitchBranchInputSchema,
  pingInputSchema,
} from '@shared/schemas/ipc'

const REPOSITORY_ID = '00000000-0000-4000-8000-000000000000'

describe('pingInputSchema', () => {
  it('接受合法消息并去除首尾空白', () => {
    expect(pingInputSchema.parse({ message: '  hello  ' })).toEqual({ message: 'hello' })
  })

  it('拒绝空字符串', () => {
    expect(pingInputSchema.safeParse({ message: '   ' }).success).toBe(false)
  })

  it('拒绝超长消息', () => {
    const message = 'a'.repeat(MAX_PING_MESSAGE_LENGTH + 1)
    expect(pingInputSchema.safeParse({ message }).success).toBe(false)
  })

  it('拒绝非对象输入', () => {
    expect(pingInputSchema.safeParse('hello').success).toBe(false)
    expect(pingInputSchema.safeParse(null).success).toBe(false)
  })
})

describe('fileWriteInputSchema', () => {
  const validInput = {
    repositoryId: '00000000-0000-4000-8000-000000000000',
    relativePath: 'src/index.ts',
    content: 'export const value = 1\n',
    expectedHash: 'a'.repeat(64),
  }

  it('接受合法写入参数', () => {
    expect(fileWriteInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('拒绝非法仓库 ID 与哈希', () => {
    expect(fileWriteInputSchema.safeParse({ ...validInput, repositoryId: 'nope' }).success).toBe(false)
    expect(fileWriteInputSchema.safeParse({ ...validInput, expectedHash: 'abc' }).success).toBe(false)
    expect(fileWriteInputSchema.safeParse({ ...validInput, expectedHash: 'g'.repeat(64) }).success).toBe(false)
  })

  it('拒绝路径穿越与空路径', () => {
    for (const relativePath of ['../secret', '/abs/path', 'C:\\Windows\\win.ini', '   ']) {
      expect(fileWriteInputSchema.safeParse({ ...validInput, relativePath }).success).toBe(false)
    }
  })

  it('拒绝超长内容', () => {
    const content = 'a'.repeat(MAX_FILE_WRITE_BYTES + 1)
    expect(fileWriteInputSchema.safeParse({ ...validInput, content }).success).toBe(false)
  })
})

describe('gitDiffInputSchema', () => {
  const validInput = {
    repositoryId: '00000000-0000-4000-8000-000000000000',
    relativePath: 'src/index.ts',
  }

  it('接受合法 Diff 参数', () => {
    expect(gitDiffInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('拒绝非法仓库 ID', () => {
    expect(gitDiffInputSchema.safeParse({ ...validInput, repositoryId: 'nope' }).success).toBe(false)
  })

  it('拒绝路径穿越与空路径', () => {
    for (const relativePath of ['../secret', '/abs/path', 'C:\\Windows\\win.ini', '   ']) {
      expect(gitDiffInputSchema.safeParse({ ...validInput, relativePath }).success).toBe(false)
    }
  })
})

describe('gitPathsInputSchema', () => {
  it('接受全部操作或文件列表', () => {
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, all: true }).success).toBe(true)
    expect(
      gitPathsInputSchema.safeParse({
        repositoryId: REPOSITORY_ID,
        paths: ['src/a.ts', 'dir/file with space.txt'],
      }).success,
    ).toBe(true)
  })

  it('要求 all 与 paths 二选一', () => {
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID }).success).toBe(false)
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, all: false }).success).toBe(false)
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, all: true, paths: ['a.ts'] }).success).toBe(
      false,
    )
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, paths: [] }).success).toBe(false)
  })

  it('拒绝非法仓库 ID、不安全路径与超限输入', () => {
    expect(gitPathsInputSchema.safeParse({ repositoryId: 'nope', all: true }).success).toBe(false)
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, paths: [':magic'] }).success).toBe(false)
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, paths: ['../outside'] }).success).toBe(false)

    const tooMany = Array.from({ length: MAX_GIT_STAGE_PATHS + 1 }, (_, index) => `f${index}.ts`)
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, paths: tooMany }).success).toBe(false)

    const perPath = Math.ceil((MAX_GIT_PATHSPEC_CHARS + 1) / MAX_GIT_STAGE_PATHS) + 1
    const tooLong = Array.from({ length: MAX_GIT_STAGE_PATHS }, () => 'a'.repeat(perPath))
    expect(gitPathsInputSchema.safeParse({ repositoryId: REPOSITORY_ID, paths: tooLong }).success).toBe(false)
  })
})

describe('gitCommitInputSchema', () => {
  it('接受并去除提交信息首尾空白', () => {
    expect(gitCommitInputSchema.parse({ repositoryId: REPOSITORY_ID, message: '  fix: bug  ' }).message).toBe(
      'fix: bug',
    )
  })

  it('拒绝空、超长与含 NUL 的提交信息', () => {
    expect(gitCommitInputSchema.safeParse({ repositoryId: REPOSITORY_ID, message: '   ' }).success).toBe(false)
    expect(
      gitCommitInputSchema.safeParse({
        repositoryId: REPOSITORY_ID,
        message: 'a'.repeat(MAX_GIT_COMMIT_MESSAGE_LENGTH + 1),
      }).success,
    ).toBe(false)
    expect(gitCommitInputSchema.safeParse({ repositoryId: REPOSITORY_ID, message: 'a\0b' }).success).toBe(false)
  })
})

describe('gitCreateBranchInputSchema', () => {
  it('接受合法分支名与可选 checkout', () => {
    expect(gitCreateBranchInputSchema.safeParse({ repositoryId: REPOSITORY_ID, branchName: 'feature/x' }).success).toBe(
      true,
    )
    expect(
      gitCreateBranchInputSchema.safeParse({
        repositoryId: REPOSITORY_ID,
        branchName: 'feature/x',
        checkout: true,
      }).success,
    ).toBe(true)
  })

  it('拒绝非法分支名与超长名称', () => {
    for (const branchName of ['-foo', 'a..b', 'a b', 'HEAD', '@', 'x'.repeat(MAX_GIT_BRANCH_NAME_LENGTH + 1)]) {
      expect(
        gitCreateBranchInputSchema.safeParse({ repositoryId: REPOSITORY_ID, branchName }).success,
        branchName,
      ).toBe(false)
    }
  })
})

describe('gitSwitchBranchInputSchema', () => {
  it('接受合法分支名并拒绝非法值', () => {
    expect(gitSwitchBranchInputSchema.safeParse({ repositoryId: REPOSITORY_ID, branchName: 'main' }).success).toBe(true)
    expect(gitSwitchBranchInputSchema.safeParse({ repositoryId: REPOSITORY_ID, branchName: 'a~b' }).success).toBe(false)
  })
})

describe('gitLogInputSchema', () => {
  it('允许省略分页参数', () => {
    expect(gitLogInputSchema.safeParse({ repositoryId: REPOSITORY_ID }).success).toBe(true)
  })

  it('校验 limit 与 skip 范围', () => {
    const base = { repositoryId: REPOSITORY_ID }
    expect(gitLogInputSchema.safeParse({ ...base, limit: 1, skip: 0 }).success).toBe(true)
    expect(gitLogInputSchema.safeParse({ ...base, limit: MAX_GIT_LOG_ENTRIES }).success).toBe(true)
    expect(gitLogInputSchema.safeParse({ ...base, limit: 0 }).success).toBe(false)
    expect(gitLogInputSchema.safeParse({ ...base, limit: MAX_GIT_LOG_ENTRIES + 1 }).success).toBe(false)
    expect(gitLogInputSchema.safeParse({ ...base, limit: 1.5 }).success).toBe(false)
    expect(gitLogInputSchema.safeParse({ ...base, skip: -1 }).success).toBe(false)
  })
})

describe('gitCommitDetailInputSchema', () => {
  it('接受 40 或 64 位十六进制 SHA', () => {
    const base = { repositoryId: REPOSITORY_ID }
    expect(gitCommitDetailInputSchema.safeParse({ ...base, sha: 'a'.repeat(40) }).success).toBe(true)
    expect(gitCommitDetailInputSchema.safeParse({ ...base, sha: '0'.repeat(64) }).success).toBe(true)
  })

  it('拒绝短 SHA、非十六进制与大写 SHA', () => {
    const base = { repositoryId: REPOSITORY_ID }
    for (const sha of ['abc', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40), 'A'.repeat(40)]) {
      expect(gitCommitDetailInputSchema.safeParse({ ...base, sha }).success, sha).toBe(false)
    }
  })
})

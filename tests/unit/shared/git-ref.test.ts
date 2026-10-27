import { describe, expect, it } from 'vitest'
import { MAX_GIT_BRANCH_NAME_LENGTH } from '@shared/constants/app'
import { isSafeBranchName, isSafeGitPath, isSafeRemoteName } from '@shared/utils/git'

describe('isSafeBranchName', () => {
  it('接受常见与中文分支名', () => {
    for (const name of ['main', 'feature/login', 'release-1.0', 'fix.user.name', '中文分支', 'feature/中文', 'a']) {
      expect(isSafeBranchName(name)).toBe(true)
    }
  })

  it('拒绝空值、超长与控制字符', () => {
    const invalid = [
      '',
      '-foo',
      'HEAD',
      '@',
      'a..b',
      'a@{1}',
      'a b',
      'a\tb',
      'a\0b',
      'a~b',
      'a^b',
      'a:b',
      'a?b',
      'a*b',
      'a[b',
      'a]b',
      'a\\b',
      'a//b',
      '/leading',
      'trailing/',
      '.hidden',
      'dir/.hidden',
      'trailing.',
      'branch.lock',
      'dir/branch.lock',
      'x'.repeat(MAX_GIT_BRANCH_NAME_LENGTH + 1),
    ]

    for (const name of invalid) {
      expect(isSafeBranchName(name), name).toBe(false)
    }
  })
})

describe('isSafeGitPath', () => {
  it('接受仓库内相对路径', () => {
    for (const path of ['src/index.ts', 'dir/file with space.txt', '中文目录/文件.ts']) {
      expect(isSafeGitPath(path)).toBe(true)
    }
  })

  it('拒绝穿越、绝对路径、pathspec magic 与空值', () => {
    for (const path of ['', '../secret', '/abs/path', 'C:\\Windows\\win.ini', ':magic', 'a\0b']) {
      expect(isSafeGitPath(path), path).toBe(false)
    }
  })
})

describe('isSafeRemoteName', () => {
  it('接受常用远端名并拒绝分隔符', () => {
    expect(isSafeRemoteName('origin')).toBe(true)
    expect(isSafeRemoteName('upstream_1')).toBe(true)
    expect(isSafeRemoteName('my-remote.git')).toBe(true)
    expect(isSafeRemoteName('a/b')).toBe(false)
    expect(isSafeRemoteName('a b')).toBe(false)
    expect(isSafeRemoteName('a:b')).toBe(false)
    expect(isSafeRemoteName('')).toBe(false)
  })
})

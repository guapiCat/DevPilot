import { describe, expect, it } from 'vitest'
import { fileReadInputSchema, repositoryIdInputSchema } from '@shared/schemas/ipc'
import { isSafeRelativePath } from '@shared/utils/path'

describe('isSafeRelativePath', () => {
  it.each(['src/main/index.ts', 'docs/README.md', 'a\\b\\c.ts', 'package.json'])(
    '允许仓库内相对路径 %s',
    (relativePath) => {
      expect(isSafeRelativePath(relativePath)).toBe(true)
    }
  )

  it.each([
    '../secret.txt',
    'src/../../secret.txt',
    '/etc/passwd',
    '\\windows\\system32',
    'C:\\Windows\\win.ini',
    'c:foo.txt',
    'src//main.ts',
    'src/./main.ts',
    '',
    '.',
    '..',
    'bad\0name'
  ])('拒绝越权或非法路径 %s', (relativePath) => {
    expect(isSafeRelativePath(relativePath)).toBe(false)
  })
})

describe('fileReadInputSchema', () => {
  const validInput = {
    repositoryId: '123e4567-e89b-42d3-a456-426614174000',
    relativePath: 'src/index.ts'
  }

  it('接受合法的仓库 ID 与相对路径', () => {
    expect(fileReadInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('拒绝非 UUID 的仓库 ID', () => {
    expect(fileReadInputSchema.safeParse({ ...validInput, repositoryId: 'repo-1' }).success).toBe(
      false
    )
  })

  it('拒绝路径穿越', () => {
    expect(
      fileReadInputSchema.safeParse({ ...validInput, relativePath: '../secret.txt' }).success
    ).toBe(false)
  })
})

describe('repositoryIdInputSchema', () => {
  it('拒绝空对象', () => {
    expect(repositoryIdInputSchema.safeParse({}).success).toBe(false)
  })
})

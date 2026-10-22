import { describe, expect, it } from 'vitest'
import { MAX_FILE_WRITE_BYTES, MAX_PING_MESSAGE_LENGTH } from '@shared/constants/app'
import { fileWriteInputSchema, gitDiffInputSchema, pingInputSchema } from '@shared/schemas/ipc'

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
    expectedHash: 'a'.repeat(64)
  }

  it('接受合法写入参数', () => {
    expect(fileWriteInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('拒绝非法仓库 ID 与哈希', () => {
    expect(fileWriteInputSchema.safeParse({ ...validInput, repositoryId: 'nope' }).success).toBe(
      false
    )
    expect(fileWriteInputSchema.safeParse({ ...validInput, expectedHash: 'abc' }).success).toBe(
      false
    )
    expect(
      fileWriteInputSchema.safeParse({ ...validInput, expectedHash: 'g'.repeat(64) }).success
    ).toBe(false)
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
    relativePath: 'src/index.ts'
  }

  it('接受合法 Diff 参数', () => {
    expect(gitDiffInputSchema.safeParse(validInput).success).toBe(true)
  })

  it('拒绝非法仓库 ID', () => {
    expect(gitDiffInputSchema.safeParse({ ...validInput, repositoryId: 'nope' }).success).toBe(
      false
    )
  })

  it('拒绝路径穿越与空路径', () => {
    for (const relativePath of ['../secret', '/abs/path', 'C:\\Windows\\win.ini', '   ']) {
      expect(gitDiffInputSchema.safeParse({ ...validInput, relativePath }).success).toBe(false)
    }
  })
})

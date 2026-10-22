import { describe, expect, it } from 'vitest'
import { capText, clampText, formatToolError, toPosixRelative } from '@main/ai/tools/output'

describe('capText', () => {
  it('未超限时原样返回', () => {
    expect(capText('hello', 10)).toEqual({ text: 'hello', truncated: false })
    expect(capText('hello', 5)).toEqual({ text: 'hello', truncated: false })
  })

  it('超限时在换行边界截断并追加提示', () => {
    const text = 'a'.repeat(70) + '\n' + 'b'.repeat(30)
    const result = capText(text, 80)
    expect(result.truncated).toBe(true)
    expect(result.text).toBe('a'.repeat(70) + '\n[输出已截断：上限 80 字符]')
  })

  it('换行位置过早时直接按字符截断', () => {
    const text = 'a'.repeat(10) + '\n' + 'b'.repeat(100)
    const result = capText(text, 50)
    expect(result.truncated).toBe(true)
    expect(result.text).toBe(
      'a'.repeat(10) + '\n' + 'b'.repeat(39) + '\n[输出已截断：上限 50 字符]'
    )
  })
})

describe('clampText', () => {
  it('只按长度截断，不追加提示', () => {
    expect(clampText('abcdef', 3)).toBe('abc')
    expect(clampText('abc', 10)).toBe('abc')
  })
})

describe('toPosixRelative', () => {
  it('统一斜杠并去掉 ./ 前缀', () => {
    expect(toPosixRelative('src\\main\\index.ts')).toBe('src/main/index.ts')
    expect(toPosixRelative('./src/a.ts')).toBe('src/a.ts')
    expect(toPosixRelative('src/a.ts')).toBe('src/a.ts')
  })
})

describe('formatToolError', () => {
  it('生成稳定的工具错误文本', () => {
    expect(formatToolError('read_file', 'SENSITIVE_FILE', '不能读取敏感文件')).toBe(
      '[工具错误] read_file SENSITIVE_FILE: 不能读取敏感文件'
    )
  })
})

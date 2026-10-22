import { describe, expect, it } from 'vitest'
import { normalizeToolPath } from '@main/ai/tools/path-args'

describe('normalizeToolPath', () => {
  it('将空值与根目录写法归一为 undefined', () => {
    for (const value of [undefined, '', '   ', '.', './', './.', '/', '\\']) {
      expect(normalizeToolPath(value)).toBeUndefined()
    }
  })

  it('去除前导 ./、尾随斜杠并统一为正斜杠', () => {
    expect(normalizeToolPath('src')).toBe('src')
    expect(normalizeToolPath('src/')).toBe('src')
    expect(normalizeToolPath('./src')).toBe('src')
    expect(normalizeToolPath('.\\src')).toBe('src')
    expect(normalizeToolPath(' ./src/ ')).toBe('src')
    expect(normalizeToolPath('src\\utils\\a.ts')).toBe('src/utils/a.ts')
    expect(normalizeToolPath('./.env')).toBe('.env')
  })

  it('保留越界与绝对路径供后续校验拒绝', () => {
    expect(normalizeToolPath('../outside')).toBe('../outside')
    expect(normalizeToolPath('C:\\Windows\\win.ini')).toBe('C:/Windows/win.ini')
    expect(normalizeToolPath('//server/share')).toBe('//server/share')
  })
})

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside } from '@main/utils/path-security'

describe('isPathInside', () => {
  const root = resolve('sandbox', 'repo')

  it('允许仓库根目录与子路径', () => {
    expect(isPathInside(root, root)).toBe(true)
    expect(isPathInside(root, resolve(root, 'src', 'index.ts'))).toBe(true)
  })

  it('拒绝同级同前缀目录（repo2 不是 repo 的子目录）', () => {
    expect(isPathInside(root, resolve('sandbox', 'repo2', 'secret.txt'))).toBe(false)
  })

  it('拒绝父目录与仓库外路径', () => {
    expect(isPathInside(root, resolve(root, '..', 'secret.txt'))).toBe(false)
    expect(isPathInside(root, resolve('elsewhere', 'file.txt'))).toBe(false)
  })
})

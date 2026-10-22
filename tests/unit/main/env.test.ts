import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadEnvFiles } from '@main/utils/env'

const ENV_KEY = 'DEVPILOT_TEST_ENV_VALUE'
const tempDirs: string[] = []

afterEach(() => {
  delete process.env[ENV_KEY]

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe('loadEnvFiles', () => {
  it('加载存在的 .env 文件并跳过不存在的文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'devpilot-env-'))
    tempDirs.push(dir)

    const envFile = join(dir, '.env')
    writeFileSync(envFile, `${ENV_KEY}=hello\n`, 'utf8')

    const loaded = loadEnvFiles([join(dir, 'missing.env'), envFile])

    expect(loaded).toEqual([envFile])
    expect(process.env[ENV_KEY]).toBe('hello')
  })

  it('所有文件都不存在时返回空数组', () => {
    expect(loadEnvFiles([join(tmpdir(), 'devpilot-does-not-exist.env')])).toEqual([])
  })
})

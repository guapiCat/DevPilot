import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TOOL_READ_LINES } from '@shared/constants/app'
import { createReadFileTool } from '@main/ai/tools/read-file.tool'
import type { ToolContext } from '@main/ai/tools/tool-registry'
import { FileService } from '@main/services/file.service'
import { RepositoryService } from '@main/services/repository.service'

const tempDirs: string[] = []
let root: string
let repositoryId: string
let tool: ReturnType<typeof createReadFileTool>
let context: ToolContext

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

beforeEach(async () => {
  root = await createTempDir('devpilot-read-')
  await writeFile(join(root, 'sample.ts'), 'line1\nline2\nline3\nline4\nline5\n')
  await writeFile(join(root, '.env'), 'API_KEY=value\n')
  await writeFile(join(root, '.env.example'), 'API_KEY=\n')
  await writeFile(join(root, 'secret.ts'), 'const key = "sk-abcdefghijklmnopqrstuvwx"\n')
  await writeFile(join(root, 'binary.dat'), Buffer.from([0x61, 0x00, 0x62]))

  const repositories = new RepositoryService()
  repositoryId = (await repositories.register(root)).id
  tool = createReadFileTool(new FileService(repositories))
  context = { repositoryId, signal: new AbortController().signal }
})

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('read_file 工具', () => {
  it('读取整个文件并输出行号', async () => {
    const result = await tool.execute({ path: 'sample.ts' }, context)

    expect(result.content).toContain('# 文件: sample.ts（共 5 行）')
    expect(result.content).toContain('# 行范围: 1-5')
    expect(result.content).toContain('1: line1')
    expect(result.content).toContain('5: line5')
    expect(result.summary).toBe('sample.ts 第 1-5 行 / 共 5 行')
    expect(result.truncated).toBe(false)
  })

  it('支持起始行与结束行', async () => {
    const result = await tool.execute({ path: 'sample.ts', startLine: 2, endLine: 4 }, context)

    expect(result.content).toContain('# 行范围: 2-4')
    expect(result.content).toContain('2: line2')
    expect(result.content).toContain('4: line4')
    expect(result.content).not.toContain('1: line1')
    expect(result.content).not.toContain('5: line5')
  })

  it('单次最多返回 300 行并标记截断', async () => {
    const content = Array.from({ length: 400 }, (_, index) => `l${index + 1}`).join('\n')
    await writeFile(join(root, 'long.txt'), content)

    const result = await tool.execute({ path: 'long.txt', startLine: 1, endLine: 400 }, context)

    expect(result.summary).toBe(`long.txt 第 1-${MAX_TOOL_READ_LINES} 行 / 共 400 行`)
    expect(result.content).toContain(`${MAX_TOOL_READ_LINES}: l${MAX_TOOL_READ_LINES}`)
    expect(result.content).not.toContain('301: l301')
    expect(result.truncated).toBe(true)
  })

  it('起始行超出范围时钳制到最后一行', async () => {
    const result = await tool.execute({ path: 'sample.ts', startLine: 100 }, context)

    expect(result.content).toContain('# 行范围: 5-5')
    expect(result.content).toContain('5: line5')
  })

  it('结束行小于起始行时返回 INVALID_ARGUMENTS', async () => {
    await expect(
      tool.execute({ path: 'sample.ts', startLine: 4, endLine: 2 }, context)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
  })

  it('阻断 .env、私钥内容与二进制文件', async () => {
    await expect(tool.execute({ path: '.env' }, context)).rejects.toMatchObject({
      code: 'SENSITIVE_FILE'
    })
    await expect(tool.execute({ path: 'secret.ts' }, context)).rejects.toMatchObject({
      code: 'SENSITIVE_FILE'
    })
    await expect(tool.execute({ path: 'binary.dat' }, context)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE'
    })
  })

  it('允许读取 .env.example', async () => {
    const result = await tool.execute({ path: '.env.example' }, context)
    expect(result.content).toContain('1: API_KEY=')
  })

  it('缺失文件与路径穿越返回稳定错误码', async () => {
    await expect(tool.execute({ path: 'missing.ts' }, context)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND'
    })
    await expect(tool.execute({ path: '../outside.ts' }, context)).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED'
    })
  })
})

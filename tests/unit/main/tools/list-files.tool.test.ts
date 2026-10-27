import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TOOL_LIST_ENTRIES } from '@shared/constants/app'
import { createListFilesTool } from '@main/ai/tools/list-files.tool'
import type { ToolContext } from '@main/ai/tools/tool-registry'

const tempDirs: string[] = []
let root: string
let tool: ReturnType<typeof createListFilesTool>
let context: ToolContext

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

async function write(relativePath: string, content = ''): Promise<void> {
  const target = join(root, ...relativePath.split('/'))
  await mkdir(join(target, '..'), { recursive: true })
  await writeFile(target, content)
}

function lines(content: string): string[] {
  return content.split('\n')
}

beforeEach(async () => {
  root = await realpath(await createTempDir('devpilot-list-'))
  await write('src/main.ts', 'main')
  await write('src/utils/a.ts', 'a')
  await write('src/utils/deep/b.ts', 'b')
  await write('README.md', '# readme')
  await write('node_modules/pkg/index.js', 'x')
  await write('.git/config', '[core]')
  await write('build/out.js', 'x')
  await write('.env', 'SECRET=1')
  await write('.env.example', 'SECRET=')
  await write('.ssh/config', 'Host *')

  tool = createListFilesTool({ getRealRoot: () => root })
  context = { repositoryId: 'repo-1', signal: new AbortController().signal }
})

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('list_files 工具', () => {
  it('默认深度列出两层并跳过忽略目录与敏感条目', async () => {
    const result = await tool.execute({}, context)
    const body = lines(result.content)

    expect(body[0]).toBe('# 目录: .（深度 2）')
    expect(body).toContain('src/')
    expect(body).toContain('  main.ts')
    expect(body).toContain('  utils/')
    expect(body).not.toContain('deep/')
    expect(body).not.toContain('  a.ts')
    expect(body).toContain('.env.example')
    expect(body).not.toContain('.env')
    expect(body).not.toContain('.ssh/')
    expect(body.join('\n')).not.toContain('node_modules')
    expect(result.truncated).toBe(false)
    expect(result.summary).toContain('项')
  })

  it('depth=1 只列顶层，depth=3 可进入第三层目录', async () => {
    const shallow = await tool.execute({ depth: 1 }, context)
    expect(shallow.content).toContain('src/')
    expect(shallow.content).not.toContain('main.ts')

    const deep = await tool.execute({ depth: 3 }, context)
    expect(deep.content).toContain('deep/')
    expect(deep.content).not.toContain('b.ts')

    const scoped = await tool.execute({ path: 'src', depth: 3 }, context)
    expect(scoped.content).toContain('a.ts')
    expect(scoped.content).toContain('deep/')
    expect(scoped.content).toContain('b.ts')
  })

  it('接受 . / ./ / 尾随斜杠等常见根目录与目录写法', async () => {
    for (const path of ['.', './', '.\\', '/']) {
      const result = await tool.execute({ path, depth: 1 }, context)
      expect(result.content).toContain('# 目录: .（深度 1）')
      expect(result.content).toContain('src/')
    }

    const scoped = await tool.execute({ path: 'src/', depth: 1 }, context)
    expect(scoped.content).toContain('# 目录: src（深度 1）')
    expect(scoped.content).toContain('main.ts')
  })

  it('path 指定子目录时只列出该目录内容', async () => {
    const result = await tool.execute({ path: 'src', depth: 2 }, context)

    expect(result.content).toContain('# 目录: src')
    expect(result.content).toContain('main.ts')
    expect(result.content).toContain('utils/')
    expect(result.content).not.toContain('README.md')
  })

  it('拒绝路径穿越与绝对路径', async () => {
    await expect(tool.execute({ path: '../outside' }, context)).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED',
    })
    await expect(tool.execute({ path: 'C:\\Windows' }, context)).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED',
    })
  })

  it('目标不是目录时返回 UNSUPPORTED_FILE，缺失目录返回 FILE_NOT_FOUND', async () => {
    await expect(tool.execute({ path: 'README.md' }, context)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    })
    await expect(tool.execute({ path: 'missing' }, context)).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    })
  })

  it('超过条目上限时标记截断', async () => {
    for (let index = 0; index < 520; index += 1) {
      await writeFile(join(root, `file-${String(index).padStart(4, '0')}.txt`), 'x')
    }

    const result = await tool.execute({ depth: 1 }, context)

    const output = lines(result.content)
    expect(result.truncated).toBe(true)
    expect(output.length).toBe(1 + MAX_TOOL_LIST_ENTRIES)
    expect(output.some((line) => line.startsWith('file-'))).toBe(true)
  })
})

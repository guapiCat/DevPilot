import { spawnSync } from 'node:child_process'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_SEARCH_FILES,
  MAX_SEARCH_MATCHES,
  MAX_SEARCH_MATCHES_PER_FILE
} from '@shared/constants/app'
import { buildSearchArgs, createSearchCodeTool, parseRgJson } from '@main/ai/tools/search-code.tool'
import type { ToolContext } from '@main/ai/tools/tool-registry'

const rgAvailable = spawnSync('rg', ['--version'], { windowsHide: true }).status === 0

function matchEvent(path: string, lineNumber: number, text: string): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: path },
      lines: { text },
      line_number: lineNumber
    }
  })
}

describe('buildSearchArgs', () => {
  it('字面量模式追加 -F，正则模式不追加', () => {
    const literal = buildSearchArgs('a.b', '.', 'literal')
    const regex = buildSearchArgs('a.b', '.', 'regex')

    expect(literal).toContain('-F')
    expect(regex).not.toContain('-F')
    expect(literal.slice(-2)).toEqual(['--', '.'])
  })

  it('以 - 开头的查询作为 -e 的值传入，不被当作选项', () => {
    const args = buildSearchArgs('-TODO', 'src', 'literal')
    const index = args.indexOf('-e')

    expect(args[index + 1]).toBe('-TODO')
    expect(args[args.indexOf('--') + 1]).toBe('src')
  })

  it('包含忽略目录与输出上限参数', () => {
    const args = buildSearchArgs('x', '.', 'literal')

    expect(args).toContain('--json')
    expect(args).toContain('--no-config')
    expect(args).toContain('--max-count')
    expect(args).toContain('!**/node_modules/**')
    expect(args).toContain('!**/.git/**')
  })
})

describe('parseRgJson', () => {
  it('解析路径、行号与内容，并统一路径分隔符', () => {
    const stdout = [
      JSON.stringify({ type: 'begin', data: { path: { text: 'src/a.ts' } } }),
      matchEvent('src\\nested\\a.ts', 12, 'const a = 1\n'),
      JSON.stringify({ type: 'end', data: { path: { text: 'src/a.ts' } } }),
      JSON.stringify({ type: 'summary', data: {} })
    ].join('\n')

    const result = parseRgJson(stdout)

    expect(result.matches).toEqual([{ path: 'src/nested/a.ts', line: 12, text: 'const a = 1' }])
    expect(result.fileCount).toBe(1)
    expect(result.truncated).toBe(false)
  })

  it('过滤敏感路径并忽略非法 JSON', () => {
    const stdout = [
      'not json',
      matchEvent('.env', 1, 'SECRET=1\n'),
      matchEvent('src/.aws/credentials', 1, 'key\n'),
      matchEvent('src/ok.ts', 3, 'fine\n')
    ].join('\n')

    const result = parseRgJson(stdout)

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].path).toBe('src/ok.ts')
  })

  it('每个文件最多保留 10 条匹配', () => {
    const stdout = Array.from({ length: MAX_SEARCH_MATCHES_PER_FILE + 3 }, (_, index) =>
      matchEvent('src/a.ts', index + 1, `line ${index + 1}\n`)
    ).join('\n')

    const result = parseRgJson(stdout)

    expect(result.matches).toHaveLength(MAX_SEARCH_MATCHES_PER_FILE)
    expect(result.truncated).toBe(true)
  })

  it('最多保留 40 个文件与 200 条匹配', () => {
    const manyFiles = Array.from({ length: MAX_SEARCH_FILES + 2 }, (_, index) =>
      matchEvent(`src/f${index}.ts`, 1, 'hit\n')
    ).join('\n')
    expect(parseRgJson(manyFiles).fileCount).toBe(MAX_SEARCH_FILES)

    const manyMatches = Array.from({ length: 45 }, (_, fileIndex) =>
      Array.from({ length: 10 }, (_, lineIndex) =>
        matchEvent(`src/f${fileIndex}.ts`, lineIndex + 1, 'hit\n')
      ).join('\n')
    ).join('\n')
    const result = parseRgJson(manyMatches)
    expect(result.matches).toHaveLength(MAX_SEARCH_MATCHES)
    expect(result.truncated).toBe(true)
  })

  it('对命中片段中的高置信密钥脱敏', () => {
    const result = parseRgJson(matchEvent('src/a.ts', 1, 'key = sk-abcdefghijklmnopqrstuvwx\n'))

    expect(result.matches[0].text).toContain('[疑似敏感信息已屏蔽]')
    expect(result.matches[0].text).not.toContain('sk-abcdefghijklmnopqrstuvwx')
  })
})

describe.skipIf(!rgAvailable)('search_code 工具（真实 ripgrep）', () => {
  const tempDirs: string[] = []
  let root: string
  let tool: ReturnType<typeof createSearchCodeTool>
  let context: ToolContext

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'devpilot-search-')))
    tempDirs.push(root)
    await writeFile(join(root, 'app.ts'), 'const value = 1 // TODO: refactor\n')
    await writeFile(join(root, 'other.ts'), 'const other = 2\n')
    await writeFile(join(root, '.env'), 'TODO_SECRET=1\n')
    tool = createSearchCodeTool({ getRealRoot: () => root })
    context = { repositoryId: 'repo-1', signal: new AbortController().signal }
  })

  afterEach(async () => {
    for (const directory of tempDirs.splice(0)) {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('返回文件、行号与匹配片段，敏感文件不出现', async () => {
    const result = await tool.execute({ query: 'TODO' }, context)

    expect(result.content).toContain('app.ts:1:')
    expect(result.content).toContain('TODO: refactor')
    expect(result.content).not.toContain('.env')
    expect(result.summary).toBe('1 条匹配 / 1 个文件')
  })

  it('支持正则模式与目录范围', async () => {
    const result = await tool.execute({ query: 'TO[D]O', mode: 'regex', path: 'app.ts' }, context)
    expect(result.content).toContain('app.ts:1:')
  })

  it('无匹配时正常返回', async () => {
    const result = await tool.execute({ query: 'NOT_FOUND_ANYWHERE' }, context)

    expect(result.content).toContain('未找到匹配内容')
    expect(result.summary).toBe('未找到匹配')
    expect(result.truncated).toBe(false)
  })

  it('以 - 开头的查询不会被当作选项', async () => {
    const result = await tool.execute({ query: '-TODO', mode: 'literal' }, context)
    expect(result.summary).toBe('未找到匹配')
  })

  it('拒绝越界搜索路径', async () => {
    await expect(tool.execute({ query: 'TODO', path: '../' }, context)).rejects.toMatchObject({
      code: 'PATH_NOT_ALLOWED'
    })
  })
})

describe.skipIf(rgAvailable)('search_code 缺少 ripgrep', () => {
  it('返回 RG_NOT_AVAILABLE', async () => {
    const tool = createSearchCodeTool({ getRealRoot: () => process.cwd() })
    await expect(
      tool.execute({ query: 'x' }, { repositoryId: 'r', signal: new AbortController().signal })
    ).rejects.toMatchObject({ code: 'RG_NOT_AVAILABLE' })
  })
})

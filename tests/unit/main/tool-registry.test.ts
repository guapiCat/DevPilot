import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ToolExecutionError, ToolRegistry, type ToolContext, type ToolResult } from '@main/ai/tools/tool-registry'

const context: ToolContext = {
  repositoryId: 'repo-1',
  signal: new AbortController().signal,
}

type ExecuteFn = (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>

function createRegistry(
  execute: ExecuteFn = vi.fn(async () => ({ content: 'ok', summary: '完成', truncated: false })),
): { registry: ToolRegistry; execute: ExecuteFn } {
  const registry = new ToolRegistry()
  registry.register({
    name: 'read_file',
    description: '读取文件',
    schema: z.strictObject({
      path: z.string().min(1),
      startLine: z.number().int().min(1).optional(),
    }),
    summarizeArgs: (args) => `读取 ${args.path}`,
    execute,
  })
  return { registry, execute }
}

describe('ToolRegistry', () => {
  it('把 Zod schema 转换为不含 $schema 的 JSON Schema', () => {
    const { registry } = createRegistry()
    const [tool] = registry.toModelTools()

    expect(tool.name).toBe('read_file')
    expect(tool.description).toBe('读取文件')
    expect(tool.parameters).not.toHaveProperty('$schema')
    expect(tool.parameters).toMatchObject({
      type: 'object',
      properties: {
        path: { type: 'string' },
        startLine: { type: 'integer' },
      },
      required: ['path'],
    })
  })

  it('拒绝重复注册', () => {
    const { registry } = createRegistry()
    expect(() =>
      registry.register({
        name: 'read_file',
        description: 'again',
        schema: z.strictObject({ path: z.string() }),
        summarizeArgs: () => 'x',
        execute: async () => ({ content: '', summary: '', truncated: false }),
      }),
    ).toThrow(/重复注册/)
  })

  it('未知工具返回 UNKNOWN_TOOL', async () => {
    const { registry } = createRegistry()
    await expect(registry.execute('nope', {}, context)).rejects.toMatchObject({
      name: 'ToolExecutionError',
      code: 'UNKNOWN_TOOL',
    })
  })

  it('缺少字段、类型错误与多余字段都返回 INVALID_ARGUMENTS', async () => {
    const { registry, execute } = createRegistry()

    for (const args of [{}, { path: 42 }, { path: 'a.ts', extra: true }]) {
      await expect(registry.execute('read_file', args, context)).rejects.toBeInstanceOf(ToolExecutionError)
      await expect(registry.execute('read_file', args, context)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      })
    }
    expect(execute).not.toHaveBeenCalled()
  })

  it('校验通过后把解析后的参数与上下文传给工具', async () => {
    const { registry, execute } = createRegistry()
    await registry.execute('read_file', { path: 'src/a.ts', startLine: 3 }, context)

    expect(execute).toHaveBeenCalledWith({ path: 'src/a.ts', startLine: 3 }, context)
  })

  it('summarize 在参数合法时调用摘要函数，否则返回占位文本', () => {
    const { registry } = createRegistry()
    expect(registry.summarize('read_file', { path: 'src/a.ts' })).toBe('读取 src/a.ts')
    expect(registry.summarize('read_file', { path: '' })).toBe('(参数无效)')
    expect(registry.summarize('nope', {})).toBe('(未知工具)')
  })
})

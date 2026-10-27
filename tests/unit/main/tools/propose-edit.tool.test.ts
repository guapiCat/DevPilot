import { describe, expect, it, vi } from 'vitest'
import { MAX_EDIT_OLD_TEXT_CHARS } from '@shared/constants/app'
import { createProposeEditTool } from '@main/ai/tools/propose-edit.tool'
import {
  ToolExecutionError,
  ToolRegistry,
  type EditProposalRequest,
  type ToolContext,
} from '@main/ai/tools/tool-registry'
import { ServiceError } from '@main/utils/service-error'

function createHarness(
  propose: (input: EditProposalRequest) => Promise<{
    editSessionId: string
    fileEditId: string
  }> = async () => ({ editSessionId: 'session-1', fileEditId: 'file-1' }),
): {
  tool: ReturnType<typeof createProposeEditTool>
  registry: ToolRegistry
  propose: ReturnType<typeof vi.fn>
  onEditProposed: ReturnType<typeof vi.fn>
  context: ToolContext
} {
  const proposeMock = vi.fn(propose)
  const onEditProposed = vi.fn()
  const context: ToolContext = {
    repositoryId: 'repo-1',
    signal: new AbortController().signal,
    conversationId: 'conversation-1',
    runId: 'run-1',
    editService: { propose: proposeMock },
    onEditProposed,
  }

  const tool = createProposeEditTool()
  const registry = new ToolRegistry()
  registry.register(tool)

  return { tool, registry, propose: proposeMock, onEditProposed, context }
}

describe('propose_file_edit 工具', () => {
  it('提交修改建议并提示等待用户确认', async () => {
    const { tool, propose, onEditProposed, context } = createHarness()

    const result = await tool.execute(
      {
        path: 'src/app.ts',
        operation: 'modify',
        oldText: 'const a = 1',
        newText: 'const a = 2',
      },
      context,
    )

    expect(propose).toHaveBeenCalledWith({
      repositoryId: 'repo-1',
      conversationId: 'conversation-1',
      runId: 'run-1',
      relativePath: 'src/app.ts',
      operation: 'modify',
      oldText: 'const a = 1',
      newText: 'const a = 2',
      content: undefined,
    })
    expect(result.content).toContain('# 修改建议已提交审核')
    expect(result.content).toContain('文件: src/app.ts')
    expect(result.content).toContain('操作: 修改现有文件')
    expect(result.content).toContain('等待用户确认（尚未写入磁盘）')
    expect(result.content).toContain('不要声称文件已修改')
    expect(result.summary).toBe('src/app.ts 修改建议待审核')
    expect(result.truncated).toBe(false)
    expect(onEditProposed).toHaveBeenCalledWith({
      editSessionId: 'session-1',
      fileEditId: 'file-1',
      relativePath: 'src/app.ts',
      operation: 'modify',
    })
  })

  it('提交新建建议并归一化 Windows 路径', async () => {
    const { tool, propose, onEditProposed, context } = createHarness()

    const result = await tool.execute(
      { path: 'src\\new.ts', operation: 'create', content: 'export const x = 1\n' },
      context,
    )

    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ relativePath: 'src/new.ts', operation: 'create' }))
    expect(result.content).toContain('操作: 新建文件')
    expect(result.summary).toBe('src/new.ts 修改建议待审核')
    expect(onEditProposed).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: 'src/new.ts', operation: 'create' }),
    )
  })

  it('参数摘要包含操作与路径', () => {
    const { tool } = createHarness()

    expect(tool.summarizeArgs({ path: 'src/a.ts', operation: 'modify' })).toBe('修改 src/a.ts')
    expect(tool.summarizeArgs({ path: 'src/b.ts', operation: 'create' })).toBe('新建 src/b.ts')
  })

  it('拒绝敏感文件', async () => {
    const { tool, context } = createHarness()

    await expect(
      tool.execute({ path: '.env', operation: 'create', content: 'SECRET=1' }, context),
    ).rejects.toMatchObject({ name: 'ToolExecutionError', code: 'SENSITIVE_FILE' })
  })

  it('缺少会话上下文时返回 TOOL_FAILED', async () => {
    const { tool } = createHarness()
    const base = { repositoryId: 'repo-1', signal: new AbortController().signal }

    await expect(
      tool.execute(
        { path: 'a.ts', operation: 'create', content: 'x' },
        { ...base, runId: 'run-1', editService: { propose: vi.fn() } },
      ),
    ).rejects.toMatchObject({ code: 'TOOL_FAILED' })
    await expect(
      tool.execute(
        { path: 'a.ts', operation: 'create', content: 'x' },
        { ...base, conversationId: 'conversation-1', editService: { propose: vi.fn() } },
      ),
    ).rejects.toMatchObject({ code: 'TOOL_FAILED' })
    await expect(
      tool.execute(
        { path: 'a.ts', operation: 'create', content: 'x' },
        { ...base, conversationId: 'conversation-1', runId: 'run-1' },
      ),
    ).rejects.toMatchObject({ code: 'TOOL_FAILED' })
  })

  it('请求已停止时拒绝执行', async () => {
    const { tool, propose, context } = createHarness()
    const controller = new AbortController()
    controller.abort()

    await expect(
      tool.execute({ path: 'a.ts', operation: 'create', content: 'x' }, { ...context, signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'TOOL_FAILED' })
    expect(propose).not.toHaveBeenCalled()
  })

  it('把服务错误映射为工具错误', async () => {
    const { tool, context } = createHarness(async () => {
      throw new ServiceError('EDIT_CONFLICT', 'oldText 在文件中出现 2 次')
    })

    await expect(
      tool.execute({ path: 'a.ts', operation: 'modify', oldText: 'x', newText: 'y' }, context),
    ).rejects.toMatchObject({ name: 'ToolExecutionError', code: 'EDIT_CONFLICT' })
  })
})

describe('propose_file_edit 参数校验', () => {
  it('缺少 operation 或出现多余字段时拒绝', async () => {
    const { registry, context } = createHarness()

    for (const args of [
      { path: 'a.ts', content: 'x' },
      { path: 'a.ts', operation: 'create', content: 'x', extra: true },
    ]) {
      await expect(registry.execute('propose_file_edit', args, context)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      })
    }
  })

  it('modify 必须同时提供 oldText 与 newText', async () => {
    const { registry, context } = createHarness()

    for (const args of [
      { path: 'a.ts', operation: 'modify', newText: 'y' },
      { path: 'a.ts', operation: 'modify', oldText: 'x' },
      { path: 'a.ts', operation: 'modify', oldText: '', newText: 'y' },
    ]) {
      await expect(registry.execute('propose_file_edit', args, context)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      })
    }
  })

  it('modify 不接受 content，create 不接受 oldText/newText', async () => {
    const { registry, context } = createHarness()

    for (const args of [
      {
        path: 'a.ts',
        operation: 'modify',
        oldText: 'x',
        newText: 'y',
        content: 'z',
      },
      { path: 'a.ts', operation: 'create', content: 'x', oldText: 'a' },
      { path: 'a.ts', operation: 'create', content: 'x', newText: 'b' },
    ]) {
      await expect(registry.execute('propose_file_edit', args, context)).rejects.toMatchObject({
        code: 'INVALID_ARGUMENTS',
      })
    }
  })

  it('create 必须提供 content', async () => {
    const { registry, context } = createHarness()

    await expect(
      registry.execute('propose_file_edit', { path: 'a.ts', operation: 'create' }, context),
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENTS' })
  })

  it('oldText 超过长度上限时拒绝', async () => {
    const { registry, context } = createHarness()

    await expect(
      registry.execute(
        'propose_file_edit',
        {
          path: 'a.ts',
          operation: 'modify',
          oldText: 'a'.repeat(MAX_EDIT_OLD_TEXT_CHARS + 1),
          newText: 'b',
        },
        context,
      ),
    ).rejects.toBeInstanceOf(ToolExecutionError)
  })
})

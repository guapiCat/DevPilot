import { describe, expect, it } from 'vitest'
import { CHAT_HISTORY_MAX_CHARS, CHAT_HISTORY_MAX_MESSAGES } from '@shared/constants/app'
import type { ChatMessage } from '@shared/types/chat'
import { buildModelMessages, buildSystemPrompt, selectHistory } from '@main/ai/prompt-builder'

function message(index: number, content: string, role: ChatMessage['role'] = 'user'): ChatMessage {
  return {
    id: `message-${index}`,
    role,
    content,
    createdAt: `2026-10-01T00:00:${String(index % 60).padStart(2, '0')}.000Z`
  }
}

describe('buildSystemPrompt', () => {
  it('无工具时声明尚未读取文件并约束不可信内容', () => {
    const prompt = buildSystemPrompt()
    expect(prompt).toContain('尚未读取任何仓库文件')
    expect(prompt).toContain('不得声称查看过代码')
    expect(prompt).toContain('不可信数据')
    expect(prompt).not.toContain('list_files')
    expect(prompt).not.toContain('当前关联仓库')
  })

  it('有工具时列出只读工具、行号引用与不可信数据约束', () => {
    const prompt = buildSystemPrompt({ toolsEnabled: true })
    expect(prompt).toContain('list_files')
    expect(prompt).toContain('search_code')
    expect(prompt).toContain('read_file')
    expect(prompt).toContain('相对路径与行号')
    expect(prompt).toContain('省略 path 参数')
    expect(prompt).toContain('<tool_result>')
    expect(prompt).toContain('敏感文件已被阻止')
  })

  it('只注入仓库名称', () => {
    const prompt = buildSystemPrompt({ repositoryName: 'demo-repo' })
    expect(prompt).toContain('当前关联仓库：demo-repo')
    expect(prompt).not.toContain('F:\\')
  })

  it('有工具时说明访问范围仅限仓库', () => {
    const prompt = buildSystemPrompt({ repositoryName: 'demo-repo', toolsEnabled: true })
    expect(prompt).toContain('工具访问范围仅限该仓库')
  })
})

describe('selectHistory', () => {
  it('只保留最近 N 条 user / assistant 消息', () => {
    const messages = Array.from({ length: CHAT_HISTORY_MAX_MESSAGES + 5 }, (_, index) =>
      message(index, `message-${index}`, index % 2 === 0 ? 'user' : 'assistant')
    )

    const selected = selectHistory(messages)
    expect(selected).toHaveLength(CHAT_HISTORY_MAX_MESSAGES)
    expect(selected[0].content).toBe(`message-${messages.length - CHAT_HISTORY_MAX_MESSAGES}`)
    expect(selected.at(-1)?.content).toBe(`message-${messages.length - 1}`)
  })

  it('排除 system / tool 消息', () => {
    const selected = selectHistory([
      message(1, 'system', 'system'),
      message(2, 'user', 'user'),
      message(3, 'tool', 'tool'),
      message(4, 'assistant', 'assistant')
    ])

    expect(selected.map((item) => item.role)).toEqual(['user', 'assistant'])
  })

  it('按字符上限从新到旧裁剪，并始终保留最新消息', () => {
    const messages = [
      message(1, 'a'.repeat(10_000)),
      message(2, 'b'.repeat(10_000)),
      message(3, 'c'.repeat(10_000))
    ]

    const selected = selectHistory(messages)
    expect(selected).toHaveLength(2)
    expect(selected.at(-1)?.content.startsWith('c')).toBe(true)
    expect(selected.reduce((sum, item) => sum + item.content.length, 0)).toBeLessThanOrEqual(
      CHAT_HISTORY_MAX_CHARS
    )
  })

  it('单条超长最新消息也会保留', () => {
    const selected = selectHistory([
      message(1, 'old'),
      message(2, 'x'.repeat(CHAT_HISTORY_MAX_CHARS + 1))
    ])

    expect(selected).toHaveLength(1)
    expect(selected[0].content.startsWith('x')).toBe(true)
  })
})

describe('buildModelMessages', () => {
  it('首条为 system，随后是裁剪后的历史', () => {
    const result = buildModelMessages(
      [message(1, 'hello', 'user'), message(2, 'world', 'assistant')],
      { repositoryName: 'demo' }
    )

    expect(result[0].role).toBe('system')
    expect(result[0].content).toContain('DevPilot')
    expect(result.slice(1)).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' }
    ])
  })
})

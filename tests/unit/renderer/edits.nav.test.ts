import { describe, expect, it } from 'vitest'
import type { EditSession, FileEdit } from '@shared/types/edit'
import { editFileKey, flattenEditFiles, neighborEditEntry } from '@renderer/utils/edits'

function makeFile(id: string, relativePath: string): FileEdit {
  return {
    id,
    editSessionId: '',
    relativePath,
    operation: 'modify',
    status: 'proposed',
    originalContent: 'before',
    proposedContent: 'after',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z'
  }
}

function makeSession(id: string, files: FileEdit[]): EditSession {
  return {
    id,
    conversationId: 'conversation-1',
    repositoryId: 'repo-1',
    status: 'active',
    createdAt: '2026-10-23T00:00:00.000Z',
    updatedAt: '2026-10-23T00:00:00.000Z',
    files: files.map((file) => ({ ...file, editSessionId: id }))
  }
}

const sessions = [
  makeSession('session-a', [makeFile('file-1', 'src/a.ts'), makeFile('file-2', 'src/b.ts')]),
  makeSession('session-b', [makeFile('file-3', 'src/c.ts')])
]

const entries = flattenEditFiles(sessions)

describe('审核导航工具', () => {
  it('按会话与文件顺序展平并生成稳定的键', () => {
    expect(entries.map((entry) => entry.key)).toEqual([
      editFileKey('session-a', 'file-1'),
      editFileKey('session-a', 'file-2'),
      editFileKey('session-b', 'file-3')
    ])
    expect(entries.map((entry) => entry.file.relativePath)).toEqual([
      'src/a.ts',
      'src/b.ts',
      'src/c.ts'
    ])
    expect(entries[0].sessionId).toBe('session-a')
  })

  it('下一个/上一个可跨会话边界移动', () => {
    expect(neighborEditEntry(entries, entries[1].key, 1)?.file.relativePath).toBe('src/c.ts')
    expect(neighborEditEntry(entries, entries[1].key, -1)?.file.relativePath).toBe('src/a.ts')
    expect(neighborEditEntry(entries, entries[2].key, -1)?.sessionId).toBe('session-a')
  })

  it('首尾不环绕', () => {
    expect(neighborEditEntry(entries, entries[0].key, -1)).toBeNull()
    expect(neighborEditEntry(entries, entries[2].key, 1)).toBeNull()
  })

  it('空键、未知键与空列表返回 null', () => {
    expect(neighborEditEntry(entries, null, 1)).toBeNull()
    expect(neighborEditEntry(entries, 'session-x:file-x', 1)).toBeNull()
    expect(neighborEditEntry([], editFileKey('session-a', 'file-1'), 1)).toBeNull()
  })
})

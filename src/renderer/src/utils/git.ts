import type { GitFileStatus } from '@shared/types/git'

export const GIT_STATUS_META: Record<GitFileStatus, { label: string; className: string; title: string }> = {
  modified: { label: 'M', className: 'modified', title: '已修改' },
  added: { label: 'A', className: 'added', title: '新增' },
  deleted: { label: 'D', className: 'deleted', title: '已删除' },
  renamed: { label: 'R', className: 'renamed', title: '重命名' },
  untracked: { label: 'U', className: 'untracked', title: '未跟踪' },
  conflicted: { label: '!', className: 'conflicted', title: '冲突' },
  unknown: { label: '?', className: 'unknown', title: '未知' },
}

export function formatGitTime(seconds: number): string {
  if (!seconds) return '—'
  return new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false })
}

export function formatGitRelativeTime(seconds: number): string {
  if (!seconds) return ''
  const diffMs = Date.now() - seconds * 1000
  const minutes = Math.floor(diffMs / 60_000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`

  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`

  return new Date(seconds * 1000).toLocaleDateString('zh-CN')
}

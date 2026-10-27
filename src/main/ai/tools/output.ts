import type { ToolErrorCode } from './tool-registry'

export function clampText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, Math.max(0, maxChars))
}

export function capText(text: string, maxChars: number): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false }

  const limited = text.slice(0, maxChars)
  const lastNewline = limited.lastIndexOf('\n')
  const body = lastNewline > maxChars * 0.6 ? limited.slice(0, lastNewline) : limited

  return {
    text: `${body}\n[输出已截断：上限 ${maxChars} 字符]`,
    truncated: true,
  }
}

export function toPosixRelative(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '')
}

export function formatToolError(name: string, code: ToolErrorCode, message: string): string {
  return `[工具错误] ${name} ${code}: ${message}`
}

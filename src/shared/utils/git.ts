import { MAX_GIT_BRANCH_NAME_LENGTH } from '../constants/app'
import { isSafeRelativePath } from './path'

const INVALID_BRANCH_CHARS = /[~^:?*[\]\\]/

function hasControlOrSpace(input: string): boolean {
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

export function isSafeBranchName(input: string): boolean {
  if (!input || input.length > MAX_GIT_BRANCH_NAME_LENGTH) return false
  if (input === '@' || input === 'HEAD') return false
  if (input.startsWith('-') || input.startsWith('/') || input.endsWith('/')) return false
  if (input.includes('..') || input.includes('@{') || input.includes('//')) return false
  if (hasControlOrSpace(input) || INVALID_BRANCH_CHARS.test(input)) return false
  if (input.endsWith('.')) return false

  return input
    .split('/')
    .every(
      (segment) => segment !== '' && !segment.startsWith('.') && !segment.endsWith('.') && !segment.endsWith('.lock'),
    )
}

export function isSafeGitPath(input: string): boolean {
  return isSafeRelativePath(input) && !input.startsWith(':')
}

export function isSafeRemoteName(input: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(input)
}

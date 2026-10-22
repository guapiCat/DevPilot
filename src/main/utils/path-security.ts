import { isAbsolute, relative } from 'node:path'

export function isPathInside(root: string, candidate: string): boolean {
  const relationship = relative(root, candidate)
  return relationship === '' || (!relationship.startsWith('..') && !isAbsolute(relationship))
}

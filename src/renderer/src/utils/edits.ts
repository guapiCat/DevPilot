import type { EditSession, FileEdit } from '@shared/types/edit'

export function editFileKey(editSessionId: string, fileEditId: string): string {
  return `${editSessionId}:${fileEditId}`
}

export interface EditFileEntry {
  sessionId: string
  file: FileEdit
  key: string
}

export function flattenEditFiles(sessions: EditSession[]): EditFileEntry[] {
  const entries: EditFileEntry[] = []

  for (const session of sessions) {
    for (const file of session.files) {
      entries.push({ sessionId: session.id, file, key: editFileKey(session.id, file.id) })
    }
  }

  return entries
}

export function neighborEditEntry(
  entries: EditFileEntry[],
  currentKey: string | null,
  offset: -1 | 1
): EditFileEntry | null {
  if (!currentKey) return null

  const index = entries.findIndex((entry) => entry.key === currentKey)
  if (index === -1) return null

  return entries[index + offset] ?? null
}

const WINDOWS_DRIVE_PATTERN = /^[a-zA-Z]:/

export function isSafeRelativePath(input: string): boolean {
  if (!input || input.includes('\0')) return false
  if (input.startsWith('/') || input.startsWith('\\')) return false
  if (WINDOWS_DRIVE_PATTERN.test(input)) return false

  const segments = input.split(/[\\/]/)
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

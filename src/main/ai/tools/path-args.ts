export function normalizeToolPath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined

  const normalized = value
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '')

  return normalized === '' || normalized === '.' ? undefined : normalized
}

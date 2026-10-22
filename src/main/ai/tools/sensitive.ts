const ALLOWED_ENV_FILES = new Set(['.env.example', '.env.sample', '.env.template'])

const SENSITIVE_FILE_PATTERNS: readonly RegExp[] = [
  /^\.env(\..+)?$/i,
  /^\.envrc$/i,
  /^\.npmrc$/i,
  /^\.yarnrc(\.yml)?$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^_netrc$/i,
  /^\.pgpass$/i,
  /^\.htpasswd$/i,
  /^\.git-credentials$/i,
  /^credentials(\..+)?$/i,
  /^secrets?(\..+)?$/i,
  /^kubeconfig$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)$/i,
  /^service-account.*\.json$/i,
  /^firebase-adminsdk.*\.json$/i
]

const SENSITIVE_EXTENSIONS = new Set([
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.crt',
  '.cer',
  '.der',
  '.jks',
  '.keystore',
  '.kdbx',
  '.ppk',
  '.gpg',
  '.asc'
])

const SENSITIVE_DIRECTORY_SEGMENTS = new Set([
  '.ssh',
  '.aws',
  '.gnupg',
  '.azure',
  '.kube',
  '.docker'
])

const SECRET_PATTERNS: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/,
  /\bsk-[A-Za-z0-9]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{30,}\b/
]

const REDACTED = '[疑似敏感信息已屏蔽]'

export function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const segments = normalized.split('/').filter(Boolean)
  const fileName = (segments.at(-1) ?? '').toLowerCase()

  if (segments.some((segment) => SENSITIVE_DIRECTORY_SEGMENTS.has(segment.toLowerCase()))) {
    return true
  }
  if (!fileName) return false
  if (ALLOWED_ENV_FILES.has(fileName)) return false
  if (SENSITIVE_FILE_PATTERNS.some((pattern) => pattern.test(fileName))) return true

  const dot = fileName.lastIndexOf('.')
  return dot >= 0 && SENSITIVE_EXTENSIONS.has(fileName.slice(dot))
}

export function containsHighRiskSecret(text: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

export function redactSecretSnippet(line: string): string {
  return SECRET_PATTERNS.reduce(
    (result, pattern) => result.replace(new RegExp(pattern.source, 'g'), REDACTED),
    line
  )
}

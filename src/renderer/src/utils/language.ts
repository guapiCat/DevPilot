const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  vue: 'html',
  svelte: 'html',
  astro: 'html',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'mdx',
  yml: 'yaml',
  yaml: 'yaml',
  xml: 'xml',
  svg: 'xml',
  xsd: 'xml',
  plist: 'xml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',
  py: 'python',
  pyw: 'python',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  go: 'go',
  rs: 'rust',
  swift: 'swift',
  lua: 'lua',
  c: 'cpp',
  h: 'cpp',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  toml: 'ini',
  txt: 'plaintext',
  log: 'plaintext',
}

const LANGUAGE_BY_FILENAME: Readonly<Record<string, string>> = {
  dockerfile: 'dockerfile',
  '.editorconfig': 'ini',
  '.gitattributes': 'plaintext',
  '.gitignore': 'plaintext',
  '.npmrc': 'ini',
}

export function getMonacoLanguage(relativePath: string): string {
  const fileName = (relativePath.split('/').pop() ?? '').toLowerCase()

  const byFileName = LANGUAGE_BY_FILENAME[fileName]
  if (byFileName) return byFileName

  if (fileName === '.env' || fileName.startsWith('.env.')) return 'ini'

  const dotIndex = fileName.lastIndexOf('.')
  if (dotIndex === -1) return 'plaintext'

  return LANGUAGE_BY_EXTENSION[fileName.slice(dotIndex + 1)] ?? 'plaintext'
}

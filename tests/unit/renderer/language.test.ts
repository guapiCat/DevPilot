import { describe, expect, it } from 'vitest'
import { getMonacoLanguage } from '@renderer/utils/language'

describe('getMonacoLanguage', () => {
  it('按扩展名映射常见语言', () => {
    const cases: Array<[string, string]> = [
      ['src/main.ts', 'typescript'],
      ['src/App.vue', 'html'],
      ['scripts/build.mjs', 'javascript'],
      ['styles/app.scss', 'scss'],
      ['config/app.json', 'json'],
      ['README.md', 'markdown'],
      ['deploy/pod.yaml', 'yaml'],
      ['tools/run.ps1', 'powershell'],
      ['src/lib.rs', 'rust'],
      ['include/util.hpp', 'cpp']
    ]

    for (const [path, language] of cases) {
      expect(getMonacoLanguage(path), path).toBe(language)
    }
  })

  it('识别无扩展名的特殊文件名', () => {
    expect(getMonacoLanguage('Dockerfile')).toBe('dockerfile')
    expect(getMonacoLanguage('deploy/DOCKERFILE')).toBe('dockerfile')
    expect(getMonacoLanguage('.gitignore')).toBe('plaintext')
    expect(getMonacoLanguage('.editorconfig')).toBe('ini')
  })

  it('识别 .env 系列与无扩展名文件', () => {
    expect(getMonacoLanguage('.env')).toBe('ini')
    expect(getMonacoLanguage('config/.env.local')).toBe('ini')
    expect(getMonacoLanguage('LICENSE')).toBe('plaintext')
  })

  it('未知扩展名回退为纯文本', () => {
    expect(getMonacoLanguage('data/archive.xyz')).toBe('plaintext')
    expect(getMonacoLanguage('')).toBe('plaintext')
  })

  it('扩展名匹配不区分大小写', () => {
    expect(getMonacoLanguage('SRC/MAIN.TS')).toBe('typescript')
  })
})

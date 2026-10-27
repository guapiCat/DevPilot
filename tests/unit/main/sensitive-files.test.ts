import { describe, expect, it } from 'vitest'
import { containsHighRiskSecret, isSensitivePath, redactSecretSnippet } from '@main/ai/tools/sensitive'

describe('isSensitivePath', () => {
  it('阻断 .env 及变体，但允许示例文件', () => {
    expect(isSensitivePath('.env')).toBe(true)
    expect(isSensitivePath('.env.local')).toBe(true)
    expect(isSensitivePath('config/.env.production')).toBe(true)
    expect(isSensitivePath('.env.example')).toBe(false)
    expect(isSensitivePath('config/.env.sample')).toBe(false)
    expect(isSensitivePath('.env.template')).toBe(false)
  })

  it('阻断凭证、密钥与配置类文件名', () => {
    for (const file of [
      '.npmrc',
      '.pypirc',
      '.netrc',
      '.pgpass',
      '.git-credentials',
      'credentials.json',
      'secrets.yaml',
      'secret.txt',
      'kubeconfig',
      'id_rsa',
      'id_ed25519',
      'service-account-prod.json',
      'firebase-adminsdk-abc.json',
      'server.pem',
      'private.key',
      'store.p12',
      'cert.crt',
      'vault.kdbx',
    ]) {
      expect(isSensitivePath(file), file).toBe(true)
    }
  })

  it('阻断敏感目录下的任意文件', () => {
    expect(isSensitivePath('.ssh/config')).toBe(true)
    expect(isSensitivePath('home/.aws/credentials')).toBe(true)
    expect(isSensitivePath('project/.docker/config.json')).toBe(true)
    expect(isSensitivePath('.gnupg/pubring.kbx')).toBe(true)
  })

  it('放行普通源码与允许的路径形式', () => {
    expect(isSensitivePath('src/main/index.ts')).toBe(false)
    expect(isSensitivePath('.\\src\\a.ts')).toBe(false)
    expect(isSensitivePath('./README.md')).toBe(false)
    expect(isSensitivePath('docs/security.md')).toBe(false)
  })
})

describe('containsHighRiskSecret', () => {
  it('识别 PEM 私钥头与常见云令牌', () => {
    expect(containsHighRiskSecret('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
    expect(containsHighRiskSecret('key = sk-abcdefghijklmnopqrstuvwx')).toBe(true)
    expect(containsHighRiskSecret('token ghp_abcdefghijklmnopqrstuvwxyz')).toBe(true)
    expect(containsHighRiskSecret('AKIAABCDEFGHIJKLMNOP')).toBe(true)
    expect(containsHighRiskSecret('xoxb-1234567890-abcdef')).toBe(true)
    expect(containsHighRiskSecret('AIzaSyA1234567890abcdefghijklmnopqrstu')).toBe(true)
  })

  it('普通文本不误报', () => {
    expect(containsHighRiskSecret('const key = "hello"')).toBe(false)
    expect(containsHighRiskSecret('sk-short')).toBe(false)
    expect(containsHighRiskSecret('PUBLIC KEY')).toBe(false)
  })
})

describe('redactSecretSnippet', () => {
  it('替换命中片段中的秘密，保留其余文本', () => {
    const redacted = redactSecretSnippet('api_key = sk-abcdefghijklmnopqrstuvwx')
    expect(redacted).toContain('[疑似敏感信息已屏蔽]')
    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwx')
    expect(redacted).toContain('api_key')
  })

  it('脱敏多个出现位置', () => {
    const redacted = redactSecretSnippet('a AKIAABCDEFGHIJKLMNOP b AKIAABCDEFGHIJKLMNOP c')
    expect(redacted).toBe('a [疑似敏感信息已屏蔽] b [疑似敏感信息已屏蔽] c')
  })

  it('无命中时原样返回', () => {
    expect(redactSecretSnippet('const a = 1')).toBe('const a = 1')
  })
})

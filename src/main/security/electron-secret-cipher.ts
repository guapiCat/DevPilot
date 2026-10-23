import { safeStorage } from 'electron'
import type { SecretCipher } from './secret-cipher'

// 仅在 app.whenReady() 之后使用：safeStorage 依赖系统凭据加密（Windows DPAPI）。
export class ElectronSecretCipher implements SecretCipher {
  isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }

  encrypt(plain: string): string {
    return safeStorage.encryptString(plain).toString('base64')
  }

  decrypt(cipher: string): string {
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
  }
}

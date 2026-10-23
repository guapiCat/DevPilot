export interface SecretCipher {
  isAvailable(): boolean
  encrypt(plain: string): string
  decrypt(cipher: string): string
}

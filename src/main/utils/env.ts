import { existsSync } from 'node:fs'

/**
 * 依次加载存在的 .env 文件。已存在的环境变量不会被覆盖。
 * 仅加载文件，不读取或记录具体值，避免密钥进入日志。
 */
export function loadEnvFiles(paths: string[]): string[] {
  const loaded: string[] = []

  for (const file of paths) {
    if (!existsSync(file)) continue

    try {
      process.loadEnvFile(file)
      loaded.push(file)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.warn(`[env] 无法加载配置文件 ${file}: ${reason}`)
    }
  }

  return loaded
}

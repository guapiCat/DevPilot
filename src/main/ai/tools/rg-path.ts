import { existsSync } from 'node:fs'
import { rgPath } from '@vscode/ripgrep'

export const RG_PATH_ENV = 'DEV_PILOT_RG_PATH'

/**
 * 优先使用随包分发的 ripgrep，其次回退到系统 PATH 中的 rg。
 * 打包后 rg.exe 位于 app.asar.unpacked，需要通过真实文件路径启动。
 */
export function resolveRgCommand(override: string | undefined = process.env[RG_PATH_ENV]): string {
  if (override && existsSync(override)) return override
  if (typeof rgPath === 'string') {
    const unpackedPath = rgPath.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2')
    if (existsSync(unpackedPath)) return unpackedPath
  }
  return 'rg'
}

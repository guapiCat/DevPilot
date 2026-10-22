import { existsSync } from 'node:fs'
import { rgPath } from '@vscode/ripgrep'

export const RG_PATH_ENV = 'DEV_PILOT_RG_PATH'

/**
 * 优先使用随包分发的 ripgrep，其次回退到系统 PATH 中的 rg。
 * 打包为 asar 时需要把 @vscode/ripgrep 的 bin 目录加入 asarUnpack。
 */
export function resolveRgCommand(override: string | undefined = process.env[RG_PATH_ENV]): string {
  if (override && existsSync(override)) return override
  if (typeof rgPath === 'string' && existsSync(rgPath)) return rgPath
  return 'rg'
}

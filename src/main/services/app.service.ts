import type { AppInfo } from '@shared/types/app'
import type { PingResponse } from '@shared/types/api'

export interface AppInfoSource {
  name: string
  version: string
  platform: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  userDataPath: string
}

export function buildAppInfo(source: AppInfoSource): AppInfo {
  return {
    name: source.name,
    version: source.version,
    platform: source.platform,
    electronVersion: source.electronVersion,
    chromeVersion: source.chromeVersion,
    nodeVersion: source.nodeVersion,
    userDataPath: source.userDataPath,
  }
}

export function createPingResponse(message: string, now: Date = new Date()): PingResponse {
  return {
    message,
    receivedAt: now.toISOString(),
  }
}

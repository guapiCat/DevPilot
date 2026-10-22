export interface AppInfo {
  name: string
  version: string
  platform: string
  electronVersion: string
  chromeVersion: string
  nodeVersion: string
  userDataPath: string
}

export interface AiConfigStatus {
  configured: boolean
  model: string
  baseUrl: string
  source: 'env' | 'none'
}

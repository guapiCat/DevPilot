import type { ModelProfileSummary, ModelProviderKind } from './model'

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
  source: 'profile' | 'env' | 'none'
  provider: ModelProviderKind | null
  model: string
  baseUrl: string
  toolsEnabled: boolean
  activeProfileId: string | null
  profiles: ModelProfileSummary[]
  envConfigured: boolean
  secretStorageAvailable: boolean
}

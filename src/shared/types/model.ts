export type ModelProviderKind = 'deepseek' | 'openai-compatible'

export interface ModelProfileSummary {
  id: string
  name: string
  provider: ModelProviderKind
  model: string
  baseUrl: string
  toolsEnabled: boolean
  hasApiKey: boolean
  isActive: boolean
  updatedAt: string
}

export interface ModelProfileInput {
  id?: string
  name: string
  provider: ModelProviderKind
  model: string
  baseUrl: string
  apiKey?: string
  toolsEnabled: boolean
}

export interface TestModelProfileInput {
  profileId?: string
  provider: ModelProviderKind
  model: string
  baseUrl: string
  apiKey?: string
}

export interface ModelProfileIdInput {
  profileId: string
}

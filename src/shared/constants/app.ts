export const APP_NAME = 'DevPilot'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export const MAX_PING_MESSAGE_LENGTH = 200

export const AI_CONFIG_ENV = {
  apiKey: 'DEEPSEEK_API_KEY',
  model: 'DEEPSEEK_MODEL',
  baseUrl: 'DEEPSEEK_BASE_URL'
} as const

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appPing: 'app:ping',
  settingsGetAiConfig: 'app:get-ai-config-status'
} as const

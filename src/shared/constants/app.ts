export const APP_NAME = 'DevPilot'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export const MAX_PING_MESSAGE_LENGTH = 200

export const MAX_FILE_READ_BYTES = 1024 * 1024
export const MAX_FILE_TREE_ENTRIES = 5000
export const MAX_FILE_TREE_DEPTH = 32
export const MAX_RELATIVE_PATH_LENGTH = 4096
export const BINARY_SNIFF_BYTES = 8000

export const IGNORED_DIRECTORY_NAMES = ['.git', 'node_modules'] as const

export const AI_CONFIG_ENV = {
  apiKey: 'DEEPSEEK_API_KEY',
  model: 'DEEPSEEK_MODEL',
  baseUrl: 'DEEPSEEK_BASE_URL'
} as const

export const IPC_CHANNELS = {
  appGetInfo: 'app:get-info',
  appPing: 'app:ping',
  settingsGetAiConfig: 'app:get-ai-config-status',
  repositorySelect: 'repository:select',
  repositoryList: 'repository:list',
  repositoryGetTree: 'repository:get-tree',
  fileRead: 'file:read'
} as const

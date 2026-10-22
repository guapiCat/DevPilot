export const APP_NAME = 'DevPilot'

export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'

export const MAX_PING_MESSAGE_LENGTH = 200

export const MAX_CHAT_MESSAGE_LENGTH = 8000
export const CHAT_HISTORY_MAX_MESSAGES = 20
export const CHAT_HISTORY_MAX_CHARS = 24_000
export const CHAT_REQUEST_TIMEOUT_MS = 120_000
export const MODEL_CONNECTION_TEST_TIMEOUT_MS = 20_000
export const MAX_CHAT_OUTPUT_TOKENS = 4096
export const DEFAULT_CONVERSATION_TITLE = '新会话'
export const MAX_CONVERSATION_TITLE_LENGTH = 30

export const MAX_FILE_READ_BYTES = 1024 * 1024
export const MAX_FILE_WRITE_BYTES = 1024 * 1024
export const MAX_FILE_TREE_ENTRIES = 5000
export const MAX_FILE_TREE_DEPTH = 32
export const MAX_RELATIVE_PATH_LENGTH = 4096
export const BINARY_SNIFF_BYTES = 8000

export const GIT_COMMAND_TIMEOUT_MS = 10_000
export const MAX_GIT_OUTPUT_BYTES = 5 * 1024 * 1024
export const MAX_GIT_DIFF_BYTES = 512 * 1024
export const MAX_GIT_STATUS_ENTRIES = 2000

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
  settingsTestConnection: 'app:test-ai-connection',
  repositorySelect: 'repository:select',
  repositoryList: 'repository:list',
  repositoryGetTree: 'repository:get-tree',
  fileRead: 'file:read',
  fileWrite: 'file:write',
  gitStatus: 'git:status',
  gitDiff: 'git:diff',
  chatListConversations: 'chat:list-conversations',
  chatCreateConversation: 'chat:create-conversation',
  chatGetMessages: 'chat:get-messages',
  chatSend: 'chat:send',
  chatRetry: 'chat:retry',
  chatCancel: 'chat:cancel',
  chatEvent: 'chat:event'
} as const

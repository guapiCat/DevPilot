export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'REPOSITORY_NOT_FOUND'
  | 'PATH_NOT_ALLOWED'
  | 'FILE_NOT_FOUND'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'FILE_CHANGED'
  | 'FILE_WRITE_FAILED'
  | 'NOT_A_GIT_REPOSITORY'
  | 'GIT_NOT_AVAILABLE'
  | 'GIT_TIMEOUT'
  | 'GIT_OUTPUT_TOO_LARGE'
  | 'GIT_COMMAND_FAILED'
  | 'MODEL_CONFIG_ERROR'
  | 'MODEL_REQUEST_FAILED'
  | 'TOOL_EXECUTION_FAILED'
  | 'REQUEST_CANCELLED'
  | 'DATABASE_ERROR'
  | 'INTERNAL_ERROR'

export interface IpcErrorPayload {
  code: ErrorCode
  message: string
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: IpcErrorPayload }

import { ServiceError } from '@main/utils/service-error'
import { ToolExecutionError, type ToolErrorCode } from './tool-registry'

const SERVICE_CODE_MAP: Record<string, ToolErrorCode> = {
  REPOSITORY_NOT_FOUND: 'REPOSITORY_NOT_FOUND',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  PATH_NOT_ALLOWED: 'PATH_NOT_ALLOWED',
  NOT_A_GIT_REPOSITORY: 'NOT_A_GIT_REPOSITORY',
  GIT_NOT_AVAILABLE: 'GIT_NOT_AVAILABLE',
  GIT_TIMEOUT: 'GIT_TIMEOUT',
  GIT_COMMAND_FAILED: 'GIT_COMMAND_FAILED',
  GIT_OUTPUT_TOO_LARGE: 'GIT_COMMAND_FAILED'
}

export function toToolError(
  error: unknown,
  fallback: ToolErrorCode = 'TOOL_FAILED'
): ToolExecutionError {
  if (error instanceof ToolExecutionError) return error
  if (error instanceof ServiceError) {
    return new ToolExecutionError(SERVICE_CODE_MAP[error.code] ?? fallback, error.message)
  }
  return new ToolExecutionError(fallback, '工具执行失败')
}

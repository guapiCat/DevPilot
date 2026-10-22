import { z } from 'zod'
import type { ModelToolDefinition } from '../model-adapter'

export type ToolErrorCode =
  | 'INVALID_ARGUMENTS'
  | 'UNKNOWN_TOOL'
  | 'SENSITIVE_FILE'
  | 'PATH_NOT_ALLOWED'
  | 'FILE_NOT_FOUND'
  | 'REPOSITORY_NOT_FOUND'
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'RG_NOT_AVAILABLE'
  | 'SEARCH_FAILED'
  | 'NOT_A_GIT_REPOSITORY'
  | 'GIT_NOT_AVAILABLE'
  | 'GIT_TIMEOUT'
  | 'GIT_COMMAND_FAILED'
  | 'TOOL_FAILED'

export class ToolExecutionError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export interface ToolContext {
  repositoryId: string
  signal: AbortSignal
}

export interface ToolResult {
  content: string
  summary: string
  truncated: boolean
}

export interface ToolDefinition<S extends z.ZodType = z.ZodType> {
  name: string
  description: string
  schema: S
  summarizeArgs(args: z.output<S>): string
  execute(args: z.output<S>, context: ToolContext): Promise<ToolResult>
}

interface RegisteredTool {
  modelTool: ModelToolDefinition
  summarize(rawArgs: unknown): string
  execute(rawArgs: unknown, context: ToolContext): Promise<ToolResult>
}

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>()

  register<S extends z.ZodType>(definition: ToolDefinition<S>): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`工具重复注册：${definition.name}`)
    }

    const parameters = z.toJSONSchema(definition.schema) as Record<string, unknown>
    delete parameters.$schema

    this.tools.set(definition.name, {
      modelTool: {
        name: definition.name,
        description: definition.description,
        parameters
      },
      summarize: (rawArgs) => {
        const parsed = definition.schema.safeParse(rawArgs)
        return parsed.success ? definition.summarizeArgs(parsed.data) : '(参数无效)'
      },
      execute: async (rawArgs, context) => {
        const parsed = definition.schema.safeParse(rawArgs)
        if (!parsed.success) {
          throw new ToolExecutionError('INVALID_ARGUMENTS', '工具参数不合法')
        }
        return definition.execute(parsed.data, context)
      }
    })
  }

  toModelTools(): ModelToolDefinition[] {
    return [...this.tools.values()].map((tool) => tool.modelTool)
  }

  summarize(name: string, rawArgs: unknown): string {
    return this.tools.get(name)?.summarize(rawArgs) ?? '(未知工具)'
  }

  execute(name: string, rawArgs: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name)
    if (!tool) {
      return Promise.reject(new ToolExecutionError('UNKNOWN_TOOL', `未知工具：${name}`))
    }
    return tool.execute(rawArgs, context)
  }
}

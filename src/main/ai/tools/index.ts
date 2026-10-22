import { createGitDiffTool, createGitStatusTool } from './git.tools'
import { createListFilesTool } from './list-files.tool'
import { createProposeEditTool } from './propose-edit.tool'
import { createReadFileTool } from './read-file.tool'
import { createSearchCodeTool } from './search-code.tool'
import { ToolRegistry } from './tool-registry'

export function createDefaultToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry()
  registry.register(createListFilesTool())
  registry.register(createReadFileTool())
  registry.register(createSearchCodeTool())
  registry.register(createGitStatusTool())
  registry.register(createGitDiffTool())
  registry.register(createProposeEditTool())
  return registry
}

export { ToolExecutionError, ToolRegistry } from './tool-registry'
export type { ToolContext, ToolDefinition, ToolResult } from './tool-registry'

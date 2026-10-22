export type ToolCallStatus = 'running' | 'success' | 'error' | 'blocked' | 'timeout' | 'cancelled'

export interface ToolCallRecord {
  id: string
  name: string
  argumentsSummary: string
  status: ToolCallStatus
  summary: string
  durationMs: number
}

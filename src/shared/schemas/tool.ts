import { z } from 'zod'
import {
  MAX_TOOL_ARG_SUMMARY_CHARS,
  MAX_TOOL_RESULT_SUMMARY_CHARS,
  MAX_TOOL_RECORDS_PER_MESSAGE
} from '@shared/constants/app'

export const toolCallStatusSchema = z.enum([
  'running',
  'success',
  'error',
  'blocked',
  'timeout',
  'cancelled'
])

export const toolCallRecordSchema = z.strictObject({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(64),
  argumentsSummary: z.string().max(MAX_TOOL_ARG_SUMMARY_CHARS * 2),
  status: toolCallStatusSchema,
  summary: z.string().max(MAX_TOOL_RESULT_SUMMARY_CHARS * 2),
  durationMs: z.number().int().min(0)
})

export const toolCallsSchema = z.array(toolCallRecordSchema).max(MAX_TOOL_RECORDS_PER_MESSAGE)

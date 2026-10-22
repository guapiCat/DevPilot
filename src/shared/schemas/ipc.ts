import { z } from 'zod'
import { MAX_PING_MESSAGE_LENGTH } from '../constants/app'

export const pingInputSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, '消息不能为空')
    .max(MAX_PING_MESSAGE_LENGTH, `消息不能超过 ${MAX_PING_MESSAGE_LENGTH} 个字符`)
})

export type PingInput = z.infer<typeof pingInputSchema>

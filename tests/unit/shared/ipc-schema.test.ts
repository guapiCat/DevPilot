import { describe, expect, it } from 'vitest'
import { MAX_PING_MESSAGE_LENGTH } from '@shared/constants/app'
import { pingInputSchema } from '@shared/schemas/ipc'

describe('pingInputSchema', () => {
  it('接受合法消息并去除首尾空白', () => {
    expect(pingInputSchema.parse({ message: '  hello  ' })).toEqual({ message: 'hello' })
  })

  it('拒绝空字符串', () => {
    expect(pingInputSchema.safeParse({ message: '   ' }).success).toBe(false)
  })

  it('拒绝超长消息', () => {
    const message = 'a'.repeat(MAX_PING_MESSAGE_LENGTH + 1)
    expect(pingInputSchema.safeParse({ message }).success).toBe(false)
  })

  it('拒绝非对象输入', () => {
    expect(pingInputSchema.safeParse('hello').success).toBe(false)
    expect(pingInputSchema.safeParse(null).success).toBe(false)
  })
})

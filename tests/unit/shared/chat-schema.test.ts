import { describe, expect, it } from 'vitest'
import { MAX_CHAT_MESSAGE_LENGTH } from '@shared/constants/app'
import {
  chatCancelInputSchema,
  chatCreateConversationInputSchema,
  chatGetMessagesInputSchema,
  chatRetryInputSchema,
  chatSendInputSchema
} from '@shared/schemas/ipc'

const requestId = '11111111-1111-4111-8111-111111111111'
const conversationId = '22222222-2222-4222-8222-222222222222'
const repositoryId = '33333333-3333-4333-8333-333333333333'

describe('chatCreateConversationInputSchema', () => {
  it('接受已登记仓库或空仓库', () => {
    expect(chatCreateConversationInputSchema.parse({ repositoryId })).toEqual({ repositoryId })
    expect(chatCreateConversationInputSchema.parse({ repositoryId: null })).toEqual({
      repositoryId: null
    })
  })

  it('拒绝非法仓库 ID', () => {
    expect(chatCreateConversationInputSchema.safeParse({ repositoryId: 'nope' }).success).toBe(
      false
    )
    expect(chatCreateConversationInputSchema.safeParse({}).success).toBe(false)
  })
})

describe('chatGetMessagesInputSchema', () => {
  it('只接受合法会话 ID', () => {
    expect(chatGetMessagesInputSchema.safeParse({ conversationId }).success).toBe(true)
    expect(chatGetMessagesInputSchema.safeParse({ conversationId: 'nope' }).success).toBe(false)
  })
})

describe('chatSendInputSchema', () => {
  const validInput = { requestId, conversationId, content: '  如何排查登录问题？  ' }

  it('接受合法消息并去除首尾空白', () => {
    expect(chatSendInputSchema.parse(validInput)).toEqual({
      requestId,
      conversationId,
      content: '如何排查登录问题？'
    })
  })

  it('拒绝空消息与超长消息', () => {
    expect(chatSendInputSchema.safeParse({ ...validInput, content: '   ' }).success).toBe(false)
    expect(
      chatSendInputSchema.safeParse({
        ...validInput,
        content: 'a'.repeat(MAX_CHAT_MESSAGE_LENGTH + 1)
      }).success
    ).toBe(false)
  })

  it('拒绝非法请求与会话 ID', () => {
    expect(chatSendInputSchema.safeParse({ ...validInput, requestId: 'nope' }).success).toBe(false)
    expect(chatSendInputSchema.safeParse({ ...validInput, conversationId: 'nope' }).success).toBe(
      false
    )
  })
})

describe('chatRetryInputSchema 与 chatCancelInputSchema', () => {
  it('校验请求与会话 ID', () => {
    expect(chatRetryInputSchema.safeParse({ requestId, conversationId }).success).toBe(true)
    expect(chatRetryInputSchema.safeParse({ requestId, conversationId: 'nope' }).success).toBe(
      false
    )
    expect(chatCancelInputSchema.safeParse({ requestId }).success).toBe(true)
    expect(chatCancelInputSchema.safeParse({ requestId: 'nope' }).success).toBe(false)
  })
})

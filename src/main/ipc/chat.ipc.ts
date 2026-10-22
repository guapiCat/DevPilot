import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import {
  chatCancelInputSchema,
  chatCreateConversationInputSchema,
  chatGetMessagesInputSchema,
  chatRetryInputSchema,
  chatSendInputSchema
} from '@shared/schemas/ipc'
import { chatService, type ChatEventSink } from '../services/chat.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerChatIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.chatListConversations, () => {
    try {
      return ipcOk(chatService.listConversations())
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.chatCreateConversation, (_event, input: unknown) => {
    const parsed = chatCreateConversationInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '会话参数不合法')

    try {
      return ipcOk(chatService.createConversation(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.chatGetMessages, (_event, input: unknown) => {
    const parsed = chatGetMessagesInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '会话参数不合法')

    try {
      return ipcOk(chatService.getMessages(parsed.data.conversationId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.chatSend, (event, input: unknown) => {
    const parsed = chatSendInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '消息参数不合法')

    const sink: ChatEventSink = (payload) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.chatEvent, payload)
      }
    }

    try {
      return ipcOk(chatService.send(parsed.data, sink))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.chatRetry, (event, input: unknown) => {
    const parsed = chatRetryInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '请求参数不合法')

    const sink: ChatEventSink = (payload) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.chatEvent, payload)
      }
    }

    try {
      return ipcOk(chatService.retry(parsed.data, sink))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.chatCancel, (_event, input: unknown) => {
    const parsed = chatCancelInputSchema.safeParse(input)
    if (!parsed.success) return ipcFail('VALIDATION_ERROR', '请求参数不合法')

    return ipcOk(chatService.cancel(parsed.data.requestId))
  })
}

import { ChatOpenAI } from '@langchain/openai'
import { OpenAiCompatibleAdapter, type ChatModelOptions } from './openai-compatible.adapter'

export interface OpenAiChatAdapterOptions {
  apiKey: string
  model: string
  baseUrl: string
}

export class OpenAiChatAdapter extends OpenAiCompatibleAdapter {
  constructor(options: OpenAiChatAdapterOptions) {
    super({
      ...options,
      createModel: (modelOptions: ChatModelOptions) =>
        new ChatOpenAI({
          ...modelOptions,
          apiKey: modelOptions.apiKey || 'not-needed'
        })
    })
  }
}

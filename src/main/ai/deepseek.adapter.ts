import { ChatDeepSeek } from '@langchain/deepseek'
import { OpenAiCompatibleAdapter, type ChatModelOptions } from './openai-compatible.adapter'

export {
  finalizeToolCalls,
  mergeToolCallChunks,
  normalizeContent,
  type ToolCallAccumulatorState
} from './openai-compatible.adapter'

export interface DeepSeekAdapterOptions {
  apiKey: string
  model: string
  baseUrl: string
}

export class DeepSeekAdapter extends OpenAiCompatibleAdapter {
  constructor(options: DeepSeekAdapterOptions) {
    super({
      ...options,
      createModel: (modelOptions: ChatModelOptions) => new ChatDeepSeek(modelOptions)
    })
  }
}

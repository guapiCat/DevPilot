import type { ModelProviderKind } from '../types/model'

export interface ModelProviderPreset {
  id: string
  label: string
  provider: ModelProviderKind
  baseUrl: string
  defaultModel: string
  requiresApiKey: boolean
}

// 默认值仅作参考，以各服务商文档为准；用户可在档案中修改。
export const MODEL_PROVIDER_PRESETS: readonly ModelProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    requiresApiKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    provider: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    requiresApiKey: true,
  },
  {
    id: 'dashscope',
    label: '通义千问',
    provider: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    requiresApiKey: true,
  },
  {
    id: 'moonshot',
    label: 'Moonshot / Kimi',
    provider: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    requiresApiKey: true,
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    provider: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4-plus',
    requiresApiKey: true,
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    provider: 'openai-compatible',
    baseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'deepseek-ai/DeepSeek-V3',
    requiresApiKey: true,
  },
  {
    id: 'ollama',
    label: 'Ollama（本地）',
    provider: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1',
    defaultModel: 'qwen2.5:7b',
    requiresApiKey: false,
  },
  {
    id: 'custom',
    label: '自定义',
    provider: 'openai-compatible',
    baseUrl: '',
    defaultModel: '',
    requiresApiKey: false,
  },
]

export function findModelProviderPreset(id: string): ModelProviderPreset | undefined {
  return MODEL_PROVIDER_PRESETS.find((preset) => preset.id === id)
}

export function matchModelProviderPreset(
  provider: ModelProviderKind,
  baseUrl: string,
): ModelProviderPreset | undefined {
  const normalized = baseUrl.replace(/\/+$/, '')
  return MODEL_PROVIDER_PRESETS.find(
    (preset) =>
      preset.baseUrl.length > 0 && preset.provider === provider && preset.baseUrl.replace(/\/+$/, '') === normalized,
  )
}

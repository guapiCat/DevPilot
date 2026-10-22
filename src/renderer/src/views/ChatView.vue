<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import ChatComposer from '@renderer/components/chat/ChatComposer.vue'
import ConversationList from '@renderer/components/chat/ConversationList.vue'
import MessageList from '@renderer/components/chat/MessageList.vue'
import { desktopApi } from '@renderer/services/desktop-api'
import { useChatStore } from '@renderer/stores/chat'
import { useRepositoryStore } from '@renderer/stores/repository'
import { toErrorMessage } from '@renderer/utils/errors'

const chat = useChatStore()
const repository = useRepositoryStore()

const {
  conversations,
  activeConversationId,
  activeMessages,
  isGenerating,
  isGeneratingInActiveConversation,
  isCreatingConversation,
  canRetry,
  errorMessage
} = storeToRefs(chat)
const { activeRepository } = storeToRefs(repository)

const aiConfigured = ref(true)
const aiConfigLoading = ref(true)

onMounted(async () => {
  void chat.initialize()

  try {
    const status = await desktopApi.settings.getAiConfigStatus()
    aiConfigured.value = status.configured
  } catch (error) {
    chat.setError(toErrorMessage(error))
  } finally {
    aiConfigLoading.value = false
  }
})

async function handleCreate(): Promise<void> {
  try {
    await chat.createConversation(activeRepository.value?.id ?? null)
  } catch (error) {
    chat.setError(toErrorMessage(error))
  }
}

async function handleSelect(id: string): Promise<void> {
  try {
    await chat.selectConversation(id)
  } catch (error) {
    chat.setError(toErrorMessage(error))
  }
}

function handleSend(content: string): void {
  void chat.sendMessage(content, activeRepository.value?.id ?? null)
}

function handleCancel(): void {
  void chat.cancelGeneration()
}

function handleRetry(): void {
  void chat.retryLast()
}
</script>

<template>
  <div class="chat-view">
    <header class="page-header">
      <div>
        <h1>研发对话</h1>
        <p>当前版本只依据对话历史回答，不会读取仓库文件；对话内容会发送到云端模型。</p>
      </div>

      <router-link class="repo-chip" :to="{ name: 'workspace' }">
        <el-icon :size="14"><FolderOpened /></el-icon>
        <span>{{ activeRepository?.name ?? '未关联仓库' }}</span>
      </router-link>
    </header>

    <div class="chat-body">
      <ConversationList
        :conversations="conversations"
        :active-id="activeConversationId"
        :creating="isCreatingConversation"
        @create="handleCreate"
        @select="handleSelect"
      />

      <section class="chat-main">
        <MessageList
          :messages="activeMessages"
          :generating="isGeneratingInActiveConversation"
          :retryable="canRetry"
          @retry="handleRetry"
        />

        <el-alert
          v-if="!aiConfigLoading && !aiConfigured"
          class="chat-error"
          type="warning"
          title="尚未配置 DeepSeek API Key"
          show-icon
          :closable="false"
        >
          <template #default>
            请在
            <router-link class="inline-link" :to="{ name: 'settings' }">设置页</router-link>
            查看配置方式，并在修改 .env 后重启应用。
          </template>
        </el-alert>

        <el-alert
          v-if="errorMessage"
          class="chat-error"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
        />

        <ChatComposer
          :disabled="!aiConfigured"
          disabled-hint="请先在设置页配置 DeepSeek API Key"
          :generating="isGenerating"
          @send="handleSend"
          @cancel="handleCancel"
        />
      </section>
    </div>
  </div>
</template>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.page-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 28px 18px;
  border-bottom: 1px solid var(--dp-border);
  background: linear-gradient(180deg, #1b1e25 0%, #181b21 100%);
}

.page-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--dp-text-secondary);
  font-size: 12.5px;
}

.repo-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  background: var(--dp-bg-panel);
  color: var(--dp-text-secondary);
  font-size: 12px;
  text-decoration: none;
  transition:
    border-color 0.15s,
    color 0.15s;
}

.repo-chip:hover {
  border-color: var(--dp-border-strong);
  color: var(--dp-text);
}

.chat-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.chat-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-error {
  margin: 0 24px 10px;
}

.inline-link {
  color: var(--dp-accent);
  text-decoration: underline;
}
</style>

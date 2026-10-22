<script setup lang="ts">
import { FolderOpened } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import ChatComposer from '@renderer/components/chat/ChatComposer.vue'
import ConversationList from '@renderer/components/chat/ConversationList.vue'
import MessageList from '@renderer/components/chat/MessageList.vue'
import { useChatStore } from '@renderer/stores/chat'
import { useRepositoryStore } from '@renderer/stores/repository'

const chat = useChatStore()
const repository = useRepositoryStore()

const { conversations, activeConversationId, activeMessages, isGenerating, errorMessage } =
  storeToRefs(chat)
const { activeRepository } = storeToRefs(repository)

function handleCreate(): void {
  chat.createConversation(activeRepository.value?.id ?? null)
}

function handleSelect(id: string): void {
  chat.selectConversation(id)
}
</script>

<template>
  <div class="chat-view">
    <header class="page-header">
      <div>
        <h1>研发对话</h1>
        <p>围绕当前仓库的代码与变更进行讨论，回答会引用真实的文件上下文。</p>
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
        @create="handleCreate"
        @select="handleSelect"
      />

      <section class="chat-main">
        <MessageList :messages="activeMessages" :generating="isGenerating" />

        <el-alert
          v-if="errorMessage"
          class="chat-error"
          :title="errorMessage"
          type="error"
          show-icon
          :closable="false"
        />

        <ChatComposer disabled disabled-hint="AI 模型接入将在阶段 4 完成，当前仅展示界面" />
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
</style>

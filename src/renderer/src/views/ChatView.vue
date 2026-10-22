<script setup lang="ts">
import { onMounted } from 'vue'
import { FolderOpened } from '@element-plus/icons-vue'
import { ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import ChatPanel from '@renderer/components/chat/ChatPanel.vue'
import ConversationList from '@renderer/components/chat/ConversationList.vue'
import { useChatStore } from '@renderer/stores/chat'
import { useRepositoryStore } from '@renderer/stores/repository'
import { toErrorMessage } from '@renderer/utils/errors'

const chat = useChatStore()
const repository = useRepositoryStore()

const {
  conversations,
  activeConversationId,
  isCreatingConversation,
  generatingConversationId,
  deletingConversationId
} = storeToRefs(chat)
const { activeRepository } = storeToRefs(repository)

onMounted(() => {
  void chat.initialize()
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

async function handleRemove(id: string): Promise<void> {
  const conversation = conversations.value.find((item) => item.id === id)
  if (!conversation) return

  try {
    await ElMessageBox.confirm(
      `删除会话“${conversation.title}”？该会话的全部消息将被永久删除，无法恢复。`,
      '删除会话',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  await chat.deleteConversation(id)
}
</script>

<template>
  <div class="chat-view">
    <header class="page-header">
      <div>
        <h1>研发对话</h1>
        <p>
          可读取当前关联仓库的少量文件与搜索片段，内容会发送到云端模型；工具只读，不会修改文件。
        </p>
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
        :generating-id="generatingConversationId"
        :deleting-id="deletingConversationId"
        @create="handleCreate"
        @select="handleSelect"
        @remove="handleRemove"
      />

      <section class="chat-main">
        <ChatPanel :repository-id="activeRepository?.id ?? null" />
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
  background: var(--dp-bg-header);
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
</style>

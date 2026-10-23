<script setup lang="ts">
import { DocumentChecked } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import ChatComposer from './ChatComposer.vue'
import MessageList from './MessageList.vue'
import ModelSwitcher from './ModelSwitcher.vue'
import { useChatStore } from '@renderer/stores/chat'
import { useEditStore } from '@renderer/stores/edits'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const props = withDefaults(
  defineProps<{
    repositoryId?: string | null
    compact?: boolean
  }>(),
  { repositoryId: null, compact: false }
)

const chat = useChatStore()
const edits = useEditStore()
const workspace = useWorkspaceStore()
const router = useRouter()
const route = useRoute()
const {
  activeMessages,
  isGenerating,
  isGeneratingInActiveConversation,
  canRetry,
  errorMessage,
  aiConfigured,
  aiConfigLoading
} = storeToRefs(chat)
const { totalCount } = storeToRefs(edits)

async function goReview(): Promise<void> {
  workspace.showDiffPanel('proposals')

  if (route.name !== 'workspace') {
    void router.push({ name: 'workspace' })
  }

  await edits.loadPending(chat.activeConversationId)
}

function handleSend(content: string): void {
  void chat.sendMessage(content, props.repositoryId)
}

function handleCancel(): void {
  void chat.cancelGeneration()
}

function handleRetry(): void {
  void chat.retryLast()
}
</script>

<template>
  <div class="chat-panel" :class="{ 'is-compact': compact }">
    <MessageList
      :messages="activeMessages"
      :generating="isGeneratingInActiveConversation"
      :retryable="canRetry"
      @retry="handleRetry"
    />

    <el-alert
      v-if="!aiConfigLoading && !aiConfigured"
      class="panel-alert"
      type="warning"
      title="尚未配置模型服务"
      show-icon
      :closable="false"
    >
      <template #default>
        请在
        <router-link class="inline-link" :to="{ name: 'settings' }">设置页</router-link>
        新增模型档案，或填写 .env 后重启应用。
      </template>
    </el-alert>

    <el-alert
      v-if="totalCount > 0"
      class="panel-alert edit-alert"
      type="warning"
      show-icon
      :closable="false"
    >
      <template #title>
        <span class="edit-alert-row">
          <span>有 {{ totalCount }} 个文件修改建议待审核</span>
          <el-button
            class="review-btn"
            type="primary"
            size="small"
            :icon="DocumentChecked"
            @click="goReview"
          >
            去审核
          </el-button>
        </span>
      </template>
    </el-alert>

    <el-alert
      v-if="errorMessage"
      class="panel-alert"
      :title="errorMessage"
      type="error"
      show-icon
      @close="chat.clearError()"
    />

    <ChatComposer
      :disabled="!aiConfigured"
      disabled-hint="请先在设置页配置模型服务"
      :generating="isGenerating"
      @send="handleSend"
      @cancel="handleCancel"
    >
      <template #toolbar>
        <ModelSwitcher />
      </template>
    </ChatComposer>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.panel-alert {
  margin: 0 24px 10px;
}

.inline-link {
  color: var(--dp-accent);
  text-decoration: underline;
}

.edit-alert {
  color: var(--dp-text-secondary);
}

.edit-alert :deep(.el-alert__content) {
  flex: 1;
  min-width: 0;
}

.edit-alert :deep(.el-alert__title) {
  width: 100%;
  line-height: 20px;
}

.edit-alert-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.review-btn {
  margin-left: auto;
}

.is-compact .panel-alert {
  margin: 6px 10px;
}

.is-compact :deep(.message) {
  padding: 12px 14px;
}

.is-compact :deep(.generating) {
  padding: 6px 14px 12px;
}

.is-compact :deep(.retry-row) {
  padding: 4px 14px 12px;
}

.is-compact :deep(.empty-state) {
  padding: 24px 16px;
}

.is-compact :deep(.composer) {
  padding: 10px 12px 14px;
}

.is-compact :deep(.el-textarea__inner) {
  min-height: 58px !important;
}

.is-compact :deep(.footer .hint) {
  display: none;
}
</style>

<script setup lang="ts">
import { ChatLineRound } from '@element-plus/icons-vue'
import type { ChatMessage } from '@shared/types/chat'
import EmptyState from '@renderer/components/common/EmptyState.vue'

withDefaults(
  defineProps<{
    messages: ChatMessage[]
    generating?: boolean
    retryable?: boolean
  }>(),
  { generating: false, retryable: false }
)

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="message-list">
    <EmptyState
      v-if="messages.length === 0"
      :icon="ChatLineRound"
      title="开始一次研发对话"
      description="当前版本的 AI 只根据对话历史回答，不会读取或修改仓库文件；回答内容会发送到所配置的云端模型。"
    >
      <div class="stage-note">文件上下文与工具调用将在阶段 5 接入</div>
    </EmptyState>

    <template v-else>
      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="`role-${message.role}`"
      >
        <header>
          <span>{{ message.role === 'user' ? '你' : 'DevPilot' }}</span>
          <span v-if="message.status === 'cancelled'" class="status-tag">已停止</span>
          <span v-else-if="message.status === 'error'" class="status-tag danger">生成失败</span>
        </header>
        <p v-if="message.content">{{ message.content }}</p>
        <p v-else-if="message.status === 'cancelled'" class="placeholder-text">已停止生成</p>
        <p v-else class="placeholder-text">正在等待回复…</p>
      </article>

      <div v-if="retryable && !generating" class="retry-row">
        <el-button size="small" @click="emit('retry')">重试上一条问题</el-button>
      </div>

      <div v-if="generating" class="generating">
        <span class="dot"></span>
        <span class="dot"></span>
        <span class="dot"></span>
        <span>正在生成…</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
.message-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.stage-note {
  padding: 6px 12px;
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
}

.message {
  max-width: 820px;
  margin: 0 auto;
  padding: 18px 28px;
}

.message + .message {
  border-top: 1px solid var(--dp-border);
}

.message header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.status-tag {
  padding: 1px 7px;
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0;
}

.status-tag.danger {
  border-color: color-mix(in srgb, var(--dp-danger) 45%, transparent);
  color: var(--dp-danger);
}

.placeholder-text {
  color: var(--dp-text-muted);
  font-style: italic;
}

.retry-row {
  display: flex;
  justify-content: center;
  padding: 4px 28px 18px;
}

.message p {
  margin: 0;
  color: var(--dp-text);
  line-height: 1.75;
  white-space: pre-wrap;
}

.role-user p {
  color: var(--dp-text-secondary);
}

.generating {
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: 820px;
  margin: 0 auto;
  padding: 10px 28px 20px;
  color: var(--dp-text-muted);
  font-size: 12px;
}

.dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dp-accent);
  animation: pulse 1.2s infinite ease-in-out;
}

.dot:nth-child(2) {
  animation-delay: 0.15s;
}

.dot:nth-child(3) {
  animation-delay: 0.3s;
}

.dot + span {
  margin-left: 6px;
}

@keyframes pulse {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: translateY(0);
  }
  40% {
    opacity: 1;
    transform: translateY(-2px);
  }
}
</style>

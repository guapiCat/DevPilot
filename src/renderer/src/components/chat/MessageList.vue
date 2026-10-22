<script setup lang="ts">
import { ChatLineRound } from '@element-plus/icons-vue'
import type { ChatMessage } from '@shared/types/chat'
import EmptyState from '@renderer/components/common/EmptyState.vue'

withDefaults(
  defineProps<{
    messages: ChatMessage[]
    generating?: boolean
  }>(),
  { generating: false }
)
</script>

<template>
  <div class="message-list">
    <EmptyState
      v-if="messages.length === 0"
      :icon="ChatLineRound"
      title="开始一次研发对话"
      description="AI 将读取你授权仓库中的代码来回答。任何文件修改都会先以 Diff 展示，只有你确认后才会写入本地文件。"
    >
      <div class="stage-note">当前为界面骨架 · 模型与工具接入将在阶段 4–6 完成</div>
    </EmptyState>

    <template v-else>
      <article
        v-for="message in messages"
        :key="message.id"
        class="message"
        :class="`role-${message.role}`"
      >
        <header>{{ message.role === 'user' ? '你' : 'DevPilot' }}</header>
        <p>{{ message.content }}</p>
      </article>
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
  margin-bottom: 6px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
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

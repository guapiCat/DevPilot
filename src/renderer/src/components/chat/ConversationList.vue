<script setup lang="ts">
import { ChatDotRound, Plus } from '@element-plus/icons-vue'
import type { Conversation } from '@shared/types/chat'
import EmptyState from '@renderer/components/common/EmptyState.vue'

defineProps<{
  conversations: Conversation[]
  activeId: string | null
}>()

const emit = defineEmits<{
  create: []
  select: [id: string]
}>()

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<template>
  <section class="conversation-list">
    <header class="header">
      <span>会话</span>
      <el-tooltip content="新建会话" placement="right">
        <el-button circle size="small" aria-label="新建会话" @click="emit('create')">
          <el-icon><Plus /></el-icon>
        </el-button>
      </el-tooltip>
    </header>

    <div v-if="conversations.length === 0" class="empty">
      <EmptyState
        compact
        :icon="ChatDotRound"
        title="还没有会话"
        description="新建会话开始研发讨论"
      />
    </div>

    <ul v-else class="list">
      <li v-for="conversation in conversations" :key="conversation.id">
        <button
          type="button"
          class="entry"
          :class="{ active: conversation.id === activeId }"
          @click="emit('select', conversation.id)"
        >
          <span class="entry-title">{{ conversation.title }}</span>
          <span class="entry-time">{{ formatTime(conversation.updatedAt) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.conversation-list {
  display: flex;
  flex: 0 0 248px;
  flex-direction: column;
  width: 248px;
  min-height: 0;
  background: var(--dp-bg-sidebar);
  border-right: 1px solid var(--dp-border);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 48px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-secondary);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.empty {
  flex: 1;
  min-height: 0;
}

.list {
  flex: 1;
  padding: 8px;
  margin: 0;
  overflow: auto;
  list-style: none;
}

.list li + li {
  margin-top: 2px;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--dp-text-secondary);
  text-align: left;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s;
}

.entry:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.entry.active {
  background: var(--dp-accent-soft);
  color: var(--dp-text);
}

.entry-title {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-time {
  color: var(--dp-text-muted);
  font-size: 11px;
}
</style>

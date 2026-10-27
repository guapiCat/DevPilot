<script setup lang="ts">
import { ChatDotRound, Delete, Plus } from '@element-plus/icons-vue'
import type { Conversation } from '@shared/types/chat'
import EmptyState from '@renderer/components/common/EmptyState.vue'

withDefaults(
  defineProps<{
    conversations: Conversation[]
    activeId: string | null
    creating?: boolean
    generatingId?: string | null
    deletingId?: string | null
  }>(),
  { creating: false, generatingId: null, deletingId: null },
)

const emit = defineEmits<{
  create: []
  select: [id: string]
  remove: [id: string]
}>()

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <section class="conversation-list">
    <header class="header">
      <span>会话</span>
      <el-tooltip content="新建会话" placement="right">
        <el-button circle size="small" aria-label="新建会话" :loading="creating" @click="emit('create')">
          <el-icon><Plus /></el-icon>
        </el-button>
      </el-tooltip>
    </header>

    <div v-if="conversations.length === 0" class="empty">
      <EmptyState compact :icon="ChatDotRound" title="还没有会话" description="新建会话开始研发讨论" />
    </div>

    <ul v-else class="list">
      <li
        v-for="conversation in conversations"
        :key="conversation.id"
        class="entry-row"
        :class="{
          active: conversation.id === activeId,
          deleting: conversation.id === deletingId,
        }">
        <button
          type="button"
          class="entry"
          :class="{ active: conversation.id === activeId }"
          @click="emit('select', conversation.id)">
          <span class="entry-title">{{ conversation.title }}</span>
          <span class="entry-time">{{ formatTime(conversation.updatedAt) }}</span>
        </button>
        <button
          type="button"
          class="entry-remove"
          :disabled="conversation.id === generatingId || conversation.id === deletingId"
          :title="conversation.id === generatingId ? '生成中不可删除' : '删除会话（不可恢复）'"
          :aria-label="`删除会话 ${conversation.title}`"
          @click.stop="emit('remove', conversation.id)">
          <el-icon :size="13"><Delete /></el-icon>
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

.entry-row {
  position: relative;
  display: flex;
}

.entry-row.deleting {
  pointer-events: none;
  opacity: 0.5;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 9px 34px 9px 10px;
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

.entry-remove {
  position: absolute;
  top: 50%;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dp-text-muted);
  cursor: pointer;
  opacity: 0;
  transform: translateY(-50%);
  transition:
    background 0.15s,
    color 0.15s,
    opacity 0.15s;
}

.entry-row:hover .entry-remove,
.entry-remove:focus-visible {
  opacity: 1;
}

.entry-remove:hover:not(:disabled) {
  background: color-mix(in srgb, var(--dp-danger) 18%, transparent);
  color: var(--dp-danger);
}

.entry-remove:disabled {
  cursor: not-allowed;
  opacity: 0;
}

.entry-row:hover .entry-remove:disabled {
  opacity: 0.35;
}
</style>

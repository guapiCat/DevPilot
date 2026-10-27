<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import { computed } from 'vue'
import type { GitLogEntry } from '@shared/types/git'
import { formatGitRelativeTime, formatGitTime } from '@renderer/utils/git'

const props = defineProps<{
  entries: GitLogEntry[]
  loading: boolean
  error: string | null
  hasMore: boolean
  selectedSha: string | null
}>()

const emit = defineEmits<{
  select: [sha: string]
  loadMore: []
  refresh: []
}>()

const showEmpty = computed(() => !props.loading && !props.error && props.entries.length === 0)
</script>

<template>
  <div class="history-panel">
    <header class="panel-head">
      <span class="panel-title">提交历史</span>
      <el-button text size="small" :loading="loading" aria-label="刷新提交历史" @click="emit('refresh')">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </header>

    <div v-if="error" class="history-error">
      <el-alert :title="error" type="error" show-icon :closable="false" />
      <el-button size="small" @click="emit('refresh')">重试</el-button>
    </div>

    <div v-else-if="loading && entries.length === 0" class="history-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else-if="showEmpty" class="history-empty">当前分支还没有提交</div>

    <div class="history-list">
      <button
        v-for="entry in entries"
        :key="entry.sha"
        type="button"
        class="history-item"
        :class="{ active: selectedSha === entry.sha }"
        :title="entry.subject"
        @click="emit('select', entry.sha)">
        <span class="history-subject">{{ entry.subject || '(无提交信息)' }}</span>
        <span class="history-meta">
          <span class="history-sha">{{ entry.shortSha }}</span>
          <span class="history-author">{{ entry.authorName }}</span>
          <span :title="formatGitTime(entry.authorTime)">
            {{ formatGitRelativeTime(entry.authorTime) }}
          </span>
        </span>
      </button>

      <div class="history-footer">
        <el-button v-if="entries.length > 0 && hasMore" size="small" :loading="loading" @click="emit('loadMore')">
          加载更多
        </el-button>
        <span v-else-if="entries.length > 0" class="history-end">已显示全部提交</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.panel-head {
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--dp-border);
}

.panel-title {
  color: var(--dp-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.history-error {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.history-loading {
  padding: 12px;
}

.history-empty {
  padding: 20px 14px;
  color: var(--dp-text-muted);
  font-size: 12px;
  text-align: center;
}

.history-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 4px 0;
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 7px 14px;
  border: 0;
  border-left: 2px solid transparent;
  background: transparent;
  color: var(--dp-text-secondary);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.history-item:hover {
  background: var(--dp-bg-hover);
}

.history-item.active {
  border-left-color: var(--dp-accent);
  background: var(--dp-accent-soft);
  color: var(--dp-text);
}

.history-subject {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.history-sha {
  color: var(--dp-accent-text);
  font-family: var(--dp-mono);
}

.history-author {
  max-width: 90px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-footer {
  display: flex;
  justify-content: center;
  padding: 10px;
}

.history-end {
  color: var(--dp-text-muted);
  font-size: 10.5px;
}
</style>

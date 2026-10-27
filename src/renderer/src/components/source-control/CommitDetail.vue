<script setup lang="ts">
import type { GitCommitDetail } from '@shared/types/git'
import UnifiedDiffView from '@renderer/components/diff/UnifiedDiffView.vue'
import { GIT_STATUS_META, formatGitTime } from '@renderer/utils/git'

defineProps<{
  detail: GitCommitDetail | null
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="commit-detail">
    <div v-if="error" class="detail-error">
      <el-alert :title="error" type="error" show-icon :closable="false" />
      <el-button size="small" @click="emit('retry')">重试</el-button>
    </div>

    <div v-else-if="loading && !detail" class="detail-loading">
      <el-skeleton :rows="8" animated />
    </div>

    <template v-else-if="detail">
      <header class="detail-head">
        <div class="detail-subject">{{ detail.subject || '(无提交信息)' }}</div>
        <div class="detail-meta">
          <span>{{ detail.authorName }}</span>
          <span>{{ detail.authorEmail }}</span>
          <span>{{ formatGitTime(detail.authorTime) }}</span>
          <span class="detail-sha">{{ detail.shortSha }}</span>
        </div>
      </header>

      <div v-if="detail.body" class="detail-body">{{ detail.body }}</div>

      <section class="detail-files">
        <div class="files-head">变更文件（{{ detail.files.length }}）</div>
        <div class="file-list">
          <div
            v-for="file in detail.files"
            :key="`${file.oldRelativePath ?? ''}:${file.relativePath}`"
            class="file-item"
            :title="file.oldRelativePath ? `${file.oldRelativePath} → ${file.relativePath}` : file.relativePath">
            <span class="status-chip" :class="GIT_STATUS_META[file.status].className">
              {{ GIT_STATUS_META[file.status].label }}
            </span>
            <span class="file-path">{{ file.relativePath }}</span>
            <span v-if="file.oldRelativePath" class="file-old">← {{ file.oldRelativePath }}</span>
          </div>
          <div v-if="detail.files.length === 0" class="file-empty">该提交没有文件变更</div>
        </div>
      </section>

      <UnifiedDiffView
        class="detail-diff"
        :diff="detail.diff"
        :truncated="detail.truncated"
        empty-text="该提交没有可展示的文本差异。" />
    </template>
  </div>
</template>

<style scoped>
.commit-detail {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.detail-error {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.detail-loading {
  padding: 14px;
}

.detail-head {
  flex: 0 0 auto;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--dp-border);
}

.detail-subject {
  color: var(--dp-text);
  font-size: 13px;
  font-weight: 600;
  word-break: break-word;
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 6px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.detail-sha {
  color: var(--dp-accent-text);
  font-family: var(--dp-mono);
}

.detail-body {
  flex: 0 0 auto;
  max-height: 120px;
  overflow: auto;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-secondary);
  font-size: 11.5px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.detail-files {
  flex: 0 0 auto;
  max-height: 180px;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--dp-border);
}

.files-head {
  flex: 0 0 auto;
  padding: 7px 16px 4px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.file-list {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding-bottom: 6px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 16px;
  color: var(--dp-text-secondary);
  font-size: 11.5px;
}

.status-chip {
  display: inline-grid;
  flex: 0 0 auto;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

.status-chip.modified {
  background: var(--dp-diff-modified-bg);
  color: var(--dp-diff-modified-text);
}

.status-chip.added,
.status-chip.untracked {
  background: var(--dp-diff-added-bg);
  color: var(--dp-diff-added-text);
}

.status-chip.deleted,
.status-chip.conflicted {
  background: var(--dp-diff-deleted-bg);
  color: var(--dp-diff-deleted-text);
}

.status-chip.renamed {
  background: var(--dp-diff-renamed-bg);
  color: var(--dp-diff-renamed-text);
}

.status-chip.unknown {
  background: rgba(154, 163, 176, 0.16);
  color: var(--dp-text-muted);
}

.file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-old {
  overflow: hidden;
  color: var(--dp-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-empty {
  padding: 8px 16px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
}

.detail-diff {
  flex: 1;
  min-height: 0;
}
</style>

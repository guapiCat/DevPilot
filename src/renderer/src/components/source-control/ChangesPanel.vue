<script setup lang="ts">
import { computed } from 'vue'
import type { GitFileChange } from '@shared/types/git'
import { GIT_STATUS_META } from '@renderer/utils/git'

const props = defineProps<{
  changes: GitFileChange[]
  selectedPath: string | null
  busy: boolean
  truncated: boolean
}>()

const emit = defineEmits<{
  select: [relativePath: string]
  stage: [input: { all?: boolean; paths?: string[] }]
  unstage: [input: { all?: boolean; paths?: string[] }]
}>()

const unstagedChanges = computed(() => props.changes.filter((change) => !change.staged))
const stagedChanges = computed(() => props.changes.filter((change) => change.staged))

function changePaths(change: GitFileChange): string[] {
  if (change.oldRelativePath) return [change.oldRelativePath, change.relativePath]
  return [change.relativePath]
}
</script>

<template>
  <div class="changes-panel">
    <div v-if="truncated" class="truncated-hint">变更数量过多，仅显示部分条目</div>

    <section class="change-group">
      <header class="group-head">
        <span class="group-title">更改</span>
        <span class="group-count">{{ unstagedChanges.length }}</span>
        <button
          type="button"
          class="group-action"
          :disabled="busy || unstagedChanges.length === 0"
          @click="emit('stage', { all: true })">
          暂存全部
        </button>
      </header>

      <div v-if="unstagedChanges.length === 0" class="group-empty">没有未暂存的更改</div>

      <div
        v-for="change in unstagedChanges"
        :key="`unstaged:${change.relativePath}`"
        class="change-item"
        :class="{ active: selectedPath === change.relativePath }"
        :title="change.oldRelativePath ? `${change.oldRelativePath} → ${change.relativePath}` : change.relativePath"
        tabindex="0"
        role="button"
        @click="emit('select', change.relativePath)"
        @keydown.enter="emit('select', change.relativePath)">
        <span class="status-chip" :class="GIT_STATUS_META[change.status].className">
          {{ GIT_STATUS_META[change.status].label }}
        </span>
        <span class="change-path">{{ change.relativePath }}</span>
        <el-button text size="small" :disabled="busy" @click.stop="emit('stage', { paths: changePaths(change) })">
          暂存
        </el-button>
      </div>
    </section>

    <section class="change-group">
      <header class="group-head">
        <span class="group-title">已暂存</span>
        <span class="group-count">{{ stagedChanges.length }}</span>
        <button
          type="button"
          class="group-action"
          :disabled="busy || stagedChanges.length === 0"
          @click="emit('unstage', { all: true })">
          全部取消
        </button>
      </header>

      <div v-if="stagedChanges.length === 0" class="group-empty">没有已暂存的更改</div>

      <div
        v-for="change in stagedChanges"
        :key="`staged:${change.relativePath}`"
        class="change-item"
        :class="{ active: selectedPath === change.relativePath }"
        :title="change.oldRelativePath ? `${change.oldRelativePath} → ${change.relativePath}` : change.relativePath"
        tabindex="0"
        role="button"
        @click="emit('select', change.relativePath)"
        @keydown.enter="emit('select', change.relativePath)">
        <span class="status-chip" :class="GIT_STATUS_META[change.status].className">
          {{ GIT_STATUS_META[change.status].label }}
        </span>
        <span class="change-path">{{ change.relativePath }}</span>
        <el-button text size="small" :disabled="busy" @click.stop="emit('unstage', { paths: changePaths(change) })">
          取消暂存
        </el-button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.changes-panel {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.truncated-hint {
  padding: 6px 12px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-diff-warning-bg);
  color: var(--dp-diff-modified-text);
  font-size: 11px;
}

.change-group {
  border-bottom: 1px solid var(--dp-border);
  padding-bottom: 4px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px 4px;
}

.group-title {
  color: var(--dp-text-secondary);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.group-count {
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.group-action {
  margin-left: auto;
  padding: 2px 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  cursor: pointer;
}

.group-action:hover:not(:disabled) {
  border-color: var(--dp-border);
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.group-action:disabled {
  cursor: default;
  opacity: 0.4;
}

.group-empty {
  padding: 8px 12px 10px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px 4px 12px;
  color: var(--dp-text-secondary);
  font-size: 11.5px;
  cursor: pointer;
}

.change-item:hover {
  background: var(--dp-bg-hover);
}

.change-item.active {
  background: var(--dp-accent-soft);
  color: var(--dp-text);
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

.change-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

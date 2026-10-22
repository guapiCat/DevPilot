<script setup lang="ts">
import { computed } from 'vue'
import { Close, Document, Files, Refresh } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import type { GitFileStatus } from '@shared/types/git'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const MAX_RENDERED_DIFF_LINES = 4000

const STATUS_META: Record<GitFileStatus, { label: string; className: string }> = {
  modified: { label: 'M', className: 'modified' },
  added: { label: 'A', className: 'added' },
  deleted: { label: 'D', className: 'deleted' },
  renamed: { label: 'R', className: 'renamed' },
  untracked: { label: 'U', className: 'untracked' },
  conflicted: { label: '!', className: 'conflicted' },
  unknown: { label: '?', className: 'unknown' }
}

const emit = defineEmits<{
  open: [relativePath: string]
}>()

const repository = useRepositoryStore()
const workspace = useWorkspaceStore()
const { diffPanelVisible } = storeToRefs(workspace)
const {
  activeRepository,
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  selectedGitPath,
  gitDiff,
  gitDiffLoading,
  gitDiffError,
  gitChangeCount
} = storeToRefs(repository)

const changes = computed(() => gitStatus.value?.changes ?? [])

const branchLabel = computed(() => {
  if (gitStatusLoading.value && !gitStatus.value) return '读取中…'
  return gitStatus.value?.branch ?? 'HEAD'
})

const selectedChange = computed(() =>
  changes.value.find((change) => change.relativePath === selectedGitPath.value)
)

const diffLines = computed(() => {
  const text = gitDiff.value?.diff ?? ''
  if (!text) return []

  return text
    .split('\n')
    .slice(0, MAX_RENDERED_DIFF_LINES)
    .map((line) => ({ text: line, type: classifyDiffLine(line) }))
})

const diffOverflow = computed(() => {
  if (!gitDiff.value) return false
  if (gitDiff.value.truncated) return true
  return gitDiff.value.diff.split('\n').length > MAX_RENDERED_DIFF_LINES
})

function classifyDiffLine(line: string): string {
  if (line.startsWith('diff ') || line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}

function statusMeta(status: GitFileStatus): { label: string; className: string } {
  return STATUS_META[status]
}

function changeTitle(relativePath: string): string {
  const change = changes.value.find((item) => item.relativePath === relativePath)
  if (change?.oldRelativePath) {
    return `${change.oldRelativePath} → ${change.relativePath}`
  }
  return relativePath
}

function canOpenSelected(): boolean {
  return Boolean(selectedChange.value && selectedChange.value.status !== 'deleted')
}

function refresh(): void {
  void repository.refreshGitStatus()
}

function openSelected(): void {
  if (!selectedGitPath.value || !canOpenSelected()) return
  emit('open', selectedGitPath.value)
}
</script>

<template>
  <section v-if="diffPanelVisible" class="diff-panel">
    <header class="panel-header">
      <div class="panel-heading">
        <span>变更与 Diff</span>
        <span v-if="activeRepository?.isGitRepository" class="branch-badge">
          {{ branchLabel }}
          <template v-if="gitChangeCount > 0">· {{ gitChangeCount }}</template>
        </span>
      </div>

      <div class="panel-actions">
        <el-button
          text
          size="small"
          :loading="gitStatusLoading"
          :disabled="!activeRepository?.isGitRepository"
          title="刷新 Git 状态"
          @click="refresh"
        >
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button text size="small" aria-label="收起面板" @click="workspace.toggleDiffPanel()">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </header>

    <div v-if="!activeRepository" class="panel-body">
      <EmptyState
        compact
        :icon="Files"
        title="尚未选择仓库"
        description="选择本地仓库后，这里会展示工作区变更与文件 Diff。"
      />
    </div>

    <div v-else-if="!activeRepository.isGitRepository" class="panel-body">
      <EmptyState
        compact
        :icon="Files"
        title="当前文件夹不是 Git 仓库"
        description="DevPilot 仍可浏览与编辑文件；初始化 Git 仓库后可查看状态与 Diff。"
      />
    </div>

    <div v-else-if="gitStatusError" class="panel-body status-error">
      <el-alert :title="gitStatusError" type="error" show-icon :closable="false" />
      <el-button size="small" @click="refresh">重试</el-button>
    </div>

    <div v-else-if="gitStatusLoading && !gitStatus" class="panel-body status-loading">
      <el-skeleton :rows="4" animated />
    </div>

    <div v-else class="git-workbench">
      <aside class="change-list">
        <div class="change-list-head">
          <span>{{ gitChangeCount }} 个变更</span>
          <el-tag v-if="gitStatus?.truncated" size="small" type="warning" effect="plain">
            已截断
          </el-tag>
        </div>

        <div v-if="changes.length === 0" class="change-empty">工作区没有变更</div>

        <template v-else>
          <button
            v-for="change in changes"
            :key="`${change.oldRelativePath ?? ''}:${change.relativePath}`"
            type="button"
            class="change-item"
            :class="{ active: selectedGitPath === change.relativePath }"
            :title="changeTitle(change.relativePath)"
            @click="repository.selectGitChange(change.relativePath)"
          >
            <span class="status-chip" :class="statusMeta(change.status).className">
              {{ statusMeta(change.status).label }}
            </span>
            <span class="change-path">{{ change.relativePath }}</span>
            <span v-if="change.staged" class="staged-tag" title="已暂存">S</span>
          </button>
        </template>
      </aside>

      <section class="diff-view">
        <template v-if="!selectedGitPath">
          <EmptyState
            compact
            :icon="Document"
            title="选择一个变更文件"
            description="点击左侧文件查看相对 HEAD 的文本 Diff。"
          />
        </template>

        <div v-else-if="gitDiffError" class="diff-error">
          <el-alert :title="gitDiffError" type="error" show-icon :closable="false" />
          <el-button size="small" @click="repository.refreshGitDiff(selectedGitPath)">
            重试
          </el-button>
        </div>

        <div v-else-if="gitDiffLoading && !gitDiff" class="diff-loading">
          <el-skeleton :rows="6" animated />
        </div>

        <template v-else-if="gitDiff">
          <div class="diff-head">
            <span class="diff-path" :title="selectedGitPath">{{ selectedGitPath }}</span>
            <el-button text size="small" :disabled="!canOpenSelected()" @click="openSelected">
              在编辑器中打开
            </el-button>
          </div>

          <div v-if="gitDiff.truncated || diffOverflow" class="diff-warning">
            差异过大，仅显示前 {{ MAX_RENDERED_DIFF_LINES }} 行或前 512 KB。
          </div>

          <div v-if="diffLines.length === 0" class="diff-empty">该文件没有可展示的文本差异。</div>
          <div v-else class="diff-content">
            <div
              v-for="(line, index) in diffLines"
              :key="index"
              class="diff-line"
              :class="line.type"
            >
              {{ line.text || ' ' }}
            </div>
          </div>
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.diff-panel {
  display: flex;
  flex: 0 0 300px;
  flex-direction: column;
  height: 300px;
  border-top: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.panel-header {
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--dp-border);
}

.panel-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--dp-text);
  font-size: 11.5px;
  font-weight: 600;
}

.branch-badge {
  padding: 2px 7px;
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  font-weight: 400;
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.panel-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 12px 16px;
}

.status-error {
  gap: 10px;
  align-items: stretch;
}

.status-loading {
  padding: 16px;
}

.git-workbench {
  display: flex;
  flex: 1;
  min-height: 0;
}

.change-list {
  flex: 0 0 268px;
  width: 268px;
  overflow: auto;
  border-right: 1px solid var(--dp-border);
}

.change-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  color: var(--dp-text-muted);
  font-size: 11px;
}

.change-empty {
  padding: 20px 12px;
  color: var(--dp-text-muted);
  font-size: 12px;
  text-align: center;
}

.change-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 12px;
  border: 0;
  background: transparent;
  color: var(--dp-text-secondary);
  font-size: 11.5px;
  text-align: left;
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
  background: rgba(230, 179, 74, 0.16);
  color: #e6b34a;
}

.status-chip.added,
.status-chip.untracked {
  background: rgba(86, 190, 120, 0.16);
  color: #6fd08c;
}

.status-chip.deleted,
.status-chip.conflicted {
  background: rgba(235, 108, 108, 0.16);
  color: #eb6c6c;
}

.status-chip.renamed {
  background: rgba(122, 162, 255, 0.16);
  color: #8fb4ff;
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

.staged-tag {
  flex: 0 0 auto;
  color: #6fd08c;
  font-size: 10px;
}

.diff-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.diff-head {
  display: flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-secondary);
  font-size: 11.5px;
}

.diff-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-warning {
  flex: 0 0 auto;
  padding: 5px 14px;
  border-bottom: 1px solid var(--dp-border);
  background: rgba(230, 179, 74, 0.08);
  color: #e6b34a;
  font-size: 11px;
}

.diff-error {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.diff-loading {
  padding: 14px;
}

.diff-empty {
  padding: 24px 14px;
  color: var(--dp-text-muted);
  font-size: 12px;
}

.diff-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0;
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 11.5px;
  line-height: 18px;
}

.diff-line {
  min-height: 18px;
  padding: 0 14px;
  color: var(--dp-text-secondary);
  white-space: pre;
}

.diff-line.add {
  background: rgba(86, 190, 120, 0.08);
  color: #8fdf9f;
}

.diff-line.del {
  background: rgba(235, 108, 108, 0.08);
  color: #f19a9a;
}

.diff-line.hunk {
  color: #8fb4ff;
}

.diff-line.meta {
  color: var(--dp-text-muted);
}

@media (max-width: 1280px) {
  .change-list {
    flex-basis: 228px;
    width: 228px;
  }
}
</style>

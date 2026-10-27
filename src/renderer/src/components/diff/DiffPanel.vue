<script setup lang="ts">
import { computed, watch } from 'vue'
import { Close, Document, Files, Refresh } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import type { AppliedFileEdit } from '@shared/types/edit'
import type { GitFileStatus } from '@shared/types/git'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import ProposalReview from '@renderer/components/diff/ProposalReview.vue'
import UnifiedDiffView from '@renderer/components/diff/UnifiedDiffView.vue'
import { useChatStore } from '@renderer/stores/chat'
import { useEditStore } from '@renderer/stores/edits'
import { useRepositoryStore } from '@renderer/stores/repository'
import type { DiffPanelMode } from '@renderer/stores/workspace'
import { useWorkspaceStore } from '@renderer/stores/workspace'
import { GIT_STATUS_META } from '@renderer/utils/git'

const emit = defineEmits<{
  open: [relativePath: string]
  applied: [payload: AppliedFileEdit]
}>()

const repository = useRepositoryStore()
const workspace = useWorkspaceStore()
const chat = useChatStore()
const edits = useEditStore()
const { diffPanelVisible } = storeToRefs(workspace)
const { activeConversationId } = storeToRefs(chat)
const { sessions, loading, totalCount } = storeToRefs(edits)
const {
  activeRepository,
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  selectedGitPath,
  gitDiff,
  gitDiffLoading,
  gitDiffError,
  gitChangeCount,
} = storeToRefs(repository)

const visibleTotalCount = computed(() =>
  activeRepository.value
    ? sessions.value.reduce(
        (sum, session) => (session.repositoryId === activeRepository.value?.id ? sum + session.files.length : sum),
        0,
      )
    : totalCount.value,
)

const mode = computed<DiffPanelMode>(
  () => workspace.diffPanelMode ?? (visibleTotalCount.value > 0 ? 'proposals' : 'git'),
)

watch(visibleTotalCount, (count, previous) => {
  if (count > 0 && previous === 0) workspace.diffPanelMode = 'proposals'
  else if (count === 0 && previous > 0 && mode.value === 'proposals') {
    workspace.diffPanelMode = 'git'
  }
})

watch(
  activeConversationId,
  (conversationId) => {
    void edits.loadPending(conversationId)
  },
  { immediate: true },
)

watch(diffPanelVisible, (visible) => {
  if (visible) void edits.loadPending(activeConversationId.value)
})

const changes = computed(() => gitStatus.value?.changes ?? [])

const branchLabel = computed(() => {
  if (gitStatusLoading.value && !gitStatus.value) return '读取中…'
  return gitStatus.value?.branch ?? 'HEAD'
})

const selectedChange = computed(() => changes.value.find((change) => change.relativePath === selectedGitPath.value))

function statusMeta(status: GitFileStatus): { label: string; className: string } {
  return GIT_STATUS_META[status]
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
  if (mode.value === 'proposals') {
    void edits.loadPending(activeConversationId.value)
    return
  }
  void repository.refreshGitStatus()
}

function openSelected(): void {
  if (!selectedGitPath.value || !canOpenSelected()) return
  emit('open', selectedGitPath.value)
}

function openFile(relativePath: string): void {
  emit('open', relativePath)
}

function handleApplied(payload: AppliedFileEdit): void {
  emit('applied', payload)
}
</script>

<template>
  <section v-if="diffPanelVisible" class="diff-panel">
    <header class="panel-header">
      <div class="panel-heading">
        <div class="panel-tabs">
          <button
            type="button"
            class="panel-tab"
            :class="{ active: mode === 'proposals' }"
            @click="workspace.diffPanelMode = 'proposals'">
            AI 建议
            <span v-if="visibleTotalCount > 0" class="tab-count">{{ visibleTotalCount }}</span>
          </button>
          <button
            type="button"
            class="panel-tab"
            :class="{ active: mode === 'git' }"
            @click="workspace.diffPanelMode = 'git'">
            Git 变更
            <span v-if="gitChangeCount > 0" class="tab-count">{{ gitChangeCount }}</span>
          </button>
        </div>

        <span v-if="mode === 'git' && activeRepository?.isGitRepository" class="branch-badge">
          {{ branchLabel }}
        </span>
      </div>

      <div class="panel-actions">
        <el-button
          text
          size="small"
          :loading="mode === 'git' ? gitStatusLoading : loading"
          :disabled="mode === 'git' && !activeRepository?.isGitRepository"
          :title="mode === 'proposals' ? '刷新修改建议' : '刷新 Git 状态'"
          @click="refresh">
          <el-icon><Refresh /></el-icon>
        </el-button>
        <el-button text size="small" aria-label="收起面板" @click="workspace.toggleDiffPanel()">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </header>

    <ProposalReview v-if="mode === 'proposals'" class="proposal-host" @applied="handleApplied" @open="openFile" />

    <div v-else-if="!activeRepository" class="panel-body">
      <EmptyState
        compact
        :icon="Files"
        title="尚未选择仓库"
        description="选择本地仓库后，这里会展示工作区变更与文件 Diff。" />
    </div>

    <div v-else-if="!activeRepository.isGitRepository" class="panel-body">
      <EmptyState
        compact
        :icon="Files"
        title="当前文件夹不是 Git 仓库"
        description="DevPilot 仍可浏览与编辑文件；初始化 Git 仓库后可查看状态与 Diff。" />
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
          <el-tag v-if="gitStatus?.truncated" size="small" type="warning" effect="plain"> 已截断 </el-tag>
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
            @click="repository.selectGitChange(change.relativePath)">
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
            description="点击左侧文件查看相对 HEAD 的文本 Diff。" />
        </template>

        <div v-else-if="gitDiffError" class="diff-error">
          <el-alert :title="gitDiffError" type="error" show-icon :closable="false" />
          <el-button size="small" @click="repository.refreshGitDiff(selectedGitPath)"> 重试 </el-button>
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

          <UnifiedDiffView :diff="gitDiff.diff" :truncated="gitDiff.truncated" />
        </template>
      </section>
    </div>
  </section>
</template>

<style scoped>
.diff-panel {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  height: clamp(220px, 36vh, 320px);
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

.panel-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.panel-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 9px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.panel-tab:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.panel-tab.active {
  border-color: color-mix(in srgb, var(--dp-accent) 28%, transparent);
  background: var(--dp-accent-soft);
  color: var(--dp-accent-text);
}

.tab-count {
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dp-warning) 20%, transparent);
  color: var(--dp-warning);
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
}

.proposal-host {
  display: flex;
  flex: 1;
  min-height: 0;
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

.staged-tag {
  flex: 0 0 auto;
  color: var(--dp-diff-added-text);
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

.diff-error {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
}

.diff-loading {
  padding: 14px;
}

@media (max-width: 1280px) {
  .change-list {
    flex-basis: 228px;
    width: 228px;
  }
}
</style>

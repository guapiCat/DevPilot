<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue'
import { ArrowLeft, ArrowRight, Check, Close, Document, Files } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import type { AppliedFileEdit, ApplyFileEditResult } from '@shared/types/edit'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { DesktopApiError } from '@renderer/services/desktop-api'
import { useChatStore } from '@renderer/stores/chat'
import { useEditStore } from '@renderer/stores/edits'
import { editFileKey, flattenEditFiles, neighborEditEntry } from '@renderer/utils/edits'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useWorkspaceStore } from '@renderer/stores/workspace'
import { toErrorMessage } from '@renderer/utils/errors'

const emit = defineEmits<{
  applied: [payload: AppliedFileEdit]
  open: [relativePath: string]
}>()

const ProposalDiffView = defineAsyncComponent(() => import('./ProposalDiffView.vue'))

const edits = useEditStore()
const chat = useChatStore()
const repository = useRepositoryStore()
const workspace = useWorkspaceStore()
const { sessions, loading, error, actionKey, selected } = storeToRefs(edits)
const { activeRepository } = storeToRefs(repository)
const { activeConversationId } = storeToRefs(chat)

const visibleSessions = computed(() =>
  activeRepository.value
    ? sessions.value.filter((session) => session.repositoryId === activeRepository.value?.id)
    : sessions.value
)

const busy = computed(() => actionKey.value !== null)
const selectedVisible = computed(() => {
  const current = selected.value
  if (!current) return null
  return visibleSessions.value.some((session) => session.id === current.session.id) ? current : null
})
const selectedKey = computed(() =>
  selectedVisible.value
    ? editFileKey(selectedVisible.value.session.id, selectedVisible.value.file.id)
    : null
)

const listRef = ref<HTMLElement | null>(null)

const orderedEntries = computed(() => flattenEditFiles(visibleSessions.value))
const currentIndex = computed(() => {
  if (!selectedKey.value) return -1
  return orderedEntries.value.findIndex((entry) => entry.key === selectedKey.value)
})
const canPrev = computed(() => currentIndex.value > 0)
const canNext = computed(
  () => currentIndex.value >= 0 && currentIndex.value < orderedEntries.value.length - 1
)

const hiddenCount = computed(() =>
  activeRepository.value
    ? sessions.value.reduce(
        (sum, session) =>
          session.repositoryId === activeRepository.value?.id ? sum : sum + session.files.length,
        0
      )
    : 0
)

function ensureVisibleSelection(): void {
  if (selectedVisible.value) return
  const first = visibleSessions.value[0]
  if (first?.files[0]) edits.select(first.id, first.files[0].id)
}

watch(visibleSessions, ensureVisibleSelection, { immediate: true })

watch(selectedKey, async () => {
  await nextTick()
  listRef.value?.querySelector<HTMLElement>('.proposal-item.active')?.scrollIntoView({
    block: 'nearest',
    inline: 'nearest'
  })
})

function selectNeighbor(offset: -1 | 1): void {
  const entry = neighborEditEntry(orderedEntries.value, selectedKey.value, offset)
  if (entry) edits.select(entry.sessionId, entry.file.id)
}

function neighborAfterCurrent(): { sessionId: string; fileId: string } | null {
  const index = currentIndex.value
  if (index === -1) return null
  const target = orderedEntries.value[index + 1] ?? orderedEntries.value[index - 1]
  return target ? { sessionId: target.sessionId, fileId: target.file.id } : null
}

function isShortcutBlocked(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return Boolean(
    target?.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')
  )
}

function handleKeydown(event: KeyboardEvent): void {
  if (!event.altKey || !event.shiftKey) return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  if (busy.value || isShortcutBlocked(event)) return

  event.preventDefault()
  selectNeighbor(event.key === 'ArrowUp' ? -1 : 1)
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', handleKeydown))

function operationLabel(operation: 'modify' | 'create'): string {
  return operation === 'modify' ? '修改' : '新建'
}

function statusLabel(status: string): string {
  return status === 'stale' ? '已过期' : '待审核'
}

async function applySelected(): Promise<void> {
  const current = selectedVisible.value
  if (!current || busy.value) return
  if (current.file.status === 'stale') return

  const nextSelection = neighborAfterCurrent()

  if (workspace.fileDirty[current.file.relativePath]) {
    try {
      await ElMessageBox.confirm(
        `「${current.file.relativePath}」有未保存的修改，应用建议会覆盖磁盘文件并丢弃这些修改。是否继续？`,
        '未保存的修改',
        {
          confirmButtonText: '覆盖并应用',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    } catch {
      return
    }
  }

  try {
    const result: ApplyFileEditResult = await edits.applyFile(current.session.id, current.file.id)
    if (nextSelection) edits.select(nextSelection.sessionId, nextSelection.fileId)
    emit('applied', {
      relativePath: current.file.relativePath,
      operation: current.file.operation,
      hash: result.hash,
      size: result.size,
      hadBom: result.hadBom
    })
    ElMessage.success({ message: `已应用 ${current.file.relativePath}`, duration: 1500 })
  } catch (caught) {
    if (caught instanceof DesktopApiError && caught.code === 'FILE_CHANGED') {
      ElMessage.error(caught.message)
      await edits.loadPending(activeConversationId.value)
      return
    }
    ElMessage.error(toErrorMessage(caught))
  }
}

async function rejectSelected(): Promise<void> {
  const current = selectedVisible.value
  if (!current || busy.value) return

  const nextSelection = neighborAfterCurrent()

  try {
    await ElMessageBox.confirm(
      `拒绝「${current.file.relativePath}」的修改建议？该建议将被丢弃，不会写入磁盘。`,
      '拒绝修改建议',
      {
        confirmButtonText: '拒绝',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  try {
    await edits.rejectFile(current.session.id, current.file.id)
    if (nextSelection) edits.select(nextSelection.sessionId, nextSelection.fileId)
    ElMessage.info({ message: '已拒绝该修改建议', duration: 1500 })
  } catch (caught) {
    ElMessage.error(toErrorMessage(caught))
  }
}
</script>

<template>
  <div class="proposal-review">
    <aside ref="listRef" class="proposal-list">
      <div class="list-head">
        <span>待审核建议</span>
        <el-tag v-if="visibleSessions.length > 0" size="small" type="warning" effect="plain">
          {{ visibleSessions.reduce((sum, session) => sum + session.files.length, 0) }}
        </el-tag>
      </div>

      <div v-if="loading && visibleSessions.length === 0" class="list-state">
        <el-skeleton :rows="3" animated />
      </div>

      <div v-else-if="error && visibleSessions.length === 0" class="list-state">
        <el-alert :title="error" type="error" show-icon :closable="false" />
      </div>

      <div v-else-if="visibleSessions.length === 0" class="list-empty">
        <el-icon :size="20"><Files /></el-icon>
        <span>没有待审核的修改建议</span>
        <span class="hint">在 AI 助手中提出修改需求后，建议会显示在这里。</span>
        <span v-if="hiddenCount > 0" class="hint warning">
          另有 {{ hiddenCount }} 个建议属于其他仓库，请切换仓库后查看。
        </span>
      </div>

      <template v-else>
        <div v-if="loading" class="list-refreshing">正在刷新…</div>
        <el-alert
          v-if="error"
          class="list-inline-error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
        />

        <div v-for="session in visibleSessions" :key="session.id" class="session-group">
          <div class="session-head">
            <span>{{ new Date(session.createdAt).toLocaleTimeString('zh-CN') }}</span>
            <span>{{ session.files.length }} 个文件</span>
          </div>

          <button
            v-for="file in session.files"
            :key="file.id"
            type="button"
            class="proposal-item"
            :class="{
              active: selectedKey === editFileKey(session.id, file.id),
              stale: file.status === 'stale'
            }"
            :title="file.relativePath"
            @click="edits.select(session.id, file.id)"
          >
            <span class="op-badge" :class="file.operation">
              {{ operationLabel(file.operation) }}
            </span>
            <span class="item-path">{{ file.relativePath }}</span>
            <span class="item-status" :class="file.status">{{ statusLabel(file.status) }}</span>
          </button>
        </div>
      </template>
    </aside>

    <section class="proposal-detail">
      <template v-if="selectedVisible">
        <div class="detail-head">
          <div class="detail-title">
            <span class="detail-path" :title="selectedVisible.file.relativePath">
              {{ selectedVisible.file.relativePath }}
            </span>
            <span class="op-badge" :class="selectedVisible.file.operation">
              {{ operationLabel(selectedVisible.file.operation) }}
            </span>
            <span class="item-status" :class="selectedVisible.file.status">
              {{ statusLabel(selectedVisible.file.status) }}
            </span>
          </div>

          <div v-if="orderedEntries.length > 1" class="detail-nav">
            <el-button
              text
              size="small"
              :icon="ArrowLeft"
              aria-label="上一个文件"
              title="上一个文件 (Alt+Shift+↑)"
              :disabled="!canPrev"
              @click="selectNeighbor(-1)"
            />
            <span class="nav-position"> {{ currentIndex + 1 }} / {{ orderedEntries.length }} </span>
            <el-button
              text
              size="small"
              :icon="ArrowRight"
              aria-label="下一个文件"
              title="下一个文件 (Alt+Shift+↓)"
              :disabled="!canNext"
              @click="selectNeighbor(1)"
            />
          </div>

          <div class="detail-actions">
            <el-button
              v-if="selectedVisible.file.operation === 'modify'"
              text
              size="small"
              @click="emit('open', selectedVisible.file.relativePath)"
            >
              打开文件
            </el-button>
            <el-button
              type="primary"
              size="small"
              :icon="Check"
              :loading="actionKey === selectedKey"
              :disabled="busy || selectedVisible.file.status === 'stale'"
              @click="applySelected"
            >
              应用
            </el-button>
            <el-button size="small" :icon="Close" :disabled="busy" @click="rejectSelected">
              拒绝
            </el-button>
          </div>
        </div>

        <div v-if="selectedVisible.file.status === 'stale'" class="stale-warning">
          文件已在磁盘上被外部修改，该建议已过期，无法应用。请让 AI 重新读取文件后生成建议。
        </div>

        <Suspense>
          <ProposalDiffView
            :key="selectedKey ?? ''"
            :relative-path="selectedVisible.file.relativePath"
            :original-content="selectedVisible.file.originalContent ?? ''"
            :proposed-content="selectedVisible.file.proposedContent"
          />
          <template #fallback>
            <div class="diff-fallback">
              <el-skeleton :rows="6" animated />
            </div>
          </template>
        </Suspense>
      </template>

      <EmptyState
        v-else
        compact
        :icon="Document"
        title="选择一条修改建议"
        description="在左侧选择文件后查看 AI 提议的差异，并逐项应用或拒绝。"
      />
    </section>
  </div>
</template>

<style scoped>
.proposal-review {
  display: flex;
  flex: 1;
  min-height: 0;
}

.proposal-list {
  display: flex;
  flex: 0 0 300px;
  flex-direction: column;
  width: 300px;
  overflow: auto;
  border-right: 1px solid var(--dp-border);
}

.list-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 12px;
  color: var(--dp-text-muted);
  font-size: 11px;
}

.list-state {
  padding: 12px;
}

.list-refreshing {
  padding: 6px 12px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.list-inline-error {
  margin: 0 10px 6px;
}

.diff-fallback {
  flex: 1;
  overflow: auto;
  padding: 18px;
}

.list-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 24px 16px;
  color: var(--dp-text-muted);
  font-size: 12px;
  text-align: center;
}

.list-empty .hint {
  font-size: 11px;
  line-height: 1.5;
}

.list-empty .hint.warning {
  color: var(--dp-diff-modified-text);
}

.session-group {
  padding-bottom: 4px;
}

.session-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 3px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.proposal-item {
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

.proposal-item:hover {
  background: var(--dp-bg-hover);
}

.proposal-item.active {
  background: var(--dp-accent-soft);
  color: var(--dp-text);
}

.proposal-item.stale {
  opacity: 0.75;
}

.op-badge {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
}

.op-badge.modify {
  background: var(--dp-diff-modified-bg);
  color: var(--dp-diff-modified-text);
}

.op-badge.create {
  background: var(--dp-diff-added-bg);
  color: var(--dp-diff-added-text);
}

.item-path,
.detail-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-status {
  flex: 0 0 auto;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.item-status.stale {
  color: var(--dp-warning);
}

.proposal-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.detail-head {
  display: flex;
  flex: 0 0 34px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-secondary);
  font-size: 11.5px;
}

.detail-title {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.detail-nav {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.nav-position {
  min-width: 34px;
  color: var(--dp-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.detail-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.stale-warning {
  flex: 0 0 auto;
  padding: 6px 14px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-diff-warning-bg);
  color: var(--dp-diff-modified-text);
  font-size: 11px;
}

@media (max-width: 1280px) {
  .proposal-list {
    flex-basis: 250px;
    width: 250px;
  }
}

@media (max-width: 1080px) {
  .proposal-list {
    flex-basis: 220px;
    width: 220px;
  }
}
</style>

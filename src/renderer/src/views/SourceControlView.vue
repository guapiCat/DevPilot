<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Connection, Download, Files, Refresh, RefreshLeft, Switch, Upload } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import type { RepositorySummary } from '@shared/types/repository'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import UnifiedDiffView from '@renderer/components/diff/UnifiedDiffView.vue'
import BranchDialog from '@renderer/components/source-control/BranchDialog.vue'
import ChangesPanel from '@renderer/components/source-control/ChangesPanel.vue'
import CommitBox from '@renderer/components/source-control/CommitBox.vue'
import CommitDetail from '@renderer/components/source-control/CommitDetail.vue'
import HistoryPanel from '@renderer/components/source-control/HistoryPanel.vue'
import { desktopApi } from '@renderer/services/desktop-api'
import { useGitStore } from '@renderer/stores/git'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useWorkspaceStore } from '@renderer/stores/workspace'
import { toErrorMessage } from '@renderer/utils/errors'

const router = useRouter()
const repository = useRepositoryStore()
const git = useGitStore()
const workspace = useWorkspaceStore()

const {
  repositories,
  activeRepository,
  gitStatus,
  gitStatusLoading,
  gitStatusError,
  selectedGitPath,
  gitDiff,
  gitDiffLoading,
  gitDiffError,
} = storeToRefs(repository)

const {
  branches,
  logEntries,
  logLoading,
  logError,
  logHasMore,
  selectedSha,
  commitDetail,
  commitDetailLoading,
  commitDetailError,
  remoteStatus,
  remoteError,
  busyAction,
  isBusy,
} = storeToRefs(git)

const selectedRepositoryId = ref<string | undefined>(activeRepository.value?.id)
const branchDialogVisible = ref(false)
const selectingRepository = ref(false)
const commitBoxRef = ref<InstanceType<typeof CommitBox> | null>(null)

watch(activeRepository, (repo) => {
  selectedRepositoryId.value = repo?.id
})

const isGitRepository = computed(() => activeRepository.value?.isGitRepository === true)
const changes = computed(() => gitStatus.value?.changes ?? [])
const stagedCount = computed(() => changes.value.filter((change) => change.staged).length)
const currentBranch = computed(() => branches.value?.current ?? gitStatus.value?.branch ?? null)
const headState = computed(() => gitStatus.value?.headState ?? 'attached')
const detached = computed(() => headState.value === 'detached')
const branchLabel = computed(() => (detached.value ? '分离 HEAD' : (currentBranch.value ?? 'HEAD')))
const upstreamLabel = computed(() => remoteStatus.value?.upstream ?? '未设置上游')
const aheadCount = computed(() => remoteStatus.value?.ahead ?? 0)
const behindCount = computed(() => remoteStatus.value?.behind ?? 0)
const hasRemote = computed(() => (remoteStatus.value?.remotes.length ?? 0) > 0)
const canFetch = computed(() => !isBusy.value && hasRemote.value)
const canPull = computed(() => !isBusy.value && !detached.value && Boolean(remoteStatus.value?.upstream))
const canPush = computed(() => !isBusy.value && !detached.value && hasRemote.value)

const selectedChange = computed(
  () => changes.value.find((change) => change.relativePath === selectedGitPath.value) ?? null,
)
const canOpenSelected = computed(() => Boolean(selectedChange.value && selectedChange.value.status !== 'deleted'))

async function confirmAction(title: string, message: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {
      confirmButtonText: '继续',
      cancelButtonText: '取消',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

async function confirmDiscardDirty(action: string): Promise<boolean> {
  if (!workspace.hasDirtyFiles) return true
  return confirmAction('未保存的修改', `有未保存的文件修改，${action}将丢失这些修改。是否继续？`)
}

async function loadFileTree(repositoryId: string): Promise<void> {
  try {
    const tree = await desktopApi.repository.getTree(repositoryId)
    repository.setFileTree(tree.nodes)
    repository.setFileTreeTruncated(tree.truncated)
  } catch (error) {
    repository.setFileTree([])
    ElMessage.error(toErrorMessage(error))
  }
}

async function activateRepository(summary: RepositorySummary): Promise<void> {
  workspace.resetRepositoryState()
  repository.setActiveRepository(summary)
  git.reset()
  selectedRepositoryId.value = summary.id

  await loadFileTree(summary.id)
  if (summary.isGitRepository) {
    await git.refreshAll(summary.id)
  }
}

async function handleSwitchRepository(repositoryId: string): Promise<void> {
  if (!repositoryId || repositoryId === activeRepository.value?.id) return

  const summary = repositories.value.find((item) => item.id === repositoryId)
  if (!summary) {
    selectedRepositoryId.value = activeRepository.value?.id
    return
  }

  if (!(await confirmDiscardDirty('切换仓库'))) {
    selectedRepositoryId.value = activeRepository.value?.id
    return
  }

  try {
    await activateRepository(summary)
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleSelectRepository(): Promise<void> {
  if (selectingRepository.value) return
  selectingRepository.value = true

  try {
    const summary = await desktopApi.repository.select()
    if (!summary || summary.id === activeRepository.value?.id) return
    if (!(await confirmDiscardDirty('切换仓库'))) return

    repository.setRepositories(await desktopApi.repository.list())
    await activateRepository(summary)
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  } finally {
    selectingRepository.value = false
  }
}

function refresh(): void {
  const id = activeRepository.value?.id
  if (!id || !isGitRepository.value) return
  void git.refreshAll(id)
}

function handleRefreshLog(): void {
  const id = activeRepository.value?.id
  if (!id) return
  void git.refreshLog(id)
  void git.refreshRemoteStatus(id)
}

function handleLoadMoreLog(): void {
  const id = activeRepository.value?.id
  if (!id) return
  void git.loadMoreLog(id)
}

function handleSelectChange(relativePath: string): void {
  git.clearCommit()
  repository.selectGitChange(relativePath)
}

async function handleSelectCommit(sha: string): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return
  await git.selectCommit(id, sha)
}

function handleRetryCommit(): void {
  const id = activeRepository.value?.id
  if (!id || !selectedSha.value) return
  void git.selectCommit(id, selectedSha.value)
}

async function handleStage(input: { all?: boolean; paths?: string[] }): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  const touchesConflict = changes.value.some(
    (change) =>
      change.status === 'conflicted' &&
      (input.all === true ||
        input.paths?.some((path) => path === change.relativePath || path === change.oldRelativePath)),
  )

  if (
    touchesConflict &&
    !(await confirmAction('暂存冲突文件', '存在未解决的冲突，暂存后冲突标记会进入索引。是否继续？'))
  ) {
    return
  }

  try {
    await git.stage(id, input)
    ElMessage.success(input.all ? '已暂存全部更改' : '已暂存所选文件')
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleUnstage(input: { all?: boolean; paths?: string[] }): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  try {
    await git.unstage(id, input)
    ElMessage.success(input.all ? '已取消暂存全部更改' : '已取消暂存所选文件')
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleCommit(message: string): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  if (
    detached.value &&
    !(await confirmAction('分离 HEAD', '当前处于分离 HEAD 状态，提交后不会更新任何分支。是否继续？'))
  ) {
    return
  }

  try {
    const result = await git.commit(id, message)
    commitBoxRef.value?.clear()
    ElMessage.success(`已提交 ${result.shortSha}`)
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleCreateBranch(branchName: string, checkout: boolean): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  try {
    await git.createBranch(id, branchName, checkout)
    branchDialogVisible.value = false
    ElMessage.success(checkout ? `已创建并切换到 ${branchName}` : `已创建分支 ${branchName}`)
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleSwitchBranch(branchName: string): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  if (branchName === currentBranch.value) {
    branchDialogVisible.value = false
    return
  }

  if (!(await confirmDiscardDirty('切换分支'))) return

  if (
    changes.value.length > 0 &&
    !(await confirmAction('未提交的更改', '工作区存在未提交的更改，切换分支可能被 Git 阻止。是否继续？'))
  ) {
    return
  }

  try {
    await git.switchBranch(id, branchName)
    workspace.resetRepositoryState()
    await loadFileTree(id)
    branchDialogVisible.value = false
    ElMessage.success(`已切换到 ${branchName}`)
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleFetch(): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  try {
    await git.fetch(id)
    ElMessage.success('已获取远端更新')
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handlePull(): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  const dirtyNote = workspace.hasDirtyFiles ? '未保存的编辑器修改会丢失。' : ''
  if (
    !(await confirmAction(
      '拉取远端更新',
      `将以快进方式拉取 ${upstreamLabel.value}，不会自动合并或变基。工作区未提交的修改可能导致失败。${dirtyNote}是否继续？`,
    ))
  ) {
    return
  }

  try {
    await git.pull(id)
    workspace.resetRepositoryState()
    await loadFileTree(id)
    ElMessage.success('已拉取远端更新')
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handlePush(): Promise<void> {
  const id = activeRepository.value?.id
  if (!id) return

  const message = remoteStatus.value?.upstream
    ? `将推送 ${branchLabel.value} 到 ${remoteStatus.value.upstream}（领先 ${aheadCount.value} 个提交）。是否继续？`
    : '当前分支尚未设置上游，首次推送会创建远端分支并设置上游。是否继续？'

  if (!(await confirmAction('推送提交', message))) return

  try {
    await git.push(id)
    ElMessage.success('已推送提交')
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

function handleOpenSelected(): void {
  if (!selectedGitPath.value || !canOpenSelected.value) return
  void router.push({ name: 'workspace', query: { file: selectedGitPath.value } })
}

onMounted(async () => {
  try {
    const summaries = await desktopApi.repository.list()
    repository.setRepositories(summaries)
    const current = activeRepository.value ?? summaries[0] ?? null

    if (!activeRepository.value && current) {
      repository.setActiveRepository(current)
      selectedRepositoryId.value = current.id
      await loadFileTree(current.id)
    }

    if (current?.isGitRepository) {
      await git.refreshAll(current.id)
    }
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
})
</script>

<template>
  <div class="source-control">
    <header class="sc-toolbar">
      <div class="repo-picker">
        <el-icon :size="15"><Connection /></el-icon>
        <el-select
          v-if="repositories.length > 0"
          v-model="selectedRepositoryId"
          class="repo-select"
          size="small"
          placeholder="选择仓库"
          @change="handleSwitchRepository">
          <el-option v-for="repo in repositories" :key="repo.id" :label="repo.name" :value="repo.id" />
        </el-select>
        <span v-else class="repo-name">{{ activeRepository?.name ?? '未选择仓库' }}</span>
        <el-button size="small" :loading="selectingRepository" @click="handleSelectRepository"> 打开仓库 </el-button>
      </div>

      <template v-if="isGitRepository">
        <el-button size="small" :icon="Switch" @click="branchDialogVisible = true">
          {{ branchLabel }}
        </el-button>

        <div class="sync-group">
          <span class="sync-upstream" :title="remoteError ?? `上游：${upstreamLabel}`">
            {{ upstreamLabel }}
          </span>
          <span class="sync-counts" title="领先 / 落后提交数"> ↑{{ aheadCount }} ↓{{ behindCount }} </span>
          <el-tooltip content="获取远端更新" placement="bottom">
            <el-button
              text
              size="small"
              aria-label="获取远端更新"
              :icon="Download"
              :loading="busyAction === 'fetch'"
              :disabled="!canFetch"
              @click="handleFetch" />
          </el-tooltip>
          <el-tooltip content="拉取（仅快进）" placement="bottom">
            <el-button
              text
              size="small"
              aria-label="拉取远端更新"
              :icon="RefreshLeft"
              :loading="busyAction === 'pull'"
              :disabled="!canPull"
              @click="handlePull" />
          </el-tooltip>
          <el-tooltip content="推送提交" placement="bottom">
            <el-button
              text
              size="small"
              aria-label="推送提交"
              :icon="Upload"
              :loading="busyAction === 'push'"
              :disabled="!canPush"
              @click="handlePush" />
          </el-tooltip>
        </div>

        <el-tag v-if="detached" size="small" type="warning" effect="plain">分离 HEAD</el-tag>
      </template>

      <div class="toolbar-spacer"></div>

      <el-button
        text
        size="small"
        aria-label="刷新"
        :icon="Refresh"
        :loading="gitStatusLoading"
        :disabled="!isGitRepository"
        @click="refresh" />
    </header>

    <div v-if="!activeRepository" class="sc-state">
      <EmptyState
        :icon="Connection"
        title="尚未选择仓库"
        description="打开一个本地仓库后，即可查看变更、提交历史与分支并同步远端。">
        <el-button size="small" @click="handleSelectRepository">打开仓库</el-button>
      </EmptyState>
    </div>

    <div v-else-if="!isGitRepository" class="sc-state">
      <EmptyState
        :icon="Files"
        title="当前文件夹不是 Git 仓库"
        description="DevPilot 仍可浏览与编辑文件；在磁盘上初始化 Git 仓库后重新打开即可使用源代码管理。" />
    </div>

    <div v-else-if="gitStatusError" class="sc-state">
      <div class="state-error">
        <el-alert :title="gitStatusError" type="error" show-icon :closable="false" />
        <el-button size="small" @click="refresh">重试</el-button>
      </div>
    </div>

    <div v-else-if="gitStatusLoading && !gitStatus" class="sc-state sc-loading">
      <el-skeleton :rows="6" animated />
    </div>

    <div v-else class="sc-body">
      <aside class="changes-column">
        <div class="column-head">
          <span>更改</span>
          <el-tag v-if="gitStatus?.truncated" size="small" type="warning" effect="plain"> 已截断 </el-tag>
        </div>
        <ChangesPanel
          :changes="changes"
          :selected-path="selectedGitPath"
          :busy="isBusy"
          :truncated="gitStatus?.truncated ?? false"
          @select="handleSelectChange"
          @stage="handleStage"
          @unstage="handleUnstage" />
        <CommitBox
          ref="commitBoxRef"
          :staged-count="stagedCount"
          :head-state="headState"
          :busy-action="busyAction"
          @submit="handleCommit" />
      </aside>

      <aside class="history-column">
        <HistoryPanel
          :entries="logEntries"
          :loading="logLoading"
          :error="logError"
          :has-more="logHasMore"
          :selected-sha="selectedSha"
          @select="handleSelectCommit"
          @load-more="handleLoadMoreLog"
          @refresh="handleRefreshLog" />
      </aside>

      <section class="detail-column">
        <CommitDetail
          v-if="selectedSha"
          :detail="commitDetail"
          :loading="commitDetailLoading"
          :error="commitDetailError"
          @retry="handleRetryCommit" />

        <template v-else-if="selectedGitPath">
          <div class="detail-head">
            <span class="detail-path" :title="selectedGitPath">{{ selectedGitPath }}</span>
            <el-button text size="small" :disabled="!canOpenSelected" @click="handleOpenSelected">
              在编辑器中打开
            </el-button>
          </div>

          <div v-if="gitDiffError" class="detail-error">
            <el-alert :title="gitDiffError" type="error" show-icon :closable="false" />
            <el-button size="small" @click="repository.refreshGitDiff(selectedGitPath)"> 重试 </el-button>
          </div>
          <div v-else-if="gitDiffLoading && !gitDiff" class="detail-loading">
            <el-skeleton :rows="8" animated />
          </div>
          <UnifiedDiffView v-else-if="gitDiff" :diff="gitDiff.diff" :truncated="gitDiff.truncated" />
        </template>

        <EmptyState
          v-else
          :icon="Files"
          title="选择一项查看详情"
          description="点击左侧变更查看工作区 Diff，或点击提交历史查看某次提交的详情。" />
      </section>
    </div>

    <BranchDialog
      v-model="branchDialogVisible"
      :branches="branches?.branches ?? []"
      :current="currentBranch"
      :busy-action="busyAction"
      @switch="handleSwitchBranch"
      @create="handleCreateBranch" />
  </div>
</template>

<style scoped>
.source-control {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dp-bg-app);
}

.sc-toolbar {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.repo-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dp-text-secondary);
}

.repo-select {
  width: 180px;
}

.repo-name {
  max-width: 180px;
  overflow: hidden;
  color: var(--dp-text-secondary);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-group {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 4px;
  border-left: 1px solid var(--dp-border);
}

.sync-upstream {
  max-width: 150px;
  overflow: hidden;
  margin-left: 6px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-counts {
  margin-left: 4px;
  color: var(--dp-text-secondary);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}

.toolbar-spacer {
  flex: 1;
}

.sc-state {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.sc-loading {
  padding: 24px;
  align-items: stretch;
}

.state-error {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(520px, 80%);
}

.sc-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.changes-column {
  display: flex;
  flex: 0 0 340px;
  flex-direction: column;
  width: 340px;
  min-height: 0;
  border-right: 1px solid var(--dp-border);
  background: var(--dp-bg-sidebar);
}

.history-column {
  display: flex;
  flex: 0 0 320px;
  flex-direction: column;
  width: 320px;
  min-height: 0;
  border-right: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.detail-column {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--dp-bg-app);
}

.column-head {
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.detail-head {
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 10px 0 16px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-secondary);
  font-size: 11.5px;
}

.detail-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 1280px) {
  .changes-column {
    flex-basis: 290px;
    width: 290px;
  }

  .history-column {
    flex-basis: 270px;
    width: 270px;
  }
}
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ChatDotRound, DocumentCopy, FolderAdd, FolderOpened } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { MAX_FILE_TREE_ENTRIES } from '@shared/constants/app'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import DiffPanel from '@renderer/components/diff/DiffPanel.vue'
import EditorArea from '@renderer/components/editor/EditorArea.vue'
import FileTree from '@renderer/components/repository/FileTree.vue'
import { desktopApi } from '@renderer/services/desktop-api'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useWorkspaceStore } from '@renderer/stores/workspace'
import { toErrorMessage } from '@renderer/utils/errors'

const repository = useRepositoryStore()
const workspace = useWorkspaceStore()

const { repositories, activeRepository, fileTree, fileTreeLoading, fileTreeTruncated } =
  storeToRefs(repository)
const { rightPanelVisible, diffPanelVisible } = storeToRefs(workspace)

const selecting = ref(false)
const selectError = ref<string | null>(null)

async function loadRepositoryTree(repositoryId: string): Promise<void> {
  repository.setFileTreeLoading(true)
  repository.setFileTreeTruncated(false)

  try {
    const result = await desktopApi.repository.getTree(repositoryId)
    repository.setFileTree(result.nodes)
    repository.setFileTreeTruncated(result.truncated)
  } catch (error) {
    repository.setFileTree([])
    selectError.value = toErrorMessage(error)
  } finally {
    repository.setFileTreeLoading(false)
  }
}

async function handleSelectRepository(): Promise<void> {
  if (selecting.value) return

  selecting.value = true
  selectError.value = null

  try {
    const summary = await desktopApi.repository.select()
    if (!summary) return

    workspace.resetRepositoryState()
    repository.setActiveRepository(summary)
    repository.setRepositories(await desktopApi.repository.list())
    await loadRepositoryTree(summary.id)
  } catch (error) {
    selectError.value = toErrorMessage(error)
  } finally {
    selecting.value = false
  }
}

async function handleSwitchRepository(repositoryId: string): Promise<void> {
  if (!repositoryId || repositoryId === activeRepository.value?.id) return

  const summary = repositories.value.find((item) => item.id === repositoryId)
  if (!summary) return

  selectError.value = null
  workspace.resetRepositoryState()
  repository.setActiveRepository(summary)
  await loadRepositoryTree(summary.id)
}

async function handleOpenFile(relativePath: string): Promise<void> {
  const currentRepository = activeRepository.value
  if (!currentRepository) return

  workspace.openFile(relativePath)

  if (workspace.fileContents[relativePath] || workspace.fileErrors[relativePath]) return

  workspace.setFileLoadingPath(relativePath)

  try {
    const content = await desktopApi.file.read(currentRepository.id, relativePath)
    workspace.setFileContent(relativePath, content)
  } catch (error) {
    workspace.setFileError(relativePath, toErrorMessage(error))
  } finally {
    if (workspace.fileLoadingPath === relativePath) {
      workspace.setFileLoadingPath(null)
    }
  }
}

onMounted(() => {
  void (async () => {
    try {
      repository.setRepositories(await desktopApi.repository.list())
    } catch (error) {
      selectError.value = toErrorMessage(error)
    }
  })()
})
</script>

<template>
  <div class="workspace-view">
    <header class="workspace-toolbar">
      <div class="repo-badge" :title="activeRepository?.path">
        <el-icon :size="15"><FolderOpened /></el-icon>
        <span>{{ activeRepository?.name ?? '未选择仓库' }}</span>
        <el-tag
          v-if="activeRepository && !activeRepository.isGitRepository"
          size="small"
          type="warning"
          effect="plain"
        >
          非 Git
        </el-tag>
      </div>

      <el-select
        v-if="repositories.length > 0"
        class="repo-switcher"
        size="small"
        :model-value="activeRepository?.id"
        placeholder="切换仓库"
        @change="handleSwitchRepository"
      >
        <el-option
          v-for="repo in repositories"
          :key="repo.id"
          :label="repo.name"
          :value="repo.id"
        />
      </el-select>

      <el-button
        size="small"
        :icon="FolderAdd"
        :loading="selecting"
        @click="handleSelectRepository"
      >
        选择仓库
      </el-button>

      <div class="toolbar-spacer"></div>

      <button
        type="button"
        class="toolbar-toggle"
        :class="{ active: rightPanelVisible }"
        @click="workspace.toggleRightPanel()"
      >
        <el-icon :size="14"><ChatDotRound /></el-icon>
        <span>AI 助手</span>
      </button>
      <button
        type="button"
        class="toolbar-toggle"
        :class="{ active: diffPanelVisible }"
        @click="workspace.toggleDiffPanel()"
      >
        <el-icon :size="14"><DocumentCopy /></el-icon>
        <span>变更与 Diff</span>
      </button>
    </header>

    <div class="workspace-body">
      <div class="workspace-main">
        <aside class="explorer">
          <div class="panel-title">
            <span>资源管理器</span>
            <span v-if="activeRepository" class="repo-leaf">{{ activeRepository.name }}</span>
          </div>
          <div class="explorer-body">
            <el-alert
              v-if="selectError"
              class="repo-error"
              :title="selectError"
              type="error"
              show-icon
              :closable="false"
            />
            <el-alert
              v-if="fileTreeTruncated"
              class="repo-error"
              :title="`文件树超过 ${MAX_FILE_TREE_ENTRIES} 项，已截断显示`"
              type="warning"
              show-icon
              :closable="false"
            />
            <FileTree :nodes="fileTree" :loading="fileTreeLoading" @open="handleOpenFile" />
          </div>
        </aside>

        <EditorArea />

        <aside v-if="rightPanelVisible" class="ai-panel">
          <header class="ai-panel-header">
            <span>AI 助手</span>
            <el-button text size="small" @click="workspace.toggleRightPanel()">收起</el-button>
          </header>

          <div class="ai-panel-body">
            <EmptyState
              :icon="ChatDotRound"
              title="工作区 AI 助手"
              description="选择仓库后，可在这里基于当前代码上下文提问；模型调用将在阶段 4 接通。"
            >
              <router-link class="text-link" :to="{ name: 'settings' }">打开设置</router-link>
            </EmptyState>
          </div>

          <div class="ai-panel-footer">
            <el-input size="small" disabled placeholder="AI 助手将在阶段 4 接入" />
          </div>
        </aside>
      </div>

      <DiffPanel />
    </div>
  </div>
</template>

<style scoped>
.workspace-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--dp-bg-app);
}

.workspace-toolbar {
  display: flex;
  flex: 0 0 52px;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.repo-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid var(--dp-border);
  border-radius: 6px;
  background: var(--dp-bg-elevated);
  color: var(--dp-text-secondary);
  font-size: 12.5px;
}

.repo-switcher {
  width: 150px;
}

.repo-error {
  margin: 10px 12px;
  width: auto;
}

.toolbar-spacer {
  flex: 1;
}

.toolbar-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dp-text-muted);
  font-size: 12px;
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.toolbar-toggle:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.toolbar-toggle.active {
  border-color: rgba(79, 140, 255, 0.28);
  background: var(--dp-accent-soft);
  color: #a6c4ff;
}

.workspace-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.workspace-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.explorer {
  display: flex;
  flex: 0 0 252px;
  flex-direction: column;
  width: 252px;
  min-height: 0;
  border-right: 1px solid var(--dp-border);
  background: var(--dp-bg-sidebar);
}

.panel-title {
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.repo-leaf {
  max-width: 110px;
  overflow: hidden;
  color: var(--dp-text-muted);
  font-weight: 400;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-transform: none;
  white-space: nowrap;
}

.explorer-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.ai-panel {
  display: flex;
  flex: 0 0 340px;
  flex-direction: column;
  width: 340px;
  min-height: 0;
  border-left: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.ai-panel-header {
  display: flex;
  flex: 0 0 44px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--dp-border);
  font-size: 12.5px;
  font-weight: 600;
}

.ai-panel-body {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 0;
  padding: 16px;
}

.ai-panel-footer {
  padding: 12px 14px;
  border-top: 1px solid var(--dp-border);
}

.text-link {
  color: var(--dp-accent);
  font-size: 12px;
  text-decoration: none;
}

.text-link:hover {
  text-decoration: underline;
}

@media (max-width: 1280px) {
  .explorer {
    flex-basis: 224px;
    width: 224px;
  }

  .ai-panel {
    flex-basis: 300px;
    width: 300px;
  }
}
</style>

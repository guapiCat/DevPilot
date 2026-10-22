<script setup lang="ts">
import { ChatDotRound, DocumentCopy, FolderAdd, FolderOpened } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import DiffPanel from '@renderer/components/diff/DiffPanel.vue'
import EditorArea from '@renderer/components/editor/EditorArea.vue'
import FileTree from '@renderer/components/repository/FileTree.vue'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const repository = useRepositoryStore()
const workspace = useWorkspaceStore()

const { activeRepository, fileTree, fileTreeLoading } = storeToRefs(repository)
const { rightPanelVisible, diffPanelVisible } = storeToRefs(workspace)
</script>

<template>
  <div class="workspace-view">
    <header class="workspace-toolbar">
      <div class="repo-badge">
        <el-icon :size="15"><FolderOpened /></el-icon>
        <span>{{ activeRepository?.name ?? '未选择仓库' }}</span>
      </div>

      <el-tooltip content="仓库选择将在阶段 3 接入" placement="bottom">
        <span class="tooltip-wrap">
          <el-button size="small" :icon="FolderAdd" disabled>选择仓库</el-button>
        </span>
      </el-tooltip>

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
            <FileTree :nodes="fileTree" :loading="fileTreeLoading" @open="workspace.openFile" />
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
              description="完成仓库接入（阶段 3）与模型配置后，可在这里基于当前代码上下文提问。"
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

.tooltip-wrap {
  display: inline-flex;
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

<script setup lang="ts">
import { ref } from 'vue'
import { Close, DocumentCopy, Files } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const workspace = useWorkspaceStore()
const { diffPanelVisible } = storeToRefs(workspace)

const activeTab = ref<'diff' | 'git'>('diff')
</script>

<template>
  <section v-if="diffPanelVisible" class="diff-panel">
    <header class="panel-header">
      <div class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'diff' }"
          @click="activeTab = 'diff'"
        >
          Diff 审核
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'git' }"
          @click="activeTab = 'git'"
        >
          Git 变更
        </button>
      </div>

      <el-button text size="small" aria-label="收起面板" @click="workspace.toggleDiffPanel()">
        <el-icon><Close /></el-icon>
      </el-button>
    </header>

    <div class="panel-body">
      <EmptyState
        v-if="activeTab === 'diff'"
        compact
        :icon="DocumentCopy"
        title="没有待审核的修改"
        description="AI 提议的文件修改会先在这里以 Diff 展示，只有你确认后才会写入本地文件。"
      />
      <EmptyState
        v-else
        compact
        :icon="Files"
        title="尚未接入 Git 状态"
        description="阶段 3 接入仓库后，这里会展示工作区变更与文件状态。"
      />
    </div>
  </section>
</template>

<style scoped>
.diff-panel {
  display: flex;
  flex: 0 0 208px;
  flex-direction: column;
  height: 208px;
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

.tabs {
  display: flex;
  gap: 2px;
}

.tab {
  padding: 5px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  cursor: pointer;
}

.tab:hover {
  color: var(--dp-text);
}

.tab.active {
  background: var(--dp-accent-soft);
  color: #9fc0ff;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
</style>

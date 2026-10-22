<script setup lang="ts">
import { Close, Document } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const workspace = useWorkspaceStore()
const { openTabs, activeFilePath } = storeToRefs(workspace)
</script>

<template>
  <section class="editor-area">
    <div v-if="openTabs.length > 0" class="tabs">
      <button
        v-for="tab in openTabs"
        :key="tab"
        type="button"
        class="tab"
        :class="{ active: tab === activeFilePath }"
        @click="workspace.openFile(tab)"
      >
        <el-icon :size="14"><Document /></el-icon>
        <span class="tab-path">{{ tab }}</span>
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          :aria-label="`关闭 ${tab}`"
          @click.stop="workspace.closeTab(tab)"
          @keydown.enter.stop="workspace.closeTab(tab)"
        >
          <el-icon :size="12"><Close /></el-icon>
        </span>
      </button>
    </div>

    <div class="editor-body">
      <EmptyState
        :icon="Document"
        title="没有打开的文件"
        description="从左侧文件树选择文件即可查看。代码编辑器将在阶段 3 接入 Monaco。"
      />
    </div>
  </section>
</template>

<style scoped>
.editor-area {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--dp-bg-app);
}

.tabs {
  display: flex;
  flex: 0 0 38px;
  align-items: stretch;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
  overflow-x: auto;
}

.tab {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 220px;
  padding: 0 10px 0 14px;
  border: 0;
  border-right: 1px solid var(--dp-border);
  background: transparent;
  color: var(--dp-text-muted);
  font-size: 12px;
  cursor: pointer;
}

.tab:hover {
  color: var(--dp-text);
}

.tab.active {
  background: var(--dp-bg-app);
  box-shadow: inset 0 2px 0 var(--dp-accent);
  color: var(--dp-text);
}

.tab-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-close {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 4px;
}

.tab-close:hover {
  background: var(--dp-bg-hover);
}

.editor-body {
  flex: 1;
  min-height: 0;
}
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { Close, Document } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { useWorkspaceStore } from '@renderer/stores/workspace'

const workspace = useWorkspaceStore()
const { openTabs, activeFilePath, fileContents, fileErrors, fileLoadingPath } =
  storeToRefs(workspace)

const activeContent = computed(() => {
  const path = activeFilePath.value
  return path ? (fileContents.value[path] ?? null) : null
})

const activeError = computed(() => {
  const path = activeFilePath.value
  return path ? (fileErrors.value[path] ?? null) : null
})

const isLoading = computed(
  () => Boolean(activeFilePath.value) && fileLoadingPath.value === activeFilePath.value
)

const lineNumbers = computed(() => {
  if (!activeContent.value) return ''
  const lineCount = activeContent.value.content.split('\n').length
  return Array.from({ length: lineCount }, (_, index) => index + 1).join('\n')
})

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
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
        v-if="!activeFilePath"
        :icon="Document"
        title="没有打开的文件"
        description="从左侧文件树选择文件即可只读查看代码。"
      />

      <div v-else-if="activeError" class="editor-feedback">
        <el-alert :title="activeError" type="error" show-icon :closable="false" />
      </div>

      <el-skeleton
        v-else-if="isLoading || !activeContent"
        class="editor-loading"
        :rows="10"
        animated
      />

      <div v-else class="file-view">
        <div class="file-meta">
          <span class="file-path">{{ activeContent.relativePath }}</span>
          <span class="file-info">
            {{ formatSize(activeContent.size) }} · UTF-8{{ activeContent.hadBom ? ' · BOM' : '' }} ·
            只读
          </span>
        </div>

        <div class="code-scroll">
          <pre class="line-numbers" aria-hidden="true">{{ lineNumbers }}</pre>
          <pre class="code"><code>{{ activeContent.content }}</code></pre>
        </div>
      </div>
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
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.editor-feedback,
.editor-loading {
  padding: 18px;
}

.file-view {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.file-meta {
  display: flex;
  flex: 0 0 30px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 14px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
  color: var(--dp-text-muted);
  font-size: 11.5px;
}

.file-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-info {
  flex: 0 0 auto;
}

.code-scroll {
  display: flex;
  flex: 1;
  align-items: flex-start;
  min-height: 0;
  overflow: auto;
  background: var(--dp-bg-app);
}

.line-numbers,
.code {
  padding-top: 12px;
  padding-bottom: 12px;
  margin: 0;
  font-family: var(--dp-mono);
  font-size: 12.5px;
  line-height: 1.6;
  tab-size: 2;
}

.line-numbers {
  position: sticky;
  left: 0;
  flex: 0 0 auto;
  min-width: 52px;
  padding-right: 12px;
  padding-left: 12px;
  border-right: 1px solid var(--dp-border);
  background: var(--dp-bg-app);
  color: var(--dp-text-muted);
  text-align: right;
  user-select: none;
  white-space: pre;
}

.code {
  flex: 1;
  min-width: max-content;
  padding-right: 18px;
  color: var(--dp-text);
  white-space: pre;
}
</style>

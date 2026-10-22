<script setup lang="ts">
import { FolderOpened } from '@element-plus/icons-vue'
import type { FileTreeNode } from '@shared/types/repository'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import FileTreeItem from './FileTreeItem.vue'

withDefaults(
  defineProps<{
    nodes: FileTreeNode[]
    loading?: boolean
  }>(),
  { loading: false }
)

const emit = defineEmits<{
  open: [relativePath: string]
}>()
</script>

<template>
  <div class="file-tree">
    <el-skeleton v-if="loading" class="loading" :rows="6" animated />

    <EmptyState
      v-else-if="nodes.length === 0"
      compact
      :icon="FolderOpened"
      title="尚未选择仓库"
      description="点击上方“选择仓库”选择本地目录后，文件树会显示在这里。"
    />

    <ul v-else class="root">
      <FileTreeItem
        v-for="node in nodes"
        :key="node.relativePath"
        :node="node"
        :depth="0"
        @open="emit('open', $event)"
      />
    </ul>
  </div>
</template>

<style scoped>
.file-tree {
  height: 100%;
}

.loading {
  padding: 14px 12px;
}

.root {
  padding: 4px 0;
  margin: 0;
}
</style>

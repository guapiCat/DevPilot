<script setup lang="ts">
import { computed, ref } from 'vue'
import { ArrowRight, Document, Folder, FolderOpened } from '@element-plus/icons-vue'
import type { FileTreeNode } from '@shared/types/repository'

const props = defineProps<{
  node: FileTreeNode
  depth: number
}>()

const emit = defineEmits<{
  open: [relativePath: string]
}>()

const expanded = ref(false)
const isDirectory = computed(() => props.node.type === 'directory')

function activate(): void {
  if (isDirectory.value) {
    expanded.value = !expanded.value
    return
  }
  emit('open', props.node.relativePath)
}
</script>

<template>
  <li class="tree-item">
    <button
      type="button"
      class="tree-row"
      :style="{ paddingLeft: `${depth * 14 + 10}px` }"
      :aria-expanded="isDirectory ? expanded : undefined"
      @click="activate"
    >
      <el-icon v-if="isDirectory" class="chevron" :class="{ expanded }" :size="12">
        <ArrowRight />
      </el-icon>
      <span v-else class="chevron-spacer"></span>

      <el-icon class="node-icon" :size="15">
        <FolderOpened v-if="isDirectory && expanded" />
        <Folder v-else-if="isDirectory" />
        <Document v-else />
      </el-icon>

      <span class="label">{{ node.name }}</span>
    </button>

    <ul v-if="isDirectory && expanded && node.children?.length" class="children">
      <FileTreeItem
        v-for="child in node.children"
        :key="child.relativePath"
        :node="child"
        :depth="depth + 1"
        @open="emit('open', $event)"
      />
    </ul>
  </li>
</template>

<style scoped>
.tree-item {
  list-style: none;
}

.children {
  padding: 0;
  margin: 0;
}

.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding-top: 5px;
  padding-right: 10px;
  padding-bottom: 5px;
  border: 0;
  background: transparent;
  color: var(--dp-text-secondary);
  font-size: 12.5px;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.tree-row:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.chevron {
  flex: 0 0 12px;
  color: var(--dp-text-muted);
  transition: transform 0.15s ease;
}

.chevron.expanded {
  transform: rotate(90deg);
}

.chevron-spacer {
  flex: 0 0 12px;
}

.node-icon {
  flex: 0 0 15px;
  color: var(--dp-icon-folder);
}

.tree-item .label {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

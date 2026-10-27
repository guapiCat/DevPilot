<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { GitBranch } from '@shared/types/git'
import type { GitBusyAction } from '@renderer/stores/git'

const props = defineProps<{
  modelValue: boolean
  branches: GitBranch[]
  current: string | null
  busyAction: GitBusyAction | null
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  switch: [branchName: string]
  create: [branchName: string, checkout: boolean]
}>()

const filter = ref('')
const newName = ref('')

const visible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value),
})

const filteredBranches = computed(() => {
  const keyword = filter.value.trim().toLowerCase()
  if (!keyword) return props.branches
  return props.branches.filter((branch) => branch.name.toLowerCase().includes(keyword))
})

const canCreate = computed(() => newName.value.trim().length > 0 && props.busyAction === null)

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      newName.value = ''
      filter.value = ''
    }
  },
)

function create(checkout: boolean): void {
  if (!canCreate.value) return
  emit('create', newName.value.trim(), checkout)
}
</script>

<template>
  <el-dialog v-model="visible" title="分支管理" width="600px">
    <div class="branch-dialog">
      <el-input v-model="filter" size="small" placeholder="筛选分支" clearable />

      <div class="branch-list">
        <div
          v-for="branch in filteredBranches"
          :key="branch.name"
          class="branch-item"
          :class="{ current: branch.name === current }">
          <div class="branch-main">
            <div class="branch-name-line">
              <span class="branch-name">{{ branch.name }}</span>
              <el-tag v-if="branch.name === current" size="small" type="success" effect="plain"> 当前 </el-tag>
              <span v-if="branch.upstream" class="branch-upstream" :title="branch.upstream">
                {{ branch.upstream }}
              </span>
            </div>
            <div class="branch-meta">
              <span v-if="branch.commit" class="branch-commit">{{ branch.commit }}</span>
              <span v-if="branch.subject" class="branch-subject">{{ branch.subject }}</span>
            </div>
          </div>
          <el-button
            size="small"
            :disabled="branch.name === current || busyAction !== null"
            @click="emit('switch', branch.name)">
            切换
          </el-button>
        </div>

        <div v-if="filteredBranches.length === 0" class="branch-empty">没有匹配的分支</div>
      </div>

      <div class="create-row">
        <el-input
          v-model="newName"
          size="small"
          placeholder="新分支名，例如 feature/login"
          @keydown.enter.prevent="create(true)" />
        <el-button size="small" :disabled="!canCreate" :loading="busyAction === 'create-branch'" @click="create(false)">
          新建
        </el-button>
        <el-button
          size="small"
          type="primary"
          :disabled="!canCreate"
          :loading="busyAction === 'create-branch'"
          @click="create(true)">
          新建并切换
        </el-button>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.branch-dialog {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.branch-list {
  max-height: 340px;
  overflow: auto;
  border: 1px solid var(--dp-border);
  border-radius: 6px;
}

.branch-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--dp-border);
}

.branch-item:last-child {
  border-bottom: 0;
}

.branch-item.current {
  background: var(--dp-accent-soft);
}

.branch-main {
  flex: 1;
  min-width: 0;
}

.branch-name-line {
  display: flex;
  align-items: center;
  gap: 7px;
}

.branch-name {
  overflow: hidden;
  color: var(--dp-text);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-upstream {
  overflow: hidden;
  color: var(--dp-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  color: var(--dp-text-muted);
  font-size: 10.5px;
}

.branch-commit {
  color: var(--dp-accent-text);
  font-family: var(--dp-mono);
}

.branch-subject {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-empty {
  padding: 16px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  text-align: center;
}

.create-row {
  display: flex;
  gap: 8px;
}

.create-row .el-input {
  flex: 1;
}
</style>

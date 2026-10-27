<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAX_GIT_COMMIT_MESSAGE_LENGTH } from '@shared/constants/app'
import type { GitHeadState } from '@shared/types/git'
import type { GitBusyAction } from '@renderer/stores/git'

const props = defineProps<{
  stagedCount: number
  headState: GitHeadState
  busyAction: GitBusyAction | null
}>()

const emit = defineEmits<{
  submit: [message: string]
}>()

const message = ref('')
const trimmed = computed(() => message.value.trim())
const canSubmit = computed(() => trimmed.value.length > 0 && props.stagedCount > 0 && props.busyAction === null)

function submit(): void {
  if (!canSubmit.value) return
  emit('submit', trimmed.value)
}

function clear(): void {
  message.value = ''
}

defineExpose({ clear })
</script>

<template>
  <div class="commit-box">
    <el-input
      v-model="message"
      type="textarea"
      :rows="4"
      resize="none"
      :maxlength="MAX_GIT_COMMIT_MESSAGE_LENGTH"
      placeholder="提交信息（Ctrl+Enter 提交）"
      :disabled="busyAction !== null"
      @keydown.ctrl.enter.prevent="submit" />

    <div class="commit-footer">
      <span class="commit-hint">
        <template v-if="headState === 'detached'">分离 HEAD：提交不会更新分支</template>
        <template v-else>将提交 {{ stagedCount }} 个已暂存文件</template>
      </span>
      <span class="commit-count">{{ message.length }}/{{ MAX_GIT_COMMIT_MESSAGE_LENGTH }}</span>
      <el-button type="primary" size="small" :disabled="!canSubmit" :loading="busyAction === 'commit'" @click="submit">
        提交
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.commit-box {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.commit-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}

.commit-hint {
  flex: 1;
  overflow: hidden;
  color: var(--dp-text-muted);
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.commit-count {
  color: var(--dp-text-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
</style>

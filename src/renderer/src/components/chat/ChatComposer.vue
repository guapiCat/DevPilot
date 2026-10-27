<script setup lang="ts">
import { ref } from 'vue'
import { CircleClose, Promotion } from '@element-plus/icons-vue'

const props = defineProps<{
  disabled?: boolean
  disabledHint?: string
  generating?: boolean
}>()

const emit = defineEmits<{
  send: [content: string]
  cancel: []
}>()

const content = ref('')

function submit(): void {
  if (props.disabled || props.generating) return

  const value = content.value.trim()
  if (!value) return

  emit('send', value)
  content.value = ''
}
</script>

<template>
  <div class="composer">
    <el-input
      v-model="content"
      type="textarea"
      :rows="3"
      resize="none"
      :disabled="disabled"
      placeholder="描述你的研发问题，例如：登录流程的令牌刷新逻辑在哪里？"
      @keydown.enter.exact.prevent="submit" />
    <div class="footer">
      <div class="footer-left">
        <slot name="toolbar" />
        <span class="hint">
          {{ disabled ? disabledHint : generating ? '正在生成，可先停止或等待' : 'Enter 发送 · Shift + Enter 换行' }}
        </span>
      </div>
      <el-button v-if="generating" type="danger" plain @click="emit('cancel')">
        <el-icon><CircleClose /></el-icon>
        <span>停止</span>
      </el-button>
      <el-button v-else type="primary" :disabled="disabled || !content.trim()" @click="submit">
        <el-icon><Promotion /></el-icon>
        <span>发送</span>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.composer {
  padding: 14px 24px 20px;
  border-top: 1px solid var(--dp-border);
  background: var(--dp-bg-panel);
}

.composer :deep(.el-textarea__inner) {
  min-height: 78px !important;
  padding: 12px 14px;
  background: var(--dp-bg-app);
  box-shadow: 0 0 0 1px var(--dp-border) inset;
  color: var(--dp-text);
  line-height: 1.6;
}

.composer :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--dp-accent) inset;
}

.composer :deep(.el-textarea__inner::placeholder) {
  color: var(--dp-text-muted);
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.footer-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
}

.hint {
  color: var(--dp-text-muted);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.el-button {
  flex: none;
}

.el-button .el-icon {
  margin-right: 4px;
}
</style>

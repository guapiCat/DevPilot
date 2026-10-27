<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ToolCallRecord, ToolCallStatus } from '@shared/types/tool'

const props = defineProps<{
  calls: ToolCallRecord[]
}>()

const TOOL_LABELS: Record<string, string> = {
  list_files: '浏览文件',
  read_file: '读取文件',
  search_code: '搜索代码',
  get_git_status: 'Git 状态',
  get_git_diff: 'Git 差异',
  propose_file_edit: '生成修改建议',
}

const STATUS_LABELS: Record<ToolCallStatus, string> = {
  running: '执行中',
  success: '完成',
  error: '失败',
  blocked: '已阻止',
  timeout: '超时',
  cancelled: '已停止',
}

const runningCount = computed(() => props.calls.filter((call) => call.status === 'running').length)
const failedCount = computed(
  () =>
    props.calls.filter((call) => call.status === 'error' || call.status === 'timeout' || call.status === 'blocked')
      .length,
)

const summaryText = computed(() => {
  const parts = [`工具调用 ${props.calls.length} 次`]
  if (runningCount.value > 0) parts.push(`${runningCount.value} 个执行中`)
  if (failedCount.value > 0) parts.push(`${failedCount.value} 个未成功`)
  const totalMs = props.calls.reduce((sum, call) => sum + call.durationMs, 0)
  if (runningCount.value === 0 && totalMs > 0) parts.push(`共 ${formatDuration(totalMs)}`)
  return parts.join(' · ')
})

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const expanded = ref(false)

function handleToggle(event: Event): void {
  expanded.value = (event.target as HTMLDetailsElement).open
}
</script>

<template>
  <details class="tool-call-list" @toggle="handleToggle">
    <summary>
      <span class="summary-text">{{ summaryText }}</span>
      <span class="summary-hint">{{ expanded ? '收起详情' : '展开详情' }}</span>
    </summary>

    <ul class="calls">
      <li v-for="call in calls" :key="call.id" class="call">
        <span class="status-dot" :class="call.status" :title="STATUS_LABELS[call.status]"></span>
        <span class="tool-name">{{ toolLabel(call.name) }}</span>
        <code v-if="call.argumentsSummary" class="args">{{ call.argumentsSummary }}</code>
        <span class="status-text" :class="call.status">{{ STATUS_LABELS[call.status] }}</span>
        <span v-if="call.summary && call.status !== 'success'" class="result">
          {{ call.summary }}
        </span>
        <span v-if="call.durationMs > 0" class="duration">
          {{ formatDuration(call.durationMs) }}
        </span>
      </li>
    </ul>
  </details>
</template>

<style scoped>
.tool-call-list {
  margin: 2px 0 10px;
  border: 1px solid var(--dp-border);
  border-radius: 8px;
  background: var(--dp-bg-panel);
  font-size: 12px;
}

summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 7px 11px;
  color: var(--dp-text-muted);
  cursor: pointer;
  list-style: none;
  user-select: none;
}

summary::-webkit-details-marker {
  display: none;
}

summary::before {
  content: '▸';
  margin-right: 2px;
  color: var(--dp-text-muted);
  transition: transform 0.15s;
}

.tool-call-list[open] summary::before {
  transform: rotate(90deg);
}

.summary-text {
  flex: 1;
}

.summary-hint {
  font-size: 11px;
}

.calls {
  padding: 0;
  margin: 0;
  border-top: 1px solid var(--dp-border);
  list-style: none;
}

.call {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
}

.call + .call {
  border-top: 1px solid var(--dp-border);
}

.status-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dp-text-muted);
}

.status-dot.running {
  background: var(--dp-accent);
  animation: tool-pulse 1.2s infinite ease-in-out;
}

.status-dot.success {
  background: var(--dp-success);
}

.status-dot.error,
.status-dot.timeout {
  background: var(--dp-danger);
}

.status-dot.blocked {
  background: var(--dp-warning);
}

.status-dot.cancelled {
  background: var(--dp-text-muted);
}

.tool-name {
  color: var(--dp-text);
  font-weight: 600;
  white-space: nowrap;
}

.args {
  flex: 1 1 180px;
  min-width: 0;
  overflow: hidden;
  color: var(--dp-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-text {
  color: var(--dp-text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.status-text.success {
  color: var(--dp-success);
}

.status-text.error,
.status-text.timeout {
  color: var(--dp-danger);
}

.result {
  flex-basis: 100%;
  padding-left: 15px;
  color: var(--dp-text-muted);
  font-size: 11.5px;
}

.duration {
  margin-left: auto;
  color: var(--dp-text-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

@keyframes tool-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>

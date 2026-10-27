<script setup lang="ts">
import { computed } from 'vue'

const MAX_RENDERED_DIFF_LINES = 4000

const props = withDefaults(
  defineProps<{
    diff: string
    truncated?: boolean
    emptyText?: string
  }>(),
  {
    truncated: false,
    emptyText: '该文件没有可展示的文本差异。',
  },
)

const lines = computed(() =>
  props.diff
    .split('\n')
    .slice(0, MAX_RENDERED_DIFF_LINES)
    .map((text) => ({ text, type: classifyDiffLine(text) })),
)

const overflow = computed(() => props.truncated || props.diff.split('\n').length > MAX_RENDERED_DIFF_LINES)

function classifyDiffLine(line: string): string {
  if (line.startsWith('diff ') || line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}
</script>

<template>
  <div class="unified-diff">
    <div v-if="overflow" class="diff-warning">差异过大，仅显示前 {{ MAX_RENDERED_DIFF_LINES }} 行或前 512 KB。</div>

    <div v-if="lines.length === 0" class="diff-empty">{{ emptyText }}</div>
    <div v-else class="diff-content">
      <div v-for="(line, index) in lines" :key="index" class="diff-line" :class="line.type">
        {{ line.text || ' ' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.unified-diff {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.diff-warning {
  flex: 0 0 auto;
  padding: 5px 14px;
  border-bottom: 1px solid var(--dp-border);
  background: var(--dp-diff-warning-bg);
  color: var(--dp-diff-modified-text);
  font-size: 11px;
}

.diff-empty {
  padding: 24px 14px;
  color: var(--dp-text-muted);
  font-size: 12px;
}

.diff-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 6px 0;
  font-family: 'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  font-size: 11.5px;
  line-height: 18px;
}

.diff-line {
  min-height: 18px;
  padding: 0 14px;
  color: var(--dp-text-secondary);
  white-space: pre;
}

.diff-line.add {
  background: var(--dp-diff-line-add-bg);
  color: var(--dp-diff-line-add-text);
}

.diff-line.del {
  background: var(--dp-diff-line-del-bg);
  color: var(--dp-diff-line-del-text);
}

.diff-line.hunk {
  color: var(--dp-diff-hunk-text);
}

.diff-line.meta {
  color: var(--dp-text-muted);
}
</style>

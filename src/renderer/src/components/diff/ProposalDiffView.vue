<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ArrowDown, ArrowUp } from '@element-plus/icons-vue'
import { storeToRefs } from 'pinia'
import { monaco } from '@renderer/services/monaco'
import { useThemeStore } from '@renderer/stores/theme'
import { getMonacoLanguage } from '@renderer/utils/language'

const props = defineProps<{
  relativePath: string
  originalContent: string
  proposedContent: string
}>()

const theme = useThemeStore()
const { mode } = storeToRefs(theme)
const monacoTheme = computed(() => (mode.value === 'dark' ? 'devpilot-dark' : 'devpilot-light'))

const host = ref<HTMLDivElement | null>(null)
const changeCount = ref<number | null>(null)
let editor: monaco.editor.IStandaloneDiffEditor | null = null
let diffListener: { dispose(): void } | null = null
let version = 0

function ensureEditor(): monaco.editor.IStandaloneDiffEditor | null {
  if (!editor && host.value) {
    editor = monaco.editor.createDiffEditor(host.value, {
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      theme: monacoTheme.value,
      renderSideBySide: true,
      useInlineViewWhenSpaceIsLimited: true,
      ignoreTrimWhitespace: false,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderOverviewRuler: false,
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 12,
      lineHeight: 19,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false
      }
    })

    diffListener = editor.onDidUpdateDiff(() => {
      changeCount.value = editor?.getLineChanges()?.length ?? 0
    })

    updateModels()
  }

  return editor
}

function updateModels(): void {
  if (!editor) return

  changeCount.value = null
  version += 1
  const encodedPath = props.relativePath.split('/').map(encodeURIComponent).join('/')
  const language = getMonacoLanguage(props.relativePath)

  const nextOriginal = monaco.editor.createModel(
    props.originalContent,
    language,
    monaco.Uri.parse(`devpilot-edit://original/${version}/${encodedPath}`)
  )
  const nextModified = monaco.editor.createModel(
    props.proposedContent,
    language,
    monaco.Uri.parse(`devpilot-edit://modified/${version}/${encodedPath}`)
  )

  const previous = editor.getModel()
  editor.setModel({ original: nextOriginal, modified: nextModified })
  previous?.original.dispose()
  previous?.modified.dispose()
  editor.revealFirstDiff()
}

function reveal(direction: 'next' | 'previous'): void {
  if (!changeCount.value) return
  editor?.goToDiff(direction)
}

function isShortcutBlocked(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return Boolean(
    target?.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')
  )
}

function handleKeydown(event: KeyboardEvent): void {
  if (!event.altKey || event.shiftKey) return
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  if (!changeCount.value || isShortcutBlocked(event)) return

  event.preventDefault()
  reveal(event.key === 'ArrowUp' ? 'previous' : 'next')
}

watch(monacoTheme, (value) => {
  monaco.editor.setTheme(value)
})

watch(
  () => [props.relativePath, props.originalContent, props.proposedContent],
  () => {
    updateModels()
  }
)

onMounted(() => {
  ensureEditor()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  diffListener?.dispose()
  diffListener = null
  const model = editor?.getModel()
  editor?.dispose()
  editor = null
  model?.original.dispose()
  model?.modified.dispose()
})
</script>

<template>
  <div class="proposal-diff">
    <div class="diff-nav">
      <span class="diff-nav-count">
        <template v-if="changeCount === null">计算差异中…</template>
        <template v-else-if="changeCount === 0">无文本差异</template>
        <template v-else>{{ changeCount }} 处变更</template>
      </span>
      <div class="diff-nav-actions">
        <el-button
          text
          size="small"
          :icon="ArrowUp"
          aria-label="上一处变更"
          title="上一处变更 (Alt+↑)"
          :disabled="!changeCount"
          @click="reveal('previous')"
        />
        <el-button
          text
          size="small"
          :icon="ArrowDown"
          aria-label="下一处变更"
          title="下一处变更 (Alt+↓)"
          :disabled="!changeCount"
          @click="reveal('next')"
        />
      </div>
    </div>
    <div ref="host" class="proposal-diff-editor" aria-label="修改建议差异"></div>
  </div>
</template>

<style scoped>
.proposal-diff {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.diff-nav {
  display: flex;
  flex: 0 0 28px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 8px 0 14px;
  border-bottom: 1px solid var(--dp-border);
  color: var(--dp-text-muted);
  font-size: 11px;
}

.diff-nav-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.proposal-diff-editor {
  flex: 1;
  min-height: 0;
}
</style>

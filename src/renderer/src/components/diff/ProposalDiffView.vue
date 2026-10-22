<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
let editor: monaco.editor.IStandaloneDiffEditor | null = null
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

    updateModels()
  }

  return editor
}

function updateModels(): void {
  if (!editor) return

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
})

onBeforeUnmount(() => {
  const model = editor?.getModel()
  editor?.dispose()
  editor = null
  model?.original.dispose()
  model?.modified.dispose()
})
</script>

<template>
  <div ref="host" class="proposal-diff-editor" aria-label="修改建议差异"></div>
</template>

<style scoped>
.proposal-diff-editor {
  flex: 1;
  min-height: 0;
}
</style>

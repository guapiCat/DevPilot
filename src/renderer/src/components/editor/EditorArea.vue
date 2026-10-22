<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Close, Document } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { storeToRefs } from 'pinia'
import EmptyState from '@renderer/components/common/EmptyState.vue'
import { desktopApi, DesktopApiError } from '@renderer/services/desktop-api'
import type * as Monaco from 'monaco-editor'
import { useRepositoryStore } from '@renderer/stores/repository'
import { useThemeStore } from '@renderer/stores/theme'
import { useWorkspaceStore } from '@renderer/stores/workspace'
import { toErrorMessage } from '@renderer/utils/errors'
import { getMonacoLanguage } from '@renderer/utils/language'

const workspace = useWorkspaceStore()
const repository = useRepositoryStore()
const theme = useThemeStore()
const { activeRepository } = storeToRefs(repository)
const monacoTheme = computed(() => (theme.mode === 'dark' ? 'devpilot-dark' : 'devpilot-light'))

type MonacoApi = typeof import('monaco-editor/editor/editor.api')
let monacoApi: MonacoApi | null = null

async function loadMonaco(): Promise<MonacoApi> {
  if (!monacoApi) {
    monacoApi = (await import('@renderer/services/monaco')).monaco
  }
  return monacoApi
}

watch(monacoTheme, (value) => {
  monacoApi?.editor.setTheme(value)
})
const {
  openTabs,
  activeFilePath,
  fileContents,
  fileErrors,
  fileDirty,
  fileSavingPath,
  fileLoadingPath
} = storeToRefs(workspace)

const editorHost = ref<HTMLDivElement | null>(null)
let editor: Monaco.editor.IStandaloneCodeEditor | null = null
const models = new Map<string, Monaco.editor.ITextModel>()

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

const isDirty = computed(
  () => Boolean(activeFilePath.value) && Boolean(fileDirty.value[activeFilePath.value!])
)

const isSaving = computed(
  () => Boolean(activeFilePath.value) && fileSavingPath.value === activeFilePath.value
)

const canSave = computed(() => isDirty.value && !isSaving.value)

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileName(relativePath: string): string {
  return relativePath.split('/').pop() ?? relativePath
}

function toModelUri(api: MonacoApi, relativePath: string): Monaco.Uri {
  const encodedPath = relativePath.split('/').map(encodeURIComponent).join('/')
  return api.Uri.parse(`devpilot://repository/${encodedPath}`)
}

function ensureEditor(api: MonacoApi): Monaco.editor.IStandaloneCodeEditor | null {
  if (!editor && editorHost.value) {
    editor = api.editor.create(editorHost.value, {
      readOnly: false,
      automaticLayout: true,
      theme: monacoTheme.value,
      minimap: { enabled: false },
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, monospace",
      fontSize: 12.5,
      lineHeight: 20,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      renderLineHighlight: 'none',
      glyphMargin: false,
      lineNumbersMinChars: 3,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      contextmenu: false,
      scrollbar: {
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
        useShadows: false
      }
    })

    editor.onDidChangeModelContent(() => syncActiveDirty())
  }

  return editor
}

function syncActiveDirty(): void {
  const path = activeFilePath.value
  const saved = path ? fileContents.value[path] : null
  const model = path ? models.get(path) : null
  if (!path || !saved || !model || model.isDisposed()) return

  workspace.setFileDirty(path, model.getValue() !== saved.content)
}

async function syncActiveModel(): Promise<void> {
  const path = activeFilePath.value
  const content = activeContent.value
  if (!path || !content) return

  const api = await loadMonaco()
  const currentEditor = ensureEditor(api)
  if (!currentEditor) return

  let model = models.get(path)
  if (!model || model.isDisposed()) {
    const uri = toModelUri(api, path)
    model =
      api.editor.getModel(uri) ??
      api.editor.createModel(content.content, getMonacoLanguage(path), uri)
    models.set(path, model)
  }

  // 未保存的编辑不会被磁盘内容覆盖；重新加载会先释放模型。
  if (!fileDirty.value[path] && model.getValue() !== content.content) {
    model.setValue(content.content)
  }

  if (currentEditor.getModel() !== model) {
    currentEditor.setModel(model)
  }

  syncActiveDirty()
}

function disposeModels(remainingPaths: readonly string[]): void {
  for (const [path, model] of models) {
    if (!remainingPaths.includes(path)) {
      model.dispose()
      models.delete(path)
    }
  }
}

async function reloadFile(relativePath: string): Promise<void> {
  const currentRepository = activeRepository.value
  if (!currentRepository) return

  try {
    const content = await desktopApi.file.read(currentRepository.id, relativePath)
    models.get(relativePath)?.dispose()
    models.delete(relativePath)
    workspace.setFileContent(relativePath, content)
    await nextTick()
    await syncActiveModel()
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function handleFileConflict(relativePath: string): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '该文件已在磁盘上被外部修改。重新加载将丢弃当前未保存的修改。',
      '文件已被外部修改',
      {
        confirmButtonText: '重新加载',
        cancelButtonText: '保留我的修改',
        type: 'warning',
        distinguishCancelAndClose: false
      }
    )
  } catch {
    return
  }

  await reloadFile(relativePath)
}

async function saveActiveFile(): Promise<void> {
  const path = activeFilePath.value
  const currentRepository = activeRepository.value
  if (!path || !currentRepository || fileSavingPath.value) return

  const saved = fileContents.value[path]
  const model = models.get(path)
  if (!saved || !model || model.isDisposed()) return

  const value = model.getValue()
  if (value === saved.content) {
    workspace.setFileDirty(path, false)
    return
  }

  workspace.setFileSavingPath(path)

  try {
    const result = await desktopApi.file.write(currentRepository.id, path, value, saved.hash)
    workspace.applySavedContent(path, value, result.hash, result.size, result.hadBom)
    syncActiveDirty()
    void repository.refreshGitStatus()
    ElMessage.success({ message: `已保存 ${fileName(path)}`, duration: 1500 })
  } catch (error) {
    if (error instanceof DesktopApiError && error.code === 'FILE_CHANGED') {
      if (workspace.fileSavingPath === path) workspace.setFileSavingPath(null)
      await handleFileConflict(path)
      return
    }
    ElMessage.error(toErrorMessage(error))
  } finally {
    if (workspace.fileSavingPath === path) {
      workspace.setFileSavingPath(null)
    }
  }
}

async function requestCloseTab(relativePath: string): Promise<void> {
  if (fileDirty.value[relativePath]) {
    try {
      await ElMessageBox.confirm(
        `「${fileName(relativePath)}」有未保存的修改，关闭将丢失这些修改。`,
        '关闭未保存的文件',
        {
          confirmButtonText: '关闭',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    } catch {
      return
    }
  }

  workspace.closeTab(relativePath)
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') return

  const target = event.target instanceof HTMLElement ? event.target : null
  const isEditable = Boolean(
    target?.closest('input, textarea, [contenteditable="true"]') &&
    !target.closest('.monaco-editor')
  )
  if (isEditable) return

  event.preventDefault()
  void saveActiveFile()
}

watch(
  [activeFilePath, activeContent],
  () => {
    void nextTick(() => {
      void syncActiveModel()
    })
  },
  { flush: 'post' }
)

watch(activeFilePath, (path) => {
  if (!path) {
    editor?.dispose()
    editor = null
  }
})

watch(
  openTabs,
  (tabs) => {
    disposeModels(tabs)
  },
  { deep: true }
)

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown, true)
  void nextTick(() => {
    void syncActiveModel()
  })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleGlobalKeydown, true)
  editor?.dispose()
  editor = null
  for (const model of models.values()) {
    model.dispose()
  }
  models.clear()
})
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
        <span v-if="fileDirty[tab]" class="tab-dirty" aria-label="未保存"></span>
        <span
          class="tab-close"
          role="button"
          tabindex="0"
          :aria-label="`关闭 ${tab}`"
          @click.stop="requestCloseTab(tab)"
          @keydown.enter.stop="requestCloseTab(tab)"
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
        description="从左侧文件树选择文件即可查看并编辑代码，Ctrl+S 保存。"
      />

      <div v-else class="file-view">
        <div class="file-meta">
          <span class="file-path">{{ activeFilePath }}</span>
          <div class="file-meta-actions">
            <span class="file-info">
              <template v-if="activeContent">
                {{ formatSize(activeContent.size) }} · UTF-8{{
                  activeContent.hadBom ? ' · BOM' : ''
                }}
              </template>
              <template v-else-if="!activeError">加载中…</template>
              <template v-else>读取失败</template>
            </span>
            <span v-if="activeContent" class="file-state" :class="{ dirty: isDirty }">
              {{ isDirty ? '未保存' : '已保存' }}
            </span>
            <el-button
              v-if="activeContent"
              size="small"
              :disabled="!canSave"
              :loading="isSaving"
              title="保存到磁盘（Ctrl+S）"
              @click="saveActiveFile"
            >
              保存
            </el-button>
          </div>
        </div>

        <div class="editor-stage">
          <div ref="editorHost" class="editor-host" aria-label="代码编辑器"></div>

          <div v-if="activeError" class="editor-overlay">
            <el-alert :title="activeError" type="error" show-icon :closable="false" />
          </div>

          <div v-else-if="isLoading || !activeContent" class="editor-overlay">
            <el-skeleton :rows="10" animated />
          </div>
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

.tab-dirty {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dp-accent);
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
  padding: 0 10px 0 14px;
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

.file-meta-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
}

.file-state {
  color: var(--dp-text-muted);
}

.file-state.dirty {
  color: var(--dp-warning);
}

.editor-stage {
  position: relative;
  flex: 1;
  min-height: 0;
}

.editor-host {
  position: absolute;
  inset: 0;
}

.editor-overlay {
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 18px;
  background: var(--dp-bg-app);
}
</style>

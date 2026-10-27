import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { FileContent } from '@shared/types/repository'

export type DiffPanelMode = 'proposals' | 'git'

export const useWorkspaceStore = defineStore('workspace', () => {
  const openTabs = ref<string[]>([])
  const activeFilePath = ref<string | null>(null)
  const rightPanelVisible = ref(true)
  const diffPanelVisible = ref(false)
  const diffPanelMode = ref<DiffPanelMode | null>(null)
  const selectedEditProposalId = ref<string | null>(null)
  const fileContents = ref<Record<string, FileContent>>({})
  const fileErrors = ref<Record<string, string>>({})
  const fileDirty = ref<Record<string, boolean>>({})
  const fileSavingPath = ref<string | null>(null)
  const fileLoadingPath = ref<string | null>(null)
  const hasDirtyFiles = computed(() => openTabs.value.some((path) => fileDirty.value[path]))

  function openFile(relativePath: string): void {
    if (!openTabs.value.includes(relativePath)) {
      openTabs.value.push(relativePath)
    }
    activeFilePath.value = relativePath
  }

  function closeTab(relativePath: string): void {
    const index = openTabs.value.indexOf(relativePath)
    if (index === -1) return

    openTabs.value.splice(index, 1)
    delete fileDirty.value[relativePath]

    if (activeFilePath.value === relativePath) {
      activeFilePath.value = openTabs.value[Math.max(0, index - 1)] ?? null
    }
  }

  function toggleRightPanel(): void {
    rightPanelVisible.value = !rightPanelVisible.value
  }

  function toggleDiffPanel(): void {
    diffPanelVisible.value = !diffPanelVisible.value
  }

  function showDiffPanel(mode: DiffPanelMode | null = null): void {
    if (mode) diffPanelMode.value = mode
    diffPanelVisible.value = true
  }

  function selectEditProposal(id: string | null): void {
    selectedEditProposalId.value = id
  }

  function setFileContent(relativePath: string, content: FileContent): void {
    fileContents.value[relativePath] = content
    delete fileErrors.value[relativePath]
    delete fileDirty.value[relativePath]
  }

  function setFileError(relativePath: string, message: string): void {
    fileErrors.value[relativePath] = message
  }

  function setFileDirty(relativePath: string, dirty: boolean): void {
    if (dirty) {
      fileDirty.value[relativePath] = true
    } else {
      delete fileDirty.value[relativePath]
    }
  }

  function setFileLoadingPath(relativePath: string | null): void {
    fileLoadingPath.value = relativePath
  }

  function setFileSavingPath(relativePath: string | null): void {
    fileSavingPath.value = relativePath
  }

  function applySavedContent(relativePath: string, content: string, hash: string, size: number, hadBom: boolean): void {
    const existing = fileContents.value[relativePath]
    if (!existing) return

    fileContents.value[relativePath] = { ...existing, content, hash, size, hadBom }
    delete fileDirty.value[relativePath]
    delete fileErrors.value[relativePath]
  }

  function resetRepositoryState(): void {
    openTabs.value = []
    activeFilePath.value = null
    fileContents.value = {}
    fileErrors.value = {}
    fileDirty.value = {}
    fileSavingPath.value = null
    fileLoadingPath.value = null
  }

  return {
    openTabs,
    activeFilePath,
    rightPanelVisible,
    diffPanelVisible,
    diffPanelMode,
    selectedEditProposalId,
    fileContents,
    fileErrors,
    fileDirty,
    fileSavingPath,
    fileLoadingPath,
    hasDirtyFiles,
    openFile,
    closeTab,
    toggleRightPanel,
    toggleDiffPanel,
    showDiffPanel,
    selectEditProposal,
    setFileContent,
    setFileError,
    setFileDirty,
    setFileLoadingPath,
    setFileSavingPath,
    applySavedContent,
    resetRepositoryState,
  }
})

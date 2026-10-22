import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { FileContent } from '@shared/types/repository'

export const useWorkspaceStore = defineStore('workspace', () => {
  const openTabs = ref<string[]>([])
  const activeFilePath = ref<string | null>(null)
  const rightPanelVisible = ref(true)
  const diffPanelVisible = ref(false)
  const selectedEditProposalId = ref<string | null>(null)
  const fileContents = ref<Record<string, FileContent>>({})
  const fileErrors = ref<Record<string, string>>({})
  const fileLoadingPath = ref<string | null>(null)

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

  function selectEditProposal(id: string | null): void {
    selectedEditProposalId.value = id
  }

  function setFileContent(relativePath: string, content: FileContent): void {
    fileContents.value[relativePath] = content
    delete fileErrors.value[relativePath]
  }

  function setFileError(relativePath: string, message: string): void {
    fileErrors.value[relativePath] = message
  }

  function setFileLoadingPath(relativePath: string | null): void {
    fileLoadingPath.value = relativePath
  }

  function resetRepositoryState(): void {
    openTabs.value = []
    activeFilePath.value = null
    fileContents.value = {}
    fileErrors.value = {}
    fileLoadingPath.value = null
  }

  return {
    openTabs,
    activeFilePath,
    rightPanelVisible,
    diffPanelVisible,
    selectedEditProposalId,
    fileContents,
    fileErrors,
    fileLoadingPath,
    openFile,
    closeTab,
    toggleRightPanel,
    toggleDiffPanel,
    selectEditProposal,
    setFileContent,
    setFileError,
    setFileLoadingPath,
    resetRepositoryState
  }
})

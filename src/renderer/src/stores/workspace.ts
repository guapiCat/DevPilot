import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useWorkspaceStore = defineStore('workspace', () => {
  const openTabs = ref<string[]>([])
  const activeFilePath = ref<string | null>(null)
  const rightPanelVisible = ref(true)
  const diffPanelVisible = ref(false)
  const selectedEditProposalId = ref<string | null>(null)

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

  return {
    openTabs,
    activeFilePath,
    rightPanelVisible,
    diffPanelVisible,
    selectedEditProposalId,
    openFile,
    closeTab,
    toggleRightPanel,
    toggleDiffPanel,
    selectEditProposal
  }
})

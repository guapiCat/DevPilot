import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GitDiffResult, GitStatus } from '@shared/types/git'
import type { FileTreeNode, RepositorySummary } from '@shared/types/repository'
import { desktopApi } from '@renderer/services/desktop-api'
import { toErrorMessage } from '@renderer/utils/errors'

export const useRepositoryStore = defineStore('repository', () => {
  const repositories = ref<RepositorySummary[]>([])
  const activeRepository = ref<RepositorySummary | null>(null)
  const fileTree = ref<FileTreeNode[]>([])
  const fileTreeLoading = ref(false)
  const fileTreeTruncated = ref(false)

  const gitStatus = ref<GitStatus | null>(null)
  const gitStatusLoading = ref(false)
  const gitStatusError = ref<string | null>(null)
  const selectedGitPath = ref<string | null>(null)
  const gitDiff = ref<GitDiffResult | null>(null)
  const gitDiffLoading = ref(false)
  const gitDiffError = ref<string | null>(null)

  let statusRequestId = 0
  let diffRequestId = 0

  const hasActiveRepository = computed(() => activeRepository.value !== null)
  const gitChangeCount = computed(() => gitStatus.value?.changes.length ?? 0)

  function setRepositories(next: RepositorySummary[]): void {
    repositories.value = next
  }

  function setActiveRepository(repository: RepositorySummary | null): void {
    activeRepository.value = repository
    fileTree.value = []
    fileTreeTruncated.value = false
    resetGitState()
  }

  function setFileTree(nodes: FileTreeNode[]): void {
    fileTree.value = nodes
  }

  function setFileTreeLoading(loading: boolean): void {
    fileTreeLoading.value = loading
  }

  function setFileTreeTruncated(truncated: boolean): void {
    fileTreeTruncated.value = truncated
  }

  function resetGitState(): void {
    statusRequestId += 1
    diffRequestId += 1
    gitStatus.value = null
    gitStatusLoading.value = false
    gitStatusError.value = null
    selectedGitPath.value = null
    gitDiff.value = null
    gitDiffLoading.value = false
    gitDiffError.value = null
  }

  async function refreshGitStatus(): Promise<void> {
    const summary = activeRepository.value
    if (!summary) {
      resetGitState()
      return
    }

    if (!summary.isGitRepository) {
      gitStatus.value = {
        repositoryId: summary.id,
        branch: null,
        headState: 'unborn',
        changes: [],
        truncated: false,
      }
      gitStatusError.value = null
      gitStatusLoading.value = false
      selectedGitPath.value = null
      gitDiff.value = null
      gitDiffError.value = null
      return
    }

    const requestId = ++statusRequestId
    gitStatusLoading.value = true
    gitStatusError.value = null

    try {
      const status = await desktopApi.git.getStatus(summary.id)
      if (requestId !== statusRequestId) return

      gitStatus.value = status

      if (selectedGitPath.value) {
        const stillChanged = status.changes.some((change) => change.relativePath === selectedGitPath.value)
        if (stillChanged) {
          void refreshGitDiff(selectedGitPath.value)
        } else {
          selectedGitPath.value = null
          gitDiff.value = null
          gitDiffError.value = null
        }
      }
    } catch (error) {
      if (requestId !== statusRequestId) return
      gitStatus.value = null
      gitStatusError.value = toErrorMessage(error)
    } finally {
      if (requestId === statusRequestId) {
        gitStatusLoading.value = false
      }
    }
  }

  async function refreshGitDiff(relativePath?: string | null): Promise<void> {
    const summary = activeRepository.value
    const path = relativePath ?? selectedGitPath.value
    if (!summary || !summary.isGitRepository || !path) return

    selectedGitPath.value = path
    const requestId = ++diffRequestId
    gitDiffLoading.value = true
    gitDiffError.value = null

    try {
      const diff = await desktopApi.git.getDiff(summary.id, path)
      if (requestId !== diffRequestId) return
      gitDiff.value = diff
    } catch (error) {
      if (requestId !== diffRequestId) return
      gitDiff.value = null
      gitDiffError.value = toErrorMessage(error)
    } finally {
      if (requestId === diffRequestId) {
        gitDiffLoading.value = false
      }
    }
  }

  function selectGitChange(relativePath: string): void {
    if (selectedGitPath.value === relativePath && gitDiff.value) return
    selectedGitPath.value = relativePath
    gitDiff.value = null
    void refreshGitDiff(relativePath)
  }

  return {
    repositories,
    activeRepository,
    fileTree,
    fileTreeLoading,
    fileTreeTruncated,
    gitStatus,
    gitStatusLoading,
    gitStatusError,
    selectedGitPath,
    gitDiff,
    gitDiffLoading,
    gitDiffError,
    hasActiveRepository,
    gitChangeCount,
    setRepositories,
    setActiveRepository,
    setFileTree,
    setFileTreeLoading,
    setFileTreeTruncated,
    refreshGitStatus,
    refreshGitDiff,
    selectGitChange,
    resetGitState,
  }
})

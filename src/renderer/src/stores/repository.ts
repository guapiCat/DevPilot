import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { FileTreeNode, RepositorySummary } from '@shared/types/repository'

export const useRepositoryStore = defineStore('repository', () => {
  const repositories = ref<RepositorySummary[]>([])
  const activeRepository = ref<RepositorySummary | null>(null)
  const fileTree = ref<FileTreeNode[]>([])
  const fileTreeLoading = ref(false)

  const hasActiveRepository = computed(() => activeRepository.value !== null)

  function setRepositories(next: RepositorySummary[]): void {
    repositories.value = next
  }

  function setActiveRepository(repository: RepositorySummary | null): void {
    activeRepository.value = repository
    fileTree.value = []
  }

  function setFileTree(nodes: FileTreeNode[]): void {
    fileTree.value = nodes
  }

  function setFileTreeLoading(loading: boolean): void {
    fileTreeLoading.value = loading
  }

  return {
    repositories,
    activeRepository,
    fileTree,
    fileTreeLoading,
    hasActiveRepository,
    setRepositories,
    setActiveRepository,
    setFileTree,
    setFileTreeLoading
  }
})

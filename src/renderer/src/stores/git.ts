import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { DEFAULT_GIT_LOG_LIMIT } from '@shared/constants/app'
import type { GitBranchList, GitCommitDetail, GitCommitResult, GitLogEntry, GitRemoteStatus } from '@shared/types/git'
import { desktopApi } from '@renderer/services/desktop-api'
import { toErrorMessage } from '@renderer/utils/errors'
import { useRepositoryStore } from './repository'

export type GitBusyAction =
  'stage' | 'unstage' | 'commit' | 'create-branch' | 'switch-branch' | 'fetch' | 'pull' | 'push'

export const useGitStore = defineStore('git', () => {
  const branches = ref<GitBranchList | null>(null)
  const branchesLoading = ref(false)
  const branchesError = ref<string | null>(null)

  const logEntries = ref<GitLogEntry[]>([])
  const logLoading = ref(false)
  const logError = ref<string | null>(null)
  const logHasMore = ref(false)
  const logTruncated = ref(false)

  const selectedSha = ref<string | null>(null)
  const commitDetail = ref<GitCommitDetail | null>(null)
  const commitDetailLoading = ref(false)
  const commitDetailError = ref<string | null>(null)

  const remoteStatus = ref<GitRemoteStatus | null>(null)
  const remoteLoading = ref(false)
  const remoteError = ref<string | null>(null)

  const busyAction = ref<GitBusyAction | null>(null)
  const isBusy = computed(() => busyAction.value !== null)

  let branchesRequestId = 0
  let logRequestId = 0
  let detailRequestId = 0
  let remoteRequestId = 0

  function reset(): void {
    branchesRequestId += 1
    logRequestId += 1
    detailRequestId += 1
    remoteRequestId += 1

    branches.value = null
    branchesLoading.value = false
    branchesError.value = null
    logEntries.value = []
    logLoading.value = false
    logError.value = null
    logHasMore.value = false
    logTruncated.value = false
    selectedSha.value = null
    commitDetail.value = null
    commitDetailLoading.value = false
    commitDetailError.value = null
    remoteStatus.value = null
    remoteLoading.value = false
    remoteError.value = null
    busyAction.value = null
  }

  async function refreshBranches(repositoryId: string): Promise<void> {
    const requestId = ++branchesRequestId
    branchesLoading.value = true
    branchesError.value = null

    try {
      const result = await desktopApi.git.listBranches(repositoryId)
      if (requestId !== branchesRequestId) return
      branches.value = result
    } catch (error) {
      if (requestId !== branchesRequestId) return
      branches.value = null
      branchesError.value = toErrorMessage(error)
    } finally {
      if (requestId === branchesRequestId) {
        branchesLoading.value = false
      }
    }
  }

  async function loadLog(repositoryId: string, options: { reset?: boolean; limit?: number } = {}): Promise<void> {
    const resetEntries = options.reset !== false
    const requestId = ++logRequestId
    const skip = resetEntries ? 0 : logEntries.value.length

    if (resetEntries) {
      logEntries.value = []
      logHasMore.value = false
      logTruncated.value = false
    }

    logLoading.value = true
    logError.value = null

    try {
      const result = await desktopApi.git.log(repositoryId, {
        limit: options.limit ?? DEFAULT_GIT_LOG_LIMIT,
        skip,
      })
      if (requestId !== logRequestId) return

      logEntries.value = resetEntries ? result.entries : [...logEntries.value, ...result.entries]
      logHasMore.value = result.hasMore
      logTruncated.value = result.truncated
    } catch (error) {
      if (requestId !== logRequestId) return
      logError.value = toErrorMessage(error)
    } finally {
      if (requestId === logRequestId) {
        logLoading.value = false
      }
    }
  }

  function refreshLog(repositoryId: string): Promise<void> {
    return loadLog(repositoryId, { reset: true })
  }

  function loadMoreLog(repositoryId: string): Promise<void> {
    if (logLoading.value || !logHasMore.value) return Promise.resolve()
    return loadLog(repositoryId, { reset: false })
  }

  async function selectCommit(repositoryId: string, sha: string): Promise<void> {
    if (selectedSha.value === sha && commitDetail.value) return

    selectedSha.value = sha
    commitDetail.value = null
    commitDetailError.value = null

    const requestId = ++detailRequestId
    commitDetailLoading.value = true

    try {
      const detail = await desktopApi.git.commitDetail(repositoryId, sha)
      if (requestId !== detailRequestId) return
      commitDetail.value = detail
    } catch (error) {
      if (requestId !== detailRequestId) return
      commitDetailError.value = toErrorMessage(error)
    } finally {
      if (requestId === detailRequestId) {
        commitDetailLoading.value = false
      }
    }
  }

  function clearCommit(): void {
    detailRequestId += 1
    selectedSha.value = null
    commitDetail.value = null
    commitDetailLoading.value = false
    commitDetailError.value = null
  }

  async function refreshRemoteStatus(repositoryId: string): Promise<void> {
    const requestId = ++remoteRequestId
    remoteLoading.value = true
    remoteError.value = null

    try {
      const result = await desktopApi.git.remoteStatus(repositoryId)
      if (requestId !== remoteRequestId) return
      remoteStatus.value = result
    } catch (error) {
      if (requestId !== remoteRequestId) return
      remoteStatus.value = null
      remoteError.value = toErrorMessage(error)
    } finally {
      if (requestId === remoteRequestId) {
        remoteLoading.value = false
      }
    }
  }

  async function refreshAll(repositoryId: string): Promise<void> {
    const repository = useRepositoryStore()
    await Promise.all([
      repository.refreshGitStatus(),
      refreshBranches(repositoryId),
      loadLog(repositoryId, { reset: true }),
      refreshRemoteStatus(repositoryId),
    ])
  }

  async function runWrite<T>(action: GitBusyAction, task: () => Promise<T>): Promise<T> {
    busyAction.value = action
    try {
      return await task()
    } finally {
      if (busyAction.value === action) {
        busyAction.value = null
      }
    }
  }

  async function stage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<void> {
    await runWrite('stage', () => desktopApi.git.stage(repositoryId, input))
    await refreshAll(repositoryId)
  }

  async function unstage(repositoryId: string, input: { all?: boolean; paths?: string[] }): Promise<void> {
    await runWrite('unstage', () => desktopApi.git.unstage(repositoryId, input))
    await refreshAll(repositoryId)
  }

  async function commit(repositoryId: string, message: string): Promise<GitCommitResult> {
    const result = await runWrite('commit', () => desktopApi.git.commit(repositoryId, message))
    await refreshAll(repositoryId)
    return result
  }

  async function createBranch(repositoryId: string, branchName: string, checkout: boolean): Promise<void> {
    await runWrite('create-branch', () => desktopApi.git.createBranch(repositoryId, branchName, checkout))
    await refreshAll(repositoryId)
  }

  async function switchBranch(repositoryId: string, branchName: string): Promise<void> {
    await runWrite('switch-branch', () => desktopApi.git.switchBranch(repositoryId, branchName))
    await refreshAll(repositoryId)
  }

  async function fetch(repositoryId: string): Promise<void> {
    await runWrite('fetch', () => desktopApi.git.fetch(repositoryId))
    await refreshAll(repositoryId)
  }

  async function pull(repositoryId: string): Promise<void> {
    await runWrite('pull', () => desktopApi.git.pull(repositoryId))
    await refreshAll(repositoryId)
  }

  async function push(repositoryId: string): Promise<void> {
    await runWrite('push', () => desktopApi.git.push(repositoryId))
    await refreshAll(repositoryId)
  }

  return {
    branches,
    branchesLoading,
    branchesError,
    logEntries,
    logLoading,
    logError,
    logHasMore,
    logTruncated,
    selectedSha,
    commitDetail,
    commitDetailLoading,
    commitDetailError,
    remoteStatus,
    remoteLoading,
    remoteError,
    busyAction,
    isBusy,
    reset,
    refreshBranches,
    refreshLog,
    loadMoreLog,
    selectCommit,
    clearCommit,
    refreshRemoteStatus,
    refreshAll,
    stage,
    unstage,
    commit,
    createBranch,
    switchBranch,
    fetch,
    pull,
    push,
  }
})

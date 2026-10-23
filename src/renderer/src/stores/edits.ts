import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ApplyFileEditResult, EditSession, FileEdit } from '@shared/types/edit'
import { desktopApi } from '@renderer/services/desktop-api'
import { editFileKey } from '@renderer/utils/edits'
import { toErrorMessage } from '@renderer/utils/errors'

export const useEditStore = defineStore('edits', () => {
  const sessions = ref<EditSession[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const actionKey = ref<string | null>(null)
  const selectedKey = ref<string | null>(null)

  let loadToken = 0

  const totalCount = computed(() =>
    sessions.value.reduce((sum, session) => sum + session.files.length, 0)
  )

  const selected = computed<{ session: EditSession; file: FileEdit } | null>(() => {
    for (const session of sessions.value) {
      for (const file of session.files) {
        if (editFileKey(session.id, file.id) === selectedKey.value) return { session, file }
      }
    }
    return null
  })

  function select(editSessionId: string, fileEditId: string): void {
    selectedKey.value = editFileKey(editSessionId, fileEditId)
  }

  function selectFirst(): void {
    const first = sessions.value[0]?.files[0]
    if (!first) {
      selectedKey.value = null
      return
    }
    select(sessions.value[0].id, first.id)
  }

  function removeFile(editSessionId: string, fileEditId: string): void {
    const session = sessions.value.find((item) => item.id === editSessionId)
    if (!session) return

    session.files = session.files.filter((file) => file.id !== fileEditId)
    sessions.value = sessions.value.filter((item) => item.files.length > 0)

    if (selectedKey.value === editFileKey(editSessionId, fileEditId)) {
      selectedKey.value = null
      selectFirst()
    }
  }

  async function loadPending(conversationId: string | null): Promise<void> {
    loadToken += 1
    const token = loadToken

    if (!conversationId) {
      sessions.value = []
      selectedKey.value = null
      error.value = null
      loading.value = false
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await desktopApi.edit.listPending(conversationId)
      if (token !== loadToken) return

      sessions.value = result
      if (!selected.value) {
        selectedKey.value = null
        selectFirst()
      }
    } catch (caught) {
      if (token === loadToken) error.value = toErrorMessage(caught)
    } finally {
      if (token === loadToken) loading.value = false
    }
  }

  async function applyFile(
    editSessionId: string,
    fileEditId: string
  ): Promise<ApplyFileEditResult> {
    const key = editFileKey(editSessionId, fileEditId)
    actionKey.value = key

    try {
      const result = await desktopApi.edit.applyFile(editSessionId, fileEditId)
      removeFile(editSessionId, fileEditId)
      return result
    } finally {
      if (actionKey.value === key) actionKey.value = null
    }
  }

  async function rejectFile(editSessionId: string, fileEditId: string): Promise<void> {
    const key = editFileKey(editSessionId, fileEditId)
    actionKey.value = key

    try {
      await desktopApi.edit.rejectFile(editSessionId, fileEditId)
      removeFile(editSessionId, fileEditId)
    } finally {
      if (actionKey.value === key) actionKey.value = null
    }
  }

  function reset(): void {
    sessions.value = []
    selectedKey.value = null
    error.value = null
    loading.value = false
    actionKey.value = null
  }

  return {
    sessions,
    loading,
    error,
    actionKey,
    selectedKey,
    totalCount,
    selected,
    select,
    selectFirst,
    loadPending,
    applyFile,
    rejectFile,
    reset
  }
})

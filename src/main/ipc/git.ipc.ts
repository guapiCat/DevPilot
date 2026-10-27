import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/constants/app'
import {
  gitCommitDetailInputSchema,
  gitCommitInputSchema,
  gitCreateBranchInputSchema,
  gitDiffInputSchema,
  gitLogInputSchema,
  gitPathsInputSchema,
  gitSwitchBranchInputSchema,
  repositoryIdInputSchema,
} from '@shared/schemas/ipc'
import { gitService } from '../services/git.service'
import { ipcErrorFrom } from '../utils/ipc-error'
import { ipcFail, ipcOk } from '../utils/ipc-result'

export function registerGitIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.gitStatus, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', 'Git 状态参数不合法')
    }

    try {
      return ipcOk(await gitService.getStatus(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitDiff, async (_event, input: unknown) => {
    const parsed = gitDiffInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', 'Git Diff 参数不合法')
    }

    try {
      return ipcOk(await gitService.getDiff(parsed.data.repositoryId, parsed.data.relativePath))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitListBranches, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '分支列表参数不合法')
    }

    try {
      return ipcOk(await gitService.listBranches(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitStage, async (_event, input: unknown) => {
    const parsed = gitPathsInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '暂存参数不合法')
    }

    try {
      await gitService.stage(parsed.data.repositoryId, {
        all: parsed.data.all,
        paths: parsed.data.paths,
      })
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitUnstage, async (_event, input: unknown) => {
    const parsed = gitPathsInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '取消暂存参数不合法')
    }

    try {
      await gitService.unstage(parsed.data.repositoryId, {
        all: parsed.data.all,
        paths: parsed.data.paths,
      })
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitCommit, async (_event, input: unknown) => {
    const parsed = gitCommitInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '提交参数不合法')
    }

    try {
      return ipcOk(await gitService.commit(parsed.data.repositoryId, parsed.data.message))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitCreateBranch, async (_event, input: unknown) => {
    const parsed = gitCreateBranchInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '新建分支参数不合法')
    }

    try {
      await gitService.createBranch(parsed.data.repositoryId, parsed.data.branchName, parsed.data.checkout === true)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitSwitchBranch, async (_event, input: unknown) => {
    const parsed = gitSwitchBranchInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '切换分支参数不合法')
    }

    try {
      await gitService.switchBranch(parsed.data.repositoryId, parsed.data.branchName)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitLog, async (_event, input: unknown) => {
    const parsed = gitLogInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '提交历史参数不合法')
    }

    try {
      return ipcOk(
        await gitService.getLog(parsed.data.repositoryId, {
          limit: parsed.data.limit,
          skip: parsed.data.skip,
        }),
      )
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitCommitDetail, async (_event, input: unknown) => {
    const parsed = gitCommitDetailInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '提交详情参数不合法')
    }

    try {
      return ipcOk(await gitService.getCommit(parsed.data.repositoryId, parsed.data.sha))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitRemoteStatus, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '远程状态参数不合法')
    }

    try {
      return ipcOk(await gitService.getRemoteStatus(parsed.data.repositoryId))
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitFetch, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '拉取远端参数不合法')
    }

    try {
      await gitService.fetch(parsed.data.repositoryId)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitPull, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '拉取参数不合法')
    }

    try {
      await gitService.pull(parsed.data.repositoryId)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitPush, async (_event, input: unknown) => {
    const parsed = repositoryIdInputSchema.safeParse(input)
    if (!parsed.success) {
      return ipcFail('VALIDATION_ERROR', '推送参数不合法')
    }

    try {
      await gitService.push(parsed.data.repositoryId)
      return ipcOk(null)
    } catch (error) {
      return ipcErrorFrom(error)
    }
  })
}

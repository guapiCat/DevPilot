import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import {
  IGNORED_DIRECTORY_NAMES,
  MAX_FILE_TREE_DEPTH,
  MAX_FILE_TREE_ENTRIES
} from '@shared/constants/app'
import type { FileTreeNode, FileTreeResult, RepositorySummary } from '@shared/types/repository'
import { isSafeRelativePath } from '@shared/utils/path'
import { isPathInside } from '../utils/path-security'
import { ServiceError } from '../utils/service-error'

interface RegisteredRepository {
  summary: RepositorySummary
  realRoot: string
}

interface TreeBuildResult {
  nodes: FileTreeNode[]
  truncated: boolean
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
}

function toPosixPath(value: string): string {
  return value.split(sep).join('/')
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

async function buildFileTree(root: string): Promise<TreeBuildResult> {
  let seen = 0
  let truncated = false

  async function walk(directory: string, depth: number): Promise<FileTreeNode[]> {
    if (depth > MAX_FILE_TREE_DEPTH || seen >= MAX_FILE_TREE_ENTRIES) {
      truncated = truncated || seen >= MAX_FILE_TREE_ENTRIES
      return []
    }

    let entries: Dirent[]
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }

    entries.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1
      }
      return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
    })

    const nodes: FileTreeNode[] = []

    for (const dirent of entries) {
      if (seen >= MAX_FILE_TREE_ENTRIES) {
        truncated = true
        break
      }

      // 跳过符号链接，避免文件树暴露仓库外部目标。
      if (dirent.isSymbolicLink()) continue

      const fullPath = join(directory, dirent.name)
      const relativePath = toPosixPath(relative(root, fullPath))

      if (dirent.isDirectory()) {
        if ((IGNORED_DIRECTORY_NAMES as readonly string[]).includes(dirent.name)) continue
        seen += 1
        nodes.push({
          name: dirent.name,
          relativePath,
          type: 'directory',
          children: await walk(fullPath, depth + 1)
        })
      } else if (dirent.isFile()) {
        seen += 1
        nodes.push({ name: dirent.name, relativePath, type: 'file' })
      }
    }

    return nodes
  }

  const nodes = await walk(root, 0)
  return { nodes, truncated }
}

export class RepositoryService {
  private readonly registry = new Map<string, RegisteredRepository>()

  async register(rootPath: string): Promise<RepositorySummary> {
    let realRoot: string
    try {
      realRoot = await realpath(rootPath)
    } catch {
      throw new ServiceError('VALIDATION_ERROR', '所选目录不存在或不可访问')
    }

    let info
    try {
      info = await stat(realRoot)
    } catch {
      throw new ServiceError('VALIDATION_ERROR', '所选目录不存在或不可访问')
    }

    if (!info.isDirectory()) {
      throw new ServiceError('VALIDATION_ERROR', '请选择一个文件夹作为仓库')
    }

    for (const entry of this.registry.values()) {
      if (samePath(entry.realRoot, realRoot)) {
        entry.summary.updatedAt = new Date().toISOString()
        return { ...entry.summary }
      }
    }

    const now = new Date().toISOString()
    const summary: RepositorySummary = {
      id: randomUUID(),
      name: basename(realRoot) || realRoot,
      path: realRoot,
      isGitRepository: existsSync(join(realRoot, '.git')),
      createdAt: now,
      updatedAt: now
    }

    this.registry.set(summary.id, { summary, realRoot })
    return { ...summary }
  }

  list(): RepositorySummary[] {
    return [...this.registry.values()]
      .map((entry) => ({ ...entry.summary }))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }

  getRealRoot(repositoryId: string): string {
    const entry = this.registry.get(repositoryId)
    if (!entry) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库不存在或尚未登记')
    }
    return entry.realRoot
  }

  async getTree(repositoryId: string): Promise<FileTreeResult> {
    const entry = this.registry.get(repositoryId)
    if (!entry) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库不存在或尚未登记')
    }

    let info
    try {
      info = await stat(entry.realRoot)
    } catch (error) {
      if (isEnoent(error)) {
        throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库目录已不存在')
      }
      throw error
    }

    if (!info.isDirectory()) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库目录已不存在')
    }

    const { nodes, truncated } = await buildFileTree(entry.realRoot)
    return { repositoryId, nodes, truncated }
  }

  async resolveFilePath(repositoryId: string, relativePath: string): Promise<string> {
    const entry = this.registry.get(repositoryId)
    if (!entry) {
      throw new ServiceError('REPOSITORY_NOT_FOUND', '仓库不存在或尚未登记')
    }

    if (!isSafeRelativePath(relativePath)) {
      throw new ServiceError('PATH_NOT_ALLOWED', '文件路径不在授权仓库范围内')
    }

    const candidate = resolve(entry.realRoot, ...relativePath.split(/[\\/]+/))

    let targetPath: string
    try {
      // realpath 会解析符号链接，再判断最终目标是否仍在仓库内。
      targetPath = await realpath(candidate)
    } catch (error) {
      if (isEnoent(error)) {
        throw new ServiceError('FILE_NOT_FOUND', '文件不存在或不可访问')
      }
      throw new ServiceError('PATH_NOT_ALLOWED', '无法安全解析文件路径')
    }

    if (!isPathInside(entry.realRoot, targetPath)) {
      throw new ServiceError('PATH_NOT_ALLOWED', '文件路径不在授权仓库范围内')
    }

    return targetPath
  }
}

export const repositoryService = new RepositoryService()

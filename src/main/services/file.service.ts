import { createHash, randomUUID } from 'node:crypto'
import { readFile, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  BINARY_SNIFF_BYTES,
  MAX_FILE_READ_BYTES,
  MAX_FILE_WRITE_BYTES
} from '@shared/constants/app'
import type { FileContent, FileWriteResult } from '@shared/types/repository'
import { ServiceError } from '../utils/service-error'
import { repositoryService } from './repository.service'
import type { RepositoryService } from './repository.service'

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

function looksBinary(buffer: Buffer): boolean {
  const sniffLength = Math.min(buffer.length, BINARY_SNIFF_BYTES)
  return buffer.subarray(0, sniffLength).includes(0)
}

function hasUtf8Bom(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function formatLimitMb(bytes: number): string {
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`
}

export class FileService {
  constructor(private readonly repositories: RepositoryService = repositoryService) {}

  async read(repositoryId: string, relativePath: string): Promise<FileContent> {
    const targetPath = await this.repositories.resolveFilePath(repositoryId, relativePath)

    let info
    try {
      info = await stat(targetPath)
    } catch {
      throw new ServiceError('FILE_NOT_FOUND', '文件不存在或不可访问')
    }

    if (!info.isFile()) {
      throw new ServiceError('UNSUPPORTED_FILE', '目标不是可预览的文本文件')
    }

    if (info.size > MAX_FILE_READ_BYTES) {
      throw new ServiceError(
        'FILE_TOO_LARGE',
        `文件超过 ${formatLimitMb(MAX_FILE_READ_BYTES)} 读取上限`
      )
    }

    const buffer = await readFile(targetPath)

    if (looksBinary(buffer)) {
      throw new ServiceError('UNSUPPORTED_FILE', '二进制文件不支持文本预览')
    }

    const hadBom = hasUtf8Bom(buffer)
    const body = hadBom ? buffer.subarray(3) : buffer

    let content: string
    try {
      content = new TextDecoder('utf-8', { fatal: true }).decode(body)
    } catch {
      throw new ServiceError('UNSUPPORTED_FILE', '文件不是有效的 UTF-8 文本')
    }

    return {
      repositoryId,
      relativePath,
      content,
      size: info.size,
      encoding: 'utf-8',
      hadBom,
      hash: sha256(buffer)
    }
  }

  async write(
    repositoryId: string,
    relativePath: string,
    content: string,
    expectedHash: string
  ): Promise<FileWriteResult> {
    if (content.includes('\0')) {
      throw new ServiceError('UNSUPPORTED_FILE', '文件内容不能包含空字符')
    }

    const targetPath = await this.repositories.resolveFilePath(repositoryId, relativePath)

    let info
    try {
      info = await stat(targetPath)
    } catch {
      throw new ServiceError('FILE_NOT_FOUND', '文件不存在或不可访问')
    }

    if (!info.isFile()) {
      throw new ServiceError('UNSUPPORTED_FILE', '目标不是可写入的文本文件')
    }

    const originalBuffer = await readFile(targetPath)

    if (sha256(originalBuffer) !== expectedHash) {
      throw new ServiceError('FILE_CHANGED', '文件已在磁盘上被修改，请重新加载后再保存')
    }

    const body = Buffer.from(content, 'utf8')
    const buffer = hasUtf8Bom(originalBuffer) ? Buffer.concat([UTF8_BOM, body]) : body

    if (buffer.length > MAX_FILE_WRITE_BYTES) {
      throw new ServiceError(
        'FILE_TOO_LARGE',
        `文件超过 ${formatLimitMb(MAX_FILE_WRITE_BYTES)} 写入上限`
      )
    }

    const tempPath = join(dirname(targetPath), `.devpilot-${randomUUID()}.tmp`)
    try {
      await writeFile(tempPath, buffer, { flag: 'wx' })
      await rename(tempPath, targetPath)
    } catch (error) {
      await unlink(tempPath).catch(() => undefined)
      const code = (error as NodeJS.ErrnoException | null)?.code ?? 'unknown'
      console.error(`[file] 写入失败: ${code}`)
      throw new ServiceError('FILE_WRITE_FAILED', '文件保存失败，请检查文件权限后重试')
    }

    return {
      repositoryId,
      relativePath,
      size: buffer.length,
      hadBom: hasUtf8Bom(buffer),
      hash: sha256(buffer)
    }
  }

  async writeNew(
    repositoryId: string,
    relativePath: string,
    content: string
  ): Promise<FileWriteResult> {
    if (content.includes('\0')) {
      throw new ServiceError('UNSUPPORTED_FILE', '文件内容不能包含空字符')
    }

    const buffer = Buffer.from(content, 'utf8')
    if (buffer.length > MAX_FILE_WRITE_BYTES) {
      throw new ServiceError(
        'FILE_TOO_LARGE',
        `文件超过 ${formatLimitMb(MAX_FILE_WRITE_BYTES)} 写入上限`
      )
    }

    const targetPath = await this.repositories.resolveNewFilePath(repositoryId, relativePath)
    const tempPath = join(dirname(targetPath), `.devpilot-${randomUUID()}.tmp`)

    try {
      await writeFile(tempPath, buffer, { flag: 'wx' })
      await rename(tempPath, targetPath)
    } catch (error) {
      await unlink(tempPath).catch(() => undefined)
      const code = (error as NodeJS.ErrnoException | null)?.code ?? 'unknown'
      console.error(`[file] 新建文件失败: ${code}`)
      throw new ServiceError('FILE_WRITE_FAILED', '文件创建失败，请检查目录权限后重试')
    }

    return {
      repositoryId,
      relativePath,
      size: buffer.length,
      hadBom: false,
      hash: sha256(buffer)
    }
  }
}

export const fileService = new FileService()

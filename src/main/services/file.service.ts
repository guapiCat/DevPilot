import { readFile, stat } from 'node:fs/promises'
import { BINARY_SNIFF_BYTES, MAX_FILE_READ_BYTES } from '@shared/constants/app'
import type { FileContent } from '@shared/types/repository'
import { ServiceError } from '../utils/service-error'
import { repositoryService } from './repository.service'
import type { RepositoryService } from './repository.service'

function looksBinary(buffer: Buffer): boolean {
  const sniffLength = Math.min(buffer.length, BINARY_SNIFF_BYTES)
  return buffer.subarray(0, sniffLength).includes(0)
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
      const limitMb = Math.round((MAX_FILE_READ_BYTES / 1024 / 1024) * 10) / 10
      throw new ServiceError('FILE_TOO_LARGE', `文件超过 ${limitMb} MB 读取上限`)
    }

    const buffer = await readFile(targetPath)

    if (looksBinary(buffer)) {
      throw new ServiceError('UNSUPPORTED_FILE', '二进制文件不支持文本预览')
    }

    const hadBom =
      buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
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
      hadBom
    }
  }
}

export const fileService = new FileService()

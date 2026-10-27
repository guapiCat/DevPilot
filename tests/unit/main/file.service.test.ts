import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_FILE_READ_BYTES, MAX_FILE_WRITE_BYTES } from '@shared/constants/app'
import { FileService } from '@main/services/file.service'
import { RepositoryService } from '@main/services/repository.service'

const tempDirs: string[] = []
let service: FileService
let repositoryId: string
let repositoryPath: string

async function createTempDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  tempDirs.push(directory)
  return directory
}

beforeEach(async () => {
  repositoryPath = await createTempDir('devpilot-files-')

  await writeFile(join(repositoryPath, 'hello.txt'), '你好\nworld\n')
  await writeFile(
    join(repositoryPath, 'bom.txt'),
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom content', 'utf8')]),
  )
  await writeFile(join(repositoryPath, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]))
  await writeFile(join(repositoryPath, 'invalid.txt'), Buffer.from([0xc3, 0x28]))
  await writeFile(join(repositoryPath, 'large.txt'), Buffer.alloc(MAX_FILE_READ_BYTES + 1, 0x61))

  const repositories = new RepositoryService()
  repositoryId = (await repositories.register(repositoryPath)).id
  service = new FileService(repositories)
})

afterEach(async () => {
  for (const directory of tempDirs.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

describe('FileService.read', () => {
  it('读取 UTF-8 文本文件', async () => {
    const file = await service.read(repositoryId, 'hello.txt')

    expect(file.content).toBe('你好\nworld\n')
    expect(file.encoding).toBe('utf-8')
    expect(file.hadBom).toBe(false)
    expect(file.size).toBeGreaterThan(0)
  })

  it('读取包含中文路径与中文内容的文件', async () => {
    await mkdir(join(repositoryPath, '中文目录'))
    await writeFile(join(repositoryPath, '中文目录', '说明.ts'), 'export const 名称 = "测试"\n')

    const file = await service.read(repositoryId, '中文目录/说明.ts')

    expect(file.content).toContain('测试')
  })

  it('识别并移除 UTF-8 BOM', async () => {
    const file = await service.read(repositoryId, 'bom.txt')

    expect(file.content).toBe('bom content')
    expect(file.hadBom).toBe(true)
  })

  it('拒绝二进制文件', async () => {
    await expect(service.read(repositoryId, 'binary.bin')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    })
  })

  it('拒绝非 UTF-8 文本', async () => {
    await expect(service.read(repositoryId, 'invalid.txt')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    })
  })

  it('拒绝超过读取上限的文件', async () => {
    await expect(service.read(repositoryId, 'large.txt')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    })
  })

  it('拒绝路径穿越与仓库外绝对路径', async () => {
    for (const relativePath of ['../secret.txt', '/etc/passwd', 'C:\\Windows\\win.ini']) {
      await expect(service.read(repositoryId, relativePath)).rejects.toMatchObject({
        code: 'PATH_NOT_ALLOWED',
      })
    }
  })

  it('未登记的仓库无法读取文件', async () => {
    await expect(service.read('00000000-0000-4000-8000-000000000000', 'hello.txt')).rejects.toMatchObject({
      code: 'REPOSITORY_NOT_FOUND',
    })
  })

  it('返回可复核的 SHA-256 哈希', async () => {
    const file = await service.read(repositoryId, 'hello.txt')

    expect(file.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(file.hash).toBe((await service.read(repositoryId, 'hello.txt')).hash)
  })
})

describe('FileService.write', () => {
  it('保存文本并返回新的哈希与大小', async () => {
    const file = await service.read(repositoryId, 'hello.txt')
    const result = await service.write(repositoryId, 'hello.txt', '更新后的内容\nline 2\n', file.hash)

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/)
    expect(result.hash).not.toBe(file.hash)
    expect(result.size).toBe(Buffer.byteLength('更新后的内容\nline 2\n', 'utf8'))
    expect(result.hadBom).toBe(false)

    const reloaded = await service.read(repositoryId, 'hello.txt')
    expect(reloaded.content).toBe('更新后的内容\nline 2\n')
    expect(reloaded.hash).toBe(result.hash)
  })

  it('保留原有 UTF-8 BOM', async () => {
    const file = await service.read(repositoryId, 'bom.txt')
    await service.write(repositoryId, 'bom.txt', '新的 BOM 内容', file.hash)

    const raw = await readFile(join(repositoryPath, 'bom.txt'))
    expect(raw.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]))

    const reloaded = await service.read(repositoryId, 'bom.txt')
    expect(reloaded.content).toBe('新的 BOM 内容')
    expect(reloaded.hadBom).toBe(true)
  })

  it('拒绝覆盖已被外部修改的文件', async () => {
    const file = await service.read(repositoryId, 'hello.txt')
    await writeFile(join(repositoryPath, 'hello.txt'), '外部修改\n')

    await expect(service.write(repositoryId, 'hello.txt', '本地修改', file.hash)).rejects.toMatchObject({
      code: 'FILE_CHANGED',
    })
  })

  it('拒绝超过写入上限的内容', async () => {
    const file = await service.read(repositoryId, 'hello.txt')
    const content = 'a'.repeat(MAX_FILE_WRITE_BYTES + 1)

    await expect(service.write(repositoryId, 'hello.txt', content, file.hash)).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE',
    })
  })

  it('拒绝包含空字符的内容', async () => {
    const file = await service.read(repositoryId, 'hello.txt')

    await expect(service.write(repositoryId, 'hello.txt', 'bad\0content', file.hash)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE',
    })
  })

  it('拒绝路径穿越与仓库外绝对路径', async () => {
    const file = await service.read(repositoryId, 'hello.txt')

    for (const relativePath of ['../secret.txt', '/etc/passwd', 'C:\\Windows\\win.ini']) {
      await expect(service.write(repositoryId, relativePath, 'x', file.hash)).rejects.toMatchObject({
        code: 'PATH_NOT_ALLOWED',
      })
    }
  })

  it('未登记的仓库无法写入文件', async () => {
    await expect(
      service.write('00000000-0000-4000-8000-000000000000', 'hello.txt', 'x', 'a'.repeat(64)),
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_FOUND' })
  })

  it('文件不存在时拒绝写入', async () => {
    await expect(service.write(repositoryId, 'missing.txt', 'x', 'a'.repeat(64))).rejects.toMatchObject({
      code: 'FILE_NOT_FOUND',
    })
  })
})

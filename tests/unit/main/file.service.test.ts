import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_FILE_READ_BYTES } from '@shared/constants/app'
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
    Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('bom content', 'utf8')])
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
      code: 'UNSUPPORTED_FILE'
    })
  })

  it('拒绝非 UTF-8 文本', async () => {
    await expect(service.read(repositoryId, 'invalid.txt')).rejects.toMatchObject({
      code: 'UNSUPPORTED_FILE'
    })
  })

  it('拒绝超过读取上限的文件', async () => {
    await expect(service.read(repositoryId, 'large.txt')).rejects.toMatchObject({
      code: 'FILE_TOO_LARGE'
    })
  })

  it('拒绝路径穿越与仓库外绝对路径', async () => {
    for (const relativePath of ['../secret.txt', '/etc/passwd', 'C:\\Windows\\win.ini']) {
      await expect(service.read(repositoryId, relativePath)).rejects.toMatchObject({
        code: 'PATH_NOT_ALLOWED'
      })
    }
  })

  it('未登记的仓库无法读取文件', async () => {
    await expect(
      service.read('00000000-0000-4000-8000-000000000000', 'hello.txt')
    ).rejects.toMatchObject({ code: 'REPOSITORY_NOT_FOUND' })
  })
})

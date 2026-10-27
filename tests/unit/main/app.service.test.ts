import { describe, expect, it } from 'vitest'
import { buildAppInfo, createPingResponse, type AppInfoSource } from '@main/services/app.service'

const source: AppInfoSource = {
  name: 'DevPilot',
  version: '0.1.0',
  platform: 'win32',
  electronVersion: '44.9.3',
  chromeVersion: '140.0.0.0',
  nodeVersion: '22.20.0',
  userDataPath: 'C:\\Users\\tester\\AppData\\Roaming\\DevPilot',
}

describe('buildAppInfo', () => {
  it('完整映射应用信息字段', () => {
    expect(buildAppInfo(source)).toEqual(source)
  })
})

describe('createPingResponse', () => {
  it('返回消息和 ISO 时间戳', () => {
    expect(createPingResponse('hello', new Date('2026-01-02T03:04:05.000Z'))).toEqual({
      message: 'hello',
      receivedAt: '2026-01-02T03:04:05.000Z',
    })
  })
})

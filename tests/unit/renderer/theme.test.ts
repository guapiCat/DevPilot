import { describe, expect, it } from 'vitest'
import { parseThemeMode, THEME_STORAGE_KEY } from '@renderer/stores/theme'

describe('parseThemeMode', () => {
  it('识别浅色，其余值回退深色', () => {
    expect(parseThemeMode('light')).toBe('light')
    expect(parseThemeMode('dark')).toBe('dark')
    expect(parseThemeMode(null)).toBe('dark')
    expect(parseThemeMode('system')).toBe('dark')
  })

  it('使用稳定的本地存储键', () => {
    expect(THEME_STORAGE_KEY).toBe('devpilot.theme')
  })
})

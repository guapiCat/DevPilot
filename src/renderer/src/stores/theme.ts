import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ThemeMode = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'devpilot.theme'

export function parseThemeMode(value: string | null): ThemeMode {
  return value === 'light' ? 'light' : 'dark'
}

function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement
  root.classList.toggle('dark', mode === 'dark')
  root.classList.toggle('light', mode === 'light')
  root.style.colorScheme = mode
}

export const useThemeStore = defineStore('theme', () => {
  const mode = ref<ThemeMode>('dark')

  function initialize(): void {
    mode.value = parseThemeMode(window.localStorage.getItem(THEME_STORAGE_KEY))
    applyTheme(mode.value)
  }

  function setMode(next: ThemeMode): void {
    mode.value = next
    window.localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
  }

  function toggle(): void {
    setMode(mode.value === 'dark' ? 'light' : 'dark')
  }

  return { mode, initialize, setMode, toggle }
})

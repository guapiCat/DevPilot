// 在首屏渲染前应用已保存的主题，避免浅色用户启动时短暂闪黑。
try {
  const savedTheme = window.localStorage.getItem('devpilot.theme')
  const isLight = savedTheme === 'light'
  document.documentElement.classList.toggle('dark', !isLight)
  document.documentElement.classList.toggle('light', isLight)
  document.documentElement.style.colorScheme = isLight ? 'light' : 'dark'
} catch {
  document.documentElement.classList.add('dark')
}

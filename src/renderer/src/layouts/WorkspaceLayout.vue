<script setup lang="ts">
import { onMounted, ref, type Component } from 'vue'
import { ChatDotRound, FolderOpened, Moon, Setting, Sunny } from '@element-plus/icons-vue'
import logoUrl from '@renderer/assets/logo.svg'
import FishWhackGame from '@renderer/components/FishWhackGame.vue'
import { desktopApi } from '@renderer/services/desktop-api'
import { useThemeStore } from '@renderer/stores/theme'

interface NavItem {
  name: string
  label: string
  icon: Component
}

const navItems: NavItem[] = [
  { name: 'chat', label: '研发对话', icon: ChatDotRound },
  { name: 'workspace', label: '研发工作区', icon: FolderOpened },
  { name: 'settings', label: '设置', icon: Setting }
]

const appVersion = ref('0.1.0')
const theme = useThemeStore()

onMounted(async () => {
  try {
    const info = await desktopApi.app.getInfo()
    appVersion.value = info.version
  } catch (error) {
    console.warn('[layout] 无法读取应用信息', error)
  }
})
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" :src="logoUrl" alt="DevPilot logo" />
        <div class="brand-text">
          <strong>DevPilot</strong>
          <span>企业研发助手</span>
        </div>
      </div>

      <nav class="nav">
        <router-link
          v-for="item in navItems"
          :key="item.name"
          :to="{ name: item.name }"
          class="nav-item"
        >
          <el-icon :size="17"><component :is="item.icon" /></el-icon>
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="sidebar-footer">
        <span class="status-dot"></span>
        <span>本地模式</span>
        <span class="version">v{{ appVersion }}</span>
        <button
          type="button"
          class="theme-toggle"
          :title="theme.mode === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          :aria-label="theme.mode === 'dark' ? '切换到浅色主题' : '切换到深色主题'"
          @click="theme.toggle()"
        >
          <el-icon :size="14"><Sunny v-if="theme.mode === 'dark'" /><Moon v-else /></el-icon>
        </button>
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>

    <FishWhackGame />
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  height: 100%;
  background: var(--dp-bg-app);
}

.sidebar {
  display: flex;
  flex: 0 0 208px;
  flex-direction: column;
  width: 208px;
  background: var(--dp-bg-sidebar);
  border-right: 1px solid var(--dp-border);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  height: 64px;
  padding: 0 18px;
  border-bottom: 1px solid var(--dp-border);
}

.brand-mark {
  display: block;
  flex: 0 0 30px;
  width: 30px;
  height: 30px;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.brand-text strong {
  font-size: 14px;
  letter-spacing: 0.2px;
}

.brand-text span {
  color: var(--dp-text-muted);
  font-size: 11px;
}

.nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  padding: 14px 10px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  color: var(--dp-text-secondary);
  font-size: 13px;
  text-decoration: none;
  transition:
    background 0.15s,
    color 0.15s;
}

.nav-item:hover {
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.nav-item.router-link-active {
  background: var(--dp-accent-soft);
  color: var(--dp-accent-text);
}

.nav-item.router-link-active::before {
  position: absolute;
  top: 9px;
  bottom: 9px;
  left: -10px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--dp-accent);
  content: '';
}

.sidebar-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--dp-border);
  color: var(--dp-text-muted);
  font-size: 11px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dp-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--dp-success) 14%, transparent);
}

.version {
  margin-left: auto;
  font-family: var(--dp-mono);
}

.theme-toggle {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--dp-text-muted);
  cursor: pointer;
  transition:
    background 0.15s,
    color 0.15s,
    border-color 0.15s;
}

.theme-toggle:hover {
  border-color: var(--dp-border);
  background: var(--dp-bg-hover);
  color: var(--dp-text);
}

.content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>

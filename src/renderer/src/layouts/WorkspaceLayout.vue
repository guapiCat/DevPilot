<script setup lang="ts">
import { onMounted, ref, type Component } from 'vue'
import { ChatDotRound, FolderOpened, Setting } from '@element-plus/icons-vue'
import { desktopApi } from '@renderer/services/desktop-api'

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
        <div class="brand-mark">DP</div>
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
      </div>
    </aside>

    <main class="content">
      <router-view />
    </main>
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
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f8cff, #2f6fe0);
  box-shadow: 0 4px 14px rgba(79, 140, 255, 0.28);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
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
  color: #a6c4ff;
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
  box-shadow: 0 0 0 3px rgba(63, 185, 80, 0.14);
}

.version {
  margin-left: auto;
  font-family: var(--dp-mono);
}

.content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import { desktopApi } from '@renderer/services/desktop-api'
import { toErrorMessage } from '@renderer/utils/errors'

const loading = ref(true)
const loadError = ref<string | null>(null)
const config = ref<AiConfigStatus | null>(null)
const appInfo = ref<AppInfo | null>(null)

const pingLoading = ref(false)
const pingResult = ref<string | null>(null)
const pingError = ref<string | null>(null)

async function loadSettings(): Promise<void> {
  loading.value = true
  loadError.value = null

  try {
    const [configStatus, info] = await Promise.all([
      desktopApi.settings.getAiConfigStatus(),
      desktopApi.app.getInfo()
    ])
    config.value = configStatus
    appInfo.value = info
  } catch (error) {
    loadError.value = toErrorMessage(error)
  } finally {
    loading.value = false
  }
}

async function testMainProcess(): Promise<void> {
  pingLoading.value = true
  pingResult.value = null
  pingError.value = null

  try {
    const response = await desktopApi.app.ping('settings-ping')
    pingResult.value = `主进程通信正常 · ${new Date(response.receivedAt).toLocaleTimeString('zh-CN')}`
  } catch (error) {
    pingError.value = toErrorMessage(error)
  } finally {
    pingLoading.value = false
  }
}

onMounted(() => {
  void loadSettings()
})
</script>

<template>
  <div class="settings-view">
    <header class="page-header">
      <div>
        <h1>设置</h1>
        <p>模型配置、应用信息与本地安全边界。</p>
      </div>
    </header>

    <div class="settings-scroll">
      <div class="settings-inner">
        <el-alert
          v-if="loadError"
          class="load-error"
          type="error"
          :title="loadError"
          description="无法从主进程读取设置，请检查应用是否正常启动。"
          show-icon
          :closable="false"
        />

        <section class="settings-card">
          <header class="card-header">
            <div>
              <h2>模型服务</h2>
              <p>DeepSeek · V1 默认云端模型</p>
            </div>
            <el-tag v-if="config" :type="config.configured ? 'success' : 'warning'" effect="dark">
              {{ config.configured ? '已配置' : '未配置' }}
            </el-tag>
          </header>

          <el-skeleton v-if="loading" :rows="3" animated />

          <template v-else-if="config">
            <dl class="field-grid">
              <dt>服务商</dt>
              <dd>DeepSeek</dd>
              <dt>配置来源</dt>
              <dd>.env（仅主进程读取，API Key 不进入 Renderer）</dd>
              <dt>模型</dt>
              <dd class="mono">{{ config.model }}</dd>
              <dt>Base URL</dt>
              <dd class="mono">{{ config.baseUrl }}</dd>
              <dt>API Key</dt>
              <dd>
                <span class="inline-status" :class="config.configured ? 'ok' : 'warn'">
                  <span class="dot"></span>
                  {{ config.configured ? '已从环境变量读取' : '未检测到 DEEPSEEK_API_KEY' }}
                </span>
              </dd>
            </dl>

            <div class="actions">
              <el-button size="small" :loading="loading" @click="loadSettings">重新检测</el-button>
              <el-tooltip content="连接测试将在阶段 4 接通模型后提供" placement="top">
                <span><el-button size="small" disabled>测试连接</el-button></span>
              </el-tooltip>
            </div>

            <div class="hint-box">
              <p>
                开发环境：在项目根目录创建 <code>.env</code>（可从
                <code>.env.example</code> 复制），修改后重启应用。
              </p>
              <p v-if="appInfo">
                打包后：在数据目录创建 <code>.env</code>：
                <code class="path">{{ appInfo.userDataPath }}\.env</code>
              </p>
              <pre class="code-block">
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com</pre>
              <p class="muted">
                .env
                是本地明文配置文件，不等同于系统凭据库；请勿提交到版本库。密钥不会写入日志、数据库或前端产物。
              </p>
            </div>
          </template>
        </section>

        <section class="settings-card">
          <header class="card-header">
            <div>
              <h2>主进程通信</h2>
              <p>验证 Preload 与 Main 之间的 IPC 链路。</p>
            </div>
          </header>

          <div class="actions">
            <el-button size="small" :loading="pingLoading" @click="testMainProcess">
              测试 Ping
            </el-button>
            <span v-if="pingResult" class="inline-status ok">
              <span class="dot"></span>{{ pingResult }}
            </span>
            <span v-if="pingError" class="inline-status danger">
              <span class="dot"></span>{{ pingError }}
            </span>
          </div>
        </section>

        <section class="settings-card">
          <header class="card-header">
            <div>
              <h2>应用与数据</h2>
              <p>版本信息与本地数据目录。</p>
            </div>
          </header>

          <el-skeleton v-if="loading" :rows="4" animated />

          <dl v-else-if="appInfo" class="field-grid">
            <dt>应用版本</dt>
            <dd class="mono">v{{ appInfo.version }}</dd>
            <dt>平台</dt>
            <dd class="mono">{{ appInfo.platform }}</dd>
            <dt>Electron</dt>
            <dd class="mono">{{ appInfo.electronVersion }}</dd>
            <dt>Chromium</dt>
            <dd class="mono">{{ appInfo.chromeVersion }}</dd>
            <dt>Node.js</dt>
            <dd class="mono">{{ appInfo.nodeVersion }}</dd>
            <dt>数据目录</dt>
            <dd class="mono path">{{ appInfo.userDataPath }}</dd>
          </dl>

          <p class="card-note">
            对话、仓库与编辑会话数据将在阶段 3 起保存到该目录下的 SQLite 数据库。当前阶段仅使用 .env
            配置。
          </p>
        </section>

        <section class="settings-card">
          <header class="card-header">
            <div>
              <h2>隐私与安全</h2>
              <p>在启用 AI 能力前请了解以下边界。</p>
            </div>
          </header>

          <ul class="security-list">
            <li>启用模型后，为回答代码问题，相关文件内容或搜索片段会发送到所配置的云端模型。</li>
            <li>
              AI 对文件的修改只能生成提案，必须以 Diff 形式审核，并由你确认后才会写入磁盘（阶段
              6）。
            </li>
            <li>Renderer 不具备 Node.js、文件系统或数据库访问能力，只能调用受限的 Preload API。</li>
            <li>默认不执行任意终端命令，也不自动提交、推送或清理 Git 工作区。</li>
            <li>系统会尽量过滤 .env、私钥和证书等敏感文件，但无法保证识别所有秘密。</li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.page-header {
  flex: 0 0 auto;
  padding: 20px 28px 18px;
  border-bottom: 1px solid var(--dp-border);
  background: linear-gradient(180deg, #1b1e25 0%, #181b21 100%);
}

.page-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.2px;
}

.page-header p {
  margin: 6px 0 0;
  color: var(--dp-text-secondary);
  font-size: 12.5px;
}

.settings-scroll {
  flex: 1;
  min-height: 0;
  padding: 24px 28px 48px;
  overflow: auto;
}

.settings-inner {
  max-width: 880px;
  margin: 0 auto;
}

.load-error {
  margin-bottom: 16px;
}

.settings-card {
  padding: 20px 22px;
  margin-bottom: 16px;
  border: 1px solid var(--dp-border);
  border-radius: 12px;
  background: var(--dp-bg-panel);
}

.card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.card-header h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.card-header p {
  margin: 5px 0 0;
  color: var(--dp-text-muted);
  font-size: 12px;
}

.field-grid {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 11px 18px;
  margin: 0;
  font-size: 12.5px;
}

.field-grid dt {
  color: var(--dp-text-muted);
}

.field-grid dd {
  margin: 0;
  color: var(--dp-text);
  line-height: 1.5;
}

.mono {
  font-family: var(--dp-mono);
  font-size: 12px;
}

.path {
  overflow-wrap: anywhere;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 18px;
}

.inline-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--dp-text-secondary);
  font-size: 12px;
}

.inline-status .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--dp-text-muted);
}

.inline-status.ok .dot {
  background: var(--dp-success);
}

.inline-status.warn .dot {
  background: var(--dp-warning);
}

.inline-status.danger {
  color: var(--dp-danger);
}

.inline-status.danger .dot {
  background: var(--dp-danger);
}

.hint-box {
  padding: 14px 16px;
  margin-top: 18px;
  border: 1px solid var(--dp-border);
  border-radius: 8px;
  background: var(--dp-bg-app);
  color: var(--dp-text-secondary);
  font-size: 12.5px;
  line-height: 1.7;
}

.hint-box p {
  margin: 0 0 8px;
}

.hint-box p:last-child {
  margin-bottom: 0;
}

.hint-box code {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--dp-bg-elevated);
  color: #9fc0ff;
  font-family: var(--dp-mono);
  font-size: 11.5px;
}

.hint-box code.path {
  overflow-wrap: anywhere;
}

.code-block {
  padding: 12px 14px;
  margin: 10px 0;
  overflow: auto;
  border: 1px solid var(--dp-border);
  border-radius: 8px;
  background: #111318;
  color: #c8d2e0;
  font-family: var(--dp-mono);
  font-size: 11.5px;
  line-height: 1.6;
}

.muted {
  color: var(--dp-text-muted);
}

.card-note {
  margin: 16px 0 0;
  color: var(--dp-text-muted);
  font-size: 12px;
  line-height: 1.7;
}

.security-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.security-list li {
  position: relative;
  padding-left: 16px;
  color: var(--dp-text-secondary);
  font-size: 12.5px;
  line-height: 1.75;
}

.security-list li + li {
  margin-top: 8px;
}

.security-list li::before {
  position: absolute;
  top: 8px;
  left: 2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dp-accent);
  content: '';
}
</style>

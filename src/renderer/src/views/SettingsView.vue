<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  MODEL_PROVIDER_PRESETS,
  findModelProviderPreset,
  matchModelProviderPreset
} from '@shared/constants/model-presets'
import type { AiConfigStatus, AppInfo } from '@shared/types/app'
import type {
  ModelProfileInput,
  ModelProfileSummary,
  ModelProviderKind,
  TestModelProfileInput
} from '@shared/types/model'
import { desktopApi } from '@renderer/services/desktop-api'
import { useChatStore } from '@renderer/stores/chat'
import { useThemeStore } from '@renderer/stores/theme'
import { toErrorMessage } from '@renderer/utils/errors'

const theme = useThemeStore()
const chat = useChatStore()
const loading = ref(true)
const loadError = ref<string | null>(null)
const config = ref<AiConfigStatus | null>(null)
const appInfo = ref<AppInfo | null>(null)

const pingLoading = ref(false)
const pingResult = ref<string | null>(null)
const pingError = ref<string | null>(null)

const testLoading = ref(false)
const testResult = ref<string | null>(null)
const testError = ref<string | null>(null)

interface ProfileForm {
  name: string
  provider: ModelProviderKind
  model: string
  baseUrl: string
  apiKey: string
  toolsEnabled: boolean
}

const form = reactive<ProfileForm>({
  name: '',
  provider: 'deepseek',
  model: '',
  baseUrl: '',
  apiKey: '',
  toolsEnabled: true
})
const presetId = ref('deepseek')
const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)
const formError = ref<string | null>(null)

const draftTestLoading = ref(false)
const draftTestResult = ref<string | null>(null)
const draftTestError = ref<string | null>(null)

const rowTestId = ref<string | null>(null)
const rowTestLoading = ref(false)
const rowTestResult = ref<string | null>(null)
const rowTestError = ref<string | null>(null)

const activeProfile = computed(
  () => config.value?.profiles.find((profile) => profile.isActive) ?? null
)
const editingProfile = computed(
  () => config.value?.profiles.find((profile) => profile.id === editingId.value) ?? null
)
const hasStoredKey = computed(() => Boolean(editingProfile.value?.hasApiKey))

function providerLabel(provider: ModelProviderKind): string {
  return provider === 'deepseek' ? 'DeepSeek' : 'OpenAI 兼容'
}

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

async function refreshChatConfig(): Promise<void> {
  await chat.loadAiConfig()
}

function handleThemeChange(value: unknown): void {
  if (value === 'light' || value === 'dark') theme.setMode(value)
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

async function testAiConnection(): Promise<void> {
  testLoading.value = true
  testResult.value = null
  testError.value = null

  try {
    const result = await desktopApi.settings.testConnection()
    testResult.value = `连接成功 · ${result.model} · ${result.latencyMs} ms`
  } catch (error) {
    testError.value = toErrorMessage(error)
  } finally {
    testLoading.value = false
  }
}

function resetDraftTest(): void {
  draftTestResult.value = null
  draftTestError.value = null
}

function resetRowTest(): void {
  rowTestId.value = null
  rowTestResult.value = null
  rowTestError.value = null
}

function openCreate(): void {
  const preset = findModelProviderPreset('deepseek')
  editingId.value = null
  presetId.value = 'deepseek'
  form.name = preset?.label ?? ''
  form.provider = preset?.provider ?? 'deepseek'
  form.model = preset?.defaultModel ?? ''
  form.baseUrl = preset?.baseUrl ?? ''
  form.apiKey = ''
  form.toolsEnabled = true
  formError.value = null
  resetDraftTest()
  dialogVisible.value = true
}

function openEdit(profile: ModelProfileSummary): void {
  editingId.value = profile.id
  presetId.value = matchModelProviderPreset(profile.provider, profile.baseUrl)?.id ?? 'custom'
  form.name = profile.name
  form.provider = profile.provider
  form.model = profile.model
  form.baseUrl = profile.baseUrl
  form.apiKey = ''
  form.toolsEnabled = profile.toolsEnabled
  formError.value = null
  resetDraftTest()
  dialogVisible.value = true
}

function handlePresetChange(value: unknown): void {
  if (typeof value !== 'string') return
  const preset = findModelProviderPreset(value)
  if (!preset) return

  presetId.value = value
  form.provider = preset.provider

  if (preset.id === 'custom') return

  form.baseUrl = preset.baseUrl
  form.model = preset.defaultModel

  const matchesPresetLabel = MODEL_PROVIDER_PRESETS.some((item) => item.label === form.name)
  if (!form.name.trim() || matchesPresetLabel) {
    form.name = preset.label
  }
}

function buildDraftInput(): TestModelProfileInput {
  return {
    ...(editingId.value ? { profileId: editingId.value } : {}),
    provider: form.provider,
    model: form.model,
    baseUrl: form.baseUrl,
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {})
  }
}

async function testDraft(): Promise<void> {
  draftTestLoading.value = true
  resetDraftTest()

  try {
    const result = await desktopApi.settings.testModelProfile(buildDraftInput())
    draftTestResult.value = `连接成功 · ${result.model} · ${result.latencyMs} ms`
  } catch (error) {
    draftTestError.value = toErrorMessage(error)
  } finally {
    draftTestLoading.value = false
  }
}

async function saveProfile(): Promise<void> {
  saving.value = true
  formError.value = null

  const input: ModelProfileInput = {
    ...(editingId.value ? { id: editingId.value } : {}),
    name: form.name,
    provider: form.provider,
    model: form.model,
    baseUrl: form.baseUrl,
    ...(form.apiKey.trim() ? { apiKey: form.apiKey.trim() } : {}),
    toolsEnabled: form.toolsEnabled
  }

  try {
    config.value = await desktopApi.settings.saveModelProfile(input)
    await refreshChatConfig()
    dialogVisible.value = false
    resetRowTest()
    ElMessage.success({ message: `已保存「${input.name}」`, duration: 1500 })
  } catch (error) {
    formError.value = toErrorMessage(error)
  } finally {
    saving.value = false
  }
}

async function activateProfile(profile: ModelProfileSummary): Promise<void> {
  if (profile.isActive) return

  try {
    config.value = await desktopApi.settings.activateModelProfile(profile.id)
    await refreshChatConfig()
    resetRowTest()
    ElMessage.success({ message: `当前模型已切换为「${profile.name}」`, duration: 1500 })
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function deleteProfile(profile: ModelProfileSummary): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除「${profile.name}」？已保存的 API Key 也会一并删除，此操作不可撤销。`,
      '删除模型档案',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  try {
    config.value = await desktopApi.settings.deleteModelProfile(profile.id)
    await refreshChatConfig()
    resetRowTest()
    ElMessage.success({ message: `已删除「${profile.name}」`, duration: 1500 })
  } catch (error) {
    ElMessage.error(toErrorMessage(error))
  }
}

async function testProfile(profile: ModelProfileSummary): Promise<void> {
  rowTestId.value = profile.id
  rowTestLoading.value = true
  rowTestResult.value = null
  rowTestError.value = null

  try {
    const result = await desktopApi.settings.testModelProfile({
      profileId: profile.id,
      provider: profile.provider,
      model: profile.model,
      baseUrl: profile.baseUrl
    })
    rowTestResult.value = `${result.model} · ${result.latencyMs} ms`
  } catch (error) {
    rowTestError.value = toErrorMessage(error)
  } finally {
    rowTestLoading.value = false
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
              <p>配置多个模型档案，选择一个作为当前模型。</p>
            </div>
            <el-tag v-if="config" :type="config.configured ? 'success' : 'warning'" effect="dark">
              {{ config.configured ? '已配置' : '未配置' }}
            </el-tag>
          </header>

          <el-skeleton v-if="loading" :rows="4" animated />

          <template v-else-if="config">
            <el-alert
              v-if="!config.secretStorageAvailable"
              class="model-alert"
              type="warning"
              title="系统凭据加密不可用"
              description="无法安全保存新的 API Key，可改用 .env 配置，或检查系统凭据服务。"
              show-icon
              :closable="false"
            />

            <el-alert
              v-if="config.source === 'env'"
              class="model-alert"
              type="info"
              title="当前使用 .env 配置"
              description="新增模型档案后，将优先使用档案中的当前模型。"
              show-icon
              :closable="false"
            />
            <el-alert
              v-else-if="config.source === 'none'"
              class="model-alert"
              type="warning"
              title="尚未配置模型服务"
              description="点击“新增模型”填写服务商、模型与 API Key。"
              show-icon
              :closable="false"
            />

            <dl class="field-grid">
              <dt>当前模型</dt>
              <dd>
                {{ activeProfile?.name ?? (config.source === 'env' ? '环境变量（.env）' : '—') }}
              </dd>
              <dt>服务商</dt>
              <dd>{{ config.provider ? providerLabel(config.provider) : '—' }}</dd>
              <dt>模型</dt>
              <dd class="mono">{{ config.model || '—' }}</dd>
              <dt>Base URL</dt>
              <dd class="mono path">{{ config.baseUrl || '—' }}</dd>
              <dt>代码理解工具</dt>
              <dd>{{ config.toolsEnabled ? '已启用' : '已关闭' }}</dd>
            </dl>

            <div class="actions">
              <el-button size="small" type="primary" @click="openCreate">新增模型</el-button>
              <el-button size="small" :loading="loading" @click="loadSettings">重新检测</el-button>
              <el-button
                size="small"
                :disabled="!config.configured"
                :loading="testLoading"
                @click="testAiConnection"
              >
                测试当前模型
              </el-button>
              <span v-if="testResult" class="inline-status ok">
                <span class="dot"></span>{{ testResult }}
              </span>
              <span v-if="testError" class="inline-status danger">
                <span class="dot"></span>{{ testError }}
              </span>
            </div>

            <div v-if="config.profiles.length > 0" class="profile-list">
              <div
                v-for="profile in config.profiles"
                :key="profile.id"
                class="profile-row"
                :class="{ active: profile.isActive }"
              >
                <div class="profile-info">
                  <div class="profile-name">
                    <span class="profile-title">{{ profile.name }}</span>
                    <el-tag v-if="profile.isActive" size="small" type="success" effect="dark">
                      当前
                    </el-tag>
                    <el-tag size="small" effect="plain">{{
                      providerLabel(profile.provider)
                    }}</el-tag>
                    <el-tag v-if="!profile.toolsEnabled" size="small" type="warning" effect="plain">
                      工具关闭
                    </el-tag>
                  </div>
                  <div class="profile-meta mono">{{ profile.model }} · {{ profile.baseUrl }}</div>
                  <div class="profile-meta">
                    {{ profile.hasApiKey ? '已保存 API Key' : '未设置 API Key' }}
                    <span v-if="rowTestId === profile.id && rowTestResult">
                      · 连接成功 · {{ rowTestResult }}
                    </span>
                    <span
                      v-if="rowTestId === profile.id && rowTestError"
                      class="profile-test-error"
                    >
                      · {{ rowTestError }}
                    </span>
                  </div>
                </div>
                <div class="profile-actions">
                  <el-button
                    v-if="!profile.isActive"
                    size="small"
                    text
                    @click="activateProfile(profile)"
                  >
                    设为当前
                  </el-button>
                  <el-button
                    size="small"
                    text
                    :loading="rowTestId === profile.id && rowTestLoading"
                    @click="testProfile(profile)"
                  >
                    测试
                  </el-button>
                  <el-button size="small" text @click="openEdit(profile)">编辑</el-button>
                  <el-button size="small" text type="danger" @click="deleteProfile(profile)">
                    删除
                  </el-button>
                </div>
              </div>
            </div>

            <div v-else class="hint-box">
              <p>也可以继续使用 <code>.env</code>：开发环境放在项目根目录，打包后放在数据目录。</p>
              <p v-if="appInfo">
                数据目录：<code class="path">{{ appInfo.userDataPath }}\.env</code>
              </p>
              <pre class="code-block">
DEEPSEEK_API_KEY=你的密钥
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com</pre>
              <p class="muted">
                .env
                是本地明文配置文件，不等同于系统凭据库；请勿提交到版本库。新增模型档案后将优先使用档案配置。
              </p>
            </div>

            <p class="card-note">
              模型档案保存在本地数据库，API Key 使用系统凭据加密（Windows DPAPI）；预设的 Base URL
              与模型名仅作参考，请以服务商文档为准。
            </p>
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
              <h2>外观</h2>
              <p>选择界面配色，偏好保存在本地，重启后保持。</p>
            </div>
          </header>

          <el-radio-group :model-value="theme.mode" @change="handleThemeChange">
            <el-radio-button value="light">浅色</el-radio-button>
            <el-radio-button value="dark">深色</el-radio-button>
          </el-radio-group>

          <p class="card-note">
            浅色适合明亮环境，深色适合长时间编码。编辑器、代码高亮与 Diff 配色会同步切换。
          </p>
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
            仓库信息、对话与模型档案会保存在该目录下的 SQLite 数据库（devpilot.db）中；API Key
            只以系统凭据加密后的密文保存，或从 .env 读取。
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
            <li>AI 对文件的修改只能生成提案，必须以 Diff 形式审核，并由你确认后才会写入磁盘</li>
            <li>系统会尽量过滤 .env、私钥和证书等敏感文件，但无法保证识别所有秘密。</li>
          </ul>
        </section>

        <el-dialog
          v-model="dialogVisible"
          :title="editingId ? '编辑模型' : '新增模型'"
          width="560px"
          :close-on-click-modal="false"
        >
          <div class="model-form">
            <label class="form-row">
              <span>服务商预设</span>
              <el-select :model-value="presetId" @change="handlePresetChange">
                <el-option
                  v-for="preset in MODEL_PROVIDER_PRESETS"
                  :key="preset.id"
                  :label="preset.label"
                  :value="preset.id"
                />
              </el-select>
            </label>

            <label class="form-row">
              <span>档案名称</span>
              <el-input v-model="form.name" :maxlength="40" placeholder="例如：DeepSeek 主力模型" />
            </label>

            <label class="form-row">
              <span>模型 ID</span>
              <el-input v-model="form.model" :maxlength="120" placeholder="例如：deepseek-chat" />
            </label>

            <label class="form-row">
              <span>Base URL</span>
              <el-input v-model="form.baseUrl" placeholder="https://api.example.com/v1" />
            </label>

            <label class="form-row">
              <span>API Key</span>
              <el-input
                v-model="form.apiKey"
                type="password"
                show-password
                autocomplete="off"
                :placeholder="hasStoredKey ? '已保存，留空则保持不变' : '本地模型可留空'"
              />
            </label>

            <label class="form-row switch-row">
              <span>启用代码理解工具</span>
              <el-switch v-model="form.toolsEnabled" />
            </label>
          </div>

          <p class="card-note">
            关闭工具后，该模型不会读取仓库文件，也不能生成修改建议；适合不支持 Function Calling
            的模型。预设值仅作参考，请以服务商文档为准。
          </p>

          <div v-if="draftTestResult" class="inline-status ok">
            <span class="dot"></span>{{ draftTestResult }}
          </div>
          <div v-if="draftTestError" class="inline-status danger">
            <span class="dot"></span>{{ draftTestError }}
          </div>
          <el-alert
            v-if="formError"
            class="model-alert"
            type="error"
            :title="formError"
            show-icon
            :closable="false"
          />

          <template #footer>
            <div class="dialog-footer">
              <el-button :loading="draftTestLoading" @click="testDraft">测试连接</el-button>
              <span class="dialog-spacer"></span>
              <el-button @click="dialogVisible = false">取消</el-button>
              <el-button type="primary" :loading="saving" @click="saveProfile">保存</el-button>
            </div>
          </template>
        </el-dialog>
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
  background: var(--dp-bg-header);
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

.model-alert {
  margin-bottom: 14px;
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
  color: var(--dp-code-inline);
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
  background: var(--dp-bg-code);
  color: var(--dp-text-code);
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

.profile-list {
  margin-top: 16px;
  border: 1px solid var(--dp-border);
  border-radius: 10px;
  overflow: hidden;
}

.profile-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  background: var(--dp-bg-app);
}

.profile-row + .profile-row {
  border-top: 1px solid var(--dp-border);
}

.profile-row.active {
  box-shadow: inset 3px 0 0 var(--dp-accent);
}

.profile-info {
  min-width: 0;
}

.profile-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.profile-title {
  font-size: 13px;
  font-weight: 600;
}

.profile-meta {
  margin-top: 5px;
  overflow: hidden;
  color: var(--dp-text-muted);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-test-error {
  color: var(--dp-danger);
}

.profile-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.model-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-row {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
}

.form-row > span {
  color: var(--dp-text-muted);
}

.switch-row {
  align-items: center;
}

.dialog-footer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.dialog-spacer {
  flex: 1;
}

@media (max-width: 720px) {
  .profile-row {
    flex-direction: column;
    align-items: stretch;
  }

  .profile-actions {
    justify-content: flex-end;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>

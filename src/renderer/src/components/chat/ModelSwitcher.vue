<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { useChatStore } from '@renderer/stores/chat'
import { toErrorMessage } from '@renderer/utils/errors'

const chat = useChatStore()
const { aiStatus, isGenerating } = storeToRefs(chat)

const switching = ref(false)
const profiles = computed(() => aiStatus.value?.profiles ?? [])
const activeProfileId = computed(() => aiStatus.value?.activeProfileId ?? null)
const selectedId = ref<string | null>(activeProfileId.value)

watch(
  activeProfileId,
  (id) => {
    selectedId.value = id
  },
  { immediate: true },
)

const tooltip = computed(() => {
  const active = profiles.value.find((profile) => profile.id === activeProfileId.value)
  if (!active) return '切换后对之后发送的消息生效（全局）'
  const tools = active.toolsEnabled ? '工具已启用' : '工具已关闭'
  return `${active.model} · ${tools} · 切换后对之后发送的消息生效`
})

async function handleChange(value: string): Promise<void> {
  if (!value || value === activeProfileId.value || switching.value) return

  const target = profiles.value.find((profile) => profile.id === value)
  switching.value = true
  try {
    const status = await chat.activateModelProfile(value)
    selectedId.value = status.activeProfileId ?? value
    ElMessage.success({
      message: `当前模型已切换为「${target?.name ?? value}」`,
      duration: 1500,
    })
  } catch (error) {
    selectedId.value = activeProfileId.value
    ElMessage.error(toErrorMessage(error))
  } finally {
    switching.value = false
  }
}
</script>

<template>
  <el-select
    v-if="profiles.length > 0"
    v-model="selectedId"
    class="model-switcher"
    size="small"
    aria-label="切换当前模型"
    :title="tooltip"
    :disabled="switching || isGenerating"
    :loading="switching"
    @change="handleChange">
    <el-option v-for="profile in profiles" :key="profile.id" :label="profile.name" :value="profile.id">
      <span class="model-option">
        <span class="model-option-name">{{ profile.name }}</span>
        <span class="model-option-meta">
          {{ profile.model }}<template v-if="!profile.toolsEnabled"> · 工具关闭</template>
        </span>
      </span>
    </el-option>
  </el-select>
  <span
    v-else-if="aiStatus?.configured && aiStatus.source === 'env'"
    class="model-chip"
    title="当前使用 .env 配置；在设置页新增模型档案后可直接切换">
    环境变量 · {{ aiStatus.model }}
  </span>
</template>

<style scoped>
.model-switcher {
  flex: 0 1 150px;
  width: 150px;
  min-width: 96px;
}

.model-chip {
  display: inline-flex;
  align-items: center;
  max-width: 150px;
  padding: 2px 8px;
  border: 1px solid var(--dp-border);
  border-radius: 999px;
  background: var(--dp-bg-app);
  color: var(--dp-text-muted);
  font-size: 11.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.model-option-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-option-meta {
  color: var(--dp-text-muted);
  font-size: 11.5px;
  white-space: nowrap;
}
</style>

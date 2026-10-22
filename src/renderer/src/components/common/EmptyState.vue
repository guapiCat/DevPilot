<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    title: string
    description?: string
    icon?: Component
    compact?: boolean
  }>(),
  { compact: false }
)
</script>

<template>
  <div class="empty-state" :class="{ 'is-compact': compact }">
    <div v-if="icon" class="icon-wrap">
      <el-icon :size="compact ? 20 : 26"><component :is="icon" /></el-icon>
    </div>
    <p class="title">{{ title }}</p>
    <p v-if="description" class="description">{{ description }}</p>
    <div v-if="$slots.default" class="extra">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 100%;
  padding: 48px 32px;
  color: var(--dp-text-secondary);
  text-align: center;
}

.icon-wrap {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 4px;
  border-radius: 14px;
  background: var(--dp-accent-soft);
  color: var(--dp-accent);
}

.title {
  margin: 0;
  color: var(--dp-text);
  font-size: 15px;
  font-weight: 600;
}

.description {
  max-width: 430px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
}

.extra {
  margin-top: 8px;
}

.is-compact {
  gap: 8px;
  padding: 24px 16px;
}

.is-compact .icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
}

.is-compact .title {
  font-size: 13px;
}

.is-compact .description {
  font-size: 12px;
}
</style>

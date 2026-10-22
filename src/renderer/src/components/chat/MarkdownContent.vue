<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@renderer/utils/markdown'

const props = defineProps<{ content: string }>()

const html = computed(() => renderMarkdown(props.content))
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- markdown-it 已禁用原始 HTML 并转义模型输出 -->
  <div class="markdown-body" v-html="html"></div>
</template>

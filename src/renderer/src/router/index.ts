import { createRouter, createWebHashHistory } from 'vue-router'
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: WorkspaceLayout,
      redirect: '/chat',
      children: [
        {
          path: 'chat',
          name: 'chat',
          component: () => import('@renderer/views/ChatView.vue'),
          meta: { title: '研发对话' },
        },
        {
          path: 'workspace',
          name: 'workspace',
          component: () => import('@renderer/views/WorkspaceView.vue'),
          meta: { title: '研发工作区' },
        },
        {
          path: 'source-control',
          name: 'source-control',
          component: () => import('@renderer/views/SourceControlView.vue'),
          meta: { title: '源代码管理' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@renderer/views/SettingsView.vue'),
          meta: { title: '设置' },
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/chat',
    },
  ],
})

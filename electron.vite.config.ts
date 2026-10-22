import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

const sharedAlias = {
  '@shared': resolve('src/shared')
}

const mainAlias = {
  ...sharedAlias,
  // 必须显式声明：仅靠 tsconfig paths 时，Rolldown 会把 @main 与相对路径解析成
  // 两份模块实例，导致单例（如 repositoryService）被初始化到另一份副本上。
  '@main': resolve('src/main')
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: mainAlias
    }
  },
  preload: {
    resolve: {
      alias: sharedAlias
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        ...sharedAlias
      }
    },
    plugins: [vue()]
  }
})

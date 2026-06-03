import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueJsx(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return
          }

          if (id.includes('/vue/') || id.includes('/vue-router/') || id.includes('/pinia/')) {
            return 'vue-vendor'
          }

          if (id.includes('/katex') || id.includes('/marked-katex-extension/')) {
            return 'katex-vendor'
          }

          if (id.includes('/highlight.js/styles/')) {
            return
          }

          if (id.includes('/highlight.js/')) {
            return 'highlight-vendor'
          }

          if (id.includes('/marked')) {
            return 'marked-vendor'
          }

          if (id.includes('/html-to-image/')) {
            return 'image-vendor'
          }

          return 'vendor'
        },
      },
    },
  },
})

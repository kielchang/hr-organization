import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 將大型第三方相依拆成穩定的 vendor chunk，利於瀏覽器長期快取
        // （應用程式碼變動時不需重新下載這些庫）。
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@xyflow') || id.includes('dagre')) return 'vendor-reactflow';
          if (
            id.includes('react-router') ||
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler')
          ) {
            return 'vendor-react';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // 只跑前端 src 內的測試；後端 server/ 有自己的 Vitest 設定。
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**', 'src/context/**'],
      // 回歸防護閾值（設於目前覆蓋率下方數個百分點）：避免新增程式未測時覆蓋率倒退。
      // 後續補測後可逐步調高。
      thresholds: {
        statements: 83,
        branches: 68,
        functions: 86,
        lines: 84,
      },
    },
  },
})

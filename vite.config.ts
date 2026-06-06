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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/services/**', 'src/context/**'],
      // 回歸防護閾值（設於目前覆蓋率下方數個百分點）：避免新增程式未測時覆蓋率倒退。
      // 後續補測後可逐步調高。
      thresholds: {
        statements: 48,
        branches: 38,
        functions: 48,
        lines: 48,
      },
    },
  },
})

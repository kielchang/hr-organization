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
    // 高 CPU 負載下，隔離跑 <1s 的重 UI 測試（React Flow 渲染、axe a11y 掃描）
    // 仍可能因排程爭用破 Vitest 預設 5000ms per-test 逾時，造成 pre-push 假性失敗。
    // 將逾時提高到 15000ms，給負載下實際很快完成的測試足夠餘裕；不影響正常情況耗時。
    testTimeout: 15000,
    hookTimeout: 15000,
    // 只跑前端 src 內的測試；後端 server/ 有自己的 Vitest 設定。
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 涵蓋整個應用程式碼（含 UI 層），讓覆蓋率數字誠實反映現況。
      include: [
        'src/services/**',
        'src/context/**',
        'src/components/**',
        'src/hooks/**',
        'src/pages/**',
      ],
      // 回歸防護閾值（設於目前覆蓋率下方數個百分點）：避免新增程式未測時倒退。
      // services/context 已高（~80-90%），UI 層仍在成長，整體門檻隨補測逐步調高。
      thresholds: {
        statements: 50,
        branches: 36,
        functions: 43,
        lines: 51,
      },
    },
  },
})

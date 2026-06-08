import { defineConfig } from 'vitest/config';

// 後端自有 Vitest 設定（node 環境、不沿用前端的 jsdom/setup）。
export default defineConfig({
  test: {
    environment: 'node',
    root: import.meta.dirname,
  },
});

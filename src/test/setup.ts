import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每個測試後清理 DOM 與 localStorage，避免 Provider 狀態互染
afterEach(() => {
  cleanup()
  localStorage.clear()
})

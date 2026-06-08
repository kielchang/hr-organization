import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

/**
 * useOnlineStatus 行為測試（契約 §1）。
 *
 * 重點：
 * - 初始值反映 `navigator.onLine`。
 * - 訂閱 window 'online'/'offline' 事件並更新狀態。
 * - 卸載後移除監聽：unmount 後再 dispatch 不更新、不報錯（無洩漏）。
 *
 * 以 `Object.defineProperty` 覆寫 `navigator.onLine`（jsdom 預設 true、唯讀），
 * 每測後還原，避免污染其他測試。
 */

/** 暫時設定 navigator.onLine（configurable 才能覆寫 / 還原）。 */
function setOnLine(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  afterEach(() => {
    // 還原為 jsdom 預設（線上），避免跨測試污染。
    setOnLine(true);
  });

  it('初始值反映 navigator.onLine = true', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
  });

  it('初始值反映 navigator.onLine = false', () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
  });

  it("dispatch window 'offline' → 變為 false", () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it("dispatch window 'online' → 變為 true", () => {
    setOnLine(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
  });

  it('online/offline 連續切換正確反映最新狀態', () => {
    setOnLine(true);
    const { result } = renderHook(() => useOnlineStatus());
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    expect(result.current).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe(false);
  });

  it('卸載後移除監聽：再 dispatch 不更新、不報錯', () => {
    setOnLine(true);
    const { result, unmount } = renderHook(() => useOnlineStatus());
    expect(result.current).toBe(true);

    unmount();

    // 卸載後事件仍可被 dispatch，但 hook 已移除監聽，不應更新已快照的回傳值，
    // 也不應因在已卸載元件上 setState 而拋錯。
    expect(() => {
      act(() => {
        window.dispatchEvent(new Event('offline'));
        window.dispatchEvent(new Event('online'));
      });
    }).not.toThrow();

    // result.current 為卸載前最後一次 render 的快照，維持 true。
    expect(result.current).toBe(true);
  });
});

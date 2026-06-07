import { useEffect, useState } from 'react';

/**
 * 偵測瀏覽器的線上／離線狀態。
 *
 * - 初始值取 `navigator.onLine`（SSR／測試環境無 navigator 時預設視為線上）。
 * - 訂閱 `window` 的 `online`／`offline` 事件更新狀態，卸載時移除監聽。
 * - 本切片**不**主動輪詢網路（契約 §1 排除）；僅反映瀏覽器回報的連線狀態。
 *
 * @returns `isOnline` — 目前是否線上。
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

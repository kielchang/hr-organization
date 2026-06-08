/**
 * localStorage 寫入封裝：失敗（多為容量超限 QuotaExceededError）時不再 silent，
 * 而是回傳 false 並通知已註冊的處理器，讓 UI 能對使用者顯示提示。
 */

type StorageErrorHandler = (info: { key: string; error: unknown }) => void;

const handlers = new Set<StorageErrorHandler>();

/** 訂閱寫入失敗事件，回傳取消訂閱函式。 */
export function onStorageError(handler: StorageErrorHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

/**
 * 安全寫入 localStorage。
 * @returns 是否寫入成功；失敗時會通知所有已註冊處理器。
 */
export function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    for (const handler of handlers) {
      try {
        handler({ key, error });
      } catch {
        /* 忽略處理器自身的錯誤 */
      }
    }
    return false;
  }
}

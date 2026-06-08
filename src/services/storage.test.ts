import { onStorageError, safeSetItem } from './storage';

describe('safeSetItem', () => {
  it('成功寫入回 true 並實際存入', () => {
    expect(safeSetItem('k', 'v')).toBe(true);
    expect(localStorage.getItem('k')).toBe('v');
  });

  it('寫入失敗回 false 並通知處理器', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const seen: { key: string }[] = [];
    const off = onStorageError(({ key }) => seen.push({ key }));

    const ok = safeSetItem('big', 'x');
    expect(ok).toBe(false);
    expect(seen).toEqual([{ key: 'big' }]);

    off();
    spy.mockRestore();
  });

  it('取消訂閱後不再收到通知', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('fail');
    });
    let count = 0;
    const off = onStorageError(() => count++);
    off();
    safeSetItem('k', 'v');
    expect(count).toBe(0);
    spy.mockRestore();
  });
});

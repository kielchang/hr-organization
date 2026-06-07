import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { OrgProvider } from './OrgProvider';
import { useOrg } from './useOrg';
import type { Employee, Group } from '../types/org';
import { makeOrgData } from '../test/fixtures';

const wrapper = ({ children }: { children: ReactNode }) => (
  <OrgProvider>{children}</OrgProvider>
);

const emp = (id: string, employeeNo: string): Employee => ({
  id,
  employeeNo,
  name: id,
  status: 'active',
});

describe('OrgProvider', () => {
  it('初始載入內建 seed 版本', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    expect(result.current.activeVersionId).toBe('org-data');
    expect(result.current.data.employees.length).toBeGreaterThan(0);
    expect(result.current.data.schemaVersion).toBeGreaterThanOrEqual(1);
  });

  it('saveEmployee 新增並寫入 localStorage 草稿', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    const before = result.current.data.employees.length;
    act(() => {
      const err = result.current.saveEmployee(emp('new-1', 'E999'), true);
      expect(err).toBeNull();
    });
    expect(result.current.data.employees).toHaveLength(before + 1);
    const draft = JSON.parse(localStorage.getItem('hr-org-draft')!);
    expect(draft.employees.some((e: Employee) => e.employeeNo === 'E999')).toBe(true);
  });

  it('saveEmployee 工號重複回傳錯誤訊息', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    const existingNo = result.current.data.employees[0].employeeNo;
    let err: string | null = null;
    act(() => {
      err = result.current.saveEmployee(emp('dup', existingNo), true);
    });
    expect(err).toBeTruthy();
  });

  it('removeEmployee 移除員工', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    const target = result.current.data.employees[0].id;
    act(() => result.current.removeEmployee(target));
    expect(result.current.data.employees.some((e) => e.id === target)).toBe(false);
  });

  it('saveGroup 新增組別', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    const before = result.current.data.groups.length;
    const g: Group = { id: 'g-new', code: 'ZZZ', name: '新組', parentId: null, status: 'active', kind: 'department' };
    act(() => {
      const err = result.current.saveGroup(g, true);
      expect(err).toBeNull();
    });
    expect(result.current.data.groups).toHaveLength(before + 1);
  });

  it('publishVersion 產生發布版本並切換為當前版本', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    let newId = '';
    act(() => {
      newId = result.current.publishVersion(result.current.data);
    });
    expect(newId).toMatch(/^pub-/);
    expect(result.current.activeVersionId).toBe(newId);
    expect(result.current.dataVersions.some((v) => v.id === newId)).toBe(true);
  });

  it('publishVersion 只傳 draft（無 opts）仍正常發布（向後相容）', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    let newId = '';
    act(() => {
      newId = result.current.publishVersion(result.current.data);
    });
    const created = result.current.dataVersions.find((v) => v.id === newId);
    expect(created).toBeDefined();
    expect(created?.note).toBeUndefined();
    expect(created?.effectiveDate).toBeUndefined();
  });

  it('publishVersion 帶 opts（label/note/effectiveDate）正確傳遞', () => {
    const { result } = renderHook(() => useOrg(), { wrapper });
    let newId = '';
    act(() => {
      newId = result.current.publishVersion(result.current.data, {
        label: '2026 上半年調整案',
        note: '整併重疊職能',
        effectiveDate: '2026-12-31',
      });
    });
    const created = result.current.dataVersions.find((v) => v.id === newId);
    expect(created?.label).toBe('發布 · 2026 上半年調整案');
    expect(created?.note).toBe('整併重疊職能');
    expect(created?.effectiveDate).toBe('2026-12-31');
  });
});

describe('OrgProvider（啟用後端 API）', () => {
  const cloudOrg = () => ({ ...makeOrgData(), employees: [] });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function setupFetch() {
    const calls: { method: string; url: string; body?: unknown }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(init.body as string) : undefined });
      if (method === 'GET' && url.endsWith('/api/versions')) {
        return { ok: true, status: 200, json: async () => [
          { id: 'ver-cloud1', label: '雲端A', data: cloudOrg(), publishedAt: '2026-05-05T00:00:00.000Z' },
        ] } as Response;
      }
      if (method === 'POST' && url.endsWith('/api/versions')) {
        return { ok: true, status: 201, json: async () => (
          { id: 'ver-new', label: '雲端New', data: cloudOrg(), publishedAt: '2026-05-06T00:00:00.000Z' }
        ) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', fetchMock);
    return { calls };
  }

  it('啟用時載入雲端版本併入下拉', async () => {
    setupFetch();
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() =>
      expect(result.current.dataVersions.some((v) => v.id === 'ver-cloud1')).toBe(true),
    );
    expect(result.current.dataVersions.find((v) => v.id === 'ver-cloud1')?.label).toContain('雲端');
  });

  it('發布時寫穿到後端（POST /api/versions）', async () => {
    const { calls } = setupFetch();
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
    act(() => {
      result.current.publishVersion(result.current.data);
    });
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/api/versions'))).toBe(true),
    );
  });
});

describe('OrgProvider 自動「預設最新雲端版」（草稿優先，否則最新雲端）', () => {
  const cloudOrg = () => ({ ...makeOrgData(), employees: [] });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  /** 後端啟用 + 自訂雲端版本清單（可多筆，含 publishedAt）。 */
  function setupFetchWithVersions(
    versions: { id: string; label: string; publishedAt: string }[],
  ) {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/api/versions')) {
        return {
          ok: true,
          status: 200,
          json: async () =>
            versions.map((v) => ({ ...v, data: cloudOrg() })),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', fetchMock);
  }

  /** 後端啟用但 listVersions reject（雲端載入失敗）。 */
  function setupFetchRejecting() {
    const fetchMock = vi.fn(async () => {
      throw new Error('network down');
    });
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', fetchMock);
  }

  it('無髒草稿 + 雲端有版本 → 載入後 active 切到最新雲端版 id', async () => {
    setupFetchWithVersions([
      { id: 'ver-old', label: '雲端舊', publishedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'ver-latest', label: '雲端新', publishedAt: '2026-05-05T00:00:00.000Z' },
    ]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 初始為本機 seed 預設
    expect(result.current.activeVersionId).toBe('org-data');
    // 雲端載入後自動切到最新雲端版
    await waitFor(() =>
      expect(result.current.activeVersionId).toBe('ver-latest'),
    );
    expect(localStorage.getItem('hr-org-active-version')).toBe('ver-latest');
  });

  it('有髒草稿 → 停在草稿，不被切到雲端', async () => {
    // 預置：active 版本＝seed org-data，且草稿相對 seed 有未發布變更（髒草稿）。
    localStorage.setItem('hr-org-active-version', 'org-data');
    localStorage.setItem(
      'hr-org-draft',
      JSON.stringify(
        makeOrgData({ employees: [emp('dirty-1', 'DIRTY1')] }),
      ),
    );
    setupFetchWithVersions([
      { id: 'ver-latest', label: '雲端新', publishedAt: '2026-05-05T00:00:00.000Z' },
    ]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 仍停在 seed（草稿所屬版本），不被自動切到雲端
    expect(result.current.activeVersionId).toBe('org-data');
    // 等雲端載入併入下拉後，仍未切走
    await waitFor(() =>
      expect(result.current.dataVersions.some((v) => v.id === 'ver-latest')).toBe(true),
    );
    expect(result.current.activeVersionId).toBe('org-data');
    expect(result.current.data.employees.some((e) => e.employeeNo === 'DIRTY1')).toBe(true);
  });

  it('雲端清單為空 → 維持本機預設（不切換、不報錯）', async () => {
    setupFetchWithVersions([]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(result.current.dataVersions.length).toBeGreaterThan(0));
    // 給雲端 effect 跑完的機會後仍維持 seed
    await Promise.resolve();
    expect(result.current.activeVersionId).toBe('org-data');
  });

  it('listVersions reject → 維持本機預設（不報錯、不切換）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    setupFetchRejecting();
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(warnSpy).toHaveBeenCalled());
    expect(result.current.activeVersionId).toBe('org-data');
    warnSpy.mockRestore();
  });

  it('後端停用（未設 VITE_API_URL）→ 維持本機預設，不打雲端', () => {
    // 不 stubEnv VITE_API_URL → isApiEnabled() 為 false
    const { result } = renderHook(() => useOrg(), { wrapper });
    expect(result.current.activeVersionId).toBe('org-data');
    expect(result.current.dataVersions.some((v) => v.id.startsWith('ver-'))).toBe(false);
  });

  it('使用者手動選版後 → 後續雲端載入不覆蓋手動選擇', async () => {
    setupFetchWithVersions([
      { id: 'ver-latest', label: '雲端新', publishedAt: '2026-05-05T00:00:00.000Z' },
    ]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 在雲端 effect 解析前先手動選回本機 seed（標記手動）
    act(() => {
      result.current.selectDataVersion('org-data');
    });
    // 等雲端版本載入併入下拉
    await waitFor(() =>
      expect(result.current.dataVersions.some((v) => v.id === 'ver-latest')).toBe(true),
    );
    // 手動選擇不被自動切換覆蓋
    expect(result.current.activeVersionId).toBe('org-data');
  });

  it('雲端 resolve 前 loadFromFile 匯入 → 載入後仍保留匯入資料，不被切到雲端', async () => {
    setupFetchWithVersions([
      { id: 'ver-latest', label: '雲端新', publishedAt: '2026-05-05T00:00:00.000Z' },
    ]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 在雲端 listVersions resolve（微任務）前匯入一份檔案資料
    act(() => {
      result.current.loadFromFile(
        makeOrgData({ employees: [emp('imported-1', 'IMPORTED1')] }),
      );
    });
    expect(result.current.data.employees.some((e) => e.employeeNo === 'IMPORTED1')).toBe(true);
    // 等雲端版本載入併入下拉後，仍保留匯入資料、未被自動切到雲端
    await waitFor(() =>
      expect(result.current.dataVersions.some((v) => v.id === 'ver-latest')).toBe(true),
    );
    expect(result.current.activeVersionId).toBe('org-data');
    expect(result.current.data.employees.some((e) => e.employeeNo === 'IMPORTED1')).toBe(true);
  });

  it('雲端 resolve 前發生一次編輯（saveEmployee）→ 不被自動切到雲端', async () => {
    setupFetchWithVersions([
      { id: 'ver-latest', label: '雲端新', publishedAt: '2026-05-05T00:00:00.000Z' },
    ]);
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 在雲端 listVersions resolve 前發生一次編輯（走 commit）
    act(() => {
      const err = result.current.saveEmployee(emp('edit-1', 'EDIT1'), true);
      expect(err).toBeNull();
    });
    // 等雲端版本載入併入下拉後，仍未被自動切走、編輯仍在
    await waitFor(() =>
      expect(result.current.dataVersions.some((v) => v.id === 'ver-latest')).toBe(true),
    );
    expect(result.current.activeVersionId).toBe('org-data');
    expect(result.current.data.employees.some((e) => e.employeeNo === 'EDIT1')).toBe(true);
  });
});

describe('OrgProvider 未同步雲端旗標（pendingCloudSync）', () => {
  const CLOUD_SYNC_PENDING_KEY = 'hr-org-cloud-sync-pending';
  const cloudOrg = () => ({ ...makeOrgData(), employees: [] });

  /** 暫時設定 navigator.onLine（configurable 才能覆寫 / 還原）。 */
  function setOnLine(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    setOnLine(true);
  });

  /**
   * 後端啟用，listVersions 回單筆雲端版本；POST /api/versions 依 `publishOk` 決定
   * 成功（回 201）或失敗（回 500 → apiClient request throw → publishVersion .catch）。
   */
  function setupFetch(publishOk: boolean) {
    const calls: { method: string; url: string }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      if (method === 'GET' && url.endsWith('/api/versions')) {
        return {
          ok: true,
          status: 200,
          json: async () => [
            { id: 'ver-cloud1', label: '雲端A', data: cloudOrg(), publishedAt: '2026-05-05T00:00:00.000Z' },
          ],
        } as Response;
      }
      if (method === 'POST' && url.endsWith('/api/versions')) {
        if (publishOk) {
          return {
            ok: true,
            status: 201,
            json: async () => ({ id: 'ver-new', label: '雲端New', data: cloudOrg(), publishedAt: '2026-05-06T00:00:00.000Z' }),
          } as Response;
        }
        // 非 2xx → apiClient.request 拋 ApiError → publishVersion 的 .catch 觸發。
        return { ok: false, status: 500, json: async () => ({}) } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.stubGlobal('fetch', fetchMock);
    return { calls };
  }

  it('後端啟用、雲端寫入成功 → pendingCloudSync=false 且 localStorage 為 false', async () => {
    setOnLine(true);
    const { calls } = setupFetch(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));

    act(() => {
      result.current.publishVersion(result.current.data);
    });

    // 等 publishVersion 內 .then 成功回呼清除 pending。
    await waitFor(() => expect(result.current.pendingCloudSync).toBe(false));
    expect(localStorage.getItem(CLOUD_SYNC_PENDING_KEY)).toBe('false');
    warnSpy.mockRestore();
  });

  it('雲端寫入失敗（reject）→ pendingCloudSync=true 且持久化', async () => {
    setOnLine(true);
    const { calls } = setupFetch(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));

    act(() => {
      result.current.publishVersion(result.current.data);
    });

    // 等 publishVersion 內 .catch 回呼標記 pending。
    await waitFor(() => expect(result.current.pendingCloudSync).toBe(true));
    expect(localStorage.getItem(CLOUD_SYNC_PENDING_KEY)).toBe('true');
    warnSpy.mockRestore();
  });

  it('發布當下離線（navigator.onLine=false）→ pendingCloudSync=true', async () => {
    setOnLine(true);
    const { calls } = setupFetch(false);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOrg(), { wrapper });
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));

    // 發布當下離線：發布前先切離線，使 publishVersion 同步區塊立即標記 pending。
    setOnLine(false);
    act(() => {
      result.current.publishVersion(result.current.data);
    });

    await waitFor(() => expect(result.current.pendingCloudSync).toBe(true));
    expect(localStorage.getItem(CLOUD_SYNC_PENDING_KEY)).toBe('true');
    warnSpy.mockRestore();
  });

  it('後端停用 → pendingCloudSync 恆為 false（不讀/不設）', () => {
    // 即使 localStorage 預置 'true'，後端停用時 loadCloudSyncPending 回 false。
    localStorage.setItem(CLOUD_SYNC_PENDING_KEY, 'true');
    // 不 stubEnv VITE_API_URL → isApiEnabled() 為 false。
    const { result } = renderHook(() => useOrg(), { wrapper });
    expect(result.current.pendingCloudSync).toBe(false);

    // 後端停用時 publishVersion 不走雲端寫穿，pending 仍為 false。
    act(() => {
      result.current.publishVersion(result.current.data);
    });
    expect(result.current.pendingCloudSync).toBe(false);
  });

  it('初始從 localStorage 讀回 pending（預置 true + 後端啟用 → 初始 true）', async () => {
    localStorage.setItem(CLOUD_SYNC_PENDING_KEY, 'true');
    const { calls } = setupFetch(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useOrg(), { wrapper });
    // 初始即反映持久化的未同步狀態（不需等待非同步）。
    expect(result.current.pendingCloudSync).toBe(true);
    // 等雲端 effect 跑完，避免 act 警告殘留。
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
    warnSpy.mockRestore();
  });
});

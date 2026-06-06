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

import { ApiError, apiClient, isApiEnabled } from './apiClient';
import { makeOrgData } from '../test/fixtures';

function mockFetch(impl: (url: string, init?: RequestInit) => { ok: boolean; status: number; body?: unknown }) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const r = impl(url, init);
    return {
      ok: r.ok,
      status: r.status,
      json: async () => r.body,
    } as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('isApiEnabled', () => {
  it('未設 VITE_API_URL 時為 false', () => {
    vi.stubEnv('VITE_API_URL', '');
    expect(isApiEnabled()).toBe(false);
  });
  it('設定後為 true', () => {
    vi.stubEnv('VITE_API_URL', 'http://localhost:3001');
    expect(isApiEnabled()).toBe(true);
  });
});

describe('apiClient', () => {
  beforeEach(() => vi.stubEnv('VITE_API_URL', 'http://api.test'));

  it('listVersions 發 GET 並回傳陣列', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200, body: [{ id: 'v1', label: 'a', data: {}, publishedAt: '' }] }));
    const out = await apiClient.listVersions();
    expect(out).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/versions', expect.objectContaining({}));
  });

  it('publishVersion 發 POST 帶 label/data', async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 201, body: { id: 'v2', label: 'x', data: {}, publishedAt: '' } }));
    const data = makeOrgData();
    const out = await apiClient.publishVersion('x', data);
    expect(out.id).toBe('v2');
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ label: 'x', data });
  });

  it('deleteVersion 處理 204 無內容', async () => {
    mockFetch(() => ({ ok: true, status: 204 }));
    await expect(apiClient.deleteVersion('v1')).resolves.toBeUndefined();
  });

  it('getDraft 在 404 時回 null', async () => {
    mockFetch(() => ({ ok: false, status: 404 }));
    expect(await apiClient.getDraft()).toBeNull();
  });

  it('getDraft 正常回草稿', async () => {
    mockFetch(() => ({ ok: true, status: 200, body: { data: {}, updatedAt: 't' } }));
    const d = await apiClient.getDraft();
    expect(d?.updatedAt).toBe('t');
  });

  it('非 ok 且非 404 拋 ApiError 帶狀態碼', async () => {
    mockFetch(() => ({ ok: false, status: 500 }));
    await expect(apiClient.listVersions()).rejects.toBeInstanceOf(ApiError);
    await expect(apiClient.listVersions()).rejects.toMatchObject({ status: 500 });
  });
});

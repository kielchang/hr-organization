import type { OrgData } from '../types/org';

/**
 * 後端 API 客戶端（版本／草稿持久化）。
 * 以 `VITE_API_URL` 環境變數啟用；未設定時 `isApiEnabled()` 回 false，
 * 應用程式應退回 localStorage（見 OrgProvider 接線）。
 */

export interface ApiVersion {
  id: string;
  label: string;
  data: OrgData;
  publishedAt: string;
}

export interface ApiDraft {
  data: OrgData;
  updatedAt: string;
}

function baseUrl(): string {
  return (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
}

export function isApiEnabled(): boolean {
  return baseUrl().length > 0;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    throw new ApiError(res.status, `API ${init?.method ?? 'GET'} ${path} 失敗（${res.status}）`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export const apiClient = {
  listVersions(): Promise<ApiVersion[]> {
    return request<ApiVersion[]>('/api/versions');
  },
  getVersion(id: string): Promise<ApiVersion> {
    return request<ApiVersion>(`/api/versions/${encodeURIComponent(id)}`);
  },
  publishVersion(label: string, data: OrgData): Promise<ApiVersion> {
    return request<ApiVersion>('/api/versions', {
      method: 'POST',
      body: JSON.stringify({ label, data }),
    });
  },
  deleteVersion(id: string): Promise<void> {
    return request<void>(`/api/versions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  /** 無草稿（404）時回 null。 */
  async getDraft(): Promise<ApiDraft | null> {
    try {
      return await request<ApiDraft>('/api/draft');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  },
  putDraft(data: OrgData): Promise<ApiDraft> {
    return request<ApiDraft>('/api/draft', {
      method: 'PUT',
      body: JSON.stringify({ data }),
    });
  },
};

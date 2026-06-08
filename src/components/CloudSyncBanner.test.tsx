import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSyncBanner } from './CloudSyncBanner';
import type { OrgContextValue } from '../context/orgContextState';

/**
 * CloudSyncBanner 四態渲染測試（契約 §3）。
 *
 * 以 module mock 隔離三個依賴，讓四態能各自獨立控制：
 * - `isApiEnabled`（後端啟用與否）
 * - `useOnlineStatus`（線上 / 離線）
 * - `useOrg`（pendingCloudSync 旗標）
 *
 * 四態：
 * 1. 後端停用 → render null（容器不存在）。
 * 2. 後端啟用 + 離線 → 顯示離線文案。
 * 3. 後端啟用 + 線上 + pending → 顯示未同步文案。
 * 4. 後端啟用 + 線上 + 不 pending → render null。
 *
 * a11y：顯示時容器須為 role="status" 且 aria-live="polite"。
 */

const isApiEnabledMock = vi.fn<() => boolean>();
const useOnlineStatusMock = vi.fn<() => boolean>();
const useOrgMock = vi.fn<() => OrgContextValue>();

vi.mock('../services/apiClient', () => ({
  isApiEnabled: () => isApiEnabledMock(),
}));

vi.mock('../hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => useOnlineStatusMock(),
}));

vi.mock('../context/useOrg', () => ({
  useOrg: () => useOrgMock(),
}));

/** 設定三個依賴回傳值；pending 預設 false。 */
function setup(opts: { apiEnabled: boolean; online: boolean; pending?: boolean }) {
  isApiEnabledMock.mockReturnValue(opts.apiEnabled);
  useOnlineStatusMock.mockReturnValue(opts.online);
  // 只有 pendingCloudSync 會被元件讀取，其餘欄位元件不碰，以 partial cast 提供。
  useOrgMock.mockReturnValue({
    pendingCloudSync: opts.pending ?? false,
  } as OrgContextValue);
}

describe('CloudSyncBanner', () => {
  beforeEach(() => {
    isApiEnabledMock.mockReset();
    useOnlineStatusMock.mockReset();
    useOrgMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('後端停用 → render null（不顯示任何提醒）', () => {
    setup({ apiEnabled: false, online: false, pending: true });
    const { container } = render(<CloudSyncBanner />);
    // 後端停用時，即使離線且 pending 也一律不顯示。
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('後端啟用 + 離線 → 顯示離線文案', () => {
    setup({ apiEnabled: true, online: false, pending: false });
    render(<CloudSyncBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('目前離線中');
    expect(banner).toHaveTextContent('尚未同步到雲端');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('後端啟用 + 離線 → pending 與否都優先顯示離線文案', () => {
    setup({ apiEnabled: true, online: false, pending: true });
    render(<CloudSyncBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('目前離線中');
    // 不應同時出現「線上但未同步」的文案。
    expect(banner).not.toHaveTextContent('有本機變更尚未同步到雲端。 回線');
  });

  it('後端啟用 + 線上 + pending → 顯示未同步文案', () => {
    setup({ apiEnabled: true, online: true, pending: true });
    render(<CloudSyncBanner />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('有本機變更尚未同步到雲端');
    expect(banner).toHaveTextContent('回線同步將於後續版本提供');
    expect(banner).toHaveAttribute('aria-live', 'polite');
  });

  it('後端啟用 + 線上 + 不 pending → render null', () => {
    setup({ apiEnabled: true, online: true, pending: false });
    const { container } = render(<CloudSyncBanner />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

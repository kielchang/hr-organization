import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { OrgChartPage } from './OrgChartPage';

/**
 * React Flow（@xyflow/react）掛載時會建立 ResizeObserver 量測容器，
 * jsdom 未提供此 API。提供最小 stub 讓元件能掛載，行為斷言不依賴實際量測。
 */
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/** 取得左上角「檢視組別」下拉目前顯示的文字（含當前選定組名）。 */
function selectorText() {
  return document.getElementById('org-chart-group-select')?.textContent ?? '';
}

/**
 * 守護：組別歸屬視角下，若目前選定的是「單一組別」且其 kind 與新過濾不符，
 * 切換過濾種類時應自動切回「全部視角」，避免渲染成空白畫面。
 *
 * 利用 seed 資料：預設選定組為 g4「前端組」(kind=department)；
 * 種類過濾 tab 有「全部／部門／職能」。
 */
describe('OrgChartPage 組別歸屬視角：過濾種類不符時自動切回全部視角', () => {
  async function gotoMembership(user: ReturnType<typeof userEvent.setup>) {
    renderWithProviders(<OrgChartPage />, { route: '/' });
    await user.click(screen.getByRole('tab', { name: '組別歸屬圖' }));
    // 預設選定單一部門組（前端組），尚未切換種類過濾
    await waitFor(() => expect(selectorText()).toMatch(/前端組/));
  }

  it('選定部門組後切到「職能」過濾（kind 不符）→ 自動切回全公司', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    await user.click(screen.getByRole('tab', { name: '職能' }));

    // 前端組 kind=department，與「職能」不符 → 應切回全部視角
    await waitFor(() => expect(selectorText()).toMatch(/全公司/));
    expect(selectorText()).not.toMatch(/前端組/);
  });

  it('選定部門組後切到「部門」過濾（kind 相符）→ 維持原選定，不誤切回', async () => {
    const user = userEvent.setup();
    await gotoMembership(user);

    await user.click(screen.getByRole('tab', { name: '部門' }));

    // 前端組 kind=department 與「部門」相符 → 不應被切回全部視角；
    // 給足時間確認沒有發生切回（避免恒真：與上一案的「切回」形成對照）。
    await waitFor(() => expect(selectorText()).toMatch(/前端組/));
    expect(selectorText()).not.toMatch(/全公司/);
  });
});

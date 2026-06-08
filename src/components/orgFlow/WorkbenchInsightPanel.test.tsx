import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkbenchInsightPanel } from './WorkbenchInsightPanel';
import { buildOrgHealth } from '../../services/orgHealth';
import { assignment, emp, group, jobLevel, makeOrgData } from '../../test/fixtures';
import type { OrgData } from '../../types/org';

/**
 * WorkbenchInsightPanel render + 互動測試。
 *
 * 此面板不含 React Flow 畫布——以手構 props（OrgData → buildOrgHealth 的 health
 * ＋ selectedEmployeeId）餵入即可純 render，不需 ResizeObserver/畫布 stub。
 *
 * 固定 fixture 設計（由 buildOrgHealth 推導、已驗證）：
 * - 王主管(sup)：span-wide(warning) + spof(warning)——同一人兩筆警示、跨 span/spof 兩群。
 * - 李經理(mgr)：span-narrow(info)——唯一一筆 info。
 * - 全域：2 warning + 1 info；規劃就緒度 total=91、level=high（「結構就緒」）。
 * 用於斷言 CM 防過載（預設藏 info）、選中縮限、分群標籤與徽章。
 */
function makeFixture(): OrgData {
  const reports = Array.from({ length: 9 }, (_, i) => `r${i}`);
  return makeOrgData({
    groups: [group('dept', { kind: 'department' })],
    jobLevels: [jobLevel('j1', 10)],
    employees: [
      emp('sup', { name: '王主管' }),
      emp('mgr', { name: '李經理' }),
      emp('solo', { name: '陳專員' }),
      ...reports.map((id) => emp(id, { name: id })),
    ],
    assignments: [
      assignment('as-sup', { employeeId: 'sup', groupId: 'dept', jobLevelId: 'j1' }),
      // sup 帶 9 名 → span-wide(warning) ＋（唯一主管 ≥2 人）spof(warning)
      ...reports.map((id) =>
        assignment(`as-${id}`, {
          employeeId: id,
          groupId: 'dept',
          jobLevelId: 'j1',
          supervisorIds: ['sup'],
          primarySupervisorId: 'sup',
        }),
      ),
      // mgr 帶 1 名（solo）→ span-narrow(info)
      assignment('as-mgr', {
        employeeId: 'mgr',
        groupId: 'dept',
        jobLevelId: 'j1',
        supervisorIds: ['sup'],
        primarySupervisorId: 'sup',
      }),
      assignment('as-solo', {
        employeeId: 'solo',
        groupId: 'dept',
        jobLevelId: 'j1',
        supervisorIds: ['mgr'],
        primarySupervisorId: 'mgr',
      }),
    ],
  });
}

/** 以固定 fixture 渲染面板；可覆寫選中員工等 props。 */
function renderPanel(
  overrides: Partial<React.ComponentProps<typeof WorkbenchInsightPanel>> = {},
) {
  const orgData = makeFixture();
  const health = buildOrgHealth(orgData);
  return render(
    <WorkbenchInsightPanel
      health={health}
      orgData={orgData}
      selectedEmployeeId={null}
      {...overrides}
    />,
  );
}

describe('WorkbenchInsightPanel render', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('呈現規劃就緒度徽章、findings 分群標籤與職能覆蓋，且無 console.error', () => {
    renderPanel();

    // 面板 landmark
    expect(
      screen.getByRole('complementary', { name: '即時整合面板' }),
    ).toBeInTheDocument();

    // 規劃就緒度：分數 + 等級徽章（fixture readiness total=91 → high「結構就緒」）
    expect(screen.getByText('規劃就緒度')).toBeInTheDocument();
    expect(screen.getByText('91')).toBeInTheDocument();
    expect(screen.getByText('結構就緒')).toBeInTheDocument();

    // 預設只看 warning：span / spof 兩群標籤出現
    expect(screen.getByText('管理幅度')).toBeInTheDocument();
    expect(screen.getByText('無備援主管')).toBeInTheDocument();

    // 職能覆蓋面板重用
    expect(screen.getByText('職能覆蓋訊號')).toBeInTheDocument();

    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('WorkbenchInsightPanel — CM 防過載（warning ⇄ 全部）', () => {
  it('預設只顯示 warning；點「展開全部」後 info 級 finding 出現，aria-pressed 同步', async () => {
    const user = userEvent.setup();
    renderPanel();

    const insightSection = screen.getByRole('region', { name: '即時提醒' });

    // 預設：warning 的 span-wide 訊息可見；info 的 span-narrow 不可見。
    expect(
      within(insightSection).getByText(/直接管理 10 名部屬/),
    ).toBeInTheDocument();
    expect(
      within(insightSection).queryByText(/僅有 1 名直接部屬/),
    ).not.toBeInTheDocument();

    // 切換鈕初始為「展開全部（含 1 則提示）」、aria-pressed=false。
    const toggle = within(insightSection).getByRole('button', {
      name: /展開全部（含 1 則提示）/,
    });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await user.click(toggle);

    // 展開後：info 級 finding 出現；aria-pressed=true；鈕文字切為「只看警示」。
    expect(within(insightSection).getByText(/僅有 1 名直接部屬/)).toBeInTheDocument();
    const toggleAfter = within(insightSection).getByRole('button', {
      name: '只看警示',
    });
    expect(toggleAfter).toHaveAttribute('aria-pressed', 'true');

    // 收起後 info 再次隱藏（雙向）。
    await user.click(toggleAfter);
    expect(
      within(insightSection).queryByText(/僅有 1 名直接部屬/),
    ).not.toBeInTheDocument();
  });
});

describe('WorkbenchInsightPanel — 收合 a11y', () => {
  it('收合鈕 aria-expanded 隨摺疊狀態切換', async () => {
    const user = userEvent.setup();
    renderPanel();

    // 展開態：收合鈕 aria-expanded=true。
    const collapseBtn = screen.getByRole('button', { name: '收合即時整合面板' });
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true');

    await user.click(collapseBtn);

    // 收合態：面板換為收合版 landmark，展開鈕 aria-expanded=false。
    expect(
      screen.getByRole('complementary', { name: '即時整合面板（已收合）' }),
    ).toBeInTheDocument();
    const expandBtn = screen.getByRole('button', { name: '展開即時整合面板' });
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

    // 再展開：回到完整面板。
    await user.click(expandBtn);
    expect(
      screen.getByRole('complementary', { name: '即時整合面板' }),
    ).toBeInTheDocument();
  });
});

describe('WorkbenchInsightPanel — 選中節點 → 該人提醒', () => {
  it('無選中時標題為「即時提醒」、呈現全域 findings', () => {
    renderPanel({ selectedEmployeeId: null });

    expect(
      screen.getByRole('heading', { name: '即時提醒', level: 3 }),
    ).toBeInTheDocument();
    // 全域：王主管(span-wide) + 無備援主管(spof) 群皆在。
    expect(screen.getByText('管理幅度')).toBeInTheDocument();
    expect(screen.getByText('無備援主管')).toBeInTheDocument();
  });

  it('傳入 selectedEmployeeId 時標題為「{姓名} 的相關提醒」且 findings 縮限該人', () => {
    // 選中王主管（sup）：其 findings＝span-wide(warning) + spof(warning)，無 info。
    renderPanel({ selectedEmployeeId: 'sup', selectedEmployeeName: '王主管' });

    expect(
      screen.getByRole('heading', { name: '王主管 的相關提醒', level: 3 }),
    ).toBeInTheDocument();

    const insightSection = screen.getByRole('region', { name: '即時提醒' });
    // 該人的兩筆警示在；李經理(mgr)的 info 不在（縮限到 sup，且 sup 本就無 info）。
    expect(
      within(insightSection).getByText(/直接管理 10 名部屬/),
    ).toBeInTheDocument();
    expect(within(insightSection).getByText(/唯一主管/)).toBeInTheDocument();
    expect(
      within(insightSection).queryByText(/僅有 1 名直接部屬/),
    ).not.toBeInTheDocument();

    // sup 縮限後無 info → CM 切換鈕不出現（沒有可展開的提示，避免空切換）。
    expect(
      within(insightSection).queryByRole('button', { name: /展開全部/ }),
    ).not.toBeInTheDocument();
  });

  it('選中只有 info 的員工：預設顯示「沒有警示」空狀態，展開後該人 info 才出現', async () => {
    const user = userEvent.setup();
    // 選中李經理（mgr）：唯一 finding 是 span-narrow(info)。
    renderPanel({ selectedEmployeeId: 'mgr', selectedEmployeeName: '李經理' });

    const insightSection = screen.getByRole('region', { name: '即時提醒' });
    // 預設藏 info → 該人空狀態文案。
    expect(
      within(insightSection).getByText('此員工目前沒有警示。'),
    ).toBeInTheDocument();

    // 展開全部後該人 info 出現。
    await user.click(
      within(insightSection).getByRole('button', { name: /展開全部/ }),
    );
    expect(within(insightSection).getByText(/僅有 1 名直接部屬/)).toBeInTheDocument();
  });
});

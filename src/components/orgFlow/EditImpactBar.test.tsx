import { afterEach, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EditImpactBar } from './EditImpactBar';
import type {
  HealthMetricDelta,
  OrgHealthDelta,
} from '../../services/orgHealth';

/**
 * EditImpactBar render smoke（R5.2）。
 *
 * 此元件為純展示元件（plain props {delta}，不依賴 page／React Flow context），
 * 故以手構的 OrgHealthDelta 直接掛載，低成本驗證呈現契約：
 *  - hasChanges=true：標題、4 指標 label、before→after 數字、改善/惡化文字皆出現。
 *  - hasChanges=false：顯示「尚無變更」（不消失，保留即時回饋區）。
 *  - 無 console.error（a11y/React 不報警）。
 *
 * 不重測 compareOrgHealth 演算法（已由 orgHealth.test.ts 覆蓋），僅測呈現。
 */

/** 造一筆 HealthMetricDelta，預設值可被覆寫。 */
function metric(partial: Partial<HealthMetricDelta>): HealthMetricDelta {
  return {
    key: 'warningCount',
    label: '警示數',
    before: 0,
    after: 0,
    delta: 0,
    direction: 'unchanged',
    ...partial,
  };
}

/** hasChanges=true 的 delta：四指標各示範一種方向／格式。 */
function changedDelta(): OrgHealthDelta {
  return {
    metrics: [
      // avgSpan：6.2 → 4.8（一位小數），改善
      metric({
        key: 'avgSpan',
        label: '平均管理幅度',
        before: 6.2,
        after: 4.8,
        delta: -1.4,
        direction: 'improved',
      }),
      // maxDepth：5 → 5，持平
      metric({
        key: 'maxDepth',
        label: '最大層級',
        before: 5,
        after: 5,
        delta: 0,
        direction: 'unchanged',
      }),
      // warningCount：8 → 5，改善
      metric({
        key: 'warningCount',
        label: '警示數',
        before: 8,
        after: 5,
        delta: -3,
        direction: 'improved',
      }),
      // readiness：72 → 65，惡化（越大越好，下降即惡化）
      metric({
        key: 'readiness',
        label: '規劃就緒度',
        before: 72,
        after: 65,
        delta: -7,
        direction: 'worsened',
      }),
    ],
    hasChanges: true,
  };
}

/** hasChanges=false 的 delta：四指標皆持平。 */
function unchangedDelta(): OrgHealthDelta {
  return {
    metrics: [
      metric({ key: 'avgSpan', label: '平均管理幅度', before: 4.8, after: 4.8 }),
      metric({ key: 'maxDepth', label: '最大層級', before: 5, after: 5 }),
      metric({ key: 'warningCount', label: '警示數', before: 5, after: 5 }),
      metric({ key: 'readiness', label: '規劃就緒度', before: 80, after: 80 }),
    ],
    hasChanges: false,
  };
}

describe('EditImpactBar — render smoke（R5.2）', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('hasChanges=true：標題、4 指標 label、before→after 數字皆出現', () => {
    render(<EditImpactBar delta={changedDelta()} />);

    // 標題（同時為 section aria-label 與可見文字）
    expect(screen.getAllByText('本次調整的影響').length).toBeGreaterThan(0);

    // 4 指標 label
    expect(screen.getByText('平均管理幅度')).toBeInTheDocument();
    expect(screen.getByText('最大層級')).toBeInTheDocument();
    expect(screen.getByText('警示數')).toBeInTheDocument();
    expect(screen.getByText('規劃就緒度')).toBeInTheDocument();

    // before/after 數字：avgSpan 一位小數、整數指標原值
    expect(screen.getByText('6.2')).toBeInTheDocument(); // avgSpan before
    expect(screen.getByText('4.8')).toBeInTheDocument(); // avgSpan after
    expect(screen.getByText('8')).toBeInTheDocument(); // warningCount before
    expect(screen.getByText('72')).toBeInTheDocument(); // readiness before
    expect(screen.getByText('65')).toBeInTheDocument(); // readiness after

    // 未顯示「尚無變更」
    expect(screen.queryByText('尚無變更')).not.toBeInTheDocument();
  });

  it('hasChanges=true：方向文字「改善／惡化／持平」皆以文字呈現（不單靠顏色/箭頭）', () => {
    render(<EditImpactBar delta={changedDelta()} />);

    // 改善（avgSpan、warningCount 各一） + 惡化（readiness） + 持平（maxDepth）
    expect(screen.getAllByText('改善').length).toBe(2);
    expect(screen.getByText('惡化')).toBeInTheDocument();
    expect(screen.getByText('持平')).toBeInTheDocument();
  });

  it('hasChanges=true：差值帶正負號（改善為負號、avgSpan 一位小數）', () => {
    render(<EditImpactBar delta={changedDelta()} />);

    // formatDelta 用 U+2212（−）作負號，avgSpan 一位小數
    expect(screen.getByText('−1.4')).toBeInTheDocument(); // avgSpan delta
    expect(screen.getByText('−3')).toBeInTheDocument(); // warningCount delta
    expect(screen.getByText('−7')).toBeInTheDocument(); // readiness delta
    expect(screen.getByText('±0')).toBeInTheDocument(); // maxDepth 持平
  });

  it('hasChanges=false：顯示「尚無變更」（區塊不消失）', () => {
    render(<EditImpactBar delta={unchangedDelta()} />);

    expect(screen.getByText('尚無變更')).toBeInTheDocument();
    // 標題與指標仍在（區塊保留，只是淡化）
    expect(screen.getByText('規劃就緒度')).toBeInTheDocument();
  });

  it('render 不觸發 console.error', () => {
    render(<EditImpactBar delta={changedDelta()} />);
    render(<EditImpactBar delta={unchangedDelta()} />);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { pickDefaultGroupId, resolveGroupId } from './orgFlowGroupSelection';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';

/** 群組選擇純函式測試（§3.5 順手技術債，把階段 2 遺留的 branch 57% 補滿）。 */

type G = { id: string; status: string };
const active = (id: string): G => ({ id, status: 'active' });
const inactive = (id: string): G => ({ id, status: 'inactive' });

describe('pickDefaultGroupId', () => {
  it('優先選「前端組」g4（即使非第一個 active）', () => {
    expect(pickDefaultGroupId([active('g1'), active('g4'), active('g2')])).toBe('g4');
  });

  it('g4 存在但為 inactive 時不選 g4，退而選第一個 active', () => {
    expect(pickDefaultGroupId([active('g1'), inactive('g4'), active('g2')])).toBe('g1');
  });

  it('無 g4 時選第一個 active 組', () => {
    expect(pickDefaultGroupId([active('g2'), active('g3')])).toBe('g2');
  });

  it('第一個是 inactive 時跳過，選第一個 active', () => {
    expect(pickDefaultGroupId([inactive('g1'), active('g2')])).toBe('g2');
  });

  it('全部 inactive 時回退到全公司視角', () => {
    expect(pickDefaultGroupId([inactive('g1'), inactive('g2')])).toBe(ALL_GROUPS_VIEW_ID);
  });

  it('空 groups 時回退到全公司視角', () => {
    expect(pickDefaultGroupId([])).toBe(ALL_GROUPS_VIEW_ID);
  });
});

describe('resolveGroupId', () => {
  it('全公司視角原樣保留', () => {
    expect(resolveGroupId(ALL_GROUPS_VIEW_ID, [active('g1')])).toBe(ALL_GROUPS_VIEW_ID);
    // 即使 groups 為空，全公司視角仍保留（不退回預設）
    expect(resolveGroupId(ALL_GROUPS_VIEW_ID, [])).toBe(ALL_GROUPS_VIEW_ID);
  });

  it('目前 groupId 仍為 active 組 → 原樣保留', () => {
    expect(resolveGroupId('g2', [active('g1'), active('g2')])).toBe('g2');
  });

  it('目前 groupId 指向已停用組別 → 回退到預設組', () => {
    // g2 已停用、g4 為 active → 回退到 g4（pickDefault 優先 g4）
    expect(resolveGroupId('g2', [inactive('g2'), active('g4')])).toBe('g4');
  });

  it('目前 groupId 指向已不存在組別 → 回退到預設組', () => {
    // gone 不存在，無 g4 → 回退到第一個 active（g1）
    expect(resolveGroupId('gone', [active('g1'), active('g3')])).toBe('g1');
  });

  it('目前 groupId 無效且無任何 active 組 → 回退到全公司視角', () => {
    expect(resolveGroupId('gone', [inactive('g1')])).toBe(ALL_GROUPS_VIEW_ID);
    expect(resolveGroupId('gone', [])).toBe(ALL_GROUPS_VIEW_ID);
  });
});

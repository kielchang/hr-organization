import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OrgProvider } from '../context/OrgProvider';
import { useOrg } from '../context/useOrg';
import { useOrgFlowEditing } from './useOrgFlowEditing';
import { buildOrgHealth, compareOrgHealth } from '../services/orgHealth';
import { cloneOrgData } from '../services/exportImport';
import type { OrgData } from '../types/org';

/**
 * useOrgFlowEditing 行為測試。
 *
 * 重點：以 renderHook + 真實 OrgProvider（與 OrgProvider.test 同一 wrapper 風格），
 * 驗證從 OrgChartPage 抽出的編輯 session 編排與內聯版等價：
 * - 初始非編輯態：orgData === 已發布資料、impactDelta/diffResult 為 null
 * - 進編輯／改草稿／發布／離開的狀態遷移
 * - impactDelta 反映草稿與 base 的健檢差異（以純函式 compareOrgHealth 做自驗，
 *   不硬編 seed 細節，避免 seed 變動時測試脆裂）
 */

const wrapper = ({ children }: { children: ReactNode }) => (
  <OrgProvider>{children}</OrgProvider>
);

/**
 * 同時取用 useOrg 與 useOrgFlowEditing —— 讓測試能拿到「已發布資料」做比對，
 * 也能在需要時造一個確定改變健檢指標的草稿。
 */
function useEditingHarness() {
  return { org: useOrg(), editing: useOrgFlowEditing() };
}

/**
 * 由 base 造一份「會降低 warningCount」的草稿（self-validating）：
 * 為職能組 g8 的某成員補上主主管，消除 function-no-lead 警示。
 * 回傳 null 表示此 seed 無法套用此 mutation（測試會據此 skip 該斷言而非誤報）。
 */
function makeWarningReducingDraft(base: OrgData): OrgData | null {
  const draft = cloneOrgData(base);
  const g8Member = draft.assignments.find((a) => a.groupId === 'g8');
  if (!g8Member) return null;
  g8Member.primarySupervisorId = 'e1';
  return draft;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useOrgFlowEditing — 初始（非編輯）狀態', () => {
  it('非編輯態：isEditMode=false、orgData 等於已發布資料、impactDelta/diffResult/session 皆 null', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });
    const { editing, org } = result.current;

    expect(editing.isEditMode).toBe(false);
    expect(editing.session).toBeNull();
    // 非編輯態下顯示的就是 provider 的已發布資料（同一參考）。
    expect(editing.orgData).toBe(org.data);
    expect(editing.impactDelta).toBeNull();
    expect(editing.diffResult).toBeNull();
    expect(editing.staleDataWarning).toBe(false);
  });
});

describe('useOrgFlowEditing — 進入／離開編輯模式', () => {
  it('enterEditMode → isEditMode=true、session 帶 base/draft 皆為當前發布資料的副本', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });
    const published = result.current.org.data;

    act(() => result.current.editing.enterEditMode());

    const { editing } = result.current;
    expect(editing.isEditMode).toBe(true);
    expect(editing.session).not.toBeNull();
    // session 內是 clone（深拷貝），不應與 provider 同參考但內容等價。
    expect(editing.session!.baseData).not.toBe(published);
    expect(editing.session!.draftData).not.toBe(published);
    expect(editing.session!.baseData.employees).toHaveLength(
      published.employees.length,
    );
    // 剛進編輯、草稿未動：base 與 draft 相等 → impactDelta 無變化。
    expect(editing.orgData).toBe(editing.session!.draftData);
    expect(editing.impactDelta).not.toBeNull();
    expect(editing.impactDelta!.hasChanges).toBe(false);
  });

  it('exitEditMode → 回非編輯態、session 歸 null、orgData 回到已發布資料', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });

    act(() => result.current.editing.enterEditMode());
    expect(result.current.editing.isEditMode).toBe(true);

    act(() => result.current.editing.exitEditMode());

    const { editing, org } = result.current;
    expect(editing.isEditMode).toBe(false);
    expect(editing.session).toBeNull();
    expect(editing.orgData).toBe(org.data);
    expect(editing.impactDelta).toBeNull();
  });
});

describe('useOrgFlowEditing — 草稿變更與 impactDelta', () => {
  it('onDraftChange 更新草稿，且 impactDelta 與純函式 compareOrgHealth(base, draft) 一致', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });

    act(() => result.current.editing.enterEditMode());
    const base = result.current.editing.session!.baseData;

    const reduced = makeWarningReducingDraft(base);
    // self-validating：先用純函式確認此 mutation 真的降低 warningCount，
    // 否則此 seed 不適用此情境（避免恒真斷言）。
    expect(reduced).not.toBeNull();
    const baseHealth = buildOrgHealth(base);
    const draftHealth = buildOrgHealth(reduced!);
    expect(draftHealth.summary.warningCount).toBeLessThan(
      baseHealth.summary.warningCount,
    );

    act(() => result.current.editing.onDraftChange(reduced!));

    const { editing } = result.current;
    // 草稿已替換為新資料。
    expect(editing.orgData).toBe(editing.session!.draftData);
    expect(editing.session!.draftData.assignments).toEqual(reduced!.assignments);

    // impactDelta 應等價於對 base/draft 直接比對的結果。
    const expected = compareOrgHealth(base, reduced!);
    expect(editing.impactDelta).toEqual(expected);
    expect(editing.impactDelta!.hasChanges).toBe(true);

    const warningMetric = editing.impactDelta!.metrics.find(
      (m) => m.key === 'warningCount',
    )!;
    expect(warningMetric.delta).toBeLessThan(0);
    expect(warningMetric.direction).toBe('improved');
  });
});

describe('useOrgFlowEditing — 發布', () => {
  it('publish → 呼叫 OrgProvider.publishVersion 產生新版本、切為當前版本並退出編輯', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });
    const publishSpy = vi.spyOn(result.current.org, 'publishVersion');

    act(() => result.current.editing.enterEditMode());
    const base = result.current.editing.session!.baseData;
    const reduced = makeWarningReducingDraft(base) ?? cloneOrgData(base);
    act(() => result.current.editing.onDraftChange(reduced));

    act(() =>
      result.current.editing.publish({
        label: '測試發布',
        note: '補上 g8 lead',
      }),
    );

    // publishVersion 被以「草稿副本 + opts」呼叫。
    expect(publishSpy).toHaveBeenCalledTimes(1);
    const [draftArg, optsArg] = publishSpy.mock.calls[0];
    expect(draftArg.assignments).toEqual(reduced.assignments);
    expect(optsArg).toMatchObject({ label: '測試發布', note: '補上 g8 lead' });

    // 發布後退出編輯模式，且 provider 已切到新發布版本（pub- 開頭）。
    const { editing, org } = result.current;
    expect(editing.isEditMode).toBe(false);
    expect(editing.session).toBeNull();
    expect(org.activeVersionId).toMatch(/^pub-/);
  });
});

describe('useOrgFlowEditing — 快照預覽與 diffResult', () => {
  it('saveCheckpoint + previewSnapshot → diffResult 反映 base→快照 的差異；取消預覽歸 null', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });

    act(() => result.current.editing.enterEditMode());
    const base = result.current.editing.session!.baseData;
    const reduced = makeWarningReducingDraft(base) ?? cloneOrgData(base);

    // 先改草稿再存檢查點，使快照內容與 base 有差異。
    act(() => result.current.editing.onDraftChange(reduced));
    act(() => result.current.editing.saveCheckpoint('cp1'));

    const snapshotId = result.current.editing.session!.snapshots[0].id;
    expect(snapshotId).toBeTruthy();
    // 尚未預覽 → diffResult 為 null。
    expect(result.current.editing.diffResult).toBeNull();

    act(() => result.current.editing.previewSnapshot(snapshotId));
    const diff = result.current.editing.diffResult;
    expect(diff).not.toBeNull();
    // g8 成員補主管屬「歸屬修改」→ 該員工出現在 assignmentChangedEmployeeIds。
    expect(diff!.assignmentChangedEmployeeIds.size).toBeGreaterThan(0);

    act(() => result.current.editing.previewSnapshot(null));
    expect(result.current.editing.diffResult).toBeNull();
  });
});

describe('useOrgFlowEditing — staleDataWarning', () => {
  it('編輯中底層發布資料被外部變更 → staleDataWarning=true；dismiss 後歸 false', () => {
    const { result } = renderHook(useEditingHarness, { wrapper });

    act(() => result.current.editing.enterEditMode());
    expect(result.current.editing.staleDataWarning).toBe(false);

    // 編輯中以 loadFromFile 替換底層 provider 資料（換一個新 OrgData 參考），
    // 模擬「底層發布資料被外部變更」——觸發 hook 的 stale 偵測（data !== prev）。
    const external = cloneOrgData(result.current.org.data);
    external.exportedAt = '2099-01-01T00:00:00.000Z';
    act(() => result.current.org.loadFromFile(external));

    expect(result.current.editing.staleDataWarning).toBe(true);

    act(() => result.current.editing.dismissStaleWarning());
    expect(result.current.editing.staleDataWarning).toBe(false);
    // dismiss 不離開編輯模式。
    expect(result.current.editing.isEditMode).toBe(true);
  });
});

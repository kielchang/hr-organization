import { useEffect, useMemo, useRef, useState } from 'react';
import { useOrg } from '../context/useOrg';
import { useEditSession } from './useEditSession';
import { computeOrgDiff } from '../services/computeOrgDiff';
import { buildHealthDelta, buildOrgHealth } from '../services/orgHealth';
import { cloneOrgData } from '../services/exportImport';
import type { OrgData } from '../types/org';
import type { EditSession, OrgDiffResult } from '../types/editSession';
import type { OrgHealthDelta } from '../services/orgHealth';

/**
 * 組織圖編輯 session 的整坨編排（從 OrgChartPage 抽出，供 /org-chart 與 /workbench 共用）。
 *
 * 重構等價約束：本 hook 的行為必須與原 OrgChartPage 內聯邏輯完全一致——
 * 既有 OrgChartPage 測試不需修改即全綠。memo 依賴細化（base 依 baseData、
 * draft 依 draftData）刻意保留，避免草稿 mutate 時白白重算 base 端（先前踩過的雷）。
 *
 * 邊界：本 hook 只負責「編輯 session」狀態（編輯態、草稿、快照、health delta、
 * 發布／檢查點等）。頁面層的 UI 狀態（chartMode、選定組別、選定員工、面板開合）
 * 仍由各頁面自管，因兩頁版面不同。
 */
export interface UseOrgFlowEditing {
  /** 是否處於編輯模式。 */
  isEditMode: boolean;
  /** 當前編輯 session（未編輯時為 null）。 */
  session: EditSession | null;
  /** 當前該顯示的資料：編輯中為草稿、否則為已發布資料。 */
  orgData: OrgData;
  /** 編輯態 before→after 指標 delta（非編輯態為 null）。 */
  impactDelta: OrgHealthDelta | null;
  /** 預覽快照時的 diff 結果（未預覽為 null）。 */
  diffResult: OrgDiffResult | null;
  /** 編輯中底層發布版本被外部變更時為 true。 */
  staleDataWarning: boolean;
  /** 以目前已發布資料進入編輯模式。 */
  enterEditMode: () => void;
  /** 離開編輯模式（捨棄草稿）。 */
  exitEditMode: () => void;
  /** 以目前草稿存一個檢查點快照。 */
  saveCheckpoint: (description: string) => void;
  /** 發布目前草稿為新版本並離開編輯模式。 */
  publish: (opts: { label?: string; note?: string; effectiveDate?: string }) => void;
  /** 草稿整體替換（畫布編輯等寫回草稿）。 */
  onDraftChange: (next: OrgData) => void;
  /** 預覽（或取消預覽）某一快照。 */
  previewSnapshot: (snapshotId: string | null) => void;
  /** 回滾草稿至某一快照。 */
  rollbackToSnapshot: (snapshotId: string) => void;
  /** 關閉 stale 警示（不離開編輯模式）。 */
  dismissStaleWarning: () => void;
}

export function useOrgFlowEditing(): UseOrgFlowEditing {
  const { data, publishVersion } = useOrg();

  const editSession = useEditSession();
  const [staleDataWarning, setStaleDataWarning] = useState(false);
  const prevPublishedRef = useRef<OrgData>(data);

  // 編輯中若底層已發布資料被外部變更，提示使用者草稿可能過時。
  useEffect(() => {
    if (editSession.isEditMode && data !== prevPublishedRef.current) {
      setStaleDataWarning(true);
    }
    prevPublishedRef.current = data;
  }, [data, editSession.isEditMode]);

  // 當前資料來源：編輯中用草稿、否則用已發布資料。
  const orgData = useMemo((): OrgData => {
    if (editSession.isEditMode && editSession.session) {
      return editSession.session.draftData;
    }
    return data;
  }, [data, editSession.isEditMode, editSession.session]);

  // 預覽快照時的 diff：以進編輯前的 baseData vs 被預覽快照比較，
  // 讓使用者看出「從原始狀態到該檢查點」改了什麼。
  const diffResult = useMemo(() => {
    if (!editSession.session?.previewingSnapshotId || !editSession.session) return null;
    const snapshot = editSession.session.snapshots.find(
      (s) => s.id === editSession.session!.previewingSnapshotId,
    );
    if (!snapshot) return null;
    return computeOrgDiff(editSession.session.baseData, snapshot.orgData);
  }, [editSession.session]);

  // base 端 health：整個編輯 session 內 baseData 穩定，故獨立 memo 在 [baseData]，
  // 避免每次草稿 mutate 都連 base 一起重算 buildOrgHealth。
  const baseHealth = useMemo(() => {
    if (!editSession.isEditMode || !editSession.session) return null;
    return buildOrgHealth(editSession.session.baseData);
    // 刻意只依賴 baseData（session 內穩定）：依賴整個 session 會在每次草稿 mutate
    // 時白白重算 base 端，違背此優化目的。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSession.isEditMode, editSession.session?.baseData]);

  // draft 端 health：僅在草稿資料變動時重算。
  const draftHealth = useMemo(() => {
    if (!editSession.isEditMode || !editSession.session) return null;
    return buildOrgHealth(editSession.session.draftData);
    // 刻意只依賴 draftData，避免被 session 其他欄位（如快照、預覽狀態）變動牽連重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSession.isEditMode, editSession.session?.draftData]);

  const impactDelta = useMemo(() => {
    if (!baseHealth || !draftHealth) return null;
    return buildHealthDelta(baseHealth, draftHealth);
  }, [baseHealth, draftHealth]);

  const enterEditMode = () => {
    editSession.enterEditMode(data);
    setStaleDataWarning(false);
  };

  const exitEditMode = () => {
    editSession.exitEditMode();
    setStaleDataWarning(false);
  };

  const saveCheckpoint = (description: string) => {
    editSession.saveCheckpoint(description);
  };

  const publish = (opts: {
    label?: string;
    note?: string;
    effectiveDate?: string;
  }) => {
    const draft = editSession.getDraftData();
    if (!draft) return;
    publishVersion(cloneOrgData(draft), opts);
    editSession.exitEditMode();
    setStaleDataWarning(false);
  };

  const onDraftChange = (next: OrgData) => {
    editSession.mutateDraft(() => next);
  };

  const dismissStaleWarning = () => {
    setStaleDataWarning(false);
  };

  return {
    isEditMode: editSession.isEditMode,
    session: editSession.session,
    orgData,
    impactDelta,
    diffResult,
    staleDataWarning,
    enterEditMode,
    exitEditMode,
    saveCheckpoint,
    publish,
    onDraftChange,
    previewSnapshot: editSession.previewSnapshot,
    rollbackToSnapshot: editSession.rollbackToSnapshot,
    dismissStaleWarning,
  };
}

import type { ReactNode } from 'react';
import { GroupOrgFlowChart } from './GroupOrgFlowChart';
import type { OrgData } from '../../types/org';
import type { OrgDiffResult } from '../../types/editSession';

interface GroupOrgCanvasProps {
  /** 圖資料源（唯讀；工作台中為 draft 或已發佈資料）。 */
  orgData: OrgData;
  /** 差異預覽（若編輯 session 有 diff，著色成員節點）。 */
  diffResult?: OrgDiffResult | null;
  /** 目前選定組別（已 resolve 過的有效值）。 */
  resolvedGroupId: string;
  /** 使用者切換檢視組別。 */
  onGroupChange: (groupId: string) => void;
  /** 目前選定員工節點（lift 至頁面，供右側面板取用）。 */
  selectedEmployeeId: string | null;
  /** 員工節點選取變更。 */
  onNodeSelect: (employeeId: string | null) => void;
  /** 畫布高度的 inline style（與 reporting 版面一致）。 */
  heightStyle?: React.CSSProperties;
  /** 畫布右側額外面板（工作台即時面板），與 reporting 版共用同一 WorkbenchInsightPanel。 */
  asidePanel?: ReactNode;
}

/**
 * 組別為主組織圖的「唯讀版面」包裝（仿 {@link ReportingEditCanvas} 的版面骨架）：
 * 中央 GroupOrgFlowChart + 右側 asidePanel。
 *
 * 與 ReportingEditCanvas 的差異：**無編輯工具列、無快照面板、無 stale 警示**——
 * D2 組別視圖唯讀，拖曳改組為 Phase E。組別選擇狀態與選定員工狀態皆由頁面 lift，
 * 與 reporting 視圖共用同一份 groupId / selectedEmployeeId，切換 tab 不需重設。
 */
export function GroupOrgCanvas({
  orgData,
  diffResult,
  resolvedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
  heightStyle = { height: 'calc(100vh - 18rem)' },
  asidePanel,
}: GroupOrgCanvasProps) {
  return (
    <div className="flex min-h-0 gap-3" style={heightStyle}>
      <div className="relative min-h-[480px] flex-1">
        <GroupOrgFlowChart
          orgData={orgData}
          diffResult={diffResult}
          selectedGroupId={resolvedGroupId}
          onGroupChange={onGroupChange}
          selectedEmployeeId={selectedEmployeeId}
          onNodeSelect={onNodeSelect}
          // 唯讀版面：isEditMode/onDraftChange 採預設（非編輯、no-op）；編輯能力走 GroupOrgEditCanvas。
        />
      </div>
      {asidePanel}
    </div>
  );
}

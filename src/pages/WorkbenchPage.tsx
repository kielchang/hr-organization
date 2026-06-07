import { useMemo, useState } from 'react';
import { Network, Boxes } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReportingEditCanvas } from '../components/orgFlow/ReportingEditCanvas';
import { GroupOrgCanvas } from '../components/groupOrg/GroupOrgCanvas';
import { WorkbenchInsightPanel } from '../components/orgFlow/WorkbenchInsightPanel';
import { WorkbenchGuideLinks } from '../components/orgFlow/WorkbenchGuideLinks';
import { resolveGroupId } from '../components/orgFlow/orgFlowGroupSelection';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { buildOrgHealth } from '../services/orgHealth';
import { useOrgFlowEditing } from '../hooks/useOrgFlowEditing';

/** 工作台主視圖：匯報組織圖（可編輯）／組別組織圖（D2 唯讀）。 */
type WorkbenchView = 'reporting' | 'group';

/**
 * 組織圖工作台（/workbench）—— 整合性主介面。
 *
 * 階段 2（即時整合面板）：中央沿用與 /org-chart 共用的 ReportingEditCanvas
 * 進行匯報編輯；右側可摺疊面板即時呈現規劃就緒度、findings（CM 防過載：預設
 * 只看 warning）與職能覆蓋；選中節點時面板縮限到該人的相關提醒；底部提供
 * 引導到各專門頁的連結。編輯 session 編排與 /org-chart 共用 useOrgFlowEditing。
 */
export function WorkbenchPage() {
  const editing = useOrgFlowEditing();
  const { orgData } = editing;

  // 工作台是整合主介面，預設用「全公司視角」開啟（不挑單組），
  // reporting + membership 皆從全公司起。/org-chart 維持 pickDefaultGroupId。
  const [groupId, setGroupId] = useState<string>(ALL_GROUPS_VIEW_ID);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  // 主視圖切換：預設維持既有「匯報組織圖」（避免驚嚇）；組別視圖為新增變體。
  const [view, setView] = useState<WorkbenchView>('reporting');

  const resolvedGroupId = useMemo(
    () => resolveGroupId(groupId, orgData.groups),
    [groupId, orgData],
  );

  // 右側面板共用的單一健檢結果（即時反映 draft）；readiness 與 findings 皆由此衍生。
  const health = useMemo(() => buildOrgHealth(orgData), [orgData]);

  // 選中員工的姓名（供「{姓名} 的相關提醒」標題；找不到則由面板回退顯示）。
  const selectedEmployeeName = useMemo(
    () =>
      selectedEmployeeId
        ? orgData.employees.find((e) => e.id === selectedEmployeeId)?.name
        : undefined,
    [orgData.employees, selectedEmployeeId],
  );

  // 右側即時面板兩視圖共用（同一 health／selectedEmployeeId）。
  const insightPanel = (
    <WorkbenchInsightPanel
      health={health}
      orgData={orgData}
      selectedEmployeeId={selectedEmployeeId}
      selectedEmployeeName={selectedEmployeeName}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">組織圖工作台</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          以組織圖拖拉為中心的整合工作區：在同一畫面進編輯、調整匯報關係，右側即時看見規劃就緒度與結構提醒。
        </p>
      </header>

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as WorkbenchView)}
        className="gap-4"
      >
        <TabsList aria-label="工作台主視圖切換">
          <TabsTrigger value="reporting">
            <Network aria-hidden="true" />
            匯報組織圖
          </TabsTrigger>
          <TabsTrigger value="group">
            <Boxes aria-hidden="true" />
            組別組織圖
          </TabsTrigger>
        </TabsList>

        <TabsContent value="reporting">
          <ReportingEditCanvas
            editing={editing}
            resolvedGroupId={resolvedGroupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
            asidePanel={insightPanel}
          />
        </TabsContent>

        <TabsContent value="group" className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            組別組織圖（每人一節點、依組別群組；可編輯為後續）
          </p>
          <GroupOrgCanvas
            orgData={orgData}
            diffResult={editing.diffResult}
            resolvedGroupId={resolvedGroupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
            asidePanel={insightPanel}
          />
        </TabsContent>
      </Tabs>

      <WorkbenchGuideLinks />
    </div>
  );
}

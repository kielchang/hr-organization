import { useMemo, useState } from 'react';
import { Network, Boxes, LayoutGrid } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ReportingEditCanvas } from '../components/orgFlow/ReportingEditCanvas';
import { GroupOrgEditCanvas } from '../components/groupOrg/GroupOrgEditCanvas';
import { GroupMembershipFlowChart } from '../components/groupMembership/GroupMembershipFlowChart';
import { FunctionCoveragePanel } from '../components/groupMembership/FunctionCoveragePanel';
import { WorkbenchInsightPanel } from '../components/orgFlow/WorkbenchInsightPanel';
import { WorkbenchGuideLinks } from '../components/orgFlow/WorkbenchGuideLinks';
import { resolveGroupId } from '../components/orgFlow/orgFlowGroupSelection';
import { ALL_GROUPS_VIEW_ID } from '../services/buildOrgFlowGraph';
import { buildOrgHealth } from '../services/orgHealth';
import { useOrgFlowEditing } from '../hooks/useOrgFlowEditing';
import type { GroupKind } from '../types/org';

/**
 * 工作台主視圖：匯報組織圖／組別組織圖／組別歸屬圖
 *（前兩者皆可編輯、共用同一編輯 session；membership 沿用 /org-chart 原版面）。
 */
type WorkbenchView = 'reporting' | 'group' | 'membership';
/** 組別歸屬視角的種類過濾：all=不過濾（自 OrgChartPage 搬入）。 */
type MembershipKindFilter = 'all' | GroupKind;

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
  // 主視圖切換：預設維持既有「匯報組織圖」（避免驚嚇）；組別／組別歸屬視圖為新增變體。
  const [view, setView] = useState<WorkbenchView>('reporting');
  // 組別歸屬視角的種類過濾（自 OrgChartPage 搬入；membership 視角吃 kindFilter 而非單一 group）。
  const [membershipKind, setMembershipKind] =
    useState<MembershipKindFilter>('all');

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
          <TabsTrigger value="membership">
            <LayoutGrid aria-hidden="true" />
            組別歸屬圖
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
            組別組織圖（每人一節點、依組別群組）：進編輯後可拖成員——拖到他人身上＝改主管、拖到分區空白＝改組別。
          </p>
          <GroupOrgEditCanvas
            editing={editing}
            resolvedGroupId={resolvedGroupId}
            onGroupChange={setGroupId}
            selectedEmployeeId={selectedEmployeeId}
            onNodeSelect={setSelectedEmployeeId}
            asidePanel={insightPanel}
          />
        </TabsContent>

        {/* 組別歸屬圖（自 /org-chart 搬入、行為等價）：全寬圖 + 下方職能覆蓋，
            不掛右側 insightPanel（沿用 OrgChartPage 版面）。 */}
        <TabsContent value="membership" className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            以每筆「組別歸屬」為節點，連線依該歸屬的主管設定；同一人跨組會出現多個節點。
          </p>

          {/* 種類過濾切換（全部／部門／職能） */}
          <Tabs
            value={membershipKind}
            onValueChange={(value) => {
              const nextKind = value as MembershipKindFilter;
              setMembershipKind(nextKind);
              setSelectedEmployeeId(null);
              // 若目前選定的單組種類與新過濾不符，會渲染成空白畫面；自動切回「全部視角」。
              if (nextKind !== 'all' && resolvedGroupId !== ALL_GROUPS_VIEW_ID) {
                const selectedGroup = orgData.groups.find(
                  (g) => g.id === resolvedGroupId,
                );
                if (selectedGroup && selectedGroup.kind !== nextKind) {
                  setGroupId(ALL_GROUPS_VIEW_ID);
                }
              }
            }}
          >
            <TabsList variant="default" className="w-fit">
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="department">部門</TabsTrigger>
              <TabsTrigger value="function">職能</TabsTrigger>
            </TabsList>
          </Tabs>

          <div
            className="flex min-h-0 gap-3"
            style={{ height: 'calc(100vh - 18rem)' }}
          >
            <div className="relative min-h-[480px] flex-1">
              <GroupMembershipFlowChart
                variant="membership"
                selectedGroupId={resolvedGroupId}
                onGroupChange={setGroupId}
                selectedEmployeeId={selectedEmployeeId}
                onNodeSelect={setSelectedEmployeeId}
                kindFilter={membershipKind === 'all' ? undefined : membershipKind}
              />
            </div>
          </div>

          {/* 職能視角輕量訊號：覆蓋缺口與跨職能負載（全部／職能過濾時顯示） */}
          {membershipKind !== 'department' && (
            <FunctionCoveragePanel data={orgData} />
          )}
        </TabsContent>
      </Tabs>

      <WorkbenchGuideLinks />
    </div>
  );
}

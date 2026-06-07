import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { EmployeeNode } from '../orgFlow/EmployeeNode';
import { ReportingEdge } from '../orgFlow/ReportingEdge';
import {
  OrgFlowFullscreenButton,
  OrgFlowMiniMap,
} from '../orgFlow/OrgFlowChartChrome';
import { OrgFlowControlBar, type OrgFlowNavMode } from '../orgFlow/OrgFlowControlBar';
import { ORG_FLOW_NAV_PROPS } from '../orgFlow/orgFlowNav';
import { OrgChartGroupSelector } from '../orgFlow/OrgChartGroupSelector';
import { OrgDetailPanel } from '../orgFlow/OrgDetailPanel';
import { GroupZoneNode, type GroupZoneRenderData } from './GroupZoneNode';
import { GroupOrgLegendInfo } from './GroupOrgLegendInfo';
import { buildGroupOrgGraph } from '../../services/buildGroupOrgGraph';
import { buildNodeDiffMap } from '../../services/computeOrgDiff';
import { createEmptyAssignment } from '../../services/orgOperations';
import type { OrgData } from '../../types/org';
import type { OrgDiffResult } from '../../types/editSession';

// nodeTypes/edgeTypes 為 module 常數（穩定參考），避免每 render 重建造成 React Flow 警告。
const nodeTypes = { employee: EmployeeNode, groupZone: GroupZoneNode } as const;
const edgeTypes = { reporting: ReportingEdge } as const;

// 唯讀詳情用的 no-op save（OrgDetailPanel 在 isEditMode=false 下永不呼叫；僅滿足必填型別）。
const NO_OP_SAVE = (): string | null => null;

export interface GroupOrgFlowChartProps {
  /** 目前選定組別（ALL_GROUPS_VIEW_ID＝全公司各組並列，或單一 groupId）。 */
  selectedGroupId: string;
  /** 使用者切換檢視組別。 */
  onGroupChange: (groupId: string) => void;
  /** 目前選定員工節點（lift 至頁面，供右側面板取用）。 */
  selectedEmployeeId: string | null;
  /** 員工節點選取變更。 */
  onNodeSelect: (employeeId: string | null) => void;
  /** 圖資料源（唯讀；工作台中為 draft 或已發佈資料）。 */
  orgData: OrgData;
  /** 差異預覽（若編輯 session 有 diff，著色成員節點；唯讀視圖仍可呈現）。 */
  diffResult?: OrgDiffResult | null;
}

function GroupFlowInner({
  selectedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
  orgData,
  diffResult,
}: GroupOrgFlowChartProps) {
  const { fitView } = useReactFlow();

  const activeGroups = useMemo(
    () => orgData.groups.filter((g) => g.status === 'active'),
    [orgData.groups],
  );

  // 組別為主佈局（重用 D1 buildGroupOrgGraph）。
  const { nodes: builtNodes, edges, error } = useMemo(
    () => buildGroupOrgGraph(orgData, selectedGroupId),
    [orgData, selectedGroupId],
  );

  // 差異著色（成員節點）：成員節點 id 已作用域化，但 buildNodeDiffMap 以 employeeId
  // 比對 diff 集合 → 用裸 employeeId（node.data.employee.id）建表與查表。
  const diffMap = useMemo(() => {
    if (!diffResult) return undefined;
    const employeeIds = builtNodes
      .filter((n) => n.type === 'employee')
      .map((n) => (n.data as { employee: { id: string } }).employee.id);
    return buildNodeDiffMap(diffResult, employeeIds);
  }, [diffResult, builtNodes]);

  // 員工姓名查表（供 groupZone 角落標籤把 leaderId/coLeaderIds 解析成姓名）。
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of orgData.employees) m.set(e.id, e.name);
    return m;
  }, [orgData.employees]);

  /**
   * 對 D1 輸出做兩件唯讀後處理（不改 buildGroupOrgGraph）：
   * 1. groupZone 背景節點：注入 leaderName/coLeaderNames（由姓名查表解析）。
   *    （不可選/不可拖/低層等已由 D1 在 node 上設定，此處沿用、僅補姓名。）
   * 2. employee 節點：注入 diffStatus（若有 diff）。
   *
   * 維持「分區背景在前、攤平成員在後」的輸出順序（D1 已如此）：成員為頂層節點、
   * 無 parentId，順序僅影響 DOM 繪製；配合 D1 設的 zIndex 確保成員疊在分區之上。
   */
  const nodes = useMemo<Node[]>(() => {
    const zones: Node[] = [];
    const members: Node[] = [];
    for (const n of builtNodes) {
      if (n.type === 'groupZone') {
        const gd = n.data as GroupZoneRenderData;
        const renderData: GroupZoneRenderData = {
          ...gd,
          leaderName: gd.leaderId != null ? nameById.get(gd.leaderId) ?? null : null,
          coLeaderNames: gd.coLeaderIds.map((id) => nameById.get(id) ?? id),
        };
        zones.push({ ...n, data: renderData });
      } else {
        const employeeId = (n.data as { employee: { id: string } }).employee.id;
        const child = diffMap
          ? { ...n, data: { ...n.data, diffStatus: diffMap.get(employeeId) } }
          : n;
        // D2 唯讀：成員節點可被選取（顯示詳情）但不可拖曳。
        members.push({ ...child, draggable: false });
      }
    }
    return [...zones, ...members];
  }, [builtNodes, nameById, diffMap]);

  // 切換組別 / 資料更新後置中（與 reporting 視圖一致的 fitView 行為）。
  useEffect(() => {
    if (nodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [nodes, edges, fitView, selectedGroupId]);

  const [showMiniMap, setShowMiniMap] = useState(true);
  const [navMode, setNavMode] = useState<OrgFlowNavMode>('mouse');

  const containerRef = useRef<HTMLDivElement>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const setChartContainer = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    setPortalContainer(node);
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // 分區背景不可選（理論上 pointer-events-none 不會觸發）；防呆視為清空。
      // 成員節點 id 已作用域化（${groupId}::${employeeId}）→ 上拋原 employeeId
      // （OrgDetailPanel 以 employeeId 解析），取自 node.data.employee.id。
      if (node.type === 'groupZone') {
        onNodeSelect(null);
        return;
      }
      const data = node.data as { employee: { id: string } };
      onNodeSelect(data.employee.id);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
  }, [onNodeSelect]);

  const hasDetail = !!selectedEmployeeId;

  return (
    <div
      ref={setChartContainer}
      className={cn(
        'org-flow-chart relative h-full min-h-[480px] overflow-hidden rounded-xl border border-border bg-background shadow-sm',
        isFullscreen && 'org-flow-chart--fullscreen',
      )}
    >
      <ReactFlow
        colorMode="light"
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes as import('@xyflow/react').NodeTypes}
        edgeTypes={edgeTypes as import('@xyflow/react').EdgeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        minZoom={0.2}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        {...ORG_FLOW_NAV_PROPS[navMode]}
      >
        <Background gap={20} size={1} color="var(--border)" />

        <Panel position="top-left" className="org-flow-chrome-panel !m-3">
          <div className="flex flex-col items-start gap-3">
            <div
              className="flex items-center gap-2 rounded-xl border border-border bg-card/95 px-3 py-2 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <OrgChartGroupSelector
                selectedGroupId={selectedGroupId}
                onGroupChange={onGroupChange}
                activeGroups={activeGroups}
                allGroupsLabel="全公司（各組並列）"
                mountNode={portalContainer}
              />
              <GroupOrgLegendInfo />
            </div>
            {hasDetail && selectedEmployeeId && (
              <OrgDetailPanel
                employeeId={selectedEmployeeId}
                onClose={() => onNodeSelect(null)}
                portalContainer={portalContainer}
                orgData={orgData}
                // D2 唯讀：view-only 詳情；所有編輯 affordance 在 OrgDetailPanel 內由
                // isEditMode 把關，故下列 save/new 回呼在此永不被觸發（傳 no-op 滿足型別）。
                isEditMode={false}
                onSaveEmployee={NO_OP_SAVE}
                onSaveAssignment={NO_OP_SAVE}
                onNewAssignment={createEmptyAssignment}
              />
            )}
          </div>
        </Panel>

        <OrgFlowFullscreenButton isFullscreen={isFullscreen} onToggle={toggleFullscreen} />

        <Panel position="bottom-right" className="org-flow-chrome-panel !m-3">
          <div className="flex flex-col items-end gap-2">
            <OrgFlowMiniMap show={showMiniMap} onToggle={() => setShowMiniMap((v) => !v)} />
            <OrgFlowControlBar navMode={navMode} onNavModeChange={setNavMode} />
          </div>
        </Panel>
      </ReactFlow>

      {error && (
        <Alert
          variant="destructive"
          className="absolute bottom-3 left-3 right-3 z-10 border-destructive/30 bg-card/95 shadow-md backdrop-blur-sm"
        >
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}

/**
 * 組別為主組織圖（**唯讀**）：一張連貫的組織圖（每人一攤平節點、匯報線含跨組）+
 * 同組背景分區（泳道感淡色色塊 + 角落「組名・組長」標籤）。組長/co-leader 在分區
 * 角落標籤以徽章標示、co-leader 與組長平行同層。X 軸吸附到共用欄位刻度使整體工整。
 *
 * 與 `OrgFlowChart`（reporting，可編輯）的差異：
 * - nodeTypes 含 `groupZone`（背景分區、低層不互動）；資料源為 `buildGroupOrgGraph`。
 * - **不接任何編輯手勢**（無 onNodeDragStop/onConnect/onEdgesDelete、nodesDraggable=false）；
 *   拖曳改組為 Phase E。
 * - 保留檢視 chrome：組別選擇、pan/zoom、fitView、MiniMap、控制列、全螢幕、節點詳情。
 */
export function GroupOrgFlowChart(props: GroupOrgFlowChartProps) {
  return (
    <ReactFlowProvider>
      <GroupFlowInner {...props} />
    </ReactFlowProvider>
  );
}

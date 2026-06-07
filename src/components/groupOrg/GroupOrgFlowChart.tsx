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
import { GroupBoxNode, type GroupBoxRenderData } from './GroupBoxNode';
import { GroupOrgLegendInfo } from './GroupOrgLegendInfo';
import { buildGroupOrgGraph } from '../../services/buildGroupOrgGraph';
import { buildNodeDiffMap } from '../../services/computeOrgDiff';
import { createEmptyAssignment } from '../../services/orgOperations';
import type { OrgData } from '../../types/org';
import type { OrgDiffResult } from '../../types/editSession';

// nodeTypes/edgeTypes 為 module 常數（穩定參考），避免每 render 重建造成 React Flow 警告。
const nodeTypes = { employee: EmployeeNode, groupBox: GroupBoxNode } as const;
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

  // 員工姓名查表（供 groupBox 標題列把 leaderId/coLeaderIds 解析成姓名）。
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of orgData.employees) m.set(e.id, e.name);
    return m;
  }, [orgData.employees]);

  /**
   * 對 D1 輸出做兩件唯讀後處理（不改 buildGroupOrgGraph）：
   * 1. groupBox 節點：注入 leaderName/coLeaderNames（由姓名查表解析）、設不可選/不可拖。
   * 2. employee 節點：注入 diffStatus（若有 diff）。
   *
   * 並做**父先排序保險**：React Flow v12 要求父節點排在子節點之前。D1 已是父先輸出，
   * 此處以 stable 分流（groupBox 全部移到前段、保留各自相對順序）再保險一次，
   * 避免日後 D1 順序變動造成 parentId 解析失敗。
   */
  const nodes = useMemo<Node[]>(() => {
    const groupBoxes: Node[] = [];
    const children: Node[] = [];
    for (const n of builtNodes) {
      if (n.type === 'groupBox') {
        const gd = n.data as GroupBoxRenderData;
        const renderData: GroupBoxRenderData = {
          ...gd,
          leaderName: gd.leaderId != null ? nameById.get(gd.leaderId) ?? null : null,
          coLeaderNames: gd.coLeaderIds.map((id) => nameById.get(id) ?? id),
        };
        groupBoxes.push({
          ...n,
          data: renderData,
          selectable: false,
          draggable: false,
          // 群組框不參與連線/刪除；純視覺容器。
          connectable: false,
          deletable: false,
        });
      } else {
        const employeeId = (n.data as { employee: { id: string } }).employee.id;
        const child = diffMap
          ? { ...n, data: { ...n.data, diffStatus: diffMap.get(employeeId) } }
          : n;
        // D2 唯讀：成員節點可被選取（顯示詳情）但不可拖曳。
        children.push({ ...child, draggable: false });
      }
    }
    return [...groupBoxes, ...children];
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
      // 群組框不可選；點到框視為清空（pane click 語意）。
      // 成員節點 id 已作用域化（${groupId}::${employeeId}）→ 上拋原 employeeId
      // （OrgDetailPanel 以 employeeId 解析），取自 node.data.employee.id。
      if (node.type === 'groupBox') {
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
 * 組別為主組織圖（**唯讀**）：每人一節點、依組別群組成群組框、組間以 department
 * parentId 連邊；組長/co-leader 在框標題列以徽章標示、co-leader 與組長平行同層。
 *
 * 與 `OrgFlowChart`（reporting，可編輯）的差異：
 * - nodeTypes 含 `groupBox`；資料源為 `buildGroupOrgGraph`。
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

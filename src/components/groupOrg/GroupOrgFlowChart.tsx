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
import { EmployeeNode, type EmployeeNodeData } from '../orgFlow/EmployeeNode';
import { ReportingEdge } from '../orgFlow/ReportingEdge';
import {
  OrgFlowFullscreenButton,
  OrgFlowMiniMap,
} from '../orgFlow/OrgFlowChartChrome';
import { OrgFlowControlBar, type OrgFlowNavMode } from '../orgFlow/OrgFlowControlBar';
import { ORG_FLOW_NAV_PROPS } from '../orgFlow/orgFlowNav';
import { OrgChartGroupSelector } from '../orgFlow/OrgChartGroupSelector';
import { OrgDetailPanel } from '../orgFlow/OrgDetailPanel';
import { useDraggableFlowNodes } from '../orgFlow/useDraggableFlowNodes';
import { GroupZoneNode, type GroupZoneRenderData } from './GroupZoneNode';
import { GroupOrgLegendInfo } from './GroupOrgLegendInfo';
import { buildGroupOrgGraph } from '../../services/buildGroupOrgGraph';
import { buildNodeDiffMap } from '../../services/computeOrgDiff';
import {
  createEmptyAssignment,
  reassignEmployeeGroup,
  reassignSupervisor,
  upsertAssignment,
  upsertEmployee,
} from '../../services/orgOperations';
import { useOrg } from '../../context/useOrg';
import type { OrgData, Assignment, Employee } from '../../types/org';
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
  /**
   * 是否處於編輯模式（true 時成員節點可拖、雙手勢分流改主管/改組）。
   * 預設 `false`（唯讀）——未傳即維持純檢視，無編輯 affordance。
   */
  isEditMode?: boolean;
  /** 圖資料源（編輯中為 draft、否則為已發佈資料）。 */
  orgData: OrgData;
  /** 差異預覽（若編輯 session 有 diff，著色成員節點）。 */
  diffResult?: OrgDiffResult | null;
  /**
   * 草稿整體替換（拖曳改組/改主管等寫回草稿）。
   * 唯讀模式不會觸發；未傳時預設 no-op（僅編輯模式需要）。
   */
  onDraftChange?: (next: OrgData) => void;
}

// 唯讀模式 fallback（onDraftChange 未傳時用；isEditMode=false 下永不被觸發）。
const NO_OP_DRAFT_CHANGE = (): void => {};

function GroupFlowInner({
  selectedGroupId,
  onGroupChange,
  selectedEmployeeId,
  onNodeSelect,
  isEditMode = false,
  orgData,
  diffResult,
  onDraftChange = NO_OP_DRAFT_CHANGE,
}: GroupOrgFlowChartProps) {
  const { operator } = useOrg();
  const { fitView, getIntersectingNodes } = useReactFlow();
  /** drag-to-reassign 失敗時的短暫提示（循環/inactive/重複/自我）；成功則清空。 */
  const [reassignError, setReassignError] = useState<string | null>(null);
  /** 拖曳過程中懸停可放置的目標節點 id（員工或分區皆可高亮），未懸停為 null。 */
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

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
   * 對 D1 輸出做唯讀後處理（不改 buildGroupOrgGraph）：
   * 1. groupZone 背景節點：注入 leaderName/coLeaderNames（由姓名查表解析）。
   * 2. employee 節點：注入 diffStatus（若有 diff）；編輯模式下設 `draggable`——
   *    但 **co-leader 成員（assignmentId 為空、無本組歸屬）不可拖**（無可改的歸屬）。
   *
   * 維持「分區背景在前、攤平成員在後」的輸出順序（D1 已如此）：成員為頂層節點、
   * 無 parentId，順序僅影響 DOM 繪製；配合 D1 設的 zIndex 確保成員疊在分區之上。
   */
  const computedNodes = useMemo<Node[]>(() => {
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
        // 分區在編輯模式下作為「改組」drop target：須可被 getIntersectingNodes 命中
        // （selectable/draggable/connectable 維持 false，僅當落點偵測對象）。
        zones.push({ ...n, data: renderData });
      } else {
        const md = n.data as EmployeeNodeData;
        const employeeId = md.employee.id;
        const withDiff = diffMap
          ? { ...n, data: { ...n.data, diffStatus: diffMap.get(employeeId) } }
          : n;
        // 編輯模式：有本組歸屬（assignmentId 非空）的成員可拖；co-leader（空 assignmentId）
        // 與唯讀模式皆不可拖。
        const draggable = isEditMode && md.assignmentId !== '';
        members.push({ ...withDiff, draggable });
      }
    }
    return [...zones, ...members];
  }, [builtNodes, nameById, diffMap, isEditMode]);

  // 編輯模式：以拖曳狀態承載成員位置（resetKey=selectedGroupId；組別視圖無「拖層級」
  // 語意，故不傳 snapStep）。唯讀模式 preserveDraggedPositions=false 永遠跟隨計算位置。
  const { nodes: draggableNodes, onNodesChange } = useDraggableFlowNodes(
    computedNodes,
    selectedGroupId,
    undefined,
    isEditMode,
  );

  // 把 drag-to-reassign 懸停高亮注入節點 data（不改動拖曳位置狀態）。
  // 員工與分區皆可高亮（分別由各自元件依 isDropTarget 呈現樣式）。
  const nodes = useMemo<Node[]>(() => {
    if (!dropTargetId) return draggableNodes;
    return draggableNodes.map((n) =>
      n.id === dropTargetId
        ? { ...n, data: { ...n.data, isDropTarget: true } }
        : n,
    );
  }, [draggableNodes, dropTargetId]);

  /**
   * 取被拖節點重疊的 drop target：**員工優先（改主管）、否則分區（改組）**。
   * 過濾掉自己。員工命中取最上層（z 序末筆）；無員工命中時退回分區命中（取末筆）。
   */
  const findDropTarget = useCallback(
    (node: Node): Node | null => {
      const hits = getIntersectingNodes(node, false).filter(
        (n) => n.id !== node.id,
      );
      if (hits.length === 0) return null;
      const employeeHits = hits.filter((n) => n.type === 'employee');
      if (employeeHits.length > 0) {
        // 落在他人節點上＝改主管；取最上層（後繪在上）。
        return employeeHits[employeeHits.length - 1];
      }
      const zoneHits = hits.filter((n) => n.type === 'groupZone');
      if (zoneHits.length > 0) {
        // 僅落在分區空白＝改組；取末筆。
        return zoneHits[zoneHits.length - 1];
      }
      return null;
    },
    [getIntersectingNodes],
  );

  /** 把某節點視覺位置回滾到 computed 佈局（避免拖拉失敗後停在亂位）。 */
  const resetNodePosition = useCallback(
    (nodeId: string) => {
      const computed = computedNodes.find((n) => n.id === nodeId);
      if (!computed) return;
      onNodesChange([
        { id: nodeId, type: 'position', position: { ...computed.position } },
      ]);
    },
    [computedNodes, onNodesChange],
  );

  const onNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent | React.MouseEvent, node: Node) => {
      if (!isEditMode) return;
      const target = findDropTarget(node);
      setDropTargetId((prev) =>
        prev === (target?.id ?? null) ? prev : target?.id ?? null,
      );
    },
    [isEditMode, findDropTarget],
  );

  const onNodeDragStop = useCallback(
    (_: MouseEvent | TouchEvent | React.MouseEvent, node: Node) => {
      if (!isEditMode) {
        setDropTargetId(null);
        return;
      }
      const d = node.data as EmployeeNodeData;

      // co-leader（無本組歸屬、assignmentId 為空）：無可改的歸屬 → 回滾、不處理。
      // （理論上 draggable=false 已擋住，仍守一層。）
      if (d.assignmentId === '') {
        resetNodePosition(node.id);
        setDropTargetId(null);
        return;
      }

      // 所見即所得：drop 命中優先採用 onNodeDrag 高亮時已算好的 dropTargetId，
      // 避免 z 序變動造成「高亮的」與「實際命中的」不一致；為 null 時 fallback 重算。
      const targetId = dropTargetId ?? findDropTarget(node)?.id ?? null;
      const target = targetId
        ? nodes.find((n) => n.id === targetId) ?? null
        : null;

      if (target && target.type === 'employee') {
        // 命中員工：改主管。drop target 的 employee.id 即新主管 employeeId
        //（成員節點 id 為作用域化、不可直接當 employeeId）。
        const newSupervisorId = (target.data as EmployeeNodeData).employee.id;
        const result = reassignSupervisor(
          orgData,
          d.assignmentId,
          newSupervisorId,
          operator,
        );
        if (result.error) {
          setReassignError(result.error);
          resetNodePosition(node.id);
        } else {
          setReassignError(null);
          onDraftChange(result.data);
        }
        setDropTargetId(null);
        return;
      }

      if (target && target.type === 'groupZone') {
        // 命中分區空白：改組。分區 data.groupId 為該分區組 id。
        const newGroupId = (target.data as { groupId: string }).groupId;
        const result = reassignEmployeeGroup(
          orgData,
          d.assignmentId,
          newGroupId,
          operator,
        );
        if (result.error) {
          setReassignError(result.error);
          resetNodePosition(node.id);
        } else {
          // 同組 no-op（error:null 且資料未變）→ 回滾位置即可，無需提交。
          if (result.data === orgData) {
            resetNodePosition(node.id);
          } else {
            setReassignError(null);
            onDraftChange(result.data);
          }
        }
        setDropTargetId(null);
        return;
      }

      // 未命中任何 drop target：組別視圖無「拖層級」語意 → 回滾被拖節點位置。
      resetNodePosition(node.id);
      setDropTargetId(null);
    },
    [
      isEditMode,
      orgData,
      operator,
      onDraftChange,
      findDropTarget,
      resetNodePosition,
      dropTargetId,
      nodes,
    ],
  );

  // 切換組別 / 資料更新後置中（與 reporting 視圖一致的 fitView 行為）。
  useEffect(() => {
    if (computedNodes.length > 0) {
      const t = setTimeout(() => fitView({ padding: 0.2 }), 80);
      return () => clearTimeout(t);
    }
  }, [computedNodes, edges, fitView, selectedGroupId]);

  // drag-to-reassign 失敗提示：數秒後自動消失。
  useEffect(() => {
    if (!reassignError) return;
    const t = setTimeout(() => setReassignError(null), 4000);
    return () => clearTimeout(t);
  }, [reassignError]);

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

  // 詳情面板存檔（編輯模式寫回 draft；唯讀模式 OrgDetailPanel 內由 isEditMode 把關不觸發）。
  const handleSaveEmployee = useCallback(
    (employee: Employee, isNew: boolean): string | null => {
      const result = upsertEmployee(orgData, employee, operator, isNew);
      if (result.error) return result.error;
      onDraftChange(result.data);
      return null;
    },
    [orgData, operator, onDraftChange],
  );

  const handleSaveAssignment = useCallback(
    (assignment: Assignment, isNew: boolean): string | null => {
      const result = upsertAssignment(orgData, assignment, operator, isNew);
      if (result.error) return result.error;
      onDraftChange(result.data);
      return null;
    },
    [orgData, operator, onDraftChange],
  );

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
        onNodesChange={onNodesChange as import('@xyflow/react').OnNodesChange}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={onPaneClick}
        nodesDraggable={isEditMode}
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
                isEditMode={isEditMode}
                onSaveEmployee={isEditMode ? handleSaveEmployee : NO_OP_SAVE}
                onSaveAssignment={isEditMode ? handleSaveAssignment : NO_OP_SAVE}
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

      {reassignError && (
        <Alert
          variant="destructive"
          role="alert"
          className="absolute left-3 right-3 top-3 z-10 border-destructive/30 bg-card/95 shadow-md backdrop-blur-sm"
        >
          <AlertDescription>{reassignError}</AlertDescription>
        </Alert>
      )}

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
 * 組別為主組織圖：一張連貫的組織圖（每人一攤平節點、匯報線含跨組）+ 同組背景分區
 *（泳道感淡色色塊 + 角落「組名・組長」標籤）。組長/co-leader 在分區角落以徽章標示、
 * 與組長平行同層；X 軸吸附共用欄位刻度使整體工整。
 *
 * 編輯能力（Phase E）：`isEditMode` 時成員節點可拖，`onNodeDragStop` 雙手勢分流——
 * - drop 命中**他人員工節點** → 改主管（`reassignSupervisor`，沿用 reporting 契約）。
 * - drop 僅落在**分區空白** → 改組別（`reassignEmployeeGroup`）。
 * - 未命中 → 回滾位置（組別視圖無「拖層級」語意）。
 * 失敗（循環/inactive/重複歸屬/自我）→ 回滾被拖節點位置 + 短暫 role="alert" 提示。
 * co-leader 成員（無本組歸屬）不可拖。**reporting 視圖 `OrgFlowChart` 完全不動。**
 *
 * 與 `OrgFlowChart`（reporting）差異：nodeTypes 含 `groupZone`（背景分區、低層）；
 * 資料源為 `buildGroupOrgGraph`；無 onConnect/onEdgesDelete（組別視圖不直接連/刪匯報線）。
 */
export function GroupOrgFlowChart(props: GroupOrgFlowChartProps) {
  return (
    <ReactFlowProvider>
      <GroupFlowInner {...props} />
    </ReactFlowProvider>
  );
}

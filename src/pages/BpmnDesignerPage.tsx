import { useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Save, Settings2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useBpmn } from '../context/useBpmn';
import { useOrg } from '../context/useOrg';
import { BpmnCanvas } from '../components/bpmn/BpmnCanvas';
import { BpmnPropertiesPanel } from '../components/bpmn/BpmnPropertiesPanel';
import { ApprovalThresholdEditor } from '../components/bpmn/ApprovalThresholdEditor';
import type { BpmnFlowEdge, BpmnFlowNode, BpmnNodeType } from '../types/bpmn';

const PALETTE_ITEMS: { type: BpmnNodeType; label: string; color: string; desc: string }[] = [
  { type: 'bpmnUserTask', label: '人工任務', color: 'bg-blue-50 border-blue-300 text-blue-700', desc: '需人員執行的任務' },
  { type: 'bpmnServiceTask', label: '系統任務', color: 'bg-violet-50 border-violet-300 text-violet-700', desc: '系統自動執行' },
  { type: 'bpmnExclusiveGateway', label: 'XOR 閘', color: 'bg-amber-50 border-amber-300 text-amber-700', desc: '條件分支（擇一）' },
  { type: 'bpmnParallelGateway', label: 'AND 閘', color: 'bg-teal-50 border-teal-300 text-teal-700', desc: '並行分支' },
  { type: 'bpmnStart', label: '開始事件', color: 'bg-emerald-50 border-emerald-300 text-emerald-700', desc: '流程起點' },
  { type: 'bpmnEnd', label: '結束事件', color: 'bg-rose-50 border-rose-300 text-rose-700', desc: '流程終點' },
];

export function BpmnDesignerPage() {
  const { processId } = useParams<{ processId: string }>();
  const { store, upsertProcess } = useBpmn();
  const { data } = useOrg();
  const navigate = useNavigate();

  const process = store.processes.find((p) => p.id === processId);

  const [nodes, setNodes] = useState<BpmnFlowNode[]>(process?.nodes ?? []);
  const [edges, setEdges] = useState<BpmnFlowEdge[]>(process?.edges ?? []);
  const [name, setName] = useState(process?.name ?? '');
  const [description, setDescription] = useState(process?.description ?? '');
  const [category, setCategory] = useState(process?.category ?? '一般');
  const [thresholds, setThresholds] = useState(process?.approvalThresholds ?? []);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<'properties' | 'thresholds'>('properties');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const selectedEdge = edges.find((e) => e.id === selectedEdgeId) ?? null;

  const handleNodeSelect = useCallback((id: string | null) => {
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    if (id) setRightTab('properties');
  }, []);

  const addNode = useCallback((type: BpmnNodeType, label: string) => {
    const id = `n-${Date.now()}`;
    const newNode: BpmnFlowNode = {
      id,
      type,
      position: { x: 250 + Math.random() * 60 - 30, y: 150 + Math.random() * 60 - 30 },
      data: { label, taskType: type === 'bpmnUserTask' ? 'approve' : undefined },
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  }, []);

  function handleNodeChange(updated: BpmnFlowNode) {
    setNodes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  function handleEdgeChange(updated: BpmnFlowEdge) {
    setEdges((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  function handleSave() {
    if (!process) return;
    upsertProcess({
      ...process,
      name,
      description,
      category,
      status: process.status ?? 'active',
      version: (process.version ?? 0) + 1,
      nodes,
      edges,
      approvalThresholds: thresholds,
      updatedAt: new Date().toISOString(),
    });
  }

  if (!process) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">找不到此流程</p>
        <Button onClick={() => navigate('/bpmn')}>返回列表</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-0 -m-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate('/bpmn')}>
          <ArrowLeft className="size-4" />返回
        </Button>
        <div className="h-5 w-px bg-border" />
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 w-48 text-sm font-medium border-0 shadow-none px-1 focus-visible:ring-1"
          placeholder="流程名稱"
        />
        <Input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="h-7 w-24 text-sm border-0 shadow-none px-1 focus-visible:ring-1 text-muted-foreground"
          placeholder="類別"
        />
        <div className="flex-1" />
        <Badge variant="secondary" className="text-[10px]">{nodes.length} 節點 · {edges.length} 連線</Badge>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/bpmn/${processId}/simulate`)}>
          <Play className="size-3.5" />模擬
        </Button>
        <Button size="sm" className="gap-1.5" onClick={handleSave}>
          <Save className="size-3.5" />儲存
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: Palette */}
        <aside className="flex w-44 shrink-0 flex-col border-r border-border bg-sidebar">
          <div className="border-b border-border px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">元素面板</p>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {PALETTE_ITEMS.map((item) => (
                <button
                  key={item.type}
                  onClick={() => addNode(item.type, item.label)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors hover:opacity-80 ${item.color}`}
                >
                  <p className="text-xs font-semibold">{item.label}</p>
                  <p className="text-[10px] opacity-70">{item.desc}</p>
                </button>
              ))}
            </div>
          </ScrollArea>
          <div className="border-t border-border p-2">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-7 text-xs"
              placeholder="流程說明…"
            />
          </div>
        </aside>

        {/* Center: Canvas */}
        <main className="flex-1 min-w-0 relative">
          <BpmnCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            onNodeSelect={handleNodeSelect}
          />
          {/* Canvas hint */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <Badge variant="muted" className="text-[10px] opacity-70">
              點擊元素面板新增節點 · 拖曳連接節點 · 點選查看屬性
            </Badge>
          </div>
        </main>

        {/* Right: Properties */}
        <aside className="flex w-56 shrink-0 flex-col border-l border-border bg-sidebar">
          <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)}>
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-9">
              <TabsTrigger value="properties" className="flex-1 text-xs gap-1">
                <Settings2 className="size-3" />屬性
              </TabsTrigger>
              <TabsTrigger value="thresholds" className="flex-1 text-xs gap-1">
                <ChevronRight className="size-3" />核決金額
              </TabsTrigger>
            </TabsList>
            <TabsContent value="properties" className="flex-1 m-0 h-[calc(100%-36px)]">
              <BpmnPropertiesPanel
                node={selectedNode}
                edge={selectedEdge}
                jobLevels={data.jobLevels}
                onNodeChange={handleNodeChange}
                onEdgeChange={handleEdgeChange}
              />
            </TabsContent>
            <TabsContent value="thresholds" className="m-0 p-3 h-[calc(100%-36px)] overflow-auto">
              <ApprovalThresholdEditor
                thresholds={thresholds}
                jobLevels={data.jobLevels}
                onChange={setThresholds}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

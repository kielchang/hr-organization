import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RotateCcw, History, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBpmn } from '../context/BpmnProvider';
import { useOrg } from '../context/useOrg';
import { BpmnCanvas } from '../components/bpmn/BpmnCanvas';
import { SimulationExpenseForm } from '../components/bpmn/simulation/SimulationExpenseForm';
import { SimulationStepPanel } from '../components/bpmn/simulation/SimulationStepPanel';
import { createSimulationSession } from '../services/bpmnSimulator';
import { fmtAmount } from '../services/bpmnSimulator';
import type { ExpenseFormData, SimulationSession } from '../types/bpmn';

export function BpmnSimulatePage() {
  const { processId } = useParams<{ processId: string }>();
  const { store, setSession, updateSession, addToHistory } = useBpmn();
  const { data } = useOrg();
  const navigate = useNavigate();

  const process = store.processes.find((p) => p.id === processId);
  const [session, setLocalSession] = useState<SimulationSession | null>(null);
  const [phase, setPhase] = useState<'form' | 'running'>('form');
  const [leftTab, setLeftTab] = useState<'sim' | 'history'>('sim');
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  const activeEmployees = data.employees.filter((e) => e.status === 'active');

  // 此流程的歷史紀錄
  const processHistory = store.simulationHistory.filter((s) => s.processId === processId);

  if (!process) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">找不到此流程</p>
        <Button onClick={() => navigate('/bpmn')}>返回列表</Button>
      </div>
    );
  }

  function handleFormSubmit(form: ExpenseFormData) {
    const s = createSimulationSession(process!, form, data);
    setLocalSession(s);
    setSession(s);
    setPhase('running');
  }

  function handleUpdate(updated: SimulationSession) {
    setLocalSession(updated);
    updateSession(updated);
    // 完成後加入歷史
    if (updated.status === 'approved' || updated.status === 'rejected') {
      addToHistory(updated);
    }
  }

  function handleReset() {
    setLocalSession(null);
    setSession(null);
    setPhase('form');
  }

  const highlightedNodeIds = session
    ? [
        ...session.logs.map((l) => l.nodeId),
        session.resolvedPath[session.currentStep],
      ].filter(Boolean)
    : [];

  // 核決金額提示（依 approvalThresholds + jobLevel rank 排序）
  const sortedLevels = [...data.jobLevels].sort((a, b) => a.rank - b.rank);
  const thresholdHints = sortedLevels
    .map((jl) => {
      const t = process.approvalThresholds.find((t) => t.jobLevelId === jl.id);
      return t && t.maxApprovalAmount > 0 ? { label: jl.name, max: t.maxApprovalAmount } : null;
    })
    .filter((x): x is { label: string; max: number } => x !== null)
    .sort((a, b) => a.max - b.max);

  return (
    <div className="flex h-full flex-col -m-6">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2 shrink-0">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate('/bpmn')}>
          <ArrowLeft className="size-4" />返回
        </Button>
        <div className="h-5 w-px bg-border" />
        <p className="font-semibold text-sm">{process.name}</p>
        <Badge variant="secondary" className="text-[10px]">{process.category}</Badge>
        {processHistory.length > 0 && (
          <Badge variant="muted" className="text-[10px] gap-1">
            <History className="size-3" />{processHistory.length} 筆紀錄
          </Badge>
        )}
        <div className="flex-1" />
        {phase === 'running' && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReset}>
            <RotateCcw className="size-3.5" />重新模擬
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => navigate(`/bpmn/${processId}`)}>
          <Pencil className="size-3.5" />編輯流程
        </Button>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left: 模擬 + 歷史頁籤 */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar overflow-hidden">
          <Tabs value={leftTab} onValueChange={(v) => setLeftTab(v as typeof leftTab)}>
            <TabsList className="w-full rounded-none border-b border-border bg-transparent h-9 shrink-0">
              <TabsTrigger value="sim" className="flex-1 text-xs">
                {phase === 'form' ? '費用申請單' : '審核控制台'}
              </TabsTrigger>
              <TabsTrigger value="history" className="flex-1 gap-1 text-xs">
                <History className="size-3" />歷史紀錄
                {processHistory.length > 0 && (
                  <Badge variant="secondary" className="text-[9px] ml-1">{processHistory.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sim" className="m-0 flex-1 overflow-y-auto p-3 min-h-0">
              {phase === 'form' ? (
                <SimulationExpenseForm
                  employees={activeEmployees}
                  orgLookup={{
                    assignments: data.assignments,
                    jobLevels: data.jobLevels,
                    groups: data.groups,
                    employees: data.employees,
                  }}
                  onSubmit={handleFormSubmit}
                  onCancel={() => navigate('/bpmn')}
                  thresholdHints={thresholdHints.length > 0 ? thresholdHints : undefined}
                />
              ) : session ? (
                <SimulationStepPanel
                  session={session}
                  process={process}
                  employees={activeEmployees}
                  assignments={data.assignments}
                  jobLevels={data.jobLevels}
                  onUpdate={handleUpdate}
                  onReset={handleReset}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="history" className="m-0 overflow-hidden flex-1">
              <ScrollArea className="h-full">
                <div className="p-3 space-y-2">
                  {processHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">尚無已完成的模擬紀錄</p>
                  ) : (
                    processHistory.map((s) => (
                      <div key={s.id} className="rounded-lg border border-border bg-card overflow-hidden">
                        <button
                          className="w-full text-left p-2.5 hover:bg-muted/30 transition-colors"
                          onClick={() => setExpandedHistory(expandedHistory === s.id ? null : s.id)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{s.orgContext.requesterName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {fmtAmount(s.formData.amount)} · {s.formData.category}
                              </p>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-0.5">
                              {s.status === 'approved'
                                ? <Badge variant="success" className="text-[9px] gap-0.5"><CheckCircle2 className="size-2.5" />核准</Badge>
                                : <Badge variant="destructive" className="text-[9px] gap-0.5"><XCircle className="size-2.5" />拒絕</Badge>
                              }
                              <span className="text-[10px] text-muted-foreground">
                                {new Date(s.startedAt).toLocaleDateString('zh-TW')}
                              </span>
                            </div>
                          </div>
                        </button>

                        {expandedHistory === s.id && (
                          <div className="border-t border-border bg-muted/20 p-2 space-y-1.5 text-xs">
                            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                              <span className="text-muted-foreground">部門</span>
                              <span>{s.orgContext.requesterPrimaryGroupName}</span>
                              <span className="text-muted-foreground">職等</span>
                              <span>{s.orgContext.requesterJobLevelName}</span>
                              {s.orgContext.requesterDirectSupervisorName && (
                                <>
                                  <span className="text-muted-foreground">直屬主管</span>
                                  <span>{s.orgContext.requesterDirectSupervisorName}</span>
                                </>
                              )}
                              <span className="text-muted-foreground">完成時間</span>
                              <span>{s.completedAt ? new Date(s.completedAt).toLocaleTimeString('zh-TW') : '—'}</span>
                            </div>
                            <div className="space-y-1 pt-1">
                              <p className="font-medium text-muted-foreground">核准紀錄</p>
                              {s.logs.map((log, i) => (
                                <div key={i} className="flex items-start justify-between gap-2">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <Clock className="size-2.5 shrink-0" />
                                    {log.nodeLabel}
                                  </span>
                                  <div className="text-right shrink-0">
                                    {log.actorName && <span className="block">{log.actorName}</span>}
                                    <Badge
                                      variant={log.action === 'approved' ? 'success' : log.action === 'rejected' ? 'destructive' : 'muted'}
                                      className="text-[9px]"
                                    >
                                      {log.action === 'approved' ? '核准' : log.action === 'rejected' ? '拒絕' : '自動'}
                                    </Badge>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </aside>

        {/* Right: BPMN canvas */}
        <main className="relative flex-1 min-w-0 bg-background">
          <BpmnCanvas
            nodes={process.nodes}
            edges={process.edges}
            highlightedNodeIds={highlightedNodeIds}
            readonly
          />
          {/* 圖例 */}
          <div className="absolute right-3 top-3 pointer-events-none">
            <div className="rounded-lg border border-border bg-card/90 px-2.5 py-1.5 shadow-sm backdrop-blur text-[10px] space-y-1">
              <p className="font-semibold text-muted-foreground">圖例</p>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border-2 border-amber-400 bg-amber-50 shrink-0" />當前節點
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded border-2 border-emerald-400 bg-emerald-50 shrink-0" />已完成
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

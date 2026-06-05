import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useBpmn } from '../context/BpmnProvider';
import { useOrg } from '../context/useOrg';
import { BpmnCanvas } from '../components/bpmn/BpmnCanvas';
import { SimulationExpenseForm } from '../components/bpmn/simulation/SimulationExpenseForm';
import { SimulationStepPanel } from '../components/bpmn/simulation/SimulationStepPanel';
import { createSimulationSession } from '../services/bpmnSimulator';
import type { ExpenseFormData, SimulationSession } from '../types/bpmn';

export function BpmnSimulatePage() {
  const { processId } = useParams<{ processId: string }>();
  const { store, setSession, updateSession } = useBpmn();
  const { data } = useOrg();
  const navigate = useNavigate();

  const process = store.processes.find((p) => p.id === processId);
  const [session, setLocalSession] = useState<SimulationSession | null>(null);
  const [phase, setPhase] = useState<'form' | 'running'>('form');

  const activeEmployees = data.employees.filter((e) => e.status === 'active');

  if (!process) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-muted-foreground">找不到此流程</p>
        <Button onClick={() => navigate('/bpmn')}>返回列表</Button>
      </div>
    );
  }

  function handleFormSubmit(form: ExpenseFormData) {
    const s = createSimulationSession(process!, form);
    setLocalSession(s);
    setSession(s);
    setPhase('running');
  }

  function handleUpdate(updated: SimulationSession) {
    setLocalSession(updated);
    updateSession(updated);
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

  // Build threshold hints for form (sorted ascending)
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
        {/* Left: Form or Step panel */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar overflow-hidden">
          <div className="border-b border-border px-3 py-2 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {phase === 'form' ? '費用申請單' : '審核控制台'}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
            {phase === 'form' ? (
              <SimulationExpenseForm
                employees={activeEmployees}
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
          </div>
        </aside>

        {/* Right: BPMN canvas */}
        <main className="flex-1 min-w-0 relative bg-background">
          <BpmnCanvas
            nodes={process.nodes}
            edges={process.edges}
            highlightedNodeIds={highlightedNodeIds}
            readonly
          />
          {/* Legend */}
          <div className="absolute top-3 right-3 flex flex-col gap-1 text-[10px] pointer-events-none">
            <div className="rounded-lg border border-border bg-card/90 backdrop-blur px-2.5 py-1.5 space-y-1 shadow-sm">
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

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import type { BpmnProcess, SimulationSession } from '../../../types/bpmn';
import type { Assignment, Employee, JobLevel } from '../../../types/org';
import { advanceSession, isInteractiveNode, fmtAmount } from '../../../services/bpmnSimulator';

interface Props {
  session: SimulationSession;
  process: BpmnProcess;
  employees: Employee[];
  assignments: Assignment[];
  jobLevels: JobLevel[];
  onUpdate: (session: SimulationSession) => void;
  onReset: () => void;
}

function statusBadge(status: SimulationSession['status']) {
  if (status === 'approved') return <Badge variant="success">已核准</Badge>;
  if (status === 'rejected') return <Badge variant="destructive">已拒絕</Badge>;
  return <Badge variant="warning">審核中</Badge>;
}

export function SimulationStepPanel({ session, process, employees, assignments, jobLevels, onUpdate, onReset }: Props) {
  const [note, setNote] = useState('');
  const [actorId, setActorId] = useState<string>('');

  const currentNodeId = session.resolvedPath[session.currentStep];
  const currentNode = process.nodes.find((n) => n.id === currentNodeId);
  const isInteractive = currentNode ? isInteractiveNode(currentNode) : false;
  const isDone = session.status !== 'running';

  // find eligible approvers for current node
  const assigneeJobLevelIds = (currentNode?.data.assigneeJobLevelIds as string[]) ?? [];
  const eligibleEmployees = employees.filter((emp) =>
    assignments.some(
      (a) => a.employeeId === emp.id && assigneeJobLevelIds.includes(a.jobLevelId),
    ),
  );

  function getJobLevelName(empId: string) {
    const a = assignments.find((a) => a.employeeId === empId && assigneeJobLevelIds.includes(a.jobLevelId));
    return a ? (jobLevels.find((jl) => jl.id === a.jobLevelId)?.name ?? '') : '';
  }

  function act(action: 'approved' | 'rejected' | 'auto') {
    const actor = employees.find((e) => e.id === actorId);
    const updated = advanceSession(session, process, action, actor?.name, actor ? getJobLevelName(actor.id) : undefined, note || undefined);
    onUpdate(updated);
    setNote('');
    setActorId('');
  }

  // auto-advance non-interactive nodes
  function autoAdvance() {
    const updated = advanceSession(session, process, 'auto');
    onUpdate(updated);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">模擬進度</p>
          <div className="flex items-center gap-2">
            {statusBadge(session.status)}
            <span className="text-xs text-muted-foreground">
              {session.currentStep} / {session.resolvedPath.length - 1} 步
            </span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>重設</Button>
      </div>

      {/* Form summary */}
      <div className="shrink-0 rounded-lg border border-border bg-muted/30 p-2 text-xs space-y-0.5">
        <div className="flex justify-between">
          <span className="text-muted-foreground">申請金額</span>
          <span className="font-semibold">{fmtAmount(session.formData.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">類別</span>
          <span>{session.formData.category}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">說明</span>
          <span className="truncate max-w-[120px]">{session.formData.description}</span>
        </div>
      </div>

      {/* Path steps */}
      <div className="shrink-0 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">核決路徑</p>
        <div className="flex flex-wrap gap-1">
          {session.resolvedPath.map((nid, i) => {
            const n = process.nodes.find((x) => x.id === nid);
            const done = i < session.currentStep;
            const current = i === session.currentStep;
            return (
              <span
                key={nid}
                className={`rounded px-1.5 py-0.5 text-[10px] border ${
                  current ? 'border-amber-400 bg-amber-50 font-semibold text-amber-800' :
                  done ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                  'border-border bg-muted/30 text-muted-foreground'
                }`}
              >
                {n?.data.label ?? nid}
              </span>
            );
          })}
        </div>
      </div>

      {/* Current action */}
      {!isDone && currentNode && (
        <div className="shrink-0 space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-amber-500" />
            <p className="text-xs font-semibold">當前：{currentNode.data.label}</p>
          </div>

          {isInteractive ? (
            <>
              {eligibleEmployees.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-muted-foreground">選擇核准人</p>
                  <Select value={actorId} onValueChange={setActorId}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="選擇人員（選填）" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleEmployees.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.name} — {getJobLevelName(e.id)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                className="text-xs resize-none"
                placeholder="備註（選填）"
              />
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1" onClick={() => act('approved')}>
                  <CheckCircle2 className="size-3.5" />核准
                </Button>
                <Button variant="destructive" size="sm" className="flex-1 gap-1" onClick={() => act('rejected')}>
                  <XCircle className="size-3.5" />拒絕
                </Button>
              </div>
            </>
          ) : (
            <Button variant="secondary" size="sm" className="w-full gap-1" onClick={autoAdvance}>
              <Zap className="size-3.5" />自動執行（系統任務）
            </Button>
          )}
        </div>
      )}

      {isDone && (
        <div className={`shrink-0 rounded-lg border p-3 text-center text-sm font-medium ${
          session.status === 'approved' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-rose-300 bg-rose-50 text-rose-700'
        }`}>
          {session.status === 'approved' ? '費用申請已核准' : '費用申請已拒絕'}
        </div>
      )}

      {/* Log */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-1">
        <p className="text-xs font-semibold text-muted-foreground">執行紀錄</p>
        {session.logs.length === 0 && (
          <p className="text-xs text-muted-foreground">尚無紀錄</p>
        )}
        {[...session.logs].reverse().map((log, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2 text-xs space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">{log.nodeLabel}</span>
              <Badge
                variant={log.action === 'approved' ? 'success' : log.action === 'rejected' ? 'destructive' : 'secondary'}
                className="text-[10px]"
              >
                {log.action === 'approved' ? '核准' : log.action === 'rejected' ? '拒絕' : log.action === 'submitted' ? '送出' : '自動'}
              </Badge>
            </div>
            {log.actorName && (
              <p className="text-muted-foreground">{log.actorName} · {log.actorJobLevel}</p>
            )}
            {log.note && <p className="text-muted-foreground italic">{log.note}</p>}
            <p className="text-muted-foreground text-[10px]">{new Date(log.timestamp).toLocaleTimeString('zh-TW')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

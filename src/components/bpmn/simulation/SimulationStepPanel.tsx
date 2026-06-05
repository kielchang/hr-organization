import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, Clock, Zap, Users, User } from 'lucide-react';
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

function resolutionModeLabel(mode?: string) {
  switch (mode) {
    case 'directSupervisor': return '直屬主管';
    case 'groupJobLevel':    return '同組職等';
    case 'orgHierarchy':     return '組織追溯';
    default:                 return '全公司職等';
  }
}

export function SimulationStepPanel({ session, process, employees, assignments, jobLevels, onUpdate, onReset }: Props) {
  const [note, setNote] = useState('');
  const [actorId, setActorId] = useState<string>('');

  const currentNodeId = session.resolvedPath[session.currentStep];
  const currentNode = process.nodes.find((n) => n.id === currentNodeId);
  const isInteractive = currentNode ? isInteractiveNode(currentNode) : false;
  const isDone = session.status !== 'running';

  // 使用預計算的 resolvedApprovers（組織感知）
  const eligibleIds: string[] = session.resolvedApprovers[currentNodeId] ?? [];
  const eligibleEmployees = employees.filter((e) => eligibleIds.includes(e.id));

  function getJobLevelName(empId: string): { name: string; id: string } {
    const assigneeJobLevelIds = (currentNode?.data.assigneeJobLevelIds as string[]) ?? [];
    // 先嘗試找符合指定職等的 assignment
    const a = assignments.find(
      (a) => a.employeeId === empId && (assigneeJobLevelIds.length === 0 || assigneeJobLevelIds.includes(a.jobLevelId)),
    ) ?? assignments.find((a) => a.employeeId === empId);
    const jl = a ? jobLevels.find((jl) => jl.id === a.jobLevelId) : undefined;
    return { name: jl?.name ?? '', id: a?.jobLevelId ?? '' };
  }

  function act(action: 'approved' | 'rejected' | 'auto') {
    const actor = employees.find((e) => e.id === actorId);
    const jl = actor ? getJobLevelName(actor.id) : { name: '', id: '' };
    const updated = advanceSession(
      session,
      process,
      action,
      actor?.id,
      actor?.name,
      jl.id || undefined,
      jl.name || undefined,
      note || undefined,
    );
    onUpdate(updated);
    setNote('');
    setActorId('');
  }

  function autoAdvance() {
    const updated = advanceSession(session, process, 'auto');
    onUpdate(updated);
  }

  const resolutionMode = currentNode?.data.approverResolution as { mode?: string } | undefined;

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

      {/* 申請人組織快照 */}
      <div className="shrink-0 rounded-lg border border-border bg-muted/30 p-2 text-xs space-y-0.5">
        <p className="font-medium text-muted-foreground mb-1">申請資訊</p>
        <div className="flex justify-between">
          <span className="text-muted-foreground">申請人</span>
          <span className="font-medium">{session.orgContext.requesterName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">部門</span>
          <span>{session.orgContext.requesterPrimaryGroupName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">職等</span>
          <span>{session.orgContext.requesterJobLevelName}</span>
        </div>
        {session.orgContext.requesterDirectSupervisorName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">直屬主管</span>
            <span className="font-medium">{session.orgContext.requesterDirectSupervisorName}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">金額</span>
          <span className="font-semibold">{fmtAmount(session.formData.amount)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">類別</span>
          <span>{session.formData.category}</span>
        </div>
      </div>

      {/* 核決路徑 */}
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
                className={`rounded border px-1.5 py-0.5 text-[10px] ${
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

      {/* 當前操作 */}
      {!isDone && currentNode && (
        <div className="shrink-0 space-y-2 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 text-amber-500 shrink-0" />
            <p className="text-xs font-semibold">{currentNode.data.label}</p>
          </div>

          {isInteractive ? (
            <>
              {/* 核准人來源說明 */}
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Users className="size-3 shrink-0" />
                核准人策略：<span className="font-medium text-foreground">{resolutionModeLabel(resolutionMode?.mode)}</span>
                <span className="ml-auto">({eligibleEmployees.length} 人)</span>
              </div>

              {eligibleEmployees.length > 0 ? (
                <Select value={actorId} onValueChange={setActorId}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue placeholder="選擇核准人（選填）" />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleEmployees.map((e) => {
                      const jl = getJobLevelName(e.id);
                      return (
                        <SelectItem key={e.id} value={e.id} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            <User className="size-3" />{e.name}
                            {jl.name && <span className="text-muted-foreground">— {jl.name}</span>}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-[11px] text-destructive">找不到符合條件的核准人（請檢查組織資料）</p>
              )}

              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={1}
                className="resize-none text-xs"
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
          {session.completedAt && (
            <p className="text-[10px] font-normal mt-0.5 opacity-70">
              {new Date(session.completedAt).toLocaleString('zh-TW')}
            </p>
          )}
        </div>
      )}

      {/* 執行紀錄 */}
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
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
              <p className="text-muted-foreground">
                {log.actorName}
                {log.actorJobLevel && ` · ${log.actorJobLevel}`}
              </p>
            )}
            {log.note && <p className="italic text-muted-foreground">{log.note}</p>}
            <p className="text-[10px] text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString('zh-TW')}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

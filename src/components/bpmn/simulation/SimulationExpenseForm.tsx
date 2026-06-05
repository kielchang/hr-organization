import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import type { ExpenseFormData } from '../../../types/bpmn';
import type { Employee, Assignment, JobLevel, Group } from '../../../types/org';
import { fmtAmount } from '../../../services/bpmnSimulator';

const CATEGORIES = ['差旅費', '餐費', '設備費', '辦公耗材', '教育訓練', '行銷推廣', '其他'];

interface OrgLookup {
  assignments: Assignment[];
  jobLevels: JobLevel[];
  groups: Group[];
  employees: Employee[];
}

interface Props {
  employees: Employee[];
  orgLookup: OrgLookup;
  onSubmit: (data: ExpenseFormData) => void;
  onCancel: () => void;
  thresholdHints?: { label: string; max: number }[];
}

function useRequesterContext(requesterId: string, lookup: OrgLookup) {
  const primaryAssignment = lookup.assignments.find(
    (a) => a.employeeId === requesterId && a.isPrimaryGroup,
  );
  const jobLevel = primaryAssignment
    ? lookup.jobLevels.find((jl) => jl.id === primaryAssignment.jobLevelId)
    : undefined;
  const group = primaryAssignment
    ? lookup.groups.find((g) => g.id === primaryAssignment.groupId)
    : undefined;
  const supervisor = primaryAssignment?.primarySupervisorId
    ? lookup.employees.find((e) => e.id === primaryAssignment.primarySupervisorId)
    : undefined;
  return { primaryAssignment, jobLevel, group, supervisor };
}

export function SimulationExpenseForm({ employees, orgLookup, onSubmit, onCancel, thresholdHints }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<ExpenseFormData>({
    requesterId: employees[0]?.id ?? '',
    amount: 0,
    category: CATEGORIES[0],
    description: '',
    date: today,
  });

  const ctx = useRequesterContext(form.requesterId, orgLookup);

  function field<K extends keyof ExpenseFormData>(k: K, v: ExpenseFormData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const valid = form.requesterId && form.amount > 0 && form.description.trim();

  // 依金額找到第一個可覆蓋的 threshold
  const matchedThreshold = thresholdHints?.find((h) => form.amount > 0 && form.amount <= h.max);

  return (
    <div className="space-y-4">
      {/* 申請人 */}
      <div className="space-y-1">
        <Label className="text-xs">申請人</Label>
        <Select value={form.requesterId} onValueChange={(v) => field('requesterId', v ?? '')}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeNo})</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 申請人組織資訊（申請人選定後顯示） */}
        {form.requesterId && ctx.group && (
          <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {ctx.group && <Badge variant="info" className="text-[10px]">{ctx.group.name}</Badge>}
              {ctx.jobLevel && <Badge variant="outline" className="text-[10px]">{ctx.jobLevel.name}</Badge>}
            </div>
            <div className="text-muted-foreground">
              直屬主管：
              {ctx.supervisor
                ? <span className="font-medium text-foreground">{ctx.supervisor.name}</span>
                : <span className="italic">（無）</span>
              }
            </div>
            {ctx.primaryAssignment?.level != null && (
              <div className="text-muted-foreground">
                組內層級：<span className="font-medium text-foreground">第 {ctx.primaryAssignment.level} 層</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 費用類別 */}
      <div className="space-y-1">
        <Label className="text-xs">費用類別</Label>
        <Select value={form.category} onValueChange={(v) => field('category', v ?? '')}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* 申請金額 */}
      <div className="space-y-1">
        <Label className="text-xs">申請金額（TWD）</Label>
        <Input
          type="number"
          min={1}
          value={form.amount || ''}
          onChange={(e) => field('amount', Number(e.target.value))}
          className="h-8 text-sm"
          placeholder="0"
        />
        {form.amount > 0 && (
          <p className="text-[11px] text-muted-foreground">{fmtAmount(form.amount)}</p>
        )}
      </div>

      {/* 核決路徑預測 */}
      {thresholdHints && form.amount > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs space-y-1">
          <p className="font-medium text-muted-foreground">核決路徑預測</p>
          {thresholdHints.map((h) => {
            const isMatch = h === matchedThreshold;
            return (
              <div
                key={h.label}
                className={`flex items-center gap-2 ${isMatch ? 'text-foreground font-semibold' : 'text-muted-foreground line-through'}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isMatch ? 'bg-amber-500' : 'bg-current'}`} />
                {h.label}（上限 {fmtAmount(h.max)}）
                {isMatch && <Badge variant="warning" className="text-[9px] ml-auto">命中</Badge>}
              </div>
            );
          })}
          {!matchedThreshold && form.amount > 0 && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              超過所有設定上限 → 預設路由
            </div>
          )}
        </div>
      )}

      {/* 日期 */}
      <div className="space-y-1">
        <Label className="text-xs">日期</Label>
        <Input type="date" value={form.date} onChange={(e) => field('date', e.target.value)} className="h-8 text-sm" />
      </div>

      {/* 說明 */}
      <div className="space-y-1">
        <Label className="text-xs">說明</Label>
        <Textarea
          value={form.description}
          onChange={(e) => field('description', e.target.value)}
          rows={2}
          className="resize-none text-sm"
          placeholder="費用說明..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" disabled={!valid} onClick={() => onSubmit(form)}>送出模擬</Button>
      </div>
    </div>
  );
}

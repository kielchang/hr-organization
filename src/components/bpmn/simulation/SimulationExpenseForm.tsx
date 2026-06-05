import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ExpenseFormData } from '../../../types/bpmn';
import type { Employee } from '../../../types/org';
import { fmtAmount } from '../../../services/bpmnSimulator';

const CATEGORIES = ['差旅費', '餐費', '設備費', '辦公耗材', '教育訓練', '行銷推廣', '其他'];

interface Props {
  employees: Employee[];
  onSubmit: (data: ExpenseFormData) => void;
  onCancel: () => void;
  /** threshold hints to display */
  thresholdHints?: { label: string; max: number }[];
}

export function SimulationExpenseForm({ employees, onSubmit, onCancel, thresholdHints }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<ExpenseFormData>({
    requesterId: employees[0]?.id ?? '',
    amount: 0,
    category: CATEGORIES[0],
    description: '',
    date: today,
  });

  const hint = thresholdHints?.find(
    (h, i) => {
      const next = thresholdHints[i + 1];
      return form.amount < h.max && (!next || form.amount < next.max);
    },
  );

  function field<K extends keyof ExpenseFormData>(k: K, v: ExpenseFormData[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  const valid = form.requesterId && form.amount > 0 && form.description.trim();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs">申請人</Label>
        <Select value={form.requesterId} onValueChange={(v) => field('requesterId', v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>{e.name} ({e.employeeNo})</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">費用類別</Label>
        <Select value={form.category} onValueChange={(v) => field('category', v)}>
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

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

      {thresholdHints && form.amount > 0 && (
        <div className="rounded-lg border border-border bg-muted/40 p-2 text-xs space-y-1">
          <p className="font-medium text-muted-foreground">核決路徑預測</p>
          {thresholdHints.map((h) => (
            <div key={h.label} className={`flex items-center gap-2 ${form.amount <= h.max ? 'text-foreground font-semibold' : 'text-muted-foreground line-through'}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
              {h.label}（上限 {fmtAmount(h.max)}）
            </div>
          ))}
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs">日期</Label>
        <Input type="date" value={form.date} onChange={(e) => field('date', e.target.value)} className="h-8 text-sm" />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">說明</Label>
        <Textarea
          value={form.description}
          onChange={(e) => field('description', e.target.value)}
          rows={2}
          className="text-sm resize-none"
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

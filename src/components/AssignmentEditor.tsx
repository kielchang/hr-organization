import { X, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Assignment } from '../types/org';
import { useOrg } from '../context/useOrg';
import { getActiveEmployees } from '../services/validators';

interface AssignmentEditorProps {
  assignment: Assignment;
  isNew: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

export function AssignmentEditor({
  assignment: initial,
  isNew,
  onSaved,
  onCancel,
}: AssignmentEditorProps) {
  const { data, saveAssignment } = useOrg();
  const [assignment, setAssignment] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const activeGroups = data.groups.filter((g) => g.status === 'active');
  const activeEmployees = getActiveEmployees(data.employees).filter(
    (e) => e.id !== assignment.employeeId,
  );

  const supervisorOptions = useMemo(
    () =>
      activeEmployees.map((e) => ({
        value: e.id,
        text: `${e.name} (${e.employeeNo})`,
      })),
    [activeEmployees],
  );

  const toggleSupervisor = (id: string, checked: boolean) => {
    setAssignment((a) => {
      const supervisorIds = checked
        ? [...a.supervisorIds, id]
        : a.supervisorIds.filter((s) => s !== id);
      const primarySupervisorId =
        !checked && a.primarySupervisorId === id ? null : a.primarySupervisorId;
      return { ...a, supervisorIds, primarySupervisorId };
    });
  };

  const onSave = () => {
    const err = saveAssignment(assignment, isNew);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
  };

  return (
    <Card size="sm" className="gap-3">
      <CardHeader>
        <CardTitle>
          {data.groups.find((g) => g.id === assignment.groupId)?.name ?? '新歸屬'}
        </CardTitle>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onCancel}
            aria-label="取消"
          >
            <X className="size-4" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3 pt-0">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="grid gap-2">
          <Label>組別</Label>
          <Select
            value={assignment.groupId || undefined}
            onValueChange={(value) => {
              if (value) setAssignment((a) => ({ ...a, groupId: value }));
            }}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="選擇組別" />
            </SelectTrigger>
            <SelectContent>
              {activeGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>職級</Label>
          <Select
            value={assignment.jobLevelId || undefined}
            onValueChange={(value) => {
              if (value) setAssignment((a) => ({ ...a, jobLevelId: value }));
            }}
          >
            <SelectTrigger className="w-full bg-background">
              <SelectValue placeholder="選擇職級" />
            </SelectTrigger>
            <SelectContent>
              {[...data.jobLevels]
                .sort((a, b) => b.rank - a.rank)
                .map((j) => (
                  <SelectItem key={j.id} value={j.id}>
                    {j.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label className="text-muted-foreground">主管（可多選）</Label>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
            {supervisorOptions.map((o) => (
              <label
                key={o.value}
                htmlFor={`${assignment.id}-supervisor-${o.value}`}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id={`${assignment.id}-supervisor-${o.value}`}
                  checked={assignment.supervisorIds.includes(o.value)}
                  onCheckedChange={(checked) =>
                    toggleSupervisor(o.value, checked === true)
                  }
                />
                {o.text}
              </label>
            ))}
          </div>
        </div>
        {assignment.supervisorIds.length > 0 && (
          <div className="grid gap-2">
            <Label>主主管</Label>
            <Select
              value={assignment.primarySupervisorId ?? undefined}
              onValueChange={(value) => {
                setAssignment((a) => ({
                  ...a,
                  primarySupervisorId: value ?? null,
                }));
              }}
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="選擇主主管" />
              </SelectTrigger>
              <SelectContent>
                {assignment.supervisorIds.map((sid) => {
                  const e = data.employees.find((x) => x.id === sid);
                  return (
                    <SelectItem key={sid} value={sid}>
                      {e?.name ?? sid}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            checked={assignment.isPrimaryGroup}
            onCheckedChange={(checked) =>
              setAssignment((a) => ({ ...a, isPrimaryGroup: checked === true }))
            }
          />
          設為主組別
        </label>
        <div className="flex justify-end">
          <Button type="button" onClick={onSave}>
            <Save className="size-4" />
            儲存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

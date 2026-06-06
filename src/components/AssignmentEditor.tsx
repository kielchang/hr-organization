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
import { selectOptionLabel, toSelectOptions } from '@/lib/selectOptions';
import { buttonIntent } from '@/lib/uiSemantics';
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

  const sortedJobLevels = useMemo(
    () => [...data.jobLevels].sort((a, b) => b.rank - a.rank),
    [data.jobLevels],
  );

  const groupOptions = useMemo(
    () =>
      toSelectOptions(
        activeGroups,
        assignment.groupId || undefined,
        (g) => g.id,
        (g) => g.name,
      ),
    [activeGroups, assignment.groupId],
  );

  const jobLevelOptions = useMemo(
    () =>
      toSelectOptions(
        sortedJobLevels,
        assignment.jobLevelId || undefined,
        (j) => j.id,
        (j) => j.name,
      ),
    [sortedJobLevels, assignment.jobLevelId],
  );

  const primarySupervisorOptions = useMemo(() => {
    const items = assignment.supervisorIds.map((sid) => {
      const e = data.employees.find((x) => x.id === sid);
      return { id: sid, name: e?.name ?? '—' };
    });
    return toSelectOptions(
      items,
      assignment.primarySupervisorId ?? undefined,
      (o) => o.id,
      (o) => o.name,
    );
  }, [assignment.supervisorIds, assignment.primarySupervisorId, data.employees]);

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
            variant={buttonIntent.quiet}
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
          <Label htmlFor={`${assignment.id}-group`}>組別</Label>
          <Select
            value={assignment.groupId || null}
            onValueChange={(value) => {
              if (value) setAssignment((a) => ({ ...a, groupId: value }));
            }}
          >
            <SelectTrigger id={`${assignment.id}-group`} className="w-full bg-background">
              <SelectValue placeholder="選擇組別">
                {selectOptionLabel(groupOptions, assignment.groupId)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {groupOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${assignment.id}-joblevel`}>職級</Label>
          <Select
            value={assignment.jobLevelId || null}
            onValueChange={(value) => {
              if (value) setAssignment((a) => ({ ...a, jobLevelId: value }));
            }}
          >
            <SelectTrigger id={`${assignment.id}-joblevel`} className="w-full bg-background">
              <SelectValue placeholder="選擇職級">
                {selectOptionLabel(jobLevelOptions, assignment.jobLevelId)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {jobLevelOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label className="text-muted-foreground">主管（可多選）</Label>
          <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-lg border border-border p-2">
            {activeEmployees.map((e) => (
              <label
                key={e.id}
                htmlFor={`${assignment.id}-supervisor-${e.id}`}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <Checkbox
                  id={`${assignment.id}-supervisor-${e.id}`}
                  checked={assignment.supervisorIds.includes(e.id)}
                  onCheckedChange={(checked) =>
                    toggleSupervisor(e.id, checked === true)
                  }
                />
                {e.name}
              </label>
            ))}
          </div>
        </div>
        {assignment.supervisorIds.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor={`${assignment.id}-primarysup`}>主主管</Label>
            <Select
              value={assignment.primarySupervisorId}
              onValueChange={(value) => {
                setAssignment((a) => ({
                  ...a,
                  primarySupervisorId: value ?? null,
                }));
              }}
            >
              <SelectTrigger id={`${assignment.id}-primarysup`} className="w-full bg-background">
                <SelectValue placeholder="選擇主主管">
                  {selectOptionLabel(
                    primarySupervisorOptions,
                    assignment.primarySupervisorId,
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {primarySupervisorOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
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
          <Button type="button" variant={buttonIntent.primary} onClick={onSave}>
            <Save className="size-4" />
            儲存
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  Plus,
  Pencil,
  Save,
  User,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  EMPLOYEE_STATUS_OPTIONS,
  selectOptionLabel,
  toSelectOptions,
} from '@/lib/selectOptions';
import { buttonIntent, tagBadge } from '@/lib/uiSemantics';
import type { Assignment, Employee } from '../../types/org';
import { useOrg } from '../../context/useOrg';
import { getActiveEmployees } from '../../services/validators';

interface OrgDetailPanelProps {
  employeeId: string;
  onClose: () => void;
  portalContainer: HTMLElement | null;
  className?: string;
}

function OrgModal({
  container,
  onBackdropClick,
  children,
}: {
  container: HTMLElement | null;
  onBackdropClick: () => void;
  children: React.ReactNode;
}) {
  if (!container) return null;
  return ReactDOM.createPortal(
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      onClick={onBackdropClick}
    >
      <div
        className="max-h-[calc(100%-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl ring-1 ring-foreground/5"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    container,
  );
}

const modalFormClass = 'flex flex-col gap-4 p-6';
const modalHeaderClass = 'flex items-center justify-between gap-2';
const modalActionsClass =
  'flex justify-end gap-2 border-t border-border pt-4';

function ModalCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick} title="關閉">
      <X className="size-4" />
    </Button>
  );
}

function EmployeeEditForm({
  employee: initial,
  onClose,
  selectPortalContainer,
}: {
  employee: Employee;
  onClose: () => void;
  /** 與檢視組別相同：全螢幕時下拉需掛在圖表容器內 */
  selectPortalContainer: HTMLElement | null;
}) {
  const { saveEmployee } = useOrg();
  const [employee, setEmployee] = useState<Employee>(initial);
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    if (!employee.employeeNo.trim() || !employee.name.trim()) {
      setError('請填寫工號與姓名');
      return;
    }
    const err = saveEmployee(employee, false);
    if (err) { setError(err); return; }
    onClose();
  };

  const statusOptions = useMemo(
    () =>
      toSelectOptions(
        EMPLOYEE_STATUS_OPTIONS,
        employee.status,
        (o) => o.value,
        (o) => o.label,
      ),
    [employee.status],
  );

  return (
    <div className={modalFormClass}>
      <div className={modalHeaderClass}>
        <p className="font-semibold tracking-tight">編輯員工資料</p>
        <ModalCloseButton onClick={onClose} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="org-edit-employee-no">工號 *</Label>
        <Input
          id="org-edit-employee-no"
          value={employee.employeeNo}
          onChange={(e) => setEmployee((v) => ({ ...v, employeeNo: e.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-edit-employee-name">姓名 *</Label>
        <Input
          id="org-edit-employee-name"
          value={employee.name}
          onChange={(e) => setEmployee((v) => ({ ...v, name: e.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-edit-employee-status">狀態</Label>
        <Select
          value={employee.status}
          onValueChange={(value) => {
            if (value) setEmployee((v) => ({ ...v, status: value as Employee['status'] }));
          }}
        >
          <SelectTrigger id="org-edit-employee-status" className="w-full">
            <SelectValue>
              {selectOptionLabel(statusOptions, employee.status)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent container={selectPortalContainer} className="z-[60]">
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className={modalActionsClass}>
        <Button type="button" variant={buttonIntent.neutral} onClick={onClose}>
          取消
        </Button>
        <Button type="button" variant={buttonIntent.primary} onClick={onSave}>
          <Save />
          儲存
        </Button>
      </div>
    </div>
  );
}

function AssignmentEditForm({
  assignment: initial,
  isNew,
  onClose,
  selectPortalContainer,
}: {
  assignment: Assignment;
  isNew: boolean;
  onClose: () => void;
  selectPortalContainer: HTMLElement | null;
}) {
  const { data, saveAssignment } = useOrg();
  const [assignment, setAssignment] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const activeGroups = data.groups.filter((g) => g.status === 'active');
  const activeEmployees = getActiveEmployees(data.employees).filter(
    (e) => e.id !== assignment.employeeId,
  );

  const toggleSupervisor = (id: string, checked: boolean) => {
    setAssignment((a) => {
      const supervisorIds = checked ? [...a.supervisorIds, id] : a.supervisorIds.filter((s) => s !== id);
      const primarySupervisorId = !checked && a.primarySupervisorId === id ? null : a.primarySupervisorId;
      return { ...a, supervisorIds, primarySupervisorId };
    });
  };

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

  const onSave = () => {
    const err = saveAssignment(assignment, isNew);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className={modalFormClass}>
      <div className={modalHeaderClass}>
        <p className="font-semibold tracking-tight">
          {isNew ? '新增組別歸屬' : '編輯組別歸屬'}
        </p>
        <ModalCloseButton onClick={onClose} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="org-edit-assignment-group">組別 *</Label>
        <Select
          value={assignment.groupId || undefined}
          onValueChange={(value) => {
            if (value) setAssignment((a) => ({ ...a, groupId: value }));
          }}
        >
          <SelectTrigger id="org-edit-assignment-group" className="w-full">
            <SelectValue placeholder="選擇組別">
              {selectOptionLabel(groupOptions, assignment.groupId)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent container={selectPortalContainer} className="z-[60]">
            {groupOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="org-edit-assignment-level">職級 *</Label>
        <Select
          value={assignment.jobLevelId || undefined}
          onValueChange={(value) => {
            if (value) setAssignment((a) => ({ ...a, jobLevelId: value }));
          }}
        >
          <SelectTrigger id="org-edit-assignment-level" className="w-full">
            <SelectValue placeholder="選擇職級">
              {selectOptionLabel(jobLevelOptions, assignment.jobLevelId)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent container={selectPortalContainer} className="z-[60]">
            {jobLevelOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <p className="mb-2 text-sm font-medium">主管（可多選）</p>
        <div className="flex max-h-36 flex-col gap-2 overflow-y-auto">
          {activeEmployees.map((e) => (
            <div key={e.id} className="flex items-center gap-2">
              <Checkbox
                id={`${assignment.id}-supervisor-${e.id}`}
                checked={assignment.supervisorIds.includes(e.id)}
                onCheckedChange={(checked) => toggleSupervisor(e.id, checked)}
              />
              <Label htmlFor={`${assignment.id}-supervisor-${e.id}`}>{e.name}</Label>
            </div>
          ))}
        </div>
      </div>
      {assignment.supervisorIds.length > 0 && (
        <div className="grid gap-1.5">
          <Label htmlFor="org-edit-primary-supervisor">主主管</Label>
          <Select
            value={assignment.primarySupervisorId ?? undefined}
            onValueChange={(value) =>
              setAssignment((a) => ({ ...a, primarySupervisorId: value ?? null }))
            }
          >
            <SelectTrigger id="org-edit-primary-supervisor" className="w-full">
              <SelectValue placeholder="選擇主主管">
                {selectOptionLabel(
                  primarySupervisorOptions,
                  assignment.primarySupervisorId,
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent container={selectPortalContainer} className="z-[60]">
              {primarySupervisorOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${assignment.id}-primary-group`}
          checked={assignment.isPrimaryGroup}
          onCheckedChange={(checked) =>
            setAssignment((a) => ({ ...a, isPrimaryGroup: checked }))
          }
        />
        <Label htmlFor={`${assignment.id}-primary-group`}>設為主組別</Label>
      </div>
      <div className={modalActionsClass}>
        <Button type="button" variant={buttonIntent.neutral} onClick={onClose}>
          取消
        </Button>
        <Button type="button" variant={buttonIntent.primary} onClick={onSave}>
          <Save />
          儲存
        </Button>
      </div>
    </div>
  );
}

export function OrgDetailPanel({
  employeeId,
  onClose,
  portalContainer,
  className,
}: OrgDetailPanelProps) {
  const { data, newAssignmentFor } = useOrg();
  const employee = data.employees.find((e) => e.id === employeeId);
  const assignments = data.assignments.filter((a) => a.employeeId === employeeId);

  const [editingEmp, setEditingEmp] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [addingAssignment, setAddingAssignment] = useState(false);
  const [newAssignmentDraft, setNewAssignmentDraft] = useState<Assignment | null>(null);

  useEffect(() => {
    if (!employee) onClose();
  }, [employee, onClose]);

  if (!employee) return null;

  const openAddAssignment = () => {
    setNewAssignmentDraft(newAssignmentFor(employeeId));
    setAddingAssignment(true);
  };

  const closeAddAssignment = () => {
    setAddingAssignment(false);
    setNewAssignmentDraft(null);
  };

  return (
    <div
      className={cn(
        'org-detail-panel w-full rounded-xl border border-border bg-card/95 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm',
        className,
      )}
    >
      <div className="flex shrink-0 items-center gap-3 p-4 pb-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <User className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold leading-snug">{employee.name}</p>
          <p className="text-xs text-muted-foreground">{employee.employeeNo}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant={buttonIntent.edit}
            size="icon-sm"
            onClick={() => setEditingEmp(true)}
            title="編輯員工資料"
          >
            <Pencil />
          </Button>
          <ModalCloseButton onClick={onClose} />
        </div>
      </div>

      <Separator className="shrink-0" />

      <div className="flex shrink-0 items-center justify-between px-4 py-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          組別歸屬
        </p>
        <Button
          type="button"
          variant={buttonIntent.create}
          size="icon-sm"
          onClick={openAddAssignment}
          title="新增歸屬"
        >
          <Plus />
        </Button>
      </div>

      <div className="org-detail-assign-list">
        <div className="flex flex-col gap-2">
          {assignments.map((a) => {
            const group = data.groups.find((g) => g.id === a.groupId);
            const jl = data.jobLevels.find((j) => j.id === a.jobLevelId);
            return (
              <Card
                key={a.id}
                size="sm"
                className="py-0 shadow-none"
              >
                <CardHeader className="gap-2 px-3 py-3">
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    {group?.name ?? '—'}
                    {a.isPrimaryGroup && (
                      <Badge variant={tagBadge()} className="text-[10px]">
                        主組別
                      </Badge>
                    )}
                  </CardTitle>
                  <CardAction>
                    <Button
                      type="button"
                      variant={buttonIntent.edit}
                      size="icon-sm"
                      onClick={() => setEditingAssignment(a)}
                      title="編輯歸屬"
                    >
                      <Pencil />
                    </Button>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-1 px-3 pb-3 pt-0 text-xs text-muted-foreground">
                  <p>職級：{jl?.name ?? '—'}</p>
                  <p>
                    主管：
                    {a.supervisorIds
                      .map((sid) => {
                        const s = data.employees.find((e) => e.id === sid);
                        return s ? `${s.name}${a.primarySupervisorId === sid ? '*' : ''}` : sid;
                      })
                      .join('、') || '—'}
                  </p>
                </CardContent>
              </Card>
            );
          })}

          {assignments.length === 0 && (
            <p className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
              尚無組別歸屬
            </p>
          )}
        </div>
      </div>

      {editingEmp && (
        <OrgModal container={portalContainer} onBackdropClick={() => setEditingEmp(false)}>
          <EmployeeEditForm
            key={employee.id}
            employee={employee}
            onClose={() => setEditingEmp(false)}
            selectPortalContainer={portalContainer}
          />
        </OrgModal>
      )}

      {editingAssignment && (
        <OrgModal
          container={portalContainer}
          onBackdropClick={() => setEditingAssignment(null)}
        >
          <AssignmentEditForm
            key={editingAssignment.id}
            assignment={editingAssignment}
            isNew={false}
            onClose={() => setEditingAssignment(null)}
            selectPortalContainer={portalContainer}
          />
        </OrgModal>
      )}

      {addingAssignment && newAssignmentDraft && (
        <OrgModal container={portalContainer} onBackdropClick={closeAddAssignment}>
          <AssignmentEditForm
            key={newAssignmentDraft.id}
            assignment={newAssignmentDraft}
            isNew
            onClose={closeAddAssignment}
            selectPortalContainer={portalContainer}
          />
        </OrgModal>
      )}
    </div>
  );
}

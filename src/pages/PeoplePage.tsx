import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AssignmentEditor } from '../components/AssignmentEditor';
import { EmployeeForm } from '../components/EmployeeForm';
import { EmployeeList } from '../components/EmployeeList';
import { useOrg } from '../context/useOrg';

export function PeoplePage() {
  const { data, removeEmployee, removeAssignment, newAssignmentFor } = useOrg();
  const [selectedId, setSelectedId] = useState<string | null>(
    data.employees[0]?.id ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAssignment, setDraftAssignment] = useState<ReturnType<
    typeof newAssignmentFor
  > | null>(null);
  const [employeeFormOpen, setEmployeeFormOpen] = useState(false);
  const [employeeFormNew, setEmployeeFormNew] = useState(false);

  const employee = data.employees.find((e) => e.id === selectedId);
  const assignments = useMemo(
    () => data.assignments.filter((a) => a.employeeId === selectedId),
    [data.assignments, selectedId],
  );

  const openNewEmployee = () => {
    setEmployeeFormNew(true);
    setEmployeeFormOpen(true);
  };

  const openEditEmployee = () => {
    setEmployeeFormNew(false);
    setEmployeeFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">人員與歸屬</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          管理員工在各組別的歸屬、直屬／虛線主管與職級。儲存後會自動匯出 JSON。
        </p>
      </header>
      <div className="grid min-h-[480px] gap-6 lg:grid-cols-[280px_1fr]">
        <EmployeeList
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddEmployee={openNewEmployee}
        />
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm ring-1 ring-foreground/5">
          {employee ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h3 className="text-xl font-semibold">{employee.name}</h3>
                <span className="text-sm text-muted-foreground">{employee.employeeNo}</span>
                <Button type="button" variant="outline" size="sm" onClick={openEditEmployee}>
                  <Pencil className="size-4" />
                  編輯員工
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm(`確定刪除 ${employee.name}？`)) {
                      removeEmployee(employee.id);
                      setSelectedId(data.employees[0]?.id ?? null);
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                  刪除
                </Button>
              </div>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold">組別歸屬</h4>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setDraftAssignment(newAssignmentFor(employee.id));
                    setEditingId(null);
                  }}
                >
                  <Plus className="size-4" />
                  新增歸屬
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {assignments.map((a) =>
                  editingId === a.id ? (
                    <AssignmentEditor
                      key={a.id}
                      assignment={a}
                      isNew={false}
                      onSaved={() => setEditingId(null)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div
                      key={a.id}
                      className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm"
                    >
                      <p className="font-medium">
                        {data.groups.find((g) => g.id === a.groupId)?.name}
                        {a.isPrimaryGroup ? '（主組別）' : ''}
                      </p>
                      <p className="text-muted-foreground">
                        職級：{data.jobLevels.find((j) => j.id === a.jobLevelId)?.name}
                      </p>
                      <p className="text-muted-foreground">
                        主管：
                        {a.supervisorIds
                          .map((sid) => data.employees.find((e) => e.id === sid)?.name)
                          .filter(Boolean)
                          .join('、') || '—'}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button type="button" size="sm" onClick={() => setEditingId(a.id)}>
                          編輯
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm('確定刪除此歸屬？')) removeAssignment(a.id);
                          }}
                        >
                          刪除
                        </Button>
                      </div>
                    </div>
                  ),
                )}
                {draftAssignment && (
                  <AssignmentEditor
                    assignment={draftAssignment}
                    isNew
                    onSaved={() => setDraftAssignment(null)}
                    onCancel={() => setDraftAssignment(null)}
                  />
                )}
                {assignments.length === 0 && !draftAssignment && (
                  <Alert>
                    <AlertDescription>尚無組別歸屬，請新增。</AlertDescription>
                  </Alert>
                )}
              </div>
            </>
          ) : (
            <Alert>
              <AlertDescription>請選擇或新增員工</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      <EmployeeForm
        open={employeeFormOpen}
        employee={employeeFormNew ? null : employee ?? null}
        isNew={employeeFormNew}
        onClose={() => setEmployeeFormOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
}

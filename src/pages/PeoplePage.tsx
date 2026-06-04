import {
  Button,
  Text,
  Title2,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { Add24Regular, Edit24Regular, Delete24Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
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
    <div className="people-page">
      <Title2>人員與歸屬</Title2>
      <Text block className="page-desc">
        管理員工在各組別的歸屬、直屬／虛線主管與職級。儲存後會自動匯出 JSON。
      </Text>
      <div className="people-layout">
        <EmployeeList
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAddEmployee={openNewEmployee}
        />
        <div className="people-detail">
          {employee ? (
            <>
              <div className="people-detail-header">
                <Title2 as="h3">{employee.name}</Title2>
                <Text>{employee.employeeNo}</Text>
                <Button
                  appearance="subtle"
                  icon={<Edit24Regular />}
                  onClick={openEditEmployee}
                >
                  編輯員工
                </Button>
                <Button
                  appearance="subtle"
                  icon={<Delete24Regular />}
                  onClick={() => {
                    if (confirm(`確定刪除 ${employee.name}？`)) {
                      removeEmployee(employee.id);
                      setSelectedId(data.employees[0]?.id ?? null);
                    }
                  }}
                >
                  刪除
                </Button>
              </div>
              <div className="assignments-header">
                <Text weight="semibold">組別歸屬</Text>
                <Button
                  icon={<Add24Regular />}
                  onClick={() => {
                    setDraftAssignment(newAssignmentFor(employee.id));
                    setEditingId(null);
                  }}
                >
                  新增歸屬
                </Button>
              </div>
              <div className="assignments-list">
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
                    <div key={a.id} className="assignment-summary">
                      <Text weight="semibold">
                        {data.groups.find((g) => g.id === a.groupId)?.name}
                        {a.isPrimaryGroup ? '（主組別）' : ''}
                      </Text>
                      <Text size={200}>
                        職級：
                        {data.jobLevels.find((j) => j.id === a.jobLevelId)?.name}
                      </Text>
                      <Text size={200}>
                        主管：
                        {a.supervisorIds
                          .map((sid) => data.employees.find((e) => e.id === sid)?.name)
                          .filter(Boolean)
                          .join('、') || '—'}
                      </Text>
                      <div className="assignment-summary-actions">
                        <Button size="small" onClick={() => setEditingId(a.id)}>
                          編輯
                        </Button>
                        <Button
                          size="small"
                          appearance="subtle"
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
                  <MessageBar>
                    <MessageBarBody>尚無組別歸屬，請新增。</MessageBarBody>
                  </MessageBar>
                )}
              </div>
            </>
          ) : (
            <MessageBar>
              <MessageBarBody>請選擇或新增員工</MessageBarBody>
            </MessageBar>
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

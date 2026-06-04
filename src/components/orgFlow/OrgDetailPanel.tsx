import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dropdown,
  Field,
  Input,
  Option,
  Text,
} from '@fluentui/react-components';
import type { OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import {
  Add24Regular,
  Dismiss24Regular,
  Edit24Regular,
  Person24Regular,
  Save24Regular,
} from '@fluentui/react-icons';
import type { Assignment, Employee } from '../../types/org';
import { useOrg } from '../../context/useOrg';
import { getActiveEmployees } from '../../services/validators';

interface OrgDetailPanelProps {
  employeeId: string;
  onClose: () => void;
  portalContainer: HTMLElement | null;
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
    <div className="org-modal-backdrop" onClick={onBackdropClick}>
      <div className="org-modal-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    container,
  );
}

function EmployeeEditForm({
  employee: initial,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
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

  return (
    <div className="org-modal-form">
      <div className="org-modal-header">
        <Text weight="semibold">編輯員工資料</Text>
        <button className="org-detail-close-btn" onClick={onClose} title="關閉">✕</button>
      </div>
      {error && <Text style={{ color: 'var(--colorPaletteRedForeground1)' }}>{error}</Text>}
      <Field label="工號" required>
        <Input value={employee.employeeNo} onChange={(_e, d) => setEmployee((v) => ({ ...v, employeeNo: d.value }))} />
      </Field>
      <Field label="姓名" required>
        <Input value={employee.name} onChange={(_e, d) => setEmployee((v) => ({ ...v, name: d.value }))} />
      </Field>
      <Field label="狀態">
        <Dropdown
          value={employee.status === 'active' ? '在職' : '離職'}
          selectedOptions={[employee.status]}
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) setEmployee((v) => ({ ...v, status: opt.optionValue as Employee['status'] }));
          }}
        >
          <Option value="active">在職</Option>
          <Option value="inactive">離職</Option>
        </Dropdown>
      </Field>
      <div className="org-modal-actions">
        <Button appearance="secondary" onClick={onClose}>取消</Button>
        <Button appearance="primary" icon={<Save24Regular />} onClick={onSave}>儲存</Button>
      </div>
    </div>
  );
}

function AssignmentEditForm({
  assignment: initial,
  isNew,
  onClose,
}: {
  assignment: Assignment;
  isNew: boolean;
  onClose: () => void;
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

  const onSave = () => {
    const err = saveAssignment(assignment, isNew);
    if (err) { setError(err); return; }
    onClose();
  };

  return (
    <div className="org-modal-form">
      <div className="org-modal-header">
        <Text weight="semibold">{isNew ? '新增組別歸屬' : '編輯組別歸屬'}</Text>
        <button className="org-detail-close-btn" onClick={onClose} title="關閉">✕</button>
      </div>
      {error && <Text style={{ color: 'var(--colorPaletteRedForeground1)' }}>{error}</Text>}
      <Field label="組別" required>
        <Dropdown
          placeholder="選擇組別"
          value={activeGroups.find((g) => g.id === assignment.groupId)?.name ?? ''}
          selectedOptions={assignment.groupId ? [assignment.groupId] : []}
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) setAssignment((a) => ({ ...a, groupId: opt.optionValue! }));
          }}
        >
          {activeGroups.map((g) => <Option key={g.id} value={g.id} text={g.name}>{g.name}</Option>)}
        </Dropdown>
      </Field>
      <Field label="職級" required>
        <Dropdown
          placeholder="選擇職級"
          value={data.jobLevels.find((j) => j.id === assignment.jobLevelId)?.name ?? ''}
          selectedOptions={assignment.jobLevelId ? [assignment.jobLevelId] : []}
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) setAssignment((a) => ({ ...a, jobLevelId: opt.optionValue! }));
          }}
        >
          {[...data.jobLevels].sort((a, b) => b.rank - a.rank).map((j) => (
            <Option key={j.id} value={j.id} text={j.name}>{j.name}</Option>
          ))}
        </Dropdown>
      </Field>
      <div className="supervisor-field">
        <Text size={300} weight="semibold" className="supervisor-field-label">
          主管（可多選）
        </Text>
        <div className="supervisor-checkboxes">
          {activeEmployees.map((e) => (
            <Checkbox
              key={e.id}
              id={`${assignment.id}-supervisor-${e.id}`}
              label={`${e.name} (${e.employeeNo})`}
              checked={assignment.supervisorIds.includes(e.id)}
              onChange={(_ev, d) => toggleSupervisor(e.id, !!d.checked)}
            />
          ))}
        </div>
      </div>
      {assignment.supervisorIds.length > 0 && (
        <Field label="主主管">
          <Dropdown
            placeholder="選擇主主管"
            value={data.employees.find((e) => e.id === assignment.primarySupervisorId)?.name ?? ''}
            selectedOptions={assignment.primarySupervisorId ? [assignment.primarySupervisorId] : []}
            onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
              setAssignment((a) => ({ ...a, primarySupervisorId: opt.optionValue ?? null }));
            }}
          >
            {assignment.supervisorIds.map((sid) => {
              const e = data.employees.find((x) => x.id === sid);
              return <Option key={sid} value={sid} text={e?.name ?? sid}>{e?.name ?? sid}</Option>;
            })}
          </Dropdown>
        </Field>
      )}
      <Checkbox
        label="設為主組別"
        checked={assignment.isPrimaryGroup}
        onChange={(_e, d) => setAssignment((a) => ({ ...a, isPrimaryGroup: !!d.checked }))}
      />
      <div className="org-modal-actions">
        <Button appearance="secondary" icon={<Dismiss24Regular />} onClick={onClose}>取消</Button>
        <Button appearance="primary" icon={<Save24Regular />} onClick={onSave}>儲存</Button>
      </div>
    </div>
  );
}

export function OrgDetailPanel({ employeeId, onClose, portalContainer }: OrgDetailPanelProps) {
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
    <div className="org-detail-panel-inner">
      <div className="org-detail-emp-row">
        <div className="org-detail-emp-info">
          <Person24Regular className="org-detail-emp-icon" />
          <div>
            <Text weight="semibold" block>{employee.name}</Text>
            <Text size={200} block>{employee.employeeNo}</Text>
          </div>
        </div>
        <div className="org-detail-emp-actions">
          <Button appearance="subtle" size="small" icon={<Edit24Regular />}
            onClick={() => setEditingEmp(true)} title="編輯員工資料" />
          <button className="org-detail-close-btn" onClick={onClose} title="關閉">✕</button>
        </div>
      </div>

      <div className="org-detail-assignments">
        <div className="org-detail-section-header">
          <Text size={200} weight="semibold">組別歸屬</Text>
          <Button appearance="subtle" size="small" icon={<Add24Regular />}
            onClick={openAddAssignment} title="新增歸屬" />
        </div>

        {assignments.map((a) => {
          const group = data.groups.find((g) => g.id === a.groupId);
          const jl = data.jobLevels.find((j) => j.id === a.jobLevelId);
          return (
            <Card key={a.id} className="org-detail-assign-card">
              <CardHeader
                header={
                  <span className="org-detail-assign-title">
                    {group?.name ?? '—'}
                    {a.isPrimaryGroup && (
                      <Badge appearance="outline" color="brand" size="small">主組別</Badge>
                    )}
                  </span>
                }
                action={
                  <Button appearance="subtle" size="small" icon={<Edit24Regular />}
                    onClick={() => setEditingAssignment(a)} title="編輯歸屬" />
                }
              />
              <Text size={200} block>職級：{jl?.name ?? '—'}</Text>
              <Text size={200} block>
                主管：
                {a.supervisorIds
                  .map((sid) => {
                    const s = data.employees.find((e) => e.id === sid);
                    return s ? `${s.name}${a.primarySupervisorId === sid ? '*' : ''}` : sid;
                  })
                  .join('、') || '—'}
              </Text>
            </Card>
          );
        })}

        {assignments.length === 0 && (
          <Text size={200} className="org-detail-empty">尚無組別歸屬</Text>
        )}
      </div>

      {editingEmp && (
        <OrgModal container={portalContainer} onBackdropClick={() => setEditingEmp(false)}>
          <EmployeeEditForm key={employee.id} employee={employee} onClose={() => setEditingEmp(false)} />
        </OrgModal>
      )}

      {editingAssignment && (
        <OrgModal container={portalContainer} onBackdropClick={() => setEditingAssignment(null)}>
          <AssignmentEditForm
            key={editingAssignment.id}
            assignment={editingAssignment}
            isNew={false}
            onClose={() => setEditingAssignment(null)}
          />
        </OrgModal>
      )}

      {addingAssignment && newAssignmentDraft && (
        <OrgModal container={portalContainer} onBackdropClick={closeAddAssignment}>
          <AssignmentEditForm
            key={newAssignmentDraft.id}
            assignment={newAssignmentDraft}
            isNew={true}
            onClose={closeAddAssignment}
          />
        </OrgModal>
      )}
    </div>
  );
}

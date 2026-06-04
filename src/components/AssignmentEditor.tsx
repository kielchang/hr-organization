import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  Dropdown,
  Field,
  Option,
  Text,
} from '@fluentui/react-components';
import type { OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import { Dismiss24Regular, Save24Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
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
    <Card className="assignment-card">
      <CardHeader
        header={
          <Text weight="semibold">
            {data.groups.find((g) => g.id === assignment.groupId)?.name ??
              '新歸屬'}
          </Text>
        }
        action={
          <Button
            appearance="subtle"
            icon={<Dismiss24Regular />}
            onClick={onCancel}
            aria-label="取消"
          />
        }
      />
      {error && (
        <Text style={{ color: 'var(--colorPaletteRedForeground1)' }}>{error}</Text>
      )}
      <Field label="組別" required>
        <Dropdown
          placeholder="選擇組別"
          value={
            activeGroups.find((g) => g.id === assignment.groupId)?.name ?? ''
          }
          selectedOptions={assignment.groupId ? [assignment.groupId] : []}
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) {
              setAssignment((a) => ({ ...a, groupId: opt.optionValue! }));
            }
          }}
        >
          {activeGroups.map((g) => (
            <Option key={g.id} value={g.id} text={g.name}>
              {g.name}
            </Option>
          ))}
        </Dropdown>
      </Field>
      <Field label="職級" required>
        <Dropdown
          placeholder="選擇職級"
          value={
            data.jobLevels.find((j) => j.id === assignment.jobLevelId)?.name ?? ''
          }
          selectedOptions={
            assignment.jobLevelId ? [assignment.jobLevelId] : []
          }
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) {
              setAssignment((a) => ({ ...a, jobLevelId: opt.optionValue! }));
            }
          }}
        >
          {[...data.jobLevels]
            .sort((a, b) => b.rank - a.rank)
            .map((j) => (
              <Option key={j.id} value={j.id} text={j.name}>
                {j.name}
              </Option>
            ))}
        </Dropdown>
      </Field>
      <div className="supervisor-field">
        <Text size={300} weight="semibold" className="supervisor-field-label">
          主管（可多選）
        </Text>
        <div className="supervisor-checkboxes">
          {supervisorOptions.map((o) => (
            <Checkbox
              key={o.value}
              id={`${assignment.id}-supervisor-${o.value}`}
              label={o.text}
              checked={assignment.supervisorIds.includes(o.value)}
              onChange={(_e, d) => toggleSupervisor(o.value, !!d.checked)}
            />
          ))}
        </div>
      </div>
      {assignment.supervisorIds.length > 0 && (
        <Field label="主主管">
          <Dropdown
            placeholder="選擇主主管"
            value={
              data.employees.find((e) => e.id === assignment.primarySupervisorId)
                ?.name ?? ''
            }
            selectedOptions={
              assignment.primarySupervisorId
                ? [assignment.primarySupervisorId]
                : []
            }
            onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
              setAssignment((a) => ({
                ...a,
                primarySupervisorId: opt.optionValue ?? null,
              }));
            }}
          >
            {assignment.supervisorIds.map((sid) => {
              const e = data.employees.find((x) => x.id === sid);
              return (
                <Option key={sid} value={sid} text={e?.name ?? sid}>
                  {e?.name ?? sid}
                </Option>
              );
            })}
          </Dropdown>
        </Field>
      )}
      <Checkbox
        label="設為主組別"
        checked={assignment.isPrimaryGroup}
        onChange={(_e, d) =>
          setAssignment((a) => ({ ...a, isPrimaryGroup: !!d.checked }))
        }
      />
      <div className="assignment-card-actions">
        <Button appearance="primary" icon={<Save24Regular />} onClick={onSave}>
          儲存
        </Button>
      </div>
    </Card>
  );
}

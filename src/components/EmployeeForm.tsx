import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Dropdown,
  Field,
  Input,
  Option,
} from '@fluentui/react-components';
import type { OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import { useState } from 'react';
import type { Employee } from '../types/org';
import { useOrg } from '../context/OrgContext';

interface EmployeeFormProps {
  open: boolean;
  employee: Employee | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EmployeeForm({
  open,
  employee: initial,
  isNew,
  onClose,
  onSaved,
}: EmployeeFormProps) {
  const { saveEmployee } = useOrg();
  const [employee, setEmployee] = useState<Employee>(
    initial ?? {
      id: `e_${crypto.randomUUID().slice(0, 8)}`,
      employeeNo: '',
      name: '',
      status: 'active',
    },
  );
  const [error, setError] = useState<string | null>(null);

  const onSave = () => {
    if (!employee.employeeNo.trim() || !employee.name.trim()) {
      setError('請填寫工號與姓名');
      return;
    }
    const err = saveEmployee(employee, isNew);
    if (err) {
      setError(err);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(_e, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{isNew ? '新增員工' : '編輯員工'}</DialogTitle>
          <DialogContent>
            {error && <p className="form-error">{error}</p>}
            <Field label="工號" required>
              <Input
                value={employee.employeeNo}
                onChange={(_e, d) =>
                  setEmployee((e) => ({ ...e, employeeNo: d.value }))
                }
              />
            </Field>
            <Field label="姓名" required>
              <Input
                value={employee.name}
                onChange={(_e, d) =>
                  setEmployee((e) => ({ ...e, name: d.value }))
                }
              />
            </Field>
            <Field label="狀態">
              <Dropdown
                value={employee.status === 'active' ? '在職' : '離職'}
                selectedOptions={[employee.status]}
                onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
                  if (opt.optionValue) {
                    setEmployee((e) => ({
                      ...e,
                      status: opt.optionValue as Employee['status'],
                    }));
                  }
                }}
              >
                <Option value="active">在職</Option>
                <Option value="inactive">離職</Option>
              </Dropdown>
            </Field>
          </DialogContent>
          <DialogActions>
            <Button appearance="secondary" onClick={onClose}>
              取消
            </Button>
            <Button appearance="primary" onClick={onSave}>
              儲存
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}

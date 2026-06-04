import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Employee } from '../types/org';
import { useOrg } from '../context/useOrg';

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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? '新增員工' : '編輯員工'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-2">
            <Label htmlFor="employee-no">工號</Label>
            <Input
              id="employee-no"
              value={employee.employeeNo}
              onChange={(e) =>
                setEmployee((emp) => ({ ...emp, employeeNo: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="employee-name">姓名</Label>
            <Input
              id="employee-name"
              value={employee.name}
              onChange={(e) => setEmployee((emp) => ({ ...emp, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="employee-status">狀態</Label>
            <Select
              value={employee.status}
              onValueChange={(value) => {
                if (value) {
                  setEmployee((emp) => ({
                    ...emp,
                    status: value as Employee['status'],
                  }));
                }
              }}
            >
              <SelectTrigger id="employee-status" className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">在職</SelectItem>
                <SelectItem value="inactive">離職</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button type="button" onClick={onSave}>
            儲存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

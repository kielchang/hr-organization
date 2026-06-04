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
import type { Group } from '../types/org';
import { useOrg } from '../context/useOrg';

const NO_PARENT = '__none__';

interface GroupFormProps {
  open: boolean;
  group: Group | null;
  isNew: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function GroupForm({
  open,
  group: initial,
  isNew,
  onClose,
  onSaved,
}: GroupFormProps) {
  const { data, saveGroup } = useOrg();
  const [group, setGroup] = useState<Group>(
    initial ?? {
      id: `g_${crypto.randomUUID().slice(0, 8)}`,
      code: '',
      name: '',
      parentId: null,
      status: 'active',
    },
  );
  const [error, setError] = useState<string | null>(null);

  const parentOptions = data.groups.filter((g) => g.id !== group.id);

  const onSave = () => {
    if (!group.code.trim() || !group.name.trim()) {
      setError('請填寫代碼與名稱');
      return;
    }
    const err = saveGroup(group, isNew);
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
          <DialogTitle>{isNew ? '新增組別' : '編輯組別'}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="grid gap-2">
            <Label htmlFor="group-code">代碼</Label>
            <Input
              id="group-code"
              value={group.code}
              onChange={(e) => setGroup((g) => ({ ...g, code: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-name">名稱</Label>
            <Input
              id="group-name"
              value={group.name}
              onChange={(e) => setGroup((g) => ({ ...g, name: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-parent">上層組別</Label>
            <Select
              value={group.parentId ?? NO_PARENT}
              onValueChange={(value) => {
                if (!value) return;
                setGroup((g) => ({
                  ...g,
                  parentId: value === NO_PARENT ? null : value,
                }));
              }}
            >
              <SelectTrigger id="group-parent" className="w-full bg-background">
                <SelectValue placeholder="（無）" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>（無）</SelectItem>
                {parentOptions.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-status">狀態</Label>
            <Select
              value={group.status}
              onValueChange={(value) => {
                if (value) {
                  setGroup((g) => ({
                    ...g,
                    status: value as Group['status'],
                  }));
                }
              }}
            >
              <SelectTrigger id="group-status" className="w-full bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">啟用</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
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

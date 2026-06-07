import { useMemo, useState } from 'react';
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
import {
  GROUP_KIND_OPTIONS,
  GROUP_STATUS_OPTIONS,
  selectOptionLabel,
  toSelectOptions,
} from '@/lib/selectOptions';
import type { Group, GroupKind } from '../types/org';
import { useOrg } from '../context/useOrg';

const NO_PARENT = '__none__';
const NO_LEADER = '__none__';

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
      kind: 'department',
    },
  );
  const [error, setError] = useState<string | null>(null);

  const parentSelectValue = group.parentId ?? NO_PARENT;

  const parentOptions = useMemo(() => {
    const items = [
      { id: NO_PARENT, name: '（無）' },
      ...data.groups.filter((g) => g.id !== group.id),
    ];
    return toSelectOptions(items, parentSelectValue, (g) => g.id, (g) => g.name);
  }, [data.groups, group.id, parentSelectValue]);

  const statusOptions = useMemo(
    () => toSelectOptions(GROUP_STATUS_OPTIONS, group.status, (o) => o.value, (o) => o.label),
    [group.status],
  );

  const kindOptions = useMemo(
    () => toSelectOptions(GROUP_KIND_OPTIONS, group.kind, (o) => o.value, (o) => o.label),
    [group.kind],
  );

  const leaderSelectValue = group.leaderId ?? NO_LEADER;

  // 該組現有成員＝對應到此 groupId 的 assignment 所指向的員工（依姓名顯示）。
  const memberEmployees = useMemo(() => {
    const memberIds = new Set(
      data.assignments.filter((a) => a.groupId === group.id).map((a) => a.employeeId),
    );
    return data.employees.filter((e) => memberIds.has(e.id));
  }, [data.assignments, data.employees, group.id]);

  const hasMembers = memberEmployees.length > 0;

  const leaderOptions = useMemo(() => {
    const items = [{ id: NO_LEADER, name: '未指定' }, ...memberEmployees];
    return toSelectOptions(items, leaderSelectValue, (e) => e.id, (e) => e.name);
  }, [memberEmployees, leaderSelectValue]);

  const isFunction = group.kind === 'function';

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
            <Label htmlFor="group-kind">種類</Label>
            <Select
              value={group.kind}
              onValueChange={(value) => {
                if (!value) return;
                setGroup((g) => ({
                  ...g,
                  kind: value as GroupKind,
                  // 職能於 v1 為扁平結構（無階層），切換時一併清掉上層。
                  parentId: value === 'function' ? null : g.parentId,
                }));
              }}
            >
              <SelectTrigger id="group-kind" className="w-full bg-background">
                <SelectValue>
                  {selectOptionLabel(kindOptions, group.kind)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {kindOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-parent">上層組別</Label>
            <Select
              value={parentSelectValue}
              disabled={isFunction}
              onValueChange={(value) => {
                if (!value) return;
                setGroup((g) => ({
                  ...g,
                  parentId: value === NO_PARENT ? null : value,
                }));
              }}
            >
              <SelectTrigger
                id="group-parent"
                className="w-full bg-background"
                aria-disabled={isFunction}
              >
                <SelectValue placeholder="（無）">
                  {selectOptionLabel(parentOptions, parentSelectValue)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {parentOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isFunction && (
              <p className="text-xs text-muted-foreground">
                職能為跨部門扁平結構，無上層組別。
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="group-leader">組長</Label>
            <Select
              value={leaderSelectValue}
              disabled={!hasMembers}
              onValueChange={(value) => {
                if (!value) return;
                setGroup((g) => ({
                  ...g,
                  leaderId: value === NO_LEADER ? null : value,
                }));
              }}
            >
              <SelectTrigger
                id="group-leader"
                className="w-full bg-background"
                aria-disabled={!hasMembers}
              >
                <SelectValue placeholder="未指定">
                  {selectOptionLabel(leaderOptions, leaderSelectValue)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {leaderOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!hasMembers && (
              <p className="text-xs text-muted-foreground">
                此組尚無成員，存檔後再設組長。
              </p>
            )}
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
                <SelectValue>
                  {selectOptionLabel(statusOptions, group.status)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
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

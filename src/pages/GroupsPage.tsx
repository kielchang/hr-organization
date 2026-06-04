import { Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Group } from '../types/org';
import { GroupForm } from '../components/GroupForm';
import { useOrg } from '../context/useOrg';

export function GroupsPage() {
  const { data } = useOrg();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Group | null>(null);
  const [isNew, setIsNew] = useState(false);

  const sorted = useMemo(
    () => [...data.groups].sort((a, b) => a.code.localeCompare(b.code)),
    [data.groups],
  );

  const parentName = (id: string | null) =>
    id ? (data.groups.find((g) => g.id === id)?.name ?? '—') : '—';

  const openNew = () => {
    setEditing(null);
    setIsNew(true);
    setFormOpen(true);
  };

  const openEdit = (g: Group) => {
    setEditing(g);
    setIsNew(false);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">組別管理</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          維護組織單位階層；人員可跨組別歸屬（矩陣組織）。
        </p>
      </header>
      <Button type="button" className="w-fit" onClick={openNew}>
        <Plus className="size-4" />
        新增組別
      </Button>
      <div className="rounded-xl border border-border bg-card shadow-sm ring-1 ring-foreground/5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>代碼</TableHead>
              <TableHead>名稱</TableHead>
              <TableHead>上層組別</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((g) => (
              <TableRow key={g.id}>
                <TableCell>{g.code}</TableCell>
                <TableCell>{g.name}</TableCell>
                <TableCell>{parentName(g.parentId)}</TableCell>
                <TableCell>
                  <Badge variant={g.status === 'active' ? 'secondary' : 'outline'}>
                    {g.status === 'active' ? '啟用' : '停用'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openEdit(g)}
                    aria-label="編輯"
                  >
                    <Pencil className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <GroupForm
        open={formOpen}
        group={editing}
        isNew={isNew}
        onClose={() => setFormOpen(false)}
        onSaved={() => setFormOpen(false)}
      />
    </div>
  );
}

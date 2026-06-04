import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  Badge,
} from '@fluentui/react-components';
import { Add24Regular, Edit24Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import type { Group } from '../types/org';
import { GroupForm } from '../components/GroupForm';
import { useOrg } from '../context/OrgContext';

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
    <div>
      <Title2>組別管理</Title2>
      <Text block className="page-desc">
        維護組織單位階層；人員可跨組別歸屬（矩陣組織）。
      </Text>
      <Button icon={<Add24Regular />} onClick={openNew} style={{ marginBottom: 16 }}>
        新增組別
      </Button>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>代碼</TableHeaderCell>
            <TableHeaderCell>名稱</TableHeaderCell>
            <TableHeaderCell>上層組別</TableHeaderCell>
            <TableHeaderCell>狀態</TableHeaderCell>
            <TableHeaderCell>操作</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((g) => (
            <TableRow key={g.id}>
              <TableCell>{g.code}</TableCell>
              <TableCell>{g.name}</TableCell>
              <TableCell>{parentName(g.parentId)}</TableCell>
              <TableCell>
                <Badge color={g.status === 'active' ? 'success' : 'informative'}>
                  {g.status === 'active' ? '啟用' : '停用'}
                </Badge>
              </TableCell>
              <TableCell>
                <Button
                  appearance="subtle"
                  icon={<Edit24Regular />}
                  onClick={() => openEdit(g)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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

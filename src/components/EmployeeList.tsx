import {
  Badge,
  Input,
  List,
  ListItem,
  Text,
  Button,
  Dropdown,
  Option,
} from '@fluentui/react-components';
import type { OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import { Add24Regular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import type { Employee } from '../types/org';
import { useOrg } from '../context/OrgContext';

interface EmployeeListProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddEmployee: () => void;
}

export function EmployeeList({
  selectedId,
  onSelect,
  onAddEmployee,
}: EmployeeListProps) {
  const { data } = useOrg();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>(
    'active',
  );

  const filtered = useMemo(() => {
    return data.employees.filter((e) => {
      const matchStatus =
        statusFilter === 'all' || e.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.employeeNo.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data.employees, search, statusFilter]);

  return (
    <div className="employee-list">
      <div className="employee-list-toolbar">
        <Input
          placeholder="搜尋姓名或工號"
          value={search}
          onChange={(_e, d) => setSearch(d.value)}
        />
        <Dropdown
          value={
            statusFilter === 'all'
              ? '全部'
              : statusFilter === 'active'
                ? '在職'
                : '離職'
          }
          selectedOptions={[statusFilter]}
          onOptionSelect={(_e: SelectionEvents, opt: OptionOnSelectData) => {
            if (opt.optionValue) {
              setStatusFilter(opt.optionValue as 'all' | 'active' | 'inactive');
            }
          }}
        >
          <Option value="all">全部</Option>
          <Option value="active">在職</Option>
          <Option value="inactive">離職</Option>
        </Dropdown>
        <Button icon={<Add24Regular />} onClick={onAddEmployee}>
          新增員工
        </Button>
      </div>
      <List selectionMode="single">
        {filtered.map((e: Employee) => (
          <ListItem
            key={e.id}
            aria-selected={selectedId === e.id}
            onClick={() => onSelect(e.id)}
            className={selectedId === e.id ? 'list-item-selected' : ''}
          >
            <Text weight="semibold">{e.name}</Text>
            <Text size={200}>{e.employeeNo}</Text>
            <Badge
              appearance="outline"
              color={e.status === 'active' ? 'success' : 'informative'}
            >
              {e.status === 'active' ? '在職' : '離職'}
            </Badge>
          </ListItem>
        ))}
      </List>
    </div>
  );
}

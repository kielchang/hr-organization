import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  EMPLOYEE_FILTER_STATUS_OPTIONS,
  selectOptionLabel,
  toSelectOptions,
} from '@/lib/selectOptions';
import { buttonIntent, employeeStatusBadge } from '@/lib/uiSemantics';
import type { Employee } from '../types/org';
import { useOrg } from '../context/useOrg';

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

  const statusOptions = useMemo(
    () =>
      toSelectOptions(
        EMPLOYEE_FILTER_STATUS_OPTIONS,
        statusFilter,
        (o) => o.value,
        (o) => o.label,
      ),
    [statusFilter],
  );

  const filtered = useMemo(() => {
    return data.employees.filter((e) => {
      const matchStatus = statusFilter === 'all' || e.status === statusFilter;
      const q = search.trim().toLowerCase();
      const matchSearch =
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.employeeNo.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [data.employees, search, statusFilter]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm ring-1 ring-foreground/5">
      <div className="flex flex-col gap-2">
        <Input
          placeholder="搜尋姓名或工號"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            if (value) setStatusFilter(value as typeof statusFilter);
          }}
        >
          <SelectTrigger aria-label="依在職狀態篩選" className="w-full bg-background">
            <SelectValue>
              {selectOptionLabel(statusOptions, statusFilter)}
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
        <Button type="button" variant={buttonIntent.create} onClick={onAddEmployee}>
          <Plus className="size-4" />
          新增員工
        </Button>
      </div>
      <ScrollArea className="h-[min(420px,50vh)]">
        <ul className="flex flex-col gap-1 pr-2">
          {filtered.map((e: Employee) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onSelect(e.id)}
                className="app-list-item"
                data-active={selectedId === e.id ? true : undefined}
              >
                <span className="font-medium">{e.name}</span>
                <span className="text-xs text-muted-foreground">{e.employeeNo}</span>
                <Badge variant={employeeStatusBadge(e.status)} className="w-fit">
                  {e.status === 'active' ? '在職' : '離職'}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
}

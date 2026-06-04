import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { orderSelectOptions } from '@/lib/orderSelectOptions';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';
import type { Group } from '../../types/org';

interface OrgChartGroupSelectorProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  allGroupsLabel: string;
  mountNode?: HTMLElement | null;
}

export function OrgChartGroupSelector({
  selectedGroupId,
  onGroupChange,
  activeGroups,
  allGroupsLabel,
  mountNode,
}: OrgChartGroupSelectorProps) {
  const groupOptions = useMemo(() => {
    const items = [
      { id: ALL_GROUPS_VIEW_ID, name: allGroupsLabel },
      ...activeGroups.map((g) => ({ id: g.id, name: g.name })),
    ];
    return orderSelectOptions(items, selectedGroupId, (o) => o.id);
  }, [activeGroups, allGroupsLabel, selectedGroupId]);

  return (
    <div className="grid gap-2">
      <Label htmlFor="org-chart-group-select" className="text-xs font-medium text-muted-foreground">
        檢視組別
      </Label>
      <Select
        value={selectedGroupId}
        onValueChange={(value) => {
          if (value) onGroupChange(value);
        }}
      >
        <SelectTrigger id="org-chart-group-select" className="w-full bg-background">
          <SelectValue>
            {selectedGroupId === ALL_GROUPS_VIEW_ID
              ? allGroupsLabel
              : (activeGroups.find((g) => g.id === selectedGroupId)?.name ?? '選擇組別')}
          </SelectValue>
        </SelectTrigger>
        <SelectContent container={mountNode}>
          {groupOptions.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

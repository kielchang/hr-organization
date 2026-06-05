import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { selectOptionLabel, toSelectOptions } from '@/lib/selectOptions';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';
import type { Group } from '../../types/org';

interface OrgChartGroupSelectorProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  allGroupsLabel: string;
  mountNode?: HTMLElement | null;
}

/**
 * 底線樣式的組別選擇：標題「檢視組別」＋當前組名以底線＋下拉箭頭呈現，
 * 提示可點擊更換（無方框，與標題一致）。
 */
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
    return toSelectOptions(items, selectedGroupId, (o) => o.id, (o) => o.name);
  }, [activeGroups, allGroupsLabel, selectedGroupId]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">檢視組別</span>
      <Select
        value={selectedGroupId}
        onValueChange={(value) => {
          if (value) onGroupChange(value);
        }}
      >
        <SelectTrigger
          id="org-chart-group-select"
          className="h-auto w-40 gap-1 rounded-none border-0 border-b border-foreground/40 bg-transparent px-0.5 py-0.5 text-sm font-semibold leading-none text-foreground shadow-none hover:border-foreground focus-visible:border-foreground focus-visible:ring-0 dark:bg-transparent"
        >
          <SelectValue placeholder="選擇組別">
            {selectOptionLabel(groupOptions, selectedGroupId)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent container={mountNode} align="start">
          {groupOptions.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

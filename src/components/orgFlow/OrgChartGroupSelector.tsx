import { Dropdown, Field, Option } from '@fluentui/react-components';
import type { OptionOnSelectData } from '@fluentui/react-components';
import { ALL_GROUPS_VIEW_ID } from '../../services/buildOrgFlowGraph';
import type { Group } from '../../types/org';

interface OrgChartGroupSelectorProps {
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  allGroupsLabel: string;
  /** 全螢幕時將下拉選單 portal 掛在圖表容器內 */
  mountNode?: HTMLElement | null;
}

export function OrgChartGroupSelector({
  selectedGroupId,
  onGroupChange,
  activeGroups,
  allGroupsLabel,
  mountNode,
}: OrgChartGroupSelectorProps) {
  const displayValue =
    selectedGroupId === ALL_GROUPS_VIEW_ID
      ? allGroupsLabel
      : (activeGroups.find((g) => g.id === selectedGroupId)?.name ?? '選擇組別');

  return (
    <Field label="檢視組別" className="org-flow-group-field">
      <Dropdown
        inlinePopup
        mountNode={mountNode ?? undefined}
        value={displayValue}
        selectedOptions={selectedGroupId ? [selectedGroupId] : []}
        onOptionSelect={(_e, opt: OptionOnSelectData) => {
          if (opt.optionValue) onGroupChange(opt.optionValue);
        }}
      >
        <Option key={ALL_GROUPS_VIEW_ID} value={ALL_GROUPS_VIEW_ID} text={allGroupsLabel}>
          {allGroupsLabel}
        </Option>
        {activeGroups.map((g) => (
          <Option key={g.id} value={g.id} text={g.name}>
            {g.name}
          </Option>
        ))}
      </Dropdown>
    </Field>
  );
}

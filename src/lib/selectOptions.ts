import { orderSelectOptions } from './orderSelectOptions';

export type SelectOption = { value: string; label: string };

export const EMPLOYEE_STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: '在職' },
  { value: 'inactive', label: '離職' },
];

export const GROUP_STATUS_OPTIONS: SelectOption[] = [
  { value: 'active', label: '啟用' },
  { value: 'inactive', label: '停用' },
];

export const EMPLOYEE_FILTER_STATUS_OPTIONS: SelectOption[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '在職' },
  { value: 'inactive', label: '離職' },
];

/** 將選中項排到最前，並轉成 value / label（label 用於顯示，value 為實際儲存值） */
export function toSelectOptions<T>(
  items: readonly T[],
  selectedValue: string | undefined | null,
  getValue: (item: T) => string,
  getLabel: (item: T) => string,
): SelectOption[] {
  return orderSelectOptions(items, selectedValue, getValue).map((item) => ({
    value: getValue(item),
    label: getLabel(item),
  }));
}

export function selectOptionLabel(
  options: readonly SelectOption[],
  value: string | undefined | null,
): string | undefined {
  if (!value) return undefined;
  return options.find((o) => o.value === value)?.label;
}

export { orderSelectOptions };

/**
 * 將目前選中的項目排到清單最前，其餘維持原順序。
 * 下拉展開時從頂部即可看到當前選項。
 */
export function orderSelectOptions<T>(
  items: readonly T[],
  selectedValue: string | undefined | null,
  getValue: (item: T) => string,
): T[] {
  if (!selectedValue) return [...items];
  const selected = items.find((item) => getValue(item) === selectedValue);
  if (!selected) return [...items];
  const rest = items.filter((item) => getValue(item) !== selectedValue);
  return [selected, ...rest];
}

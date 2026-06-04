import type { badgeVariants } from '@/components/ui/badge';
import type { buttonVariants } from '@/components/ui/button';
import type { VariantProps } from 'class-variance-authority';

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/**
 * 按鈕語意（重要程度 × 類型）
 *
 * | 語意 | variant | 用途 |
 * |------|---------|------|
 * | 主要動作 | default | 儲存、送出 |
 * | 新增 | brand | 新增員工、新增歸屬等 |
 * | 編輯 | brand-outline | 編輯、修改 |
 * | 次要動作 | secondary | 次要流程、備用 CTA |
 * | 中性操作 | outline | 取消、匯出、工具列 |
 * | 低調操作 | ghost | 圖示、關閉 |
 * | 危險操作 | destructive | 刪除、不可逆 |
 * | 正向次要 | success | 驗證通過後下載等（少用） |
 */
export const buttonIntent = {
  primary: 'default',
  create: 'brand',
  edit: 'brand-outline',
  secondary: 'secondary',
  neutral: 'outline',
  quiet: 'ghost',
  danger: 'destructive',
  positive: 'success',
} as const satisfies Record<string, ButtonVariant>;

/** 員工在職狀態 */
export function employeeStatusBadge(
  status: 'active' | 'inactive',
): BadgeVariant {
  return status === 'active' ? 'success' : 'muted';
}

/** 組別啟用狀態 */
export function groupStatusBadge(status: 'active' | 'inactive'): BadgeVariant {
  return status === 'active' ? 'success' : 'muted';
}

/** 資料版本驗證 */
export function validationBadge(valid: boolean): BadgeVariant {
  return valid ? 'success' : 'destructive';
}

/** 標籤類（主組別、外部主管等） */
export function tagBadge(): BadgeVariant {
  return 'info';
}

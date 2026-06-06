import { expect } from 'vitest';
import { axe } from 'vitest-axe';

/**
 * 對已渲染的 DOM 節點跑 axe 無障礙稽核並斷言無違規。
 *
 * 注意：jsdom 無法計算版面與顏色，故停用 color-contrast 規則
 * （對比需在真實瀏覽器或視覺工具驗證）。失敗時會列出違規摘要。
 */
export async function assertNoA11yViolations(container: Element): Promise<void> {
  const { violations } = await axe(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  const summary = violations
    .map((v) => `[${v.impact ?? 'n/a'}] ${v.id}: ${v.help}`)
    .join('\n');
  expect(violations, `發現無障礙違規：\n${summary}`).toEqual([]);
}

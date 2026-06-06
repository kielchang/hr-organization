import { render } from '@testing-library/react';
import { Button } from '../components/ui/button';
import { assertNoA11yViolations } from './axe';

describe('a11y 工具鏈煙霧測試', () => {
  it('Button 無無障礙違規', async () => {
    const { container } = render(<Button>送出</Button>);
    await assertNoA11yViolations(container);
  });

  it('缺少可及名稱的 icon 按鈕會被偵測為違規', async () => {
    const { container } = render(
      <button type="button">
        <svg aria-hidden="true" />
      </button>,
    );
    // 反例：此按鈕無可及名稱，axe 應回報違規 → helper 斷言會失敗，故此處直接驗 violations
    const { axe } = await import('vitest-axe');
    const { violations } = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(violations.length).toBeGreaterThan(0);
  });
});

import { render } from '@testing-library/react';
import { Badge } from './badge';

/** Badge 為純展示元件，對各 variant 做結構快照以防無意間更動樣式輸出。 */
describe('Badge DOM 快照', () => {
  const variants = [
    'default',
    'secondary',
    'success',
    'warning',
    'destructive',
    'info',
    'outline',
    'muted',
    'ghost',
    'link',
  ] as const;

  it.each(variants)('variant=%s 結構快照', (variant) => {
    const { container } = render(<Badge variant={variant}>標籤</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('預設 variant（secondary）結構快照', () => {
    const { container } = render(<Badge>預設</Badge>);
    expect(container.firstChild).toMatchSnapshot();
  });
});

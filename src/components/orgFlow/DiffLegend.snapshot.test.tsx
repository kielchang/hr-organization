import { render } from '@testing-library/react';
import { DiffLegend } from './DiffLegend';

/** DiffLegend 為靜態圖例（新增／移除／已修改），對其 DOM 做結構快照。 */
describe('DiffLegend DOM 快照', () => {
  it('預設圖例結構快照', () => {
    const { container } = render(<DiffLegend />);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('帶自訂 className 的圖例結構快照', () => {
    const { container } = render(<DiffLegend className="mt-4 justify-end" />);
    expect(container.firstChild).toMatchSnapshot();
  });
});

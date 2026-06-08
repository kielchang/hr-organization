import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { OrgProvider } from '../context/OrgProvider';
import { BpmnProvider } from '../context/BpmnProvider';

interface Options extends Omit<RenderOptions, 'wrapper'> {
  /** 初始路由（測試用到 useNavigate/useParams 的元件時可指定）。 */
  route?: string;
}

/**
 * 以應用程式的 Provider（Org/Bpmn）與 MemoryRouter 包裹後渲染，
 * 供元件／互動／a11y 測試共用，避免各測試重複搭建環境。
 */
export function renderWithProviders(ui: ReactElement, options: Options = {}) {
  const { route = '/', ...rest } = options;
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <OrgProvider>
          <BpmnProvider>{children}</BpmnProvider>
        </OrgProvider>
      </MemoryRouter>
    );
  }
  return render(ui, { wrapper: Wrapper, ...rest });
}

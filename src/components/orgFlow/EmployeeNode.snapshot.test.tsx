import { render } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import { EmployeeNode, type EmployeeNodeData } from './EmployeeNode';
import type { NodeDiffStatus } from '../../types/editSession';

/** EmployeeNode 為 React Flow 節點，需在 ReactFlowProvider 內渲染（Handle 依賴其 context）。 */
function renderNode(data: EmployeeNodeData, selected = false) {
  return render(
    <ReactFlowProvider>
      <EmployeeNode {...({ data, selected } as unknown as NodeProps)} />
    </ReactFlowProvider>,
  );
}

const baseData: EmployeeNodeData = {
  employee: { id: 'e1', employeeNo: 'E001', name: '王大明', status: 'active' },
  assignmentId: 'a1',
  jobLevelName: '總監',
  isPrimaryGroup: true,
  groupName: '總經理室',
  level: 1,
};

describe('EmployeeNode DOM 快照', () => {
  it('主組別節點結構快照', () => {
    const { container } = renderNode(baseData);
    expect(container.firstChild).toMatchSnapshot();
  });

  it('非主組別節點（不顯示主組別徽章）結構快照', () => {
    const { container } = renderNode({ ...baseData, isPrimaryGroup: false });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('選取狀態節點結構快照', () => {
    const { container } = renderNode(baseData, true);
    expect(container.firstChild).toMatchSnapshot();
  });

  it.each(['added', 'removed', 'modified'] as NodeDiffStatus[])(
    'diff 狀態=%s 節點結構快照',
    (diffStatus) => {
      const { container } = renderNode({ ...baseData, diffStatus });
      expect(container.firstChild).toMatchSnapshot();
    },
  );
});

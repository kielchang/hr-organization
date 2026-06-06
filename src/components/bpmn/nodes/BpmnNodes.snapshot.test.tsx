import { render } from '@testing-library/react';
import { ReactFlowProvider, type NodeProps } from '@xyflow/react';
import {
  BpmnStartNode,
  BpmnEndNode,
  BpmnUserTaskNode,
  BpmnServiceTaskNode,
  BpmnExclusiveGatewayNode,
  BpmnParallelGatewayNode,
} from './BpmnNodes';
import type { BpmnNodeData } from '../../../types/bpmn';

/** BPMN 節點皆為 React Flow 節點，需 ReactFlowProvider 提供 Handle context。 */
function renderNode(
  Comp: (p: NodeProps) => React.ReactNode,
  data: BpmnNodeData,
  selected = false,
) {
  return render(
    <ReactFlowProvider>
      {Comp({ data, selected } as unknown as NodeProps)}
    </ReactFlowProvider>,
  );
}

describe('BpmnNodes DOM 快照', () => {
  it('開始事件節點結構快照', () => {
    const { container } = renderNode(BpmnStartNode, { label: '開始' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('結束事件節點結構快照', () => {
    const { container } = renderNode(BpmnEndNode, { label: '結束' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('使用者任務（核准）節點結構快照', () => {
    const { container } = renderNode(BpmnUserTaskNode, {
      label: '主管核准',
      taskType: 'approve',
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('使用者任務（一般任務）節點結構快照', () => {
    const { container } = renderNode(BpmnUserTaskNode, {
      label: '填寫申請',
      taskType: 'submit',
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('系統服務任務節點結構快照', () => {
    const { container } = renderNode(BpmnServiceTaskNode, { label: '寄送通知' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('互斥閘道節點結構快照', () => {
    const { container } = renderNode(BpmnExclusiveGatewayNode, { label: '金額判斷' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('平行閘道節點結構快照', () => {
    const { container } = renderNode(BpmnParallelGatewayNode, { label: '並行' });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('選取狀態的服務任務節點結構快照', () => {
    const { container } = renderNode(BpmnServiceTaskNode, { label: '寄送通知' }, true);
    expect(container.firstChild).toMatchSnapshot();
  });
});

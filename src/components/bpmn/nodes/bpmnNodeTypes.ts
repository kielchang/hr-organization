import {
  BpmnEndNode,
  BpmnExclusiveGatewayNode,
  BpmnParallelGatewayNode,
  BpmnServiceTaskNode,
  BpmnStartNode,
  BpmnUserTaskNode,
} from './BpmnNodes';

/** React Flow nodeTypes 註冊表（與元件定義分檔，避免 Fast Refresh 警告）。 */
export const bpmnNodeTypes = {
  bpmnStart: BpmnStartNode,
  bpmnEnd: BpmnEndNode,
  bpmnUserTask: BpmnUserTaskNode,
  bpmnServiceTask: BpmnServiceTaskNode,
  bpmnExclusiveGateway: BpmnExclusiveGatewayNode,
  bpmnParallelGateway: BpmnParallelGatewayNode,
} as const;

import type { BpmnProcess } from '../types/bpmn';

/** 預設費用申請流程 */
export const defaultExpenseProcess: BpmnProcess = {
  id: 'proc-expense-default',
  name: '費用申請流程',
  description: '一般費用申請，依金額自動路由至對應核決層級',
  category: '財務',
  createdAt: '2026-06-05T08:00:00+08:00',
  updatedAt: '2026-06-05T08:00:00+08:00',

  approvalThresholds: [
    { jobLevelId: 'jl4', maxApprovalAmount: 0 },       // 專員：無核准權
    { jobLevelId: 'jl3', maxApprovalAmount: 5000 },    // 資深專員：5K
    { jobLevelId: 'jl2', maxApprovalAmount: 20000 },   // 副理：2 萬
    { jobLevelId: 'jl1', maxApprovalAmount: 100000 },  // 經理：10 萬
    { jobLevelId: 'jl5', maxApprovalAmount: 9999999 }, // 總監：無上限
  ],

  nodes: [
    {
      id: 'n-start',
      type: 'bpmnStart',
      position: { x: 80, y: 200 },
      data: { label: '開始' },
    },
    {
      id: 'n-submit',
      type: 'bpmnUserTask',
      position: { x: 220, y: 176 },
      data: {
        label: '填寫費用申請',
        taskType: 'submit',
        assigneeJobLevelIds: ['jl4', 'jl3', 'jl2', 'jl1', 'jl5'],
      },
    },
    {
      id: 'n-gw-amount',
      type: 'bpmnExclusiveGateway',
      position: { x: 420, y: 188 },
      data: { label: '金額判斷', defaultEdgeId: 'e-gw-high' },
    },
    {
      id: 'n-approve-low',
      type: 'bpmnUserTask',
      position: { x: 580, y: 80 },
      data: {
        label: '副理核准',
        taskType: 'approve',
        assigneeJobLevelIds: ['jl2'],
      },
    },
    {
      id: 'n-approve-mid',
      type: 'bpmnUserTask',
      position: { x: 580, y: 200 },
      data: {
        label: '經理核准',
        taskType: 'approve',
        assigneeJobLevelIds: ['jl1'],
      },
    },
    {
      id: 'n-approve-high',
      type: 'bpmnUserTask',
      position: { x: 580, y: 320 },
      data: {
        label: '總監核准',
        taskType: 'approve',
        assigneeJobLevelIds: ['jl5'],
      },
    },
    {
      id: 'n-notify',
      type: 'bpmnServiceTask',
      position: { x: 780, y: 188 },
      data: { label: '通知出納', taskType: 'notify' },
    },
    {
      id: 'n-end',
      type: 'bpmnEnd',
      position: { x: 960, y: 200 },
      data: { label: '結束' },
    },
  ],

  edges: [
    { id: 'e-start', source: 'n-start', target: 'n-submit' },
    { id: 'e-submit', source: 'n-submit', target: 'n-gw-amount' },
    {
      id: 'e-gw-low',
      source: 'n-gw-amount',
      target: 'n-approve-low',
      label: '< 20,000',
      condition: { variable: 'amount', operator: '<', value: 20000 },
    },
    {
      id: 'e-gw-mid',
      source: 'n-gw-amount',
      target: 'n-approve-mid',
      label: '20,000 – 100,000',
      condition: { variable: 'amount', operator: '<', value: 100000 },
    },
    {
      id: 'e-gw-high',
      source: 'n-gw-amount',
      target: 'n-approve-high',
      label: '≥ 100,000',
    },
    { id: 'e-low-notify', source: 'n-approve-low', target: 'n-notify' },
    { id: 'e-mid-notify', source: 'n-approve-mid', target: 'n-notify' },
    { id: 'e-high-notify', source: 'n-approve-high', target: 'n-notify' },
    { id: 'e-notify-end', source: 'n-notify', target: 'n-end' },
  ],
};

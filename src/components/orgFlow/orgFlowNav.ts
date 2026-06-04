import type { ReactFlowProps } from '@xyflow/react';
import type { OrgFlowNavMode } from './OrgFlowControlBar';

type NavProps = Pick<
  ReactFlowProps,
  'panOnScroll' | 'zoomOnScroll' | 'zoomOnPinch' | 'panOnDrag' | 'selectionOnDrag'
>;

/**
 * 滑鼠模式：右鍵拖曳移動、滾輪縮放。
 * 觸控板模式：雙指滑動移動、雙指 pinch 縮放。
 */
export const ORG_FLOW_NAV_PROPS: Record<OrgFlowNavMode, NavProps> = {
  mouse: {
    panOnScroll: false,
    zoomOnScroll: true,
    zoomOnPinch: true,
    panOnDrag: [2], // 右鍵
    selectionOnDrag: false,
  },
  trackpad: {
    panOnScroll: true,
    zoomOnScroll: false,
    zoomOnPinch: true,
    panOnDrag: [1, 2], // 中鍵 / 右鍵；雙指滑動由 panOnScroll 處理
    selectionOnDrag: false,
  },
};

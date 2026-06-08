import { beforeAll, describe, expect, it } from 'vitest';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import {
  Position,
  ReactFlowProvider,
  useStoreApi,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { ReportingEdge, type ReportingEdgeData } from './ReportingEdge';

/**
 * ReportingEdge render smoke。
 *
 * 此元件用 @xyflow/react 的 <BaseEdge> 與 <EdgeLabelRenderer>。後者透過 portal 掛到
 * `store.domNode.querySelector('.react-flow__edgelabel-renderer')`——該容器與 store.domNode
 * 正常由完整 <ReactFlow> 畫布建立。但 ReactFlow 的 edge 管線在 jsdom 不會輸出任何邊
 * （依賴實 DOM 量測 handle bounds，jsdom 量不到 → 邊被過濾），故無法用整張畫布驗單一邊。
 *
 * 因此改以最小 wrapper：在 ReactFlowProvider 內提供一個含 `.react-flow__edgelabel-renderer`
 * 的容器並設為 store.domNode，再直接以 EdgeProps 渲染本元件。如此 EdgeLabelRenderer 的
 * portal host 與 BaseEdge 的 path 皆可確定渲染，斷言不依賴畫布量測（不脆裂）。
 *
 * jsdom 未提供 ResizeObserver（部分 RF 內部需要），比照既有測試補最小 stub。
 */
beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

/** 提供 EdgeLabelRenderer 所需的 portal host（store.domNode + .react-flow__edgelabel-renderer）。 */
function EdgeHost({ children }: { children: ReactNode }) {
  const store = useStoreApi();
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) store.setState({ domNode: ref.current });
  }, [store]);
  return (
    <div ref={ref}>
      <div className="react-flow__edgelabel-renderer" />
      <svg>{children}</svg>
    </div>
  );
}

// data 用 Partial：涵蓋「無 label」與「缺 data（undefined）」兩個 fallback 測試案。
function baseProps(
  data: Partial<ReportingEdgeData> | undefined,
): EdgeProps<Edge<ReportingEdgeData>> {
  return {
    id: 'e1',
    source: 'sup',
    target: 'sub',
    // 上下對齊：source 在底、target 在頂，smoothstep 會在層間留水平段。
    sourceX: 100,
    sourceY: 0,
    targetX: 100,
    targetY: 200,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top,
    data,
  } as unknown as EdgeProps<Edge<ReportingEdgeData>>;
}

function renderEdge(data: Partial<ReportingEdgeData> | undefined) {
  return render(
    <ReactFlowProvider>
      <EdgeHost>
        <ReportingEdge {...baseProps(data)} />
      </EdgeHost>
    </ReactFlowProvider>,
  );
}

/** 取本元件畫的主線 path（BaseEdge 會多畫一條透明 interaction path，這條才是視覺線）。 */
function edgePath(container: HTMLElement): SVGPathElement {
  const path = container.querySelector<SVGPathElement>('path.react-flow__edge-path');
  expect(path).not.toBeNull();
  return path!;
}

describe('ReportingEdge', () => {
  it('有 data.label → 渲染標籤文字，且不出現內建白底（.react-flow__edge-textbg）', () => {
    const { container } = renderEdge({ isPrimary: true, label: '主匯報', offset: 60 });

    // 標籤文字以白底 div 自繪（坐在線上、白底遮住文字底下那一小段線）。
    expect(screen.getByText('主匯報')).toBeInTheDocument();
    // 線連續不被切：絕不出現內建 EdgeText 的白底 rect（本元件從不傳 label 給 BaseEdge）。
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
  });

  it('標籤 div 白底（var(--background)、非透明）、pointerEvents:none（不擋互動）、字級 10', () => {
    renderEdge({ isPrimary: true, label: '主匯報', offset: 60 });
    const label = screen.getByText('主匯報');

    // 反轉先前決定：label 從透明底改白底，坐在線上、白底遮住文字底下那一小段線。
    // 以 inline style 斷言而非 getComputedStyle：jsdom 不解析 CSS 變數，computed 對
    // var(--background) 行為不穩（可能回原字串或空），inline style.backgroundColor 才確定。
    expect(label.style.backgroundColor).toBe('var(--background)');
    expect(label.style.backgroundColor).not.toBe('');
    expect(label.style.backgroundColor).not.toBe('transparent');
    expect(label.style.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(label.style.pointerEvents).toBe('none');
    expect(label.style.fontSize).toBe('10px');
  });

  it('標籤 div 置中坐在線上：transform 不含 translateY(-10px)（不再浮在線上方）', () => {
    renderEdge({ isPrimary: true, label: '主匯報', offset: 60 });
    const label = screen.getByText('主匯報');

    // 反轉先前「浮在線上方 10px」決定：transform 只 translate(-50%,-50%) + labelX/labelY，
    // 不得再有把 label 往上推的 translateY(-10px)。
    expect(label.style.transform).toContain('translate(-50%, -50%)');
    expect(label.style.transform).not.toContain('translateY(-10px)');
    expect(label.style.transform).not.toContain('-10px');
  });

  it('無 data.label → 不渲染標籤（純線）', () => {
    const { container } = renderEdge({ isPrimary: true, offset: 60 });
    expect(screen.queryByText('主匯報')).not.toBeInTheDocument();
    expect(screen.queryByText('虛線匯報')).not.toBeInTheDocument();
    expect(container.querySelector('.react-flow__edge-textbg')).toBeNull();
    // 線仍在。
    expect(edgePath(container)).toBeTruthy();
  });

  it('主匯報（isPrimary true）為實線、strokeWidth 2、無 dash', () => {
    const { container } = renderEdge({ isPrimary: true, label: '主匯報', offset: 60 });
    const path = edgePath(container);
    // strokeWidth 為 SVG presentation 屬性，jsdom 序列化為無單位字串。
    expect(path.style.strokeWidth).toBe('2');
    expect(path.style.strokeDasharray).toBe('');
  });

  it('次要匯報（isPrimary false）為虛線、strokeWidth 1.5、帶 dash', () => {
    const { container } = renderEdge({ isPrimary: false, label: '虛線匯報', offset: 60 });
    const path = edgePath(container);
    expect(path.style.strokeWidth).toBe('1.5');
    // 非只靠顏色區分：以 dash 與主匯報實線區隔（a11y）。
    expect(path.style.strokeDasharray).toBe('6 4');
  });

  it('主 vs 次線型相異（strokeWidth 與 dash 皆不同）', () => {
    const { container: primaryC } = renderEdge({ isPrimary: true, label: '主匯報', offset: 60 });
    const primaryPath = edgePath(primaryC);

    const { container: dottedC } = renderEdge({ isPrimary: false, label: '虛線匯報', offset: 60 });
    const dottedPath = edgePath(dottedC);

    expect(primaryPath.style.strokeWidth).not.toBe(dottedPath.style.strokeWidth);
    expect(primaryPath.style.strokeDasharray).not.toBe(dottedPath.style.strokeDasharray);
  });

  it('未帶 data（無 isPrimary/label）也不拋錯：退為次要線型、無標籤', () => {
    // 防禦性：data 缺失時 isPrimary 視為 false（次要），不應 throw。
    const { container } = renderEdge(undefined);
    const path = edgePath(container);
    expect(path.style.strokeWidth).toBe('1.5');
    expect(screen.queryByText('主匯報')).not.toBeInTheDocument();
  });
});

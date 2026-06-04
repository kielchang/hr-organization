import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react';
import { MiniMap, Panel } from '@xyflow/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ORG_FLOW_MINIMAP_COMPACT_MAX_CLASS } from './orgFlowLayout';

interface OrgFlowFullscreenProps {
  isFullscreen: boolean;
  onToggle: () => void;
}

export function OrgFlowFullscreenButton({ isFullscreen, onToggle }: OrgFlowFullscreenProps) {
  return (
    <Panel position="top-right" className="org-flow-chrome-panel !m-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 bg-card/90 shadow-sm backdrop-blur-sm"
        onClick={onToggle}
        title={isFullscreen ? '離開全螢幕' : '全螢幕'}
      >
        {isFullscreen ? (
          <>
            <Minimize2 className="size-3.5" />
            離開
          </>
        ) : (
          <>
            <Maximize2 className="size-3.5" />
            全螢幕
          </>
        )}
      </Button>
    </Panel>
  );
}

interface OrgFlowMiniMapPanelProps {
  show: boolean;
  onToggle: () => void;
  /** 人員詳情開啟時縮小觀景窗本體高度 */
  compact?: boolean;
  className?: string;
}

export function OrgFlowMiniMap({
  show,
  onToggle,
  compact = false,
  className,
}: OrgFlowMiniMapPanelProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const [minimapSize, setMinimapSize] = useState<{ width: number; height: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    const el = measureRef.current;
    if (!el || !show) return;

    const syncSize = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 1 || height < 1) return;
      setMinimapSize({ width: Math.round(width), height: Math.round(height) });
    };

    syncSize();
    const observer = new ResizeObserver(syncSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [show, compact]);

  return (
    <div
      className={cn(
        'org-flow-minimap flex w-full flex-col overflow-hidden rounded-xl border border-border bg-card/95 shadow-md ring-1 ring-foreground/5 backdrop-blur-sm',
        compact && 'org-flow-minimap--compact',
        className,
      )}
    >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 rounded-none border-b border-border text-xs text-muted-foreground hover:text-foreground"
          onClick={onToggle}
          title={show ? '隱藏觀景窗' : '顯示觀景窗'}
        >
          {show ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
          觀景窗
        </Button>
        <div
          className={cn(
            'org-flow-minimap-slide overflow-hidden transition-[max-height] duration-300 ease-out',
            show
              ? compact
                ? ORG_FLOW_MINIMAP_COMPACT_MAX_CLASS
                : 'max-h-[200px]'
              : 'max-h-0',
          )}
        >
          <div
            ref={measureRef}
            className={cn(
              'w-full shrink-0',
              compact ? 'h-[5rem]' : 'h-[10rem]',
            )}
          >
            {minimapSize ? (
              <MiniMap
                zoomable
                pannable
                style={{ width: minimapSize.width, height: minimapSize.height }}
                className="org-flow-minimap-canvas !relative !bottom-auto !right-auto !m-0 !h-full !w-full !rounded-none !shadow-none"
              />
            ) : null}
          </div>
        </div>
    </div>
  );
}

/** @deprecated 觀景窗已併入左欄；請用 OrgFlowMiniMap */
export const OrgFlowMiniMapPanel = OrgFlowMiniMap;

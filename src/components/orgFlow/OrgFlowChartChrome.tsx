import { useEffect, useState } from 'react';
import { Maximize2, Minimize2, PictureInPicture2, X } from 'lucide-react';
import { MiniMap, Panel } from '@xyflow/react';
import { animated, useSpring, useTransition } from '@react-spring/web';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
  className?: string;
}

const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 150;
const FAB = 36;
const FAB_INSET = 8; // 圓鈕距觀景窗內側邊的內凹
/** 圓鈕開啟位（內凹在觀景窗右上角）相對休息位（右下）的位移 */
const FAB_OPEN_X = -FAB_INSET;
const FAB_OPEN_Y = -(MINIMAP_HEIGHT - FAB - FAB_INSET); // = -106
/** 地圖縮放：俐落帶一點回彈 */
const SPRING_CONFIG = { tension: 320, friction: 22 };
/** 開啟（往上回到角落）：snappy 少回彈 */
const FAB_RISE_CONFIG = { tension: 320, friction: 24 };
/** 圓鈕休息位（0）到下方控制列上緣的距離＝兩者間距 gap-2 */
const FAB_CONTACT_Y = 8;
/** 墜落：快、clamp 不穿透 → 硬碰在控制列上緣 */
const FAB_FALL_CONFIG = { tension: 900, friction: 30, clamp: true };
/** 彈跳峰值（負＝向上）：第一下大，之後驟降成小幅快速收尾（大→小→小） */
const FAB_BOUNCE_PEAKS = [-30, -7, -2];
/** 向上彈起：快速 */
const FAB_UP_CONFIG = { tension: 520, friction: 16 };
/** 往下墜回控制列上緣：clamp → 硬碰實體頂面、不穿透 */
const FAB_DOWN_CONFIG = { tension: 760, friction: 24, clamp: true };
/** 最終落定休息位 */
const FAB_SETTLE_CONFIG = { tension: 320, friction: 20 };

/**
 * 右下角浮動觀景窗（react-spring 物理動畫）：
 * - 收合 → 地圖以右上角為原點被「吸進」圓鈕（scale→0、淡出），圓鈕回到右下並顯示觀景窗 icon。
 * - 展開 → 地圖從圓鈕彈出（scale 0→1，帶回彈），圓鈕變 ✕ 並浮到地圖右上角外。
 * 地圖與圓鈕共用同一個 spring 進度值 `t`（0=收合, 1=展開），確保動作同步。
 */
export function OrgFlowMiniMap({ show, onToggle, className }: OrgFlowMiniMapPanelProps) {
  // dock 尺寸（撐開下方控制列位置）
  const dock = useSpring({
    width: show ? MINIMAP_WIDTH : FAB,
    height: show ? MINIMAP_HEIGHT : FAB,
    config: SPRING_CONFIG,
  });

  // 圓鈕位移：開啟→內凹在觀景窗右上角；關閉→墜落硬碰控制列上緣後回彈到休息位
  const [fab, fabApi] = useSpring(() => ({
    x: show ? FAB_OPEN_X : 0,
    y: show ? FAB_OPEN_Y : 0,
  }));

  // 旋轉（獨立並行）：關閉時 ✕ 轉一圈像把觀景窗轉著吸進去；開啟時轉回
  const spin = useSpring({
    turn: show ? 0 : 1,
    config: { tension: 240, friction: 18 },
  });

  // icon：開啟＝✕；關閉時等吸收旋轉到一半再換成觀景窗 icon
  const [iconClosed, setIconClosed] = useState(!show);

  useEffect(() => {
    if (show) {
      setIconClosed(false);
      fabApi.start({ x: FAB_OPEN_X, y: FAB_OPEN_Y, config: FAB_RISE_CONFIG });
      return;
    }
    const swap = setTimeout(() => setIconClosed(true), 220);
    fabApi.start({
      to: async (next) => {
        // 1) 快速墜落，clamp 硬碰控制列上緣（不穿透）
        await next({ x: 0, y: FAB_CONTACT_Y, config: FAB_FALL_CONFIG });
        // 2) 多次彈跳：每次往上峰值遞減，往下都硬碰上緣 → 來回逐漸變小
        for (const peak of FAB_BOUNCE_PEAKS) {
          await next({ y: peak, config: FAB_UP_CONFIG });
          await next({ y: FAB_CONTACT_Y, config: FAB_DOWN_CONFIG });
        }
        // 3) 收尾落定休息位
        await next({ y: 0, config: FAB_SETTLE_CONFIG });
      },
    });
    return () => clearTimeout(swap);
  }, [show, fabApi]);

  // 地圖只在展開時掛載；進出場各自跑彈簧（吸入／彈出）
  const mapTransition = useTransition(show, {
    from: { scale: 0, opacity: 0 },
    enter: { scale: 1, opacity: 1 },
    leave: { scale: 0, opacity: 0 },
    config: SPRING_CONFIG,
  });

  return (
    <animated.div
      className={cn('org-flow-minimap relative flex justify-end', className)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* spacer：撐出 dock 高度（彈簧驅動），下方控制列隨之定位 */}
      <animated.div style={{ width: dock.width, height: dock.height }} />

      {/* 地圖：絕對定位、以右上角為原點縮放（朝向圓鈕收合位＝dock 右上） */}
      {mapTransition((style, visible) =>
        visible ? (
          <animated.div
            className="absolute right-0 top-0 origin-top-right"
            style={{ opacity: style.opacity, scale: style.scale }}
          >
            <div className="h-[150px] w-[220px] overflow-hidden rounded-2xl border border-border bg-card/95 shadow-lg ring-1 ring-foreground/5 backdrop-blur-sm">
              <MiniMap
                zoomable
                pannable
                style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
                className="org-flow-minimap-canvas !relative !bottom-auto !right-auto !m-0 !h-full !w-full !rounded-none !shadow-none"
              />
            </div>
          </animated.div>
        ) : null,
      )}

      {/* 圓鈕：錨在 dock 右下（休息位）；開啟時上移內凹到觀景窗右上角，關閉時掉落回彈 */}
      <animated.button
        type="button"
        onClick={onToggle}
        title={show ? '收合觀景窗' : '開啟觀景窗'}
        aria-expanded={show}
        className="absolute bottom-0 right-0 z-10 flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md ring-1 ring-foreground/5 transition-colors hover:bg-muted hover:text-foreground"
        style={{ x: fab.x, y: fab.y, rotate: spin.turn.to((t) => t * 360) }}
      >
        {iconClosed ? (
          <PictureInPicture2 className="size-4 shrink-0" />
        ) : (
          <X className="size-4 shrink-0" />
        )}
      </animated.button>
    </animated.div>
  );
}

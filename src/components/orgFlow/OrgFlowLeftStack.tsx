import { useState, type RefObject } from 'react';
import { cn } from '@/lib/utils';
import { OrgFlowDrawerRail } from './OrgFlowDrawerRail';
import { OrgFlowLeftDrawer } from './OrgFlowLeftDrawer';
import { OrgFlowMiniMap } from './OrgFlowChartChrome';
import { OrgDetailPanel } from './OrgDetailPanel';
import { OrgFlowControls, type OrgFlowChartVariant } from './OrgFlowControls';
import type { Group } from '../../types/org';

interface OrgFlowLeftStackProps {
  sidebarRef: RefObject<HTMLDivElement | null>;
  variant: OrgFlowChartVariant;
  selectedGroupId: string;
  onGroupChange: (groupId: string) => void;
  activeGroups: Group[];
  mountNode: HTMLElement | null;
  selectedEmployeeId: string | null;
  onCloseDetail: () => void;
  showMiniMap: boolean;
  onToggleMiniMap: () => void;
  miniMapCompact: boolean;
}

export function OrgFlowLeftStack({
  sidebarRef,
  variant,
  selectedGroupId,
  onGroupChange,
  activeGroups,
  mountNode,
  selectedEmployeeId,
  onCloseDetail,
  showMiniMap,
  onToggleMiniMap,
  miniMapCompact,
}: OrgFlowLeftStackProps) {
  const hasDetail = !!selectedEmployeeId;
  const [drawerOpen, setDrawerOpen] = useState(true);

  return (
    <div
      ref={sidebarRef}
      className={cn(
        'org-flow-toolbar-shell flex h-full min-h-0 shrink-0 items-stretch rounded-none border-0 border-r border-border/50 bg-background/45 backdrop-blur-md',
        drawerOpen && 'org-flow-toolbar-shell--open',
      )}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {drawerOpen && (
        <OrgFlowLeftDrawer>
          <div className="shrink-0">
            <OrgFlowControls
              variant={variant}
              selectedGroupId={selectedGroupId}
              onGroupChange={onGroupChange}
              activeGroups={activeGroups}
              mountNode={mountNode}
            />
          </div>

          <div className="org-flow-left-chrome__main">
            {hasDetail && (
              <OrgDetailPanel
                employeeId={selectedEmployeeId}
                onClose={onCloseDetail}
                portalContainer={mountNode}
              />
            )}
          </div>

          <OrgFlowMiniMap
            show={showMiniMap}
            onToggle={onToggleMiniMap}
            compact={miniMapCompact}
          />
        </OrgFlowLeftDrawer>
      )}

      <OrgFlowDrawerRail
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
      />
    </div>
  );
}

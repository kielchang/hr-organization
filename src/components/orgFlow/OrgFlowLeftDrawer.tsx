import { forwardRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ORG_FLOW_SIDEBAR_WIDTH_CLASS } from './orgFlowLayout';

interface OrgFlowLeftDrawerProps {
  children: ReactNode;
  className?: string;
}

/** 工具列內容區（毛玻璃左半）；收合由右側長條控制 */
export const OrgFlowLeftDrawer = forwardRef<HTMLDivElement, OrgFlowLeftDrawerProps>(
  function OrgFlowLeftDrawer({ children, className }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'org-flow-left-drawer flex h-full min-h-0 shrink-0 flex-col overflow-hidden rounded-none border-0 bg-transparent shadow-none',
          ORG_FLOW_SIDEBAR_WIDTH_CLASS,
          className,
        )}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="org-flow-left-chrome org-flow-left-drawer__inner min-h-0 flex-1">
          {children}
        </div>
      </div>
    );
  },
);

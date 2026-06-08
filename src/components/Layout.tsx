import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Building2,
  FileSpreadsheet,
  GitCompare,
  History,
  LayoutDashboard,
  LayoutPanelLeft,
  Map as MapIcon,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DataToolbar } from './DataToolbar';
import { DeployInfo } from './DeployInfo';
import { CloudSyncBanner } from './CloudSyncBanner';
import { onStorageError } from '../services/storage';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * 旅程優先的側欄分層：主要區（日常工作面）→ 次要區（分析與紀錄、視覺降級）
 * → 頁尾 meta 區（推到最底、最低視覺層級）。「組織圖」已併入工作台第 3 視角故移除。
 */
const primaryNav: ReadonlyArray<NavItem> = [
  { to: '/', label: '總覽', icon: LayoutDashboard },
  { to: '/workbench', label: '工作台', icon: LayoutPanelLeft },
  { to: '/people', label: '人員與歸屬', icon: Users },
  { to: '/groups', label: '組別管理', icon: Building2 },
];

const secondaryNav: ReadonlyArray<NavItem> = [
  { to: '/health', label: '規劃健檢', icon: Activity },
  { to: '/compare', label: '情境比較', icon: GitCompare },
  { to: '/bpmn/impact', label: '變更影響', icon: TriangleAlert },
  { to: '/changelog', label: '調整紀錄', icon: History },
];

const metaNav: ReadonlyArray<NavItem> = [
  { to: '/csv-import', label: 'CSV 匯入', icon: FileSpreadsheet },
  { to: '/roadmap', label: '改善 Roadmap', icon: MapIcon },
];

function NavSectionLinks({
  items,
  end,
}: {
  items: ReadonlyArray<NavItem>;
  end?: boolean;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={end ? item.to === '/' : false}
            className="app-nav-link"
          >
            <Icon className="size-4 shrink-0" />
            {item.label}
          </NavLink>
        );
      })}
    </>
  );
}

export function Layout() {
  const [storageFailed, setStorageFailed] = useState(false);

  useEffect(() => onStorageError(() => setStorageFailed(true)), []);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-56 shrink-0 flex-col gap-4 border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground">
        <div>
          <h1 className="font-heading text-lg font-semibold tracking-tight">HR 組織</h1>
          <p className="text-xs text-muted-foreground">架構調整工具</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {/* 主要區：日常工作面，置頂 */}
          <NavSectionLinks items={primaryNav} end />

          {/* 次要區：分析與紀錄，與主要區之間一條細分隔線、視覺降級 */}
          <div className="mt-3 border-t border-sidebar-border pt-3">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              分析與紀錄
            </p>
            <NavSectionLinks items={secondaryNav} />
          </div>

          {/* 頁尾 meta 區：推到最底、最低視覺層級 */}
          <div className="mt-auto border-t border-sidebar-border pt-3 text-[0.8rem]">
            <NavSectionLinks items={metaNav} />
          </div>
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <DataToolbar />
            <DeployInfo />
          </div>
        </header>
        <CloudSyncBanner />
        {storageFailed && (
          <div
            role="alert"
            className="flex items-center gap-2 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-800"
          >
            <TriangleAlert className="size-4 shrink-0" />
            <span className="flex-1">
              無法寫入瀏覽器儲存空間（可能已達容量上限）。變更已套用於畫面，但
              <strong className="font-semibold">未自動保存</strong>
              ，請盡快「匯出目前資料」備份。
            </span>
            <button
              type="button"
              onClick={() => setStorageFailed(false)}
              className="shrink-0 rounded p-1 hover:bg-amber-100"
              aria-label="關閉提示"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Activity,
  Building2,
  FileSpreadsheet,
  GitBranch,
  GitCompare,
  History,
  TriangleAlert,
  Users,
  X,
} from 'lucide-react';
import { DataToolbar } from './DataToolbar';
import { DeployInfo } from './DeployInfo';
import { onStorageError } from '../services/storage';

const navItems = [
  { to: '/', label: '人員與歸屬', icon: Users },
  { to: '/groups', label: '組別管理', icon: Building2 },
  { to: '/org-chart', label: '組織圖', icon: GitBranch },
  { to: '/health', label: '規劃健檢', icon: Activity },
  { to: '/compare', label: '情境比較', icon: GitCompare },
  { to: '/bpmn/impact', label: '變更影響', icon: TriangleAlert },
  { to: '/changelog', label: '調整紀錄', icon: History },
  { to: '/csv-import', label: 'CSV 匯入', icon: FileSpreadsheet },
] as const;

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
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className="app-nav-link"
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-border bg-card px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <DataToolbar />
            <DeployInfo />
          </div>
        </header>
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

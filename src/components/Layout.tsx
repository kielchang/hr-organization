import { NavLink, Outlet } from 'react-router-dom';
import {
  Building2,
  FileSpreadsheet,
  GitBranch,
  History,
  Users,
  Workflow,
} from 'lucide-react';
import { DataToolbar } from './DataToolbar';
import { DeployInfo } from './DeployInfo';

const navItems = [
  { to: '/', label: '人員與歸屬', icon: Users },
  { to: '/groups', label: '組別管理', icon: Building2 },
  { to: '/org-chart', label: '組織圖', icon: GitBranch },
  { to: '/bpmn', label: 'BPMN 流程', icon: Workflow },
  { to: '/changelog', label: '調整紀錄', icon: History },
  { to: '/csv-import', label: 'CSV 匯入', icon: FileSpreadsheet },
] as const;

export function Layout() {
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
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

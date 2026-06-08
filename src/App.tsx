import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { OrgProvider } from './context/OrgProvider';
import { BpmnProvider } from './context/BpmnProvider';
import { Layout } from './components/Layout';

// 以路由為單位做 code-splitting：React Flow / dagre 等較重的相依只在
// 進入組織圖／BPMN 等頁面時才載入，縮小首屏 bundle。
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const PeoplePage = lazy(() => import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })));
const GroupsPage = lazy(() => import('./pages/GroupsPage').then((m) => ({ default: m.GroupsPage })));
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage').then((m) => ({ default: m.WorkbenchPage })));
const OrgHealthPage = lazy(() => import('./pages/OrgHealthPage').then((m) => ({ default: m.OrgHealthPage })));
const ScenarioComparePage = lazy(() => import('./pages/ScenarioComparePage').then((m) => ({ default: m.ScenarioComparePage })));
const ChangeLogPage = lazy(() => import('./pages/ChangeLogPage').then((m) => ({ default: m.ChangeLogPage })));
const CsvImportPage = lazy(() => import('./pages/CsvImportPage').then((m) => ({ default: m.CsvImportPage })));
const BpmnListPage = lazy(() => import('./pages/BpmnListPage').then((m) => ({ default: m.BpmnListPage })));
const BpmnDesignerPage = lazy(() => import('./pages/BpmnDesignerPage').then((m) => ({ default: m.BpmnDesignerPage })));
const BpmnSimulatePage = lazy(() => import('./pages/BpmnSimulatePage').then((m) => ({ default: m.BpmnSimulatePage })));
const BpmnImpactPage = lazy(() => import('./pages/BpmnImpactPage').then((m) => ({ default: m.BpmnImpactPage })));
const RoadmapPage = lazy(() => import('./pages/RoadmapPage').then((m) => ({ default: m.RoadmapPage })));

function PageFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function App() {
  return (
    <OrgProvider>
      <BpmnProvider>
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<OverviewPage />} />
                <Route path="people" element={<PeoplePage />} />
                <Route path="groups" element={<GroupsPage />} />
                <Route path="workbench" element={<WorkbenchPage />} />
                {/* /org-chart 已併入 /workbench 第 3 視角；保留路由並導向，避免舊連結失效。 */}
                <Route path="org-chart" element={<Navigate to="/workbench" replace />} />
                <Route path="health" element={<OrgHealthPage />} />
                <Route path="compare" element={<ScenarioComparePage />} />
                <Route path="changelog" element={<ChangeLogPage />} />
                <Route path="csv-import" element={<CsvImportPage />} />
                <Route path="roadmap" element={<RoadmapPage />} />
                <Route path="bpmn" element={<BpmnListPage />} />
                <Route path="bpmn/impact" element={<BpmnImpactPage />} />
                <Route path="bpmn/:processId" element={<BpmnDesignerPage />} />
                <Route path="bpmn/:processId/simulate" element={<BpmnSimulatePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </BpmnProvider>
    </OrgProvider>
  );
}

export default App;

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { OrgProvider } from './context/OrgProvider';
import { BpmnProvider } from './context/BpmnProvider';
import { Layout } from './components/Layout';
import { PeoplePage } from './pages/PeoplePage';
import { GroupsPage } from './pages/GroupsPage';
import { OrgChartPage } from './pages/OrgChartPage';
import { ChangeLogPage } from './pages/ChangeLogPage';
import { CsvImportPage } from './pages/CsvImportPage';
import { BpmnListPage } from './pages/BpmnListPage';
import { BpmnDesignerPage } from './pages/BpmnDesignerPage';
import { BpmnSimulatePage } from './pages/BpmnSimulatePage';
import { BpmnImpactPage } from './pages/BpmnImpactPage';

function App() {
  return (
    <OrgProvider>
      <BpmnProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<PeoplePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="org-chart" element={<OrgChartPage />} />
              <Route path="changelog" element={<ChangeLogPage />} />
              <Route path="csv-import" element={<CsvImportPage />} />
              <Route path="bpmn" element={<BpmnListPage />} />
              <Route path="bpmn/impact" element={<BpmnImpactPage />} />
              <Route path="bpmn/:processId" element={<BpmnDesignerPage />} />
              <Route path="bpmn/:processId/simulate" element={<BpmnSimulatePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </BpmnProvider>
    </OrgProvider>
  );
}

export default App;

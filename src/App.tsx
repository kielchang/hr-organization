import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { OrgProvider } from './context/OrgProvider';
import { Layout } from './components/Layout';
import { PeoplePage } from './pages/PeoplePage';
import { GroupsPage } from './pages/GroupsPage';
import { OrgChartPage } from './pages/OrgChartPage';
import { ChangeLogPage } from './pages/ChangeLogPage';
import { CsvImportPage } from './pages/CsvImportPage';

function App() {
  return (
    <FluentProvider theme={webLightTheme}>
      <OrgProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<PeoplePage />} />
              <Route path="groups" element={<GroupsPage />} />
              <Route path="org-chart" element={<OrgChartPage />} />
              <Route path="changelog" element={<ChangeLogPage />} />
              <Route path="csv-import" element={<CsvImportPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </FluentProvider>
  );
}

export default App;

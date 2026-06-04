import { useRef, useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  Input,
  MessageBar,
  MessageBarBody,
  Subtitle2,
  Text,
  Title2,
  Field,
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular,
  ArrowUpload24Regular,
  Play24Regular,
} from '@fluentui/react-icons';
import {
  CSV_MEMBER_COLUMNS,
  csvMemberRowsToOrgData,
  orgDataToCsvMemberRows,
} from '../services/csvToOrgData';
import { useOrg } from '../context/OrgContext';
import { downloadCsvText, downloadOrgData } from '../services/exportImport';
import { MOCK_DATA_DIR } from '../services/dataVersions';

export function CsvImportPage() {
  const { data } = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [outputName, setOutputName] = useState('org-data-imported');
  const [version, setVersion] = useState('1');
  const [result, setResult] = useState<ReturnType<typeof csvMemberRowsToOrgData> | null>(
    null,
  );

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
    setResult(null);
    e.target.value = '';
  };

  const runConvert = () => {
    const v = Number(version);
    setResult(
      csvMemberRowsToOrgData(csvText, {
        version: Number.isFinite(v) && v >= 1 ? v : 1,
      }),
    );
  };

  const downloadJson = () => {
    if (!result?.valid) return;
    downloadOrgData(result.data, `${outputName.trim() || 'org-data-imported'}.json`);
  };

  const downloadTemplate = () => {
    const header = CSV_MEMBER_COLUMNS.join(',');
    const content = [
      '# 成員歸屬 CSV 範本',
      header,
      'E001,範例員工,active,RD,研發部,CEO,active,ST,專員,10,,,1',
    ].join('\n');
    downloadCsvText(`${content}\n`, 'org-members.template.csv');
  };

  const exportCurrentCsv = () => {
    downloadCsvText(orgDataToCsvMemberRows(data), 'org-members-export.csv');
  };

  const outputId = outputName.trim() || 'org-data-imported';
  const cliCommand = `npm run import:csv -- -i ./your-file.csv -o ${outputId} -v ${version}`;

  return (
    <div className="csv-import-page">
      <Title2>CSV 轉 JSON</Title2>
      <Text className="page-desc">
        以「一列一筆成員歸屬」整理組織資料，轉成 JSON 後可下載，或透過指令寫入本機{' '}
        <code>{MOCK_DATA_DIR}</code>（不進版控）並在版本選單切換。
      </Text>

      <Card className="csv-import-card">
        <CardHeader header={<Subtitle2>1. 準備 CSV</Subtitle2>} />
        <div className="csv-import-actions">
          <Button icon={<ArrowDownload24Regular />} onClick={downloadTemplate}>
            下載欄位範本
          </Button>
          <Button appearance="secondary" onClick={exportCurrentCsv}>
            匯出目前版本為 CSV
          </Button>
          <Button
            icon={<ArrowUpload24Regular />}
            onClick={() => fileRef.current?.click()}
          >
            選擇 CSV 檔案
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={onFile}
          />
        </div>
        <Text size={200} className="csv-columns-hint">
          必要欄位：{CSV_MEMBER_COLUMNS.join(', ')}
        </Text>
      </Card>

      <Card className="csv-import-card">
        <CardHeader header={<Subtitle2>2. 預覽與轉換</Subtitle2>} />
        <textarea
          className="csv-textarea"
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setResult(null);
          }}
          placeholder="貼上 CSV 內容，或從上方選擇檔案…"
          rows={12}
        />
        <div className="csv-import-meta">
          <Field label="輸出檔名（不含 .json）">
            <Input
              value={outputName}
              onChange={(_e, d) => setOutputName(d.value)}
              placeholder="org-data-imported"
            />
          </Field>
          <Field label="version">
            <Input
              value={version}
              onChange={(_e, d) => setVersion(d.value)}
              type="number"
              style={{ width: 100 }}
            />
          </Field>
          <Button
            appearance="primary"
            icon={<Play24Regular />}
            onClick={runConvert}
            disabled={!csvText.trim()}
          >
            驗證並預覽
          </Button>
        </div>
        {result && (
          <div className="csv-import-result">
            <Text>
              {result.rowCount} 列 · 員工 {result.data.employees.length} · 組別{' '}
              {result.data.groups.length} · 歸屬 {result.data.assignments.length}
            </Text>
            {result.valid ? (
              <MessageBar intent="success">
                <MessageBarBody>解析與驗證通過，可下載 JSON。</MessageBarBody>
              </MessageBar>
            ) : (
              <MessageBar intent="error">
                <MessageBarBody>
                  <ul className="version-validation-list">
                    {[...result.parseErrors, ...result.validationErrors].map(
                      (err) => (
                        <li key={err}>{err}</li>
                      ),
                    )}
                  </ul>
                </MessageBarBody>
              </MessageBar>
            )}
            <Button
              icon={<ArrowDownload24Regular />}
              disabled={!result.valid}
              onClick={downloadJson}
            >
              下載 JSON
            </Button>
          </div>
        )}
      </Card>

      <Card className="csv-import-card">
        <CardHeader
          header={<Subtitle2>3. 寫入 {MOCK_DATA_DIR}（本機版本，不進版控）</Subtitle2>}
        />
        <Text>
          瀏覽器無法直接寫入專案資料夾，請在專案根目錄執行：
        </Text>
        <pre className="csv-cli-block">
          <code>{cliCommand}</code>
        </pre>
        <Text size={200}>
          成功後重新啟動 <code>npm run dev</code>，即可在頂部「資料版本」選單選擇{' '}
          <code>{outputId}</code>。若要更新各環境共用的初始資料，請改覆蓋{' '}
          <code>src/data/org-data.json</code>。
        </Text>
        <Text size={200}>
          完整範例 CSV：
          <code>src/data/templates/org-members.sample.csv</code>
        </Text>
      </Card>
    </div>
  );
}

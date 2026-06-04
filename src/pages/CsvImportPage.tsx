import { useRef, useState } from 'react';
import { Download, Play, Upload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  CSV_MEMBER_COLUMNS,
  csvMemberRowsToOrgData,
  orgDataToCsvMemberRows,
} from '../services/csvToOrgData';
import { useOrg } from '../context/useOrg';
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">CSV 轉 JSON</h2>
        <p className="text-sm text-muted-foreground">
          以「一列一筆成員歸屬」整理組織資料，轉成 JSON 後可下載，或透過指令寫入本機{' '}
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">{MOCK_DATA_DIR}</code>
          （不進版控）並在版本選單切換。
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>1. 準備 CSV</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={downloadTemplate}>
              <Download className="size-4" />
              下載欄位範本
            </Button>
            <Button type="button" variant="outline" onClick={exportCurrentCsv}>
              匯出目前版本為 CSV
            </Button>
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
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
          <CardDescription className="break-all">
            必要欄位：{CSV_MEMBER_COLUMNS.join(', ')}
          </CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. 預覽與轉換</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0">
          <Textarea
            className="min-h-48 font-mono text-xs"
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              setResult(null);
            }}
            placeholder="貼上 CSV 內容，或從上方選擇檔案…"
            rows={12}
          />
          <div className="flex flex-wrap items-end gap-4">
            <div className="grid gap-2">
              <Label htmlFor="csv-output-name">輸出檔名（不含 .json）</Label>
              <Input
                id="csv-output-name"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                placeholder="org-data-imported"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="csv-version">version</Label>
              <Input
                id="csv-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                type="number"
                className="w-24"
              />
            </div>
            <Button type="button" disabled={!csvText.trim()} onClick={runConvert}>
              <Play className="size-4" />
              驗證並預覽
            </Button>
          </div>
          {result && (
            <div className="grid gap-3">
              <p className="text-sm">
                {result.rowCount} 列 · 員工 {result.data.employees.length} · 組別{' '}
                {result.data.groups.length} · 歸屬 {result.data.assignments.length}
              </p>
              {result.valid ? (
                <Alert>
                  <AlertDescription>解析與驗證通過，可下載 JSON。</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertDescription>
                    <ul className="list-inside list-disc space-y-0.5">
                      {[...result.parseErrors, ...result.validationErrors].map((err) => (
                        <li key={err}>{err}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={!result.valid}
                onClick={downloadJson}
              >
                <Download className="size-4" />
                下載 JSON
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. 寫入 {MOCK_DATA_DIR}（本機版本，不進版控）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 pt-0 text-sm text-muted-foreground">
          <p>瀏覽器無法直接寫入專案資料夾，請在專案根目錄執行：</p>
          <pre className="overflow-x-auto rounded-lg bg-foreground px-4 py-3 font-mono text-xs text-background">
            <code>{cliCommand}</code>
          </pre>
          <p>
            成功後重新啟動 <code className="rounded-md bg-muted px-1 text-xs">npm run dev</code>
            ，即可在頂部「資料版本」選單選擇{' '}
            <code className="rounded-md bg-muted px-1 text-xs">{outputId}</code>
            。若要更新各環境共用的初始資料，請改覆蓋{' '}
            <code className="rounded-md bg-muted px-1 text-xs">src/data/org-data.json</code>。
          </p>
          <p>
            完整範例 CSV：
            <code className="rounded-md bg-muted px-1 text-xs">
              src/data/templates/org-members.sample.csv
            </code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

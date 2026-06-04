import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ChangeEntry } from '../types/org';
import { useOrg } from '../context/useOrg';

const changeTypeLabels: Record<string, string> = {
  employee_create: '新增員工',
  employee_update: '更新員工',
  employee_delete: '刪除員工',
  group_create: '新增組別',
  group_update: '更新組別',
  group_delete: '刪除組別',
  assignment_create: '新增歸屬',
  assignment_update: '更新歸屬',
  assignment_delete: '刪除歸屬',
  import: '匯入資料',
};

export function ChangeLogPage() {
  const { data } = useOrg();
  const [diffEntry, setDiffEntry] = useState<ChangeEntry | null>(null);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString('zh-TW');
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold tracking-tight">調整紀錄</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          每次變更會寫入紀錄並自動下載完整 org-data JSON。若要更新各環境共用的初始資料可覆蓋{' '}
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">src/data/org-data.json</code>
          ；本機試用版本請放到{' '}
          <code className="rounded-md bg-muted px-1.5 py-0.5 text-xs">src/data/mock/</code>
          （已在 .gitignore）。
        </p>
      </header>
      <div className="rounded-xl border border-border bg-card shadow-sm ring-1 ring-foreground/5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>時間</TableHead>
              <TableHead>操作者</TableHead>
              <TableHead>類型</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-20">Diff</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.changeLog.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  尚無調整紀錄
                </TableCell>
              </TableRow>
            ) : (
              data.changeLog.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatTime(entry.timestamp)}</TableCell>
                  <TableCell>{entry.operator}</TableCell>
                  <TableCell>
                    {changeTypeLabels[entry.changeType] ?? entry.changeType}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">
                    {entry.summary}
                  </TableCell>
                  <TableCell>
                    {(entry.before || entry.after) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setDiffEntry(entry)}
                      >
                        檢視
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={!!diffEntry} onOpenChange={(open) => !open && setDiffEntry(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>變更內容</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            {diffEntry?.before && (
              <div className="grid gap-2">
                <p className="text-sm font-semibold">變更前</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                  {diffEntry.before}
                </pre>
              </div>
            )}
            {diffEntry?.after && (
              <div className="grid gap-2">
                <p className="text-sm font-semibold">變更後</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs">
                  {diffEntry.after}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

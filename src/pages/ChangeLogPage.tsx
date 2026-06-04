import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  Title2,
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  Button,
} from '@fluentui/react-components';
import { useState } from 'react';
import type { ChangeEntry } from '../types/org';
import { useOrg } from '../context/OrgContext';

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
    <div>
      <Title2>調整紀錄</Title2>
      <Text block className="page-desc">
        每次變更會寫入紀錄並自動下載完整 org-data JSON。若要更新各環境共用的初始資料可覆蓋{' '}
        <code>src/data/org-data.json</code>；本機試用版本請放到{' '}
        <code>src/data/mock/</code>（已在 .gitignore）。
      </Text>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>時間</TableHeaderCell>
            <TableHeaderCell>操作者</TableHeaderCell>
            <TableHeaderCell>類型</TableHeaderCell>
            <TableHeaderCell>摘要</TableHeaderCell>
            <TableHeaderCell>Diff</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.changeLog.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5}>
                <Text>尚無調整紀錄</Text>
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
                <TableCell>{entry.summary}</TableCell>
                <TableCell>
                  {(entry.before || entry.after) && (
                    <Button
                      size="small"
                      appearance="subtle"
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
      <Dialog
        open={!!diffEntry}
        onOpenChange={(_e, d) => !d.open && setDiffEntry(null)}
      >
        <DialogSurface>
          <DialogBody>
            <DialogTitle>變更內容</DialogTitle>
            <DialogContent>
              {diffEntry?.before && (
                <>
                  <Text weight="semibold">變更前</Text>
                  <pre className="diff-pre">{diffEntry.before}</pre>
                </>
              )}
              {diffEntry?.after && (
                <>
                  <Text weight="semibold">變更後</Text>
                  <pre className="diff-pre">{diffEntry.after}</pre>
                </>
              )}
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

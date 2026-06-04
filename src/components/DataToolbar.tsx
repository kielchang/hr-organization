import { useRef } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseOrgDataFile } from '../services/exportImport';
import { useOrg } from '../context/useOrg';
import { VersionSelector } from './VersionSelector';

export function DataToolbar() {
  const { exportData, loadFromFile, operator, setOperator } = useOrg();
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = await parseOrgDataFile(file);
      loadFromFile(parsed);
    } catch (err) {
      alert(err instanceof Error ? err.message : '載入失敗');
    }
    e.target.value = '';
  };

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="min-w-[min(100%,320px)] flex-1">
        <VersionSelector />
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="operator" className="shrink-0 text-muted-foreground">
          操作者
        </Label>
        <Input
          id="operator"
          value={operator}
          onChange={(e) => setOperator(e.target.value)}
          className="w-36"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => exportData()}>
          <Download className="size-4" />
          匯出目前資料
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="size-4" />
          從檔案載入
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onFileChange}
        />
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { selectOptionLabel, toSelectOptions } from '@/lib/selectOptions';
import { useOrg } from '../context/useOrg';

export function VersionSelector() {
  const { dataVersions, activeVersionId, selectDataVersion, activeVersion } = useOrg();

  const versionOptions = useMemo(
    () =>
      toSelectOptions(
        dataVersions,
        activeVersionId,
        (v) => v.id,
        (v) => `${v.valid ? '✓ ' : '✗ '}${v.label}`,
      ),
    [dataVersions, activeVersionId],
  );

  if (dataVersions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">尚無可載入的資料版本</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="data-version" className="shrink-0 text-muted-foreground">
          資料版本
        </Label>
        <Select value={activeVersionId} onValueChange={(v) => v && selectDataVersion(v)}>
          <SelectTrigger id="data-version" className="min-w-[260px] bg-background">
            <SelectValue placeholder="選擇版本">
              {selectOptionLabel(versionOptions, activeVersionId)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {versionOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeVersion && (
          <Badge variant={activeVersion.valid ? 'default' : 'destructive'}>
            {activeVersion.valid ? '驗證通過' : '驗證失敗'}
          </Badge>
        )}
      </div>
      {activeVersion && !activeVersion.valid && activeVersion.errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="list-inside list-disc space-y-0.5">
              {activeVersion.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

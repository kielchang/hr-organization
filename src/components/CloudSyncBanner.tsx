import { CloudOff, CloudUpload } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isApiEnabled } from '../services/apiClient';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useOrg } from '../context/useOrg';

/**
 * 雲端同步狀態提醒 banner（全站置頂）。
 *
 * 三態（僅後端啟用時可能顯示）：
 * - 離線中：變更僅存在本機，尚未同步到雲端。
 * - 線上但有未同步變更：提醒本機有變更尚未上雲。
 * - 線上且無未同步變更：不顯示。
 *
 * a11y：容器 `role="status"`＋`aria-live="polite"`（非阻斷通知）；
 * 以圖示＋文字傳達狀態，不只靠顏色；文案口語化、避免工程術語。
 *
 * 本切片僅「記錄＋顯示」，不自動補同步（契約 §0 排除）。
 */
export function CloudSyncBanner() {
  const isOnline = useOnlineStatus();
  const { pendingCloudSync } = useOrg();

  // 後端停用（dev 無後端）時，同步提醒無意義，一律不顯示。
  if (!isApiEnabled()) return null;

  if (!isOnline) {
    return (
      <Alert
        role="status"
        aria-live="polite"
        className="rounded-none border-x-0 border-t-0 border-amber-300 bg-amber-50 text-amber-900"
      >
        <CloudOff className="size-4 shrink-0" aria-hidden="true" />
        <AlertDescription className="text-amber-900">
          目前離線中——變更僅存在本機，尚未同步到雲端。
        </AlertDescription>
      </Alert>
    );
  }

  if (pendingCloudSync) {
    return (
      <Alert
        role="status"
        aria-live="polite"
        className="rounded-none border-x-0 border-t-0 border-sky-300 bg-sky-50 text-sky-900"
      >
        <CloudUpload className="size-4 shrink-0" aria-hidden="true" />
        <AlertDescription className="text-sky-900">
          有本機變更尚未同步到雲端。
          <span className="text-sky-700"> 回線同步將於後續版本提供。</span>
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}

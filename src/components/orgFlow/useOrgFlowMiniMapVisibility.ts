import { useEffect, useRef, useState } from 'react';

/**
 * 開啟人員詳情時記住觀景窗展開狀態並收合；關閉詳情時還原。
 * 詳情開啟期間若切換人員，不會重複覆寫已記錄的狀態。
 */
export function useOrgFlowMiniMapVisibility(hasDetail: boolean) {
  const [showMiniMap, setShowMiniMap] = useState(true);
  const savedBeforeDetailRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (hasDetail) {
      setShowMiniMap((current) => {
        if (savedBeforeDetailRef.current === null) {
          savedBeforeDetailRef.current = current;
        }
        return false;
      });
      return;
    }

    if (savedBeforeDetailRef.current !== null) {
      setShowMiniMap(savedBeforeDetailRef.current);
      savedBeforeDetailRef.current = null;
    }
  }, [hasDetail]);

  return { showMiniMap, setShowMiniMap };
}

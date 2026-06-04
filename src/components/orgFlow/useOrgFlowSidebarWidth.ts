import { useEffect, useState, type RefObject } from 'react';

/** 量測左欄（檢視組別／人員詳情）寬度，供觀景窗對齊 */
export function useOrgFlowSidebarWidth(
  sidebarRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!enabled || !el) {
      setWidth(0);
      return;
    }

    const update = () => setWidth(el.getBoundingClientRect().width);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [sidebarRef, enabled]);

  return width;
}

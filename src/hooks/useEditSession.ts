import { useCallback, useState } from 'react';
import type { OrgData } from '../types/org';
import type { EditSession, EditSnapshot } from '../types/editSession';
import { cloneOrgData } from '../services/exportImport';

function newId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export interface UseEditSessionReturn {
  isEditMode: boolean;
  session: EditSession | null;
  enterEditMode: (baseData: OrgData) => void;
  exitEditMode: () => void;
  saveCheckpoint: (description: string, nodePositions?: Record<string, { x: number; y: number }>) => void;
  rollbackToSnapshot: (snapshotId: string) => void;
  previewSnapshot: (snapshotId: string | null) => void;
  mutateDraft: (mutator: (current: OrgData) => OrgData) => void;
  getDraftData: () => OrgData | null;
}

export function useEditSession(): UseEditSessionReturn {
  const [session, setSession] = useState<EditSession | null>(null);

  const enterEditMode = useCallback((baseData: OrgData) => {
    setSession({
      draftData: cloneOrgData(baseData),
      snapshots: [],
      previewingSnapshotId: null,
    });
  }, []);

  const exitEditMode = useCallback(() => {
    setSession(null);
  }, []);

  const saveCheckpoint = useCallback(
    (description: string, nodePositions: Record<string, { x: number; y: number }> = {}) => {
      setSession((prev) => {
        if (!prev) return prev;
        const snapshot: EditSnapshot = {
          id: newId(),
          timestamp: new Date().toISOString(),
          description,
          orgData: cloneOrgData(prev.draftData),
          nodePositions,
        };
        return { ...prev, snapshots: [...prev.snapshots, snapshot] };
      });
    },
    [],
  );

  const rollbackToSnapshot = useCallback((snapshotId: string) => {
    setSession((prev) => {
      if (!prev) return prev;
      const snapshot = prev.snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) return prev;
      return {
        ...prev,
        draftData: cloneOrgData(snapshot.orgData),
        previewingSnapshotId: null,
      };
    });
  }, []);

  const previewSnapshot = useCallback((snapshotId: string | null) => {
    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, previewingSnapshotId: snapshotId };
    });
  }, []);

  const mutateDraft = useCallback((mutator: (current: OrgData) => OrgData) => {
    setSession((prev) => {
      if (!prev) return prev;
      return { ...prev, draftData: mutator(prev.draftData) };
    });
  }, []);

  const getDraftData = useCallback((): OrgData | null => {
    return session?.draftData ?? null;
  }, [session]);

  return {
    isEditMode: session !== null,
    session,
    enterEditMode,
    exitEditMode,
    saveCheckpoint,
    rollbackToSnapshot,
    previewSnapshot,
    mutateDraft,
    getDraftData,
  };
}

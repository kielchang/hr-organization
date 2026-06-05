import type { OrgData } from './org';

export interface EditSnapshot {
  id: string;
  timestamp: string;
  description: string;
  orgData: OrgData;
  nodePositions: Record<string, { x: number; y: number }>;
}

export interface EditSession {
  draftData: OrgData;
  snapshots: EditSnapshot[];
  previewingSnapshotId: string | null;
}

export type NodeDiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface OrgDiffResult {
  addedEmployeeIds: Set<string>;
  removedEmployeeIds: Set<string>;
  modifiedEmployeeIds: Set<string>;
  addedAssignmentIds: Set<string>;
  removedAssignmentIds: Set<string>;
  modifiedAssignmentIds: Set<string>;
  addedEdgeKeys: Set<string>;
  removedEdgeKeys: Set<string>;
}

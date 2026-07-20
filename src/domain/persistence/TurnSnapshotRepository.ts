import type { TurnRollbackSnapshot } from '../turn/TurnRollback';

export interface TurnSnapshotSummary {
  chainId: string;
  turnNumber: number;
  createdAt: string;
  actionText: string;
}

export interface SaveTurnSnapshotInput {
  chainId: string;
  turnNumber: number;
  snapshot: TurnRollbackSnapshot;
  maxDepth: number;
}

export interface TurnSnapshotRepository {
  saveTurnSnapshot(input: SaveTurnSnapshotInput): Promise<void>;
  loadTurnSnapshot(chainId: string, turnNumber: number): Promise<TurnRollbackSnapshot | null>;
  listTurnSnapshots(chainId: string): Promise<TurnSnapshotSummary[]>;
  deleteTurnSnapshotsAfter(chainId: string, turnNumber: number): Promise<void>;
  clearTurnSnapshotsForChain(chainId: string): Promise<void>;
}

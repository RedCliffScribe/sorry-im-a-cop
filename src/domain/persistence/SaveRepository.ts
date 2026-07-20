import type { RuntimeState } from '../runtime/types';

export type RuntimeSaveKind = 'manual' | 'auto';

export interface RuntimeSaveRecord {
  saveId: string;
  rollbackChainId?: string;
  saveName: string;
  saveKind?: RuntimeSaveKind;
  createdAt: string;
  updatedAt: string;
  playerName: string;
  worldpackId: string;
  gameDateLabel: string;
  turnCounter: number;
  runtimeState: RuntimeState;
}

export type RuntimeSaveSummary = Omit<RuntimeSaveRecord, 'runtimeState'>;

export interface SaveRepository {
  list(): Promise<RuntimeSaveSummary[]>;
  load(saveId: string): Promise<RuntimeSaveRecord | null>;
  save(record: RuntimeSaveRecord): Promise<void>;
  saveMany(records: RuntimeSaveRecord[]): Promise<void>;
  delete(saveId: string): Promise<void>;
}

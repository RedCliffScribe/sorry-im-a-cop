import type { RuntimeState } from '../runtime/types';

export interface TurnRollbackSnapshot {
  beforeState: RuntimeState;
  actionText: string;
  createdAt: string;
}

export interface RestoredTurnRollbackSnapshot {
  state: RuntimeState;
  actionText: string;
}

export function createTurnRollbackSnapshot({
  beforeState,
  actionText,
  createdAt = new Date().toISOString()
}: {
  beforeState: RuntimeState;
  actionText: string;
  createdAt?: string;
}): TurnRollbackSnapshot {
  return {
    beforeState: cloneRuntimeState(beforeState),
    actionText,
    createdAt
  };
}

export function restoreTurnRollbackSnapshot(snapshot: TurnRollbackSnapshot): RestoredTurnRollbackSnapshot {
  return {
    state: cloneRuntimeState(snapshot.beforeState),
    actionText: snapshot.actionText
  };
}

function cloneRuntimeState(state: RuntimeState): RuntimeState {
  return JSON.parse(JSON.stringify(state)) as RuntimeState;
}

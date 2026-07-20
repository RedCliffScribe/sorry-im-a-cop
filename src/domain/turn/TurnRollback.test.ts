import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createTurnRollbackSnapshot, restoreTurnRollbackSnapshot } from './TurnRollback';

describe('TurnRollback', () => {
  it('captures and restores the state before a player action', () => {
    const beforeState = createInitialRuntimeState();
    beforeState.turnCounter = 7;
    beforeState.player.name = '刘星';

    const snapshot = createTurnRollbackSnapshot({
      beforeState,
      actionText: '我去问值日警长。',
      createdAt: '2026-07-07T00:00:00.000Z'
    });

    beforeState.turnCounter = 8;
    beforeState.player.name = '已修改';

    const restored = restoreTurnRollbackSnapshot(snapshot);

    expect(restored.actionText).toBe('我去问值日警长。');
    expect(restored.state.turnCounter).toBe(7);
    expect(restored.state.player.name).toBe('刘星');
    restored.state.player.name = '再次修改';
    expect(snapshot.beforeState.player.name).toBe('刘星');
  });
});

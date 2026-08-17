import { describe, expect, it } from 'vitest';
import { appendSceneShots, beginSceneReplacement, resolveSceneReplacement } from './sceneDisplayState';

describe('story scene display state', () => {
  it('appends confirmed shots without duplicating existing display entries', () => {
    const first = appendSceneShots({
      saveId: 'save_a',
      turnId: 'turn_1',
      shotIds: ['shot_1'],
      updatedAt: '2026-07-22T00:00:00.000Z'
    });
    const appended = appendSceneShots({
      current: first,
      saveId: 'save_a',
      turnId: 'turn_1',
      shotIds: ['shot_1', 'shot_2'],
      updatedAt: '2026-07-22T00:01:00.000Z'
    });
    expect(appended.activeShotIds).toEqual(['shot_1', 'shot_2']);
  });

  it('keeps old shots visible until every group replacement succeeds', () => {
    const current = appendSceneShots({
      saveId: 'save_a', turnId: 'turn_1', shotIds: ['old_shot'], updatedAt: '2026-07-22T00:00:00.000Z'
    });
    const pending = beginSceneReplacement(
      current, 'plan_new', 'replace-group', ['new_1', 'new_2'], ['old_shot'], '2026-07-22T00:01:00.000Z'
    );
    expect(pending.activeShotIds).toEqual(['old_shot']);

    const partial = resolveSceneReplacement({
      current: pending,
      succeededShotIds: ['new_1'],
      allTasksTerminal: false,
      updatedAt: '2026-07-22T00:02:00.000Z'
    });
    expect(partial.activeShotIds).toEqual(['old_shot']);
    expect(partial.pendingReplacement).toBeDefined();

    const switched = resolveSceneReplacement({
      current: partial,
      succeededShotIds: ['new_1', 'new_2'],
      allTasksTerminal: true,
      updatedAt: '2026-07-22T00:03:00.000Z'
    });
    expect(switched.activeShotIds).toEqual(['new_1', 'new_2']);
    expect(switched.pendingReplacement).toBeUndefined();
  });

  it('replaces one displayed shot in place only after its regeneration succeeds', () => {
    const current = appendSceneShots({
      saveId: 'save_a', turnId: 'turn_1', shotIds: ['old_1', 'old_2'], updatedAt: '2026-07-22T00:00:00.000Z'
    });
    const pending = beginSceneReplacement(
      current, 'plan_regenerate', 'replace-shot', ['new_1'], ['old_1'], '2026-07-22T00:01:00.000Z'
    );
    const switched = resolveSceneReplacement({
      current: pending,
      succeededShotIds: ['new_1'],
      allTasksTerminal: true,
      updatedAt: '2026-07-22T00:02:00.000Z'
    });
    expect(switched.activeShotIds).toEqual(['new_1', 'old_2']);
  });

  it('preserves the old display when every replacement task fails or is cancelled', () => {
    const current = appendSceneShots({
      saveId: 'save_a', turnId: 'turn_1', shotIds: ['old_shot'], updatedAt: '2026-07-22T00:00:00.000Z'
    });
    const pending = beginSceneReplacement(
      current, 'plan_new', 'replace-group', ['new_1'], ['old_shot'], '2026-07-22T00:01:00.000Z'
    );
    const resolved = resolveSceneReplacement({
      current: pending,
      succeededShotIds: [],
      allTasksTerminal: true,
      updatedAt: '2026-07-22T00:02:00.000Z'
    });
    expect(resolved.activeShotIds).toEqual(['old_shot']);
    expect(resolved.pendingReplacement).toBeUndefined();
  });
});

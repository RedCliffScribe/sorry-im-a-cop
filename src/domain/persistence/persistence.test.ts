import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { LocalStorageRuntimeRepository } from './LocalStorageRuntimeRepository';

describe('LocalStorageRuntimeRepository', () => {
  it('saves and loads runtime state snapshots', async () => {
    const repository = new LocalStorageRuntimeRepository('cop-v2-test-save');
    const state = createInitialRuntimeState();

    await repository.save(state);
    const loaded = await repository.load();

    expect(loaded?.runtimeVersion).toBe(1);
    expect(loaded?.player.name).toBe('');
  });

  it('returns null when no save exists', async () => {
    const repository = new LocalStorageRuntimeRepository('cop-v2-empty-save');
    localStorage.removeItem('cop-v2-empty-save');

    await expect(repository.load()).resolves.toBeNull();
  });
});

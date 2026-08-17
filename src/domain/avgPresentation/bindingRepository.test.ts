import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  IndexedDbAvgGenericPortraitBindingRepository,
  MemoryAvgGenericPortraitBindingRepository
} from './bindingRepository';
import type { AvgGenericPortraitBinding } from './types';

const databaseNames: string[] = [];

function binding(input: Partial<AvgGenericPortraitBinding> = {}): AvgGenericPortraitBinding {
  return {
    saveId: 'save_a',
    actorId: 'actor_a',
    worldpackId: 'hk1988',
    basePackId: 'base_a',
    portraitSetId: 'portrait_a',
    createdAt: '2026-08-09T00:00:00.000Z',
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...input
  };
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`Database ${name} is blocked.`));
  });
}

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map(deleteDatabase));
});

describe.each([
  ['memory', () => new MemoryAvgGenericPortraitBindingRepository()],
  ['IndexedDB', () => {
    const name = `avg-presentation-test-${crypto.randomUUID()}`;
    databaseNames.push(name);
    return new IndexedDbAvgGenericPortraitBindingRepository(name);
  }]
] as const)('%s AVG generic portrait binding repository', (_label, createRepository) => {
  it('freezes a unique portrait within one save and pack only', async () => {
    const repository = createRepository();
    expect(await repository.bindIfAvailable(binding(), 'unique_per_save')).toBe(true);
    expect(await repository.bindIfAvailable(binding({ actorId: 'actor_b' }), 'unique_per_save'))
      .toBe(false);
    expect(await repository.bindIfAvailable(
      binding({ actorId: 'actor_b', saveId: 'save_b' }),
      'unique_per_save'
    )).toBe(true);
    expect(await repository.bindIfAvailable(
      binding({ actorId: 'actor_b', basePackId: 'base_b' }),
      'unique_per_save'
    )).toBe(true);
  });

  it('allows explicit reuse policies and clears only the requested save', async () => {
    const repository = createRepository();
    await repository.bindIfAvailable(binding(), 'limited_reuse');
    await repository.bindIfAvailable(binding({ actorId: 'actor_b' }), 'limited_reuse');
    await repository.bindIfAvailable(binding({ actorId: 'actor_c', saveId: 'save_b' }), 'limited_reuse');

    expect(await repository.listForSavePack('save_a', 'hk1988', 'base_a')).toHaveLength(2);
    await repository.clearSave('save_a');
    expect(await repository.listForSavePack('save_a', 'hk1988', 'base_a')).toEqual([]);
    expect(await repository.get('save_b', 'actor_c', 'hk1988', 'base_a')).toBeDefined();
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  IndexedDbImageAutomationRuntimeRepository,
  createImageAutomationTriggerId,
  type ImageAutomationTriggerRecord
} from './automationRuntime';

function record(saveId: string, subjectId: string): ImageAutomationTriggerRecord {
  const now = '2026-07-23T08:00:00.000Z';
  return {
    triggerId: createImageAutomationTriggerId(saveId, 'character-created', subjectId),
    saveId,
    kind: 'character-created',
    subjectId,
    status: 'detected',
    executionFingerprints: [],
    taskIds: [],
    retryCount: 0,
    maxRetries: 0,
    safeMessage: '已检测到新人物。',
    createdAt: now,
    updatedAt: now
  };
}

describe('image automation runtime repository', () => {
  it('claims a deterministic trigger only once and isolates save partitions', async () => {
    const repository = new IndexedDbImageAutomationRuntimeRepository(`image-automation-runtime-${crypto.randomUUID()}`);
    const first = record('save_a', 'actor_1');
    expect(await repository.claim(first)).toMatchObject({ created: true, record: first });
    expect(await repository.claim({ ...first, safeMessage: '重复触发' })).toMatchObject({
      created: false,
      record: first
    });
    const second = record('save_b', 'actor_2');
    await repository.claim(second);
    expect(await repository.listForSave('save_a')).toEqual([first]);
    await repository.clearSave('save_a');
    expect(await repository.listForSave('save_a')).toEqual([]);
    expect(await repository.listForSave('save_b')).toHaveLength(1);
    await repository.clearAll();
    expect(await repository.listForSave('save_b')).toEqual([]);
    await repository.claim(second);
    await repository.remove(second.triggerId);
    expect(await repository.get(second.triggerId)).toBeNull();
  });

  it('uses the frozen story hash to distinguish regenerated content with the same turn id', () => {
    const firstHash = 'a'.repeat(64);
    const secondHash = 'b'.repeat(64);
    const first = createImageAutomationTriggerId(
      'save_a',
      'story-turn-completed',
      'turn_0001',
      firstHash
    );
    expect(createImageAutomationTriggerId(
      'save_a',
      'story-turn-completed',
      'turn_0001',
      firstHash
    )).toBe(first);
    expect(createImageAutomationTriggerId(
      'save_a',
      'story-turn-completed',
      'turn_0001',
      secondHash
    )).not.toBe(first);
    expect(createImageAutomationTriggerId(
      'save_a',
      'character-created',
      'npc_1',
      firstHash
    )).toBe(createImageAutomationTriggerId('save_a', 'character-created', 'npc_1'));
  });
});

import { describe, expect, it } from 'vitest';
import { createActorDefaults } from './actorFactory';
import {
  actorProfileFieldIsComplete,
  missingActorProfileEnrichmentFields
} from './actorProfileEnrichment';

describe('actorProfileEnrichment', () => {
  it('treats exact placeholder summaries as missing without rejecting meaningful text that contains 无', () => {
    const actor = createActorDefaults({
      actorId: 'npc_existing_ah_ming',
      name: '阿明',
      gender: 'male',
      computedAge: 27,
      currentIdentity: 'civilian',
      publicIdentity: '无业青年',
      attitudeTowardPlayer: '无直接关系。',
      longTermMemorySummary: '无',
      recentInteractionMemory: '暂无'
    });

    expect(actorProfileFieldIsComplete(actor, 'publicIdentity')).toBe(true);
    expect(actorProfileFieldIsComplete(actor, 'attitudeTowardPlayer')).toBe(true);
    expect(missingActorProfileEnrichmentFields(actor)).toEqual(
      expect.arrayContaining(['longTermMemorySummary', 'recentInteractionMemory'])
    );
  });
});

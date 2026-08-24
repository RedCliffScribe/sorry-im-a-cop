import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  actorNameMatchesFixedIdentity,
  evaluateFixedActorIdentityPatch,
  findFixedActorIdentityDescriptors,
  fixedActorIdentityMergeConflicts,
  repairFixedActorIdentityIntegrity
} from './fixedActorIdentityGuard';

function identity(name: string) {
  const matches = findFixedActorIdentityDescriptors(name);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

function fixedActor(name: string, actorId?: string) {
  const item = identity(name);
  return createActorDefaults({
    actorId: actorId ?? item.runtimeActorId,
    name: item.displayName,
    englishName: item.englishName,
    aliases: [...item.aliases],
    currentIdentity: 'civilian',
    publicIdentity: item.publicIdentity,
    actualIdentitySummary: item.actualIdentitySummary,
    positionSummary: item.positionSummary,
    profileSummary: item.profileSummary,
    stableIdentityRef: item.ref
  });
}

describe('fixed actor identity guard', () => {
  it('rejects a patch that addresses Zhou Huimin by id but claims Ye Yuqing identity fields', () => {
    const zhou = fixedActor('周慧敏');
    const conflict = evaluateFixedActorIdentityPatch(zhou, {
      actorId: zhou.actorId,
      name: '周慧敏',
      englishName: 'Vivian Chow',
      aliases: ['叶玉卿', 'Veronica Yip', '叶子楣', 'Amy Yip']
    });

    expect(conflict?.expected.displayName).toBe('周慧敏');
    expect(conflict?.conflicting.map((item) => item.displayName)).toEqual(
      expect.arrayContaining(['叶玉卿', '叶子楣'])
    );
    expect(actorNameMatchesFixedIdentity(zhou, '叶玉卿')).toBe(false);
    expect(actorNameMatchesFixedIdentity(zhou, 'Vivian Chow')).toBe(true);
  });

  it('never considers two distinct fixed actors safe merge candidates', () => {
    expect(fixedActorIdentityMergeConflicts(fixedActor('周慧敏'), fixedActor('叶玉卿'))).toBe(true);
    expect(fixedActorIdentityMergeConflicts(fixedActor('周慧敏'), fixedActor('周慧敏', 'legacy_zhou'))).toBe(false);
  });

  it('repairs a contaminated fixed profile and only reassigns memory with one explicit fixed identity', () => {
    const state = createInitialRuntimeState();
    const zhou = fixedActor('周慧敏');
    const ye = fixedActor('叶玉卿');
    state.actors[zhou.actorId] = {
      ...zhou,
      aliases: ['叶玉卿', 'Veronica Yip', '叶子楣', 'Amy Yip'],
      actualIdentitySummary: '刚在演艺界崭露头角的玉女明星。',
      profileSummary: '错误融合后的档案。'
    };
    state.actors[ye.actorId] = ye;
    state.memories.memory_wrong_actor = {
      memoryId: 'memory_wrong_actor',
      text: '叶玉卿刚刚被玩家见义勇为帮回了钱包。',
      kind: 'actor',
      relatedActorIds: [zhou.actorId],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_0001',
      gameTime: { ...state.time },
      importance: 70,
      visibility: 'player_known',
      certainty: 'fact'
    };

    const result = repairFixedActorIdentityIntegrity(state);
    const repaired = result.state.actors[zhou.actorId]!;

    expect(result.repairedActorCount).toBe(1);
    expect(result.repairedMemoryCount).toBe(1);
    expect(repaired.name).toBe('周慧敏');
    expect(repaired.englishName).toBe('Vivian Chow');
    expect(repaired.aliases).not.toEqual(expect.arrayContaining(['叶玉卿', '叶子楣']));
    expect(repaired.profileSummary).not.toBe('错误融合后的档案。');
    expect(result.state.memories.memory_wrong_actor.relatedActorIds).toEqual([ye.actorId]);
  });
});

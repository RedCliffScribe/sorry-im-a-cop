import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor } from '../runtime/types';
import { projectPresentActorReactions } from './presentActorReactionProjector';

describe('projectPresentActorReactions', () => {
  it('selects visible present non-player actors and includes reaction basis', () => {
    const state = createInitialRuntimeState();
    const sergeant = createActor(state.actors.player, {
      actorId: 'npc_sergeant_chan',
      name: '陈强',
      aliases: ['强哥'],
      callName: '陈沙展',
      presence: 'present',
      visibility: 'player_known',
      importance: 55,
      personality: '谨慎、压得住场面',
      speechStyle: '短句、先问事实',
      motivation: '维持报案室秩序，避免玩家把线人话题讲得太明',
      relationshipSummary: '值日警长，对玩家既照顾又观察',
      attitudeTowardPlayer: '愿意提醒，但不替玩家背锅',
      trustTendency: '先观察，确认玩家守规矩后才多讲',
      entanglementSummary: '知道夜场投诉和警署内部压力有关',
      statusSummary: '正在值班，注意到玩家接电话',
      longTermMemorySummary: '记得玩家上次处理投诉时没有乱写口供',
      recentInteractionMemory: '刚才提醒玩家别在柜台前谈线人',
      interactionScore: 42
    });
    const absentActor = createActor(state.actors.player, {
      actorId: 'npc_absent',
      name: '不在场的人',
      presence: 'absent',
      visibility: 'player_known',
      importance: 99
    });
    const hiddenActor = createActor(state.actors.player, {
      actorId: 'npc_hidden',
      name: '隐藏人物',
      presence: 'present',
      visibility: 'hidden',
      importance: 100
    });

    const projection = projectPresentActorReactions([state.actors.player, sergeant, absentActor, hiddenActor], {
      playerActorId: 'player',
      playerInput: '我问陈强刚才那通电话是谁打来的',
      currentSceneSummary: '旺角警署报案室，夜里有市民等候。',
      maxCandidates: 5
    });

    expect(projection.candidates.map((candidate) => candidate.actorId)).toEqual(['npc_sergeant_chan']);
    expect(projection.diagnostics.sourceActorCount).toBe(4);
    expect(projection.diagnostics.selectedActorIds).toEqual(['npc_sergeant_chan']);
    expect(projection.diagnostics.omittedActorCount).toBe(3);
    expect(projection.candidates[0].triggerReasons).toContain('player_input_mention');
    expect(projection.candidates[0].basis.join('\n')).toContain('谨慎、压得住场面');
    expect(projection.candidates[0].basis.join('\n')).toContain('维持报案室秩序');
    expect(projection.candidates[0].basis.join('\n')).not.toContain('刚才提醒玩家别在柜台前谈线人');
    expect(projection.candidates[0].triggerReasons).not.toContain('memory_context');
    expect(projection.candidates[0].reactionHint).toContain('未裁定建议');
  });

  it('ranks a mentioned present actor above a more important unmentioned actor', () => {
    const state = createInitialRuntimeState();
    const senior = createActor(state.actors.player, {
      actorId: 'npc_senior',
      name: '高级督察',
      presence: 'present',
      visibility: 'player_known',
      importance: 95,
      interactionScore: 10
    });
    const mentioned = createActor(state.actors.player, {
      actorId: 'npc_ah_ling',
      name: '阿玲',
      aliases: ['玲姐'],
      presence: 'present',
      visibility: 'player_known',
      importance: 30,
      interactionScore: 20
    });

    const projection = projectPresentActorReactions([state.actors.player, senior, mentioned], {
      playerActorId: 'player',
      playerInput: '我看向阿玲，问她刚才有没有听到门外的争执。'
    });

    expect(projection.candidates.map((candidate) => candidate.actorId).slice(0, 2)).toEqual([
      'npc_ah_ling',
      'npc_senior'
    ]);
  });
});

function createActor(baseActor: Actor, overrides: Partial<Actor>): Actor {
  return {
    ...baseActor,
    actorId: overrides.actorId ?? baseActor.actorId,
    name: overrides.name ?? baseActor.name,
    aliases: [...(overrides.aliases ?? baseActor.aliases)],
    callName: overrides.callName ?? baseActor.callName,
    organizationIds: [...(overrides.organizationIds ?? baseActor.organizationIds)],
    organizationRelations: [...(overrides.organizationRelations ?? baseActor.organizationRelations)],
    roleProfiles: { ...baseActor.roleProfiles, ...overrides.roleProfiles },
    attributes: { ...baseActor.attributes, ...overrides.attributes },
    activeTraits: [...(overrides.activeTraits ?? baseActor.activeTraits)],
    traitProgress: [...(overrides.traitProgress ?? baseActor.traitProgress)],
    keyMemories: [...(overrides.keyMemories ?? baseActor.keyMemories)],
    equipment: [...(overrides.equipment ?? baseActor.equipment)],
    ...overrides
  };
}

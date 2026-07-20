import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, MemoryItem } from '../runtime/types';
import { buildForegroundEvolutionDelta } from './foregroundDelta';
import { createBackgroundEvolutionPrompt } from './prompt';
import { selectBackgroundEvolutionCandidates } from './selection';

describe('background evolution prompt', () => {
  it('feeds a bounded selected NPC packet instead of the full actor store', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_liu = {
      ...state.actors.player,
      actorId: 'actor_liu',
      name: '刘启',
      aliases: [],
      presence: 'absent',
      visibility: 'player_known'
    } as Actor;
    state.actors.actor_unrelated = {
      ...state.actors.player,
      actorId: 'actor_unrelated',
      name: '不相关人物',
      aliases: [],
      presence: 'absent',
      visibility: 'player_known'
    } as Actor;
    state.relationshipThreads.thread_liu = {
      threadId: 'thread_liu',
      kind: 'network',
      title: '同僚',
      summary: '共同办理过案件。',
      relatedActorIds: ['player', 'actor_liu'],
      primaryActorId: 'actor_liu',
      relationshipRole: '同僚',
      status: 'active',
      currentPull: '刘启答应回覆走访结果。',
      milestones: [],
      visibility: 'player_known',
      importance: 60,
      createdAt: state.time,
      updatedAt: state.time
    };
    for (let index = 0; index < 10; index += 1) {
      const memoryId = `memory_liu_${index}`;
      state.memories[memoryId] = {
        memoryId,
        text: `刘启记忆 ${index}`,
        kind: 'actor',
        tier: 'short_term',
        relatedActorIds: ['actor_liu'],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { ...state.time, minute: index },
        importance: 50,
        visibility: 'hidden',
        certainty: 'fact'
      } as MemoryItem;
    }
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_1' });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain('actor_liu');
    expect(prompt).not.toContain('actor_unrelated');
    expect((prompt.match(/刘启记忆/g) ?? [])).toHaveLength(4);
    expect(prompt).not.toContain('adultPrivateProfile');
    expect(prompt).toContain('sourceRefs 永远是 object，绝不是数组');
    expect(prompt).toContain('调查案件必须写 case');
    expect(prompt).toContain('"relationshipThreadIds":[]');
    expect(prompt).toContain('operation 只能是 update / resolve');
    expect(prompt).toContain('必须与同一响应中的一条 npcTrackPatches settle/cancel 成对');
    expect(prompt).toContain('blocked 是 outcomeKind');
    expect(prompt).toContain('reason 和 sourceRefs 都不可省略');
    expect(prompt).toContain('受阻结算不要输出 backgroundActorPatches');
    expect(prompt).toContain('每个入选 NPC 本次最多一条 npcTrackPatches');
    expect(prompt).toContain('默认省略 actorMemories、outcomeRecords、chronicleEntries');
    expect(prompt).toContain('组织不是经营模拟');
    expect(prompt).toContain('禁止创建、改名、改类型');
  });

  it('feeds a compact organization packet only after a structural activation link', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'contractor',
      summary: '协助电视采访',
      visibility: 'player_known'
    });
    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_org_prompt' });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(selection.organizationCandidates.map((candidate) => candidate.organizationId)).toContain('org_tvb');
    expect(prompt).toContain('"organizationCandidates"');
    expect(prompt).toContain('"organizationId":"org_tvb"');
    expect(prompt).toContain('"allowMaterialProgress":false');
    expect(prompt).toContain('"earliestNextReviewAt":');
    expect(prompt).toContain('nextReviewAt 必须等于或晚于候选 review.earliestNextReviewAt');
    expect(prompt).toContain('organizationCandidates.actors 只是组织上下文');
    expect(prompt).toContain('organizationEvolutionPatches.operation 只能是 activate/update/settle');
  });

  it('marks a foreground organization touched through a hidden player relation as non-public', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push({
      organizationId: 'org_tvb',
      relationType: 'source',
      summary: '只由玩家知晓的隐蔽联系。',
      visibility: 'hidden'
    });
    state.organizations.org_tvb.stanceTowardPlayer = '玩家是电视台秘密线人。';
    state.organizations.org_tvb.pressureSummary = '秘密任务正在推进。';
    const delta = buildForegroundEvolutionDelta({
      state,
      foregroundTurnId: 'turn_secret_org_prompt',
      startedAt: state.time,
      turnSummary: '玩家已接受电视台秘密线人任务。',
      touches: {
        actorIds: [],
        caseIds: [],
        relationshipThreadIds: [],
        cityTrackIds: [],
        organizationIds: ['org_tvb']
      }
    });
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_secret_org_prompt',
      foregroundTouchedOrganizationIds: ['org_tvb'],
      foregroundDelta: delta
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain('"organizationId":"org_tvb"');
    expect(prompt).toContain('"visibilityCeiling":"player_known"');
    expect(prompt).toContain('"hiddenForegroundRedacted":true');
    expect(prompt).not.toContain('玩家已接受电视台秘密线人任务。');
    expect(prompt).not.toContain('玩家是电视台秘密线人。');
    expect(prompt).not.toContain('秘密任务正在推进。');
    expect(prompt).toContain('当前公开身份下没有直接关系。');
    expect(prompt).toContain('涉及玩家隐藏组织关系的前台影响最多为 player_known');
  });

  it('feeds a compact structured foreground delta without including raw story prose', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_liu = {
      ...state.actors.player,
      actorId: 'actor_liu',
      name: '刘启',
      aliases: [],
      presence: 'absent',
      visibility: 'player_known'
    } as Actor;
    const delta = buildForegroundEvolutionDelta({
      state,
      foregroundTurnId: 'turn_delta',
      startedAt: state.time,
      turnSummary: '玩家通过电话告知刘启改查值班簿。',
      touches: {
        actorIds: ['actor_liu'],
        caseIds: [],
        relationshipThreadIds: [],
        cityTrackIds: [],
        organizationIds: []
      }
    });
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_delta',
      foregroundTouchedActorIds: ['actor_liu'],
      foregroundDelta: delta
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain('"foregroundDelta"');
    expect(prompt).toContain('玩家通过电话告知刘启改查值班簿。');
    expect(prompt).toContain('"canonicalSnapshots"');
    expect(prompt).toContain('persistToMemory=true');
    expect(prompt).toContain('未来具体游戏时间浮现');
    expect(prompt).not.toContain('这是未提供给后台的故事正文');
  });
});

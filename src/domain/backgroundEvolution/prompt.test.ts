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
      visibility: 'player_known',
      importance: 20
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
    expect(prompt).toContain('actorMemories 的记忆正文键必须叫 text');
    expect(prompt).toContain('必须省略 status，不得把 quiet/settled/completed 写入 status');
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

  it('feeds the current public triad position and responsibility without granting background task authority', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    const profile = state.actors.player.roleProfiles.triad!;
    const organizationId = profile.organizationId!;
    state.actors.actor_patron = {
      ...state.actors.player,
      actorId: 'actor_patron',
      name: '阿成',
      presence: 'absent'
    } as Actor;
    state.actors.player.roleProfiles.triad = {
      ...profile,
      roleTitle: '庙街外围成员',
      rankSummary: '外围新人',
      patronActorIds: ['actor_patron']
    };
    state.dynamicEvents.currentMatters.matter_triad_responsibility = {
      id: 'matter_triad_responsibility',
      title: '弄清摊档争执',
      summary: '阿成交代先了解争执原因。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'triad_responsibility',
      matterKind: 'social',
      currentHook: '摊档双方仍在互相指责。',
      relatedActorIds: ['actor_patron'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [organizationId],
      createdAt: state.time,
      updatedAt: state.time
    };

    const selection = selectBackgroundEvolutionCandidates({ state, foregroundTurnId: 'turn_triad_prompt' });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain(`"organizationId":"${organizationId}"`);
    expect(prompt).toContain('"playerRoleContext"');
    expect(prompt).toContain('"kind":"triad"');
    expect(prompt).toContain('"roleTitle":"庙街外围成员"');
    expect(prompt).toContain('"patronActorIds":["actor_patron"]');
    expect(prompt).toContain('"title":"弄清摊档争执"');
    expect(prompt).toContain('它不是后台向玩家派任务的授权');
    expect(prompt).toContain('不得创建新的 triad_responsibility');
  });

  it('omits hidden triad membership from background packets while the public identity is police', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police', playerName: '陈启明' });
    state.actors.player.roleProfiles.triad = {
      status: 'hidden',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '不可公开的地区成员',
      rankSummary: '秘密位置',
      territorySummary: '庙街线',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '秘密责任',
      riskSummary: '秘密风险'
    };
    state.actors.player.organizationRelations.push({
      organizationId: 'org_wo_shing_wo',
      relationType: 'member',
      summary: '隐藏关系',
      visibility: 'hidden'
    });
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_hidden_triad_prompt',
      foregroundTouchedOrganizationIds: ['org_wo_shing_wo']
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).not.toContain('不可公开的地区成员');
    expect(prompt).not.toContain('秘密责任');
    expect(prompt).not.toContain('"playerRoleContext"');
  });

  it('feeds the current civilian employer role without inventing a livelihood task', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      playerName: '陈启明',
      civilianProfileId: 'hospital_nurse'
    });
    const profile = state.actors.player.roleProfiles.civilian!;
    const organizationId = profile.employerOrganizationId!;
    state.actors.actor_colleague = {
      ...state.actors.player,
      actorId: 'actor_colleague',
      name: '陈美珍',
      presence: 'absent'
    } as Actor;
    state.actors.player.roleProfiles.civilian = {
      ...profile,
      livelihoodActorIds: ['actor_colleague']
    };
    state.dynamicEvents.currentMatters.matter_shift = {
      id: 'matter_shift',
      title: '夜班顶更安排',
      summary: '护士长询问玩家是否能临时顶夜班。',
      status: 'active',
      priority: 60,
      visibility: 'known',
      source: 'workplace_notice',
      matterKind: 'livelihood',
      relatedActorIds: ['actor_colleague'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [organizationId],
      createdAt: state.time,
      updatedAt: state.time
    };

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_civilian_prompt'
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain(`"organizationId":"${organizationId}"`);
    expect(prompt).toContain('"playerRoleContext"');
    expect(prompt).toContain('"kind":"civilian"');
    expect(prompt).toContain('"employerTemplateCandidates"');
    expect(prompt).toContain('"templateId":"private_clinic"');
    expect(prompt).toContain('"title":"夜班顶更安排"');
    expect(prompt).toContain('不得创建新的 triad_responsibility 或 livelihood 事项');
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

  it('keeps an oversized background context packet valid instead of slicing its JSON', () => {
    const state = createInitialRuntimeState();
    const oversizedText = '持续有效的结构化人物资料。'.repeat(4_000);
    state.actors.actor_oversized = {
      ...state.actors.player,
      actorId: 'actor_oversized',
      name: '长档案人物',
      aliases: [],
      presence: 'absent',
      currentSceneId: undefined,
      visibility: 'player_known',
      importance: 80,
      profileSummary: oversizedText,
      relationshipSummary: oversizedText,
      recentInteractionMemory: oversizedText,
      longTermMemorySummary: oversizedText
    } as Actor;
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_oversized_context'
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);
    const marker = 'BACKGROUND_EVOLUTION_CONTEXT\n';
    const markerIndex = prompt.lastIndexOf(marker);
    const serializedPacket = prompt.slice(markerIndex + marker.length);

    expect(prompt.length).toBeLessThanOrEqual(36_000);
    expect(markerIndex).toBeGreaterThanOrEqual(0);
    expect(() => JSON.parse(serializedPacket)).not.toThrow();
    const packet = JSON.parse(serializedPacket);
    expect(packet.npcCandidates[0].actor.actorId).toBe('actor_oversized');
    expect(packet.diagnostics.contextCompaction).toBeTruthy();
  });

  it('anchors remote NPC memory timing and does not expose a floating recent-interaction string', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 12, day: 8, hour: 10, minute: 0 }
    });
    state.actors.actor_temporal = {
      ...state.actors.player,
      actorId: 'actor_temporal',
      name: '阿玲',
      aliases: [],
      presence: 'absent',
      visibility: 'player_known',
      recentInteractionMemory: '玩家说明天到茶餐厅见面。'
    } as Actor;
    state.relationshipThreads.thread_temporal = {
      threadId: 'thread_temporal',
      kind: 'network',
      title: '旧识约定',
      summary: '双方约定再次见面。',
      relatedActorIds: ['player', 'actor_temporal'],
      primaryActorId: 'actor_temporal',
      relationshipRole: '旧识',
      status: 'active',
      milestones: [],
      visibility: 'player_known',
      importance: 60,
      createdAt: state.time,
      updatedAt: state.time
    };
    state.memories.memory_temporal = {
      memoryId: 'memory_temporal',
      text: '玩家说明天到茶餐厅见面。',
      kind: 'actor',
      tier: 'short_term',
      relatedActorIds: ['actor_temporal'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: { year: 1988, month: 12, day: 1, hour: 10, minute: 0 },
      importance: 50,
      visibility: 'player_known',
      certainty: 'fact'
    };

    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId: 'turn_temporal_prompt'
    });
    const prompt = createBackgroundEvolutionPrompt(state, selection);

    expect(prompt).toContain('TIME_REFERENCE_FRAME');
    expect(prompt).toContain('玩家说1988年12月2日到茶餐厅见面。');
    expect(prompt).toContain('absolute=1988年12月02日');
    expect(prompt).not.toContain('玩家说明天到茶餐厅见面。');
    expect(prompt).toContain('不得把旧记忆里的“昨天、明天、后天、下周”重新解释成当前回合');
  });
});

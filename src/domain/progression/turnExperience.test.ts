import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type {
  JudgementCheck,
  JudgementDifficultyTier,
  JudgementOutcome,
  RuntimeState
} from '../runtime/types';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import { settleTurnExperience } from './turnExperience';

function createResponse(experienceGain?: number | string) {
  return validateNarratorResponse({
    narrativeText: '本回合正文。',
    turnSummary: '本回合完成。',
    writeback: {
      ...(experienceGain !== undefined
        ? {
            playerPatch: {
              progression: {
                experienceGain
              }
            }
          }
        : {})
    }
  });
}

function createStructuredResponse(writeback: Record<string, unknown>) {
  return validateNarratorResponse({
    narrativeText: '本回合正文。',
    turnSummary: '本回合完成。',
    writeback
  });
}

function createTurnState(): { before: RuntimeState; after: RuntimeState } {
  const before = createInitialRuntimeState();
  const after = structuredClone(before);
  after.storyLog.push({
    turnId: 'turn_1',
    speaker: 'narrator',
    text: '本回合正文。',
    gameTime: after.time
  });
  return { before, after };
}

function addJudgement(
  state: RuntimeState,
  input: {
    checkId: string;
    difficultyTier: JudgementDifficultyTier;
    outcome: JudgementOutcome;
  }
): void {
  const check: JudgementCheck = {
    rulesetVersion: 'v1.1-local-d100',
    checkId: input.checkId,
    turnId: 'turn_1',
    gameTime: state.time,
    title: '现场处置',
    category: 'observation',
    relatedActorIds: ['player'],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    difficulty: 50,
    score: 60,
    margin: 10,
    outcome: input.outcome,
    shortSummary: '判定完成。',
    factors: [],
    primaryAttribute: 'thinking',
    primaryAttributeValue: 50,
    difficultyTier: input.difficultyTier,
    difficultyModifier: 0,
    gameDifficultyModifier: 0,
    contextModifierTotal: 0,
    effectiveTarget: 50,
    presetRoll: 40,
    visibility: 'player_known'
  };
  state.judgementChecks[input.checkId] = check;
}

describe('settleTurnExperience', () => {
  it.each([
    ['standard', 'failure', 4],
    ['hard', 'success', 10],
    ['extreme', 'critical_success', 16]
  ] as const)('settles %s %s judgement as %i experience', (difficultyTier, outcome, total) => {
    const { before, after } = createTurnState();
    addJudgement(after, { checkId: 'check_1', difficultyTier, outcome });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse(),
      turnId: 'turn_1'
    });

    expect(result.award?.total).toBe(total);
    expect(result.state.player.progression.experience).toBe(total);
    expect(result.award?.sources).toEqual([
      expect.objectContaining({
        sourceId: 'judgement:check_1',
        amount: total
      })
    ]);
  });

  it('does not award an empty turn without local progress or a model proposal', () => {
    const { before, after } = createTurnState();
    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse(),
      turnId: 'turn_1'
    });

    expect(result.award).toBeUndefined();
    expect(result.state.player.progression.experience).toBe(0);
    expect(result.state.storyLog.at(-1)?.experienceAward).toBeUndefined();
  });

  it('uses the larger model proposal without adding it on top of local experience', () => {
    const { before, after } = createTurnState();
    addJudgement(after, {
      checkId: 'check_1',
      difficultyTier: 'easy',
      outcome: 'success'
    });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse('8'),
      turnId: 'turn_1'
    });

    expect(result.award?.total).toBe(8);
    expect(result.award?.modelSuggestedGain).toBe(8);
    expect(result.award?.sources.map((source) => source.amount)).toEqual([6, 2]);
  });

  it('caps a model-only proposal at 8 experience', () => {
    const { before, after } = createTurnState();
    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse(1_000),
      turnId: 'turn_1'
    });

    expect(result.award).toMatchObject({
      total: 8,
      modelSuggestedGain: 1_000,
      capped: true
    });
  });

  it('deduplicates stable source ids and will not apply an existing turn award twice', () => {
    const { before, after } = createTurnState();
    addJudgement(after, {
      checkId: 'check_same',
      difficultyTier: 'standard',
      outcome: 'success'
    });
    after.judgementChecks.duplicate_storage_key = {
      ...after.judgementChecks.check_same!
    };
    const first = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse(),
      turnId: 'turn_1'
    });
    const second = settleTurnExperience({
      beforeState: before,
      afterState: first.state,
      response: createResponse(),
      turnId: 'turn_1'
    });

    expect(first.award?.total).toBe(8);
    expect(first.award?.sources).toHaveLength(1);
    expect(second.state.player.progression).toEqual(first.state.player.progression);
    expect(second.award?.awardId).toBe('xp:turn_1');
  });

  it('uses the canonical progression helper for level and attribute point gains', () => {
    const { before, after } = createTurnState();
    after.player.progression = {
      level: 1,
      experience: 90,
      unspentAttributePoints: 0
    };
    addJudgement(after, {
      checkId: 'check_level',
      difficultyTier: 'extreme',
      outcome: 'critical_success'
    });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response: createResponse(),
      turnId: 'turn_1'
    });

    expect(result.state.player.progression).toEqual({
      level: 2,
      experience: 6,
      unspentAttributePoints: 5
    });
    expect(result.award).toMatchObject({
      levelsGained: 1,
      attributePointsGained: 5,
      levelAfter: 2
    });
  });

  it('awards only newly applied case evidence and caps that source at 8', () => {
    const { before, after } = createTurnState();
    before.cases.case_1 = {
      caseId: 'case_1',
      title: '仓库失窃案',
      caseType: '盗窃',
      status: 'investigating',
      playerRole: 'lead',
      summary: '正在调查。',
      currentFocus: '核对证物。',
      playerVisibleProgress: '已立案。',
      internalProgressSummary: '继续调查。',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      evidenceIds: [],
      activityLog: [],
      unreadActivityCount: 0,
      visibility: 'player_known',
      createdAt: before.time,
      updatedAt: before.time
    };
    after.cases.case_1 = structuredClone(before.cases.case_1);
    for (const id of ['evidence_1', 'evidence_2', 'evidence_3']) {
      after.caseEvidence[id] = {
        evidenceId: id,
        caseId: 'case_1',
        title: id,
        evidenceType: 'document',
        sourceSummary: '本回合取得。',
        summary: '有效证据。',
        relatedActorIds: [],
        relatedPlaceIds: [],
        visibility: 'player_known',
        createdAt: after.time,
        updatedAt: after.time
      };
    }
    const response = createStructuredResponse({
      caseEvidencePatches: ['evidence_1', 'evidence_2', 'evidence_3'].map(
        (evidenceId) => ({
          evidenceId,
          caseId: 'case_1',
          title: evidenceId,
          evidenceType: 'document',
          summary: '有效证据。',
          sourceSummary: '本回合取得。'
        })
      )
    });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response,
      turnId: 'turn_1'
    });

    expect(result.award?.total).toBe(8);
    expect(result.award?.sources).toHaveLength(2);
  });

  it('awards a resolved current matter and a new relationship milestone from current patches', () => {
    const { before, after } = createTurnState();
    before.dynamicEvents.currentMatters.matter_1 = {
      id: 'matter_1',
      title: '归还证物',
      summary: '等待归还。',
      status: 'active',
      priority: 50,
      visibility: 'known',
      source: 'police',
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: before.time,
      updatedAt: before.time
    };
    after.dynamicEvents.currentMatters.matter_1 = {
      ...structuredClone(before.dynamicEvents.currentMatters.matter_1),
      status: 'resolved'
    };
    after.relationshipThreads.rel_1 = {
      threadId: 'rel_1',
      kind: 'network',
      title: '街坊信任',
      summary: '逐渐建立信任。',
      relatedActorIds: ['player', 'actor_1'],
      relationshipRole: '街坊',
      status: 'active',
      milestones: [
        {
          milestoneId: 'milestone_1',
          gameTime: after.time,
          summary: '对方正式托付重要事情。',
          importance: 100,
          relatedActorIds: ['actor_1'],
          visibility: 'player_known'
        }
      ],
      visibility: 'player_known',
      importance: 70,
      createdAt: after.time,
      updatedAt: after.time
    };
    const response = createStructuredResponse({
      currentMatterPatches: [{ id: 'matter_1', status: 'resolved' }],
      relationshipThreadPatches: [
        {
          threadId: 'rel_1',
          milestoneUpdates: [
            {
              milestoneId: 'milestone_1',
              summary: '对方正式托付重要事情。',
              importance: 100
            }
          ]
        }
      ]
    });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response,
      turnId: 'turn_1'
    });

    expect(result.award?.total).toBe(25);
    expect(result.award?.sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'matter:matter_1:resolved', amount: 10 }),
        expect.objectContaining({
          sourceId: 'relationship:rel_1:milestone_1',
          amount: 15
        })
      ])
    );
  });

  it('does not reward NPC-only relationship or combat background changes', () => {
    const { before, after } = createTurnState();
    after.relationshipThreads.rel_background = {
      threadId: 'rel_background',
      kind: 'network',
      title: '两名街坊的往来',
      summary: '这条关系与玩家无关。',
      relatedActorIds: ['actor_1', 'actor_2'],
      relationshipRole: '街坊',
      status: 'active',
      milestones: [
        {
          milestoneId: 'milestone_background',
          gameTime: after.time,
          summary: '两名街坊达成约定。',
          importance: 80,
          relatedActorIds: ['actor_1', 'actor_2'],
          visibility: 'player_known'
        }
      ],
      visibility: 'player_known',
      importance: 50,
      createdAt: after.time,
      updatedAt: after.time
    };
    after.combatEvents.combat_background = {
      combatId: 'combat_background',
      turnId: 'turn_1',
      gameTime: after.time,
      title: '远处街头冲突',
      type: 'melee',
      locationSummary: '另一处街区',
      participants: [
        {
          actorId: 'actor_1',
          name: '甲',
          side: 'ally',
          roleSummary: '冲突参与者'
        },
        {
          actorId: 'actor_2',
          name: '乙',
          side: 'opponent',
          roleSummary: '冲突参与者'
        }
      ],
      outcome: 'stalemate',
      intensity: 80,
      combatText: '冲突在远处发生。',
      resultSummary: '双方散去。',
      consequenceSummary: '与玩家当前行动无关。',
      judgementCheckIds: [],
      relatedActorIds: ['actor_1', 'actor_2'],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      visibility: 'player_known',
      unread: true,
      createdAt: after.time
    };
    const response = createStructuredResponse({
      relationshipThreadPatches: [
        {
          threadId: 'rel_background',
          milestoneUpdates: [
            {
              milestoneId: 'milestone_background',
              summary: '两名街坊达成约定。',
              importance: 80
            }
          ]
        }
      ]
    });

    const result = settleTurnExperience({
      beforeState: before,
      afterState: after,
      response,
      turnId: 'turn_1'
    });

    expect(result.award).toBeUndefined();
    expect(result.state.player.progression.experience).toBe(0);
  });
});

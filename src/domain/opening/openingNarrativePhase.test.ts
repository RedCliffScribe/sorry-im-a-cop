import { describe, expect, it } from 'vitest';
import { getDramaticOpeningSourceRef } from '../drama/openingRegistry';
import { createInitialRuntimeState } from '../runtime/initialState';
import { lockOpeningCastDraft } from './openingCastDraft';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';
import {
  applyOpeningNarrativeTraceRepair,
  composeOpeningNarrativePhasePrompt,
  createConservativeOpeningNarrativeTrace,
  normalizeOpeningNarrativeDramaTrace,
  validateOpeningNarrativeDraft
} from './openingNarrativePhase';

function fixture(dramatic = false) {
  const state = createInitialRuntimeState({
    currentIdentity: 'police',
    policePostingId: 'cid_headquarters',
    ...(dramatic ? { dramaticOpeningId: 'first_shift' } : {})
  });
  const skeleton = createOpeningLocalSkeleton({
    state,
    openingSessionId: 'opening_narrative'
  });
  const sourceRef = getDramaticOpeningSourceRef('first_shift');
  if (dramatic && !sourceRef) throw new Error('missing first_shift source');
  const cast = lockOpeningCastDraft(
    {
      openingSessionId: skeleton.openingSessionId,
      openingFacts: {
        situationSummary: '警署交更。',
        centralMatter: '当值任务。',
        playerDecisionBoundary: '玩家决定行动。'
      },
      actors: [
        {
          slotId: 'opening_actor_police_relation_1',
          name: '梁志强',
          gender: 'male',
          currentIdentity: 'police',
          publicIdentity: '警长',
          actualIdentitySummary: '当值警长。',
          playerRoleRelation: 'police_supervisor',
          organizationIds: ['org_hk_police'],
          positionSummary: '警长',
          profileSummary: '负责交更。',
          personality: '务实。',
          speechStyle: '简短。',
          motivation: '完成交更。',
          presence: 'present',
          currentPlaceId: skeleton.currentPlaceId,
          currentSceneId: skeleton.currentSceneId
        }
      ],
      actionIntents: [
        {
          actionId: 'opening_action_1',
          intent: '询问任务。',
          relatedActorSlotIds: ['opening_actor_police_relation_1'],
          requiredFacts: []
        },
        {
          actionId: 'opening_action_2',
          intent: '查看记录。',
          relatedActorSlotIds: [],
          requiredFacts: []
        }
      ],
      ...(dramatic
        ? {
            dramaPlan: {
              planId: 'drama_plan_opening_first_shift',
              planningScope: 'opening',
              mode: 'surface',
              primarySource: sourceRef,
              supportSources: [],
              sceneFunction: 'choice',
              intensity: 'medium',
              playerMayIgnore: true,
              maxNewActors: 4,
              adaptationSummary: '把第一班压力落到当前交更现场。',
              reasonSummary: '玩家可以从当值任务自然进入第一幕。'
            }
          }
        : {})
    },
    skeleton,
    state
  );
  return { state, skeleton, cast, sourceRef };
}

describe('opening narrative phase', () => {
  it('accepts only the locked action IDs in their original order', () => {
    const { skeleton, cast } = fixture();
    const parsed = validateOpeningNarrativeDraft(
      {
        openingSessionId: skeleton.openingSessionId,
        narrativeText: '完整第一幕正文。',
        presentationHints: { dialogueEmotions: ['furious', 'serious'] },
        suggestedActions: [
          { actionId: 'opening_action_1', text: '询问任务。' },
          { actionId: 'opening_action_2', text: '查看记录。' }
        ]
      },
      skeleton,
      cast
    );
    expect(parsed.suggestedActions).toHaveLength(2);
    expect(parsed.presentationHints).toEqual({ dialogueEmotions: ['neutral', 'serious'] });
  });

  it('rejects runtime fields and reordered actions', () => {
    const { skeleton, cast } = fixture();
    expect(() =>
      validateOpeningNarrativeDraft(
        {
          openingSessionId: skeleton.openingSessionId,
          narrativeText: '正文。',
          suggestedActions: [
            { actionId: 'opening_action_2', text: '查看记录。' },
            { actionId: 'opening_action_1', text: '询问任务。' }
          ],
          playerStatePatch: {}
        },
        skeleton,
        cast
      )
    ).toThrow();
  });

  it('locally restores locked action IDs and order', () => {
    const { skeleton, cast } = fixture();
    const parsed = validateOpeningNarrativeDraft(
      {
        openingSessionId: skeleton.openingSessionId,
        narrativeText: '正文。',
        suggestedActions: [
          { actionId: 'opening_action_2', text: '先查看记录。' },
          { actionId: 'model_action', text: '向警长发问。' }
        ]
      },
      skeleton,
      cast
    );

    expect(parsed.suggestedActions).toEqual([
      { actionId: 'opening_action_1', text: '向警长发问。' },
      { actionId: 'opening_action_2', text: '先查看记录。' }
    ]);
  });

  it('prompts an exact narrative-only drama trace instead of a placeholder', () => {
    const { state, skeleton, cast, sourceRef } = fixture(true);
    const prompt = composeOpeningNarrativePhasePrompt({
      input: {
        setup: {
          currentIdentity: 'police',
          policePostingId: 'cid_headquarters',
          dramaticOpeningId: 'first_shift'
        },
        initialState: state
      },
      skeleton,
      cast,
      actorProfiles: []
    });

    expect(prompt).toContain('"planId": "drama_plan_opening_first_shift"');
    expect(prompt).toContain('"resultingWritebackRefs": []');
    expect(prompt).toContain('"presentationHints"');
    expect(prompt).toContain('innerMonologueEmotions');
    expect(prompt).toContain(JSON.stringify(sourceRef));
    expect(prompt).not.toContain('只有存在已验证 DramaPlan 时才按其合同输出');
  });

  it('normalizes model trace echoes to the locked local drama plan', () => {
    const { cast, sourceRef } = fixture(true);
    const result = normalizeOpeningNarrativeDramaTrace(
      {
        planId: 'model_invented_plan',
        status: 'used_persistently',
        usedSourceRefs: [
          sourceRef,
          {
            providerId: 'invented',
            sourceType: 'invented',
            sourceId: 'invented'
          }
        ],
        resultingWritebackRefs: [{ kind: 'actor', id: 'invented_actor' }],
        customEventProgress: { invented: true }
      },
      cast
    );

    expect(result.issues).toEqual([]);
    expect(result.locallyNormalized).toBe(true);
    expect(result.trace).toEqual({
      planId: 'drama_plan_opening_first_shift',
      status: 'partially_used',
      usedSourceRefs: [sourceRef],
      resultingWritebackRefs: []
    });
  });

  it('repairs only a trace and has a conservative fallback for invalid output', () => {
    const { cast, sourceRef } = fixture(true);
    expect(
      normalizeOpeningNarrativeDramaTrace('invalid trace', cast).issues
    ).toEqual(['dramaExecutionTrace 缺失或不是 object']);
    expect(
      applyOpeningNarrativeTraceRepair(
        {
          dramaExecutionTrace: {
            planId: 'wrong_plan',
            status: 'texture',
            usedSourceRefs: [sourceRef],
            resultingWritebackRefs: [{ kind: 'case', id: 'invented_case' }]
          }
        },
        cast
      )
    ).toEqual({
      planId: 'drama_plan_opening_first_shift',
      status: 'used_as_texture',
      usedSourceRefs: [sourceRef],
      resultingWritebackRefs: []
    });
    expect(createConservativeOpeningNarrativeTrace(cast)).toEqual({
      planId: 'drama_plan_opening_first_shift',
      status: 'not_used',
      usedSourceRefs: [],
      resultingWritebackRefs: []
    });
  });
});

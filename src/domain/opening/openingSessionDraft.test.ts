import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  canonicalizeOpeningSetup,
  createOpeningSessionDraft,
  createOpeningSetupHash,
  saveOpeningCastCheckpoint,
  saveOpeningNarrativeCheckpoint
} from './openingSessionDraft';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

function createCast(openingSessionId: string, state: ReturnType<typeof createInitialRuntimeState>) {
  return {
    openingSessionId,
    openingFacts: {
      situationSummary: '警署完成早班交接。',
      centralMatter: '确认最急的事务。',
      playerDecisionBoundary: '玩家自行决定调查顺序。'
    },
    actors: [
      {
        slotId: 'opening_actor_police_relation_1',
        name: '梁志强',
        gender: 'male' as const,
        currentIdentity: 'police' as const,
        publicIdentity: '当值警长',
        actualIdentitySummary: '皇家香港警察当值警长。',
        playerRoleRelation: 'police_supervisor' as const,
        organizationIds: ['org_hk_police'],
        positionSummary: '当值警长',
        profileSummary: '负责交更和分派工作的警长。',
        personality: '谨慎务实。',
        speechStyle: '简短直接。',
        motivation: '完成当值交接。',
        presence: 'present' as const,
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: state.location.currentSceneId
      }
    ],
    actionIntents: [
      {
        actionId: 'opening_action_1',
        intent: '询问最急的事务。',
        relatedActorSlotIds: ['opening_actor_police_relation_1'],
        requiredFacts: []
      },
      {
        actionId: 'opening_action_2',
        intent: '查看交更记录。',
        relatedActorSlotIds: [],
        requiredFacts: []
      }
    ]
  };
}

describe('opening session draft', () => {
  it('creates a setup-bound skeleton checkpoint without storing the setup or API data', async () => {
    const setup = {
      playerName: '陈志明',
      currentIdentity: 'police' as const,
      openingNote: '希望从早班交接开始'
    };
    const state = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_draft'
    });
    const draft = await createOpeningSessionDraft({
      setup,
      skeleton,
      now: '2026-07-28T01:00:00.000Z'
    });

    expect(draft).toMatchObject({
      openingSessionId: 'opening_draft',
      worldpackId: 'hk_1988',
      stage: 'skeleton_ready',
      actorProfiles: {},
      diagnostics: []
    });
    expect(draft).not.toHaveProperty('setup');
    expect(JSON.stringify(draft)).not.toContain('apiKey');
  });

  it('uses a canonical setup hash and changes it when the player changes setup', async () => {
    const first = {
      playerName: '陈志明',
      currentIdentity: 'police' as const
    };
    const reordered = {
      currentIdentity: 'police' as const,
      playerName: '陈志明'
    };
    expect(canonicalizeOpeningSetup(first)).toBe(
      canonicalizeOpeningSetup(reordered)
    );
    expect(await createOpeningSetupHash(first)).toBe(
      await createOpeningSetupHash(reordered)
    );
    expect(await createOpeningSetupHash(first)).not.toBe(
      await createOpeningSetupHash({ ...first, playerName: '陈志强' })
    );
  });

  it('persists the valid cast and refuses to skip unfinished actor profiles', async () => {
    const setup = { currentIdentity: 'police' as const };
    const state = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_draft_cast'
    });
    const draft = await createOpeningSessionDraft({ setup, skeleton });
    const castDraft = createCast(skeleton.openingSessionId, state);
    const withCast = saveOpeningCastCheckpoint(draft, castDraft);

    expect(withCast.stage).toBe('cast_ready');
    expect(withCast.actorProfiles.opening_actor_police_relation_1).toEqual({
      status: 'pending',
      actorSlotId: 'opening_actor_police_relation_1',
      actorId: 'opening_actor_police_relation_1'
    });
    expect(() =>
      saveOpeningNarrativeCheckpoint(withCast, {
        openingSessionId: skeleton.openingSessionId,
        narrativeText: '正文',
        suggestedActions: [
          { actionId: 'opening_action_1', text: '询问' },
          { actionId: 'opening_action_2', text: '查看' }
        ]
      })
    ).toThrow('profiles_ready');
  });
});

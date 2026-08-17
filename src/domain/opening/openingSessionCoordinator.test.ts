import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type {
  OpeningSessionRepository,
  OpeningSessionSummary
} from './openingSessionRepository';
import type { OpeningSessionDraft } from './openingSessionDraft';
import {
  abandonOpeningSession,
  beginOrResumeOpeningSession,
  persistOpeningCastStage
} from './openingSessionCoordinator';

class MemoryOpeningSessionRepository implements OpeningSessionRepository {
  private readonly drafts = new Map<string, OpeningSessionDraft>();

  async list(): Promise<OpeningSessionSummary[]> {
    return [...this.drafts.values()].map(
      ({
        openingSessionId,
        setupHash,
        worldpackId,
        stage,
        createdAt,
        updatedAt
      }) => ({
        openingSessionId,
        setupHash,
        worldpackId,
        stage,
        createdAt,
        updatedAt
      })
    );
  }

  async load(openingSessionId: string): Promise<OpeningSessionDraft | null> {
    return this.drafts.get(openingSessionId) ?? null;
  }

  async findLatestResumable(
    setupHash: string
  ): Promise<OpeningSessionDraft | null> {
    return (
      [...this.drafts.values()]
        .filter(
          (draft) => draft.setupHash === setupHash && draft.stage !== 'committed'
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] ??
      null
    );
  }

  async save(draft: OpeningSessionDraft): Promise<void> {
    this.drafts.set(draft.openingSessionId, structuredClone(draft));
  }

  async delete(openingSessionId: string): Promise<void> {
    this.drafts.delete(openingSessionId);
  }

  async clearAll(): Promise<void> {
    this.drafts.clear();
  }
}

function createRawCast(
  openingSessionId: string,
  state: ReturnType<typeof createInitialRuntimeState>
) {
  return {
    openingSessionId,
    openingFacts: {
      situationSummary: '警署完成交接。',
      centralMatter: '确认当值事务。',
      playerDecisionBoundary: '玩家决定行动顺序。'
    },
    actors: [
      {
        slotId: 'opening_actor_police_relation_1',
        name: '梁志强',
        gender: 'male',
        currentIdentity: 'police',
        publicIdentity: '当值警长',
        actualIdentitySummary: '皇家香港警察当值警长。',
        playerRoleRelation: 'police_supervisor',
        organizationIds: ['org_hk_police'],
        positionSummary: '当值警长',
        profileSummary: '负责交更和分派工作。',
        personality: '谨慎务实。',
        speechStyle: '简短直接。',
        motivation: '完成交接。',
        presence: 'present',
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId: state.location.currentSceneId
      }
    ],
    actionIntents: [
      {
        actionId: 'opening_action_1',
        intent: '询问事务。',
        relatedActorSlotIds: ['opening_actor_police_relation_1'],
        requiredFacts: []
      },
      {
        actionId: 'opening_action_2',
        intent: '查看记录。',
        relatedActorSlotIds: [],
        requiredFacts: []
      }
    ]
  };
}

describe('opening session coordinator', () => {
  it('resumes the same setup after a refresh and starts a new session after setup changes', async () => {
    const repository = new MemoryOpeningSessionRepository();
    const setup = {
      playerName: '陈志明',
      currentIdentity: 'police' as const
    };
    const state = createInitialRuntimeState(setup);
    const first = await beginOrResumeOpeningSession({
      setup,
      state,
      repository,
      openingSessionId: 'opening_first'
    });
    const resumed = await beginOrResumeOpeningSession({
      setup,
      state,
      repository,
      openingSessionId: 'opening_should_not_be_used'
    });
    const changedSetup = {
      ...setup,
      openingNote: '改为从夜班开始'
    };
    const changedState = createInitialRuntimeState(changedSetup);
    const changed = await beginOrResumeOpeningSession({
      setup: changedSetup,
      state: changedState,
      repository,
      openingSessionId: 'opening_changed'
    });

    expect(first.resumed).toBe(false);
    expect(resumed).toMatchObject({
      resumed: true,
      draft: { openingSessionId: 'opening_first' }
    });
    expect(changed).toMatchObject({
      resumed: false,
      draft: { openingSessionId: 'opening_changed' }
    });
  });

  it('persists only a validated cast and reuses local stable actor IDs', async () => {
    const repository = new MemoryOpeningSessionRepository();
    const setup = { currentIdentity: 'police' as const };
    const state = createInitialRuntimeState(setup);
    const { draft } = await beginOrResumeOpeningSession({
      setup,
      state,
      repository,
      openingSessionId: 'opening_cast'
    });
    const result = await persistOpeningCastStage({
      draft,
      rawCast: createRawCast(draft.openingSessionId, state),
      state,
      repository
    });

    expect(result.draft.stage).toBe('cast_ready');
    expect(result.lockedCast.actors[0].actorId).toBe(
      'opening_actor_police_relation_1'
    );
    expect((await repository.load('opening_cast'))?.stage).toBe('cast_ready');

    await abandonOpeningSession(repository, 'opening_cast');
    expect(await repository.load('opening_cast')).toBeNull();
  });
});

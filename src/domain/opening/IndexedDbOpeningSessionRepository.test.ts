import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { IndexedDbOpeningSessionRepository } from './IndexedDbOpeningSessionRepository';
import {
  createOpeningSessionDraft,
  saveOpeningCastCheckpoint
} from './openingSessionDraft';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

const DATABASE = 'cop-v2-test-opening-sessions';

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function createCast(
  openingSessionId: string,
  state: ReturnType<typeof createInitialRuntimeState>
) {
  return {
    openingSessionId,
    openingFacts: {
      situationSummary: '完成交接。',
      centralMatter: '确认当值事务。',
      playerDecisionBoundary: '玩家决定行动顺序。'
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
        profileSummary: '负责交更和分派工作。',
        personality: '谨慎务实。',
        speechStyle: '简短直接。',
        motivation: '完成交接。',
        presence: 'present' as const,
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

beforeEach(async () => {
  await deleteDatabase(DATABASE);
});

describe('IndexedDbOpeningSessionRepository', () => {
  it('round-trips resumable stage drafts and finds the latest matching setup', async () => {
    const repository = new IndexedDbOpeningSessionRepository(DATABASE);
    const setup = { currentIdentity: 'police' as const };
    const state = createInitialRuntimeState(setup);
    const firstSkeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_first'
    });
    const first = await createOpeningSessionDraft({
      setup,
      skeleton: firstSkeleton,
      now: '2026-07-28T01:00:00.000Z'
    });
    await repository.save(first);

    const secondSkeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_second'
    });
    const secondBase = await createOpeningSessionDraft({
      setup,
      skeleton: secondSkeleton,
      now: '2026-07-28T02:00:00.000Z'
    });
    const second = saveOpeningCastCheckpoint(
      secondBase,
      createCast(secondSkeleton.openingSessionId, state),
      '2026-07-28T02:01:00.000Z'
    );
    await repository.save(second);

    expect((await repository.list()).map((item) => item.openingSessionId)).toEqual([
      'opening_second',
      'opening_first'
    ]);
    expect(await repository.load('opening_second')).toEqual(second);
    expect(
      (await repository.findLatestResumable(first.setupHash))?.openingSessionId
    ).toBe('opening_second');
  });

  it('rejects invalid records before IndexedDB write and supports explicit cleanup', async () => {
    const repository = new IndexedDbOpeningSessionRepository(DATABASE);
    await expect(
      repository.save({
        openingSessionId: 'invalid'
      } as never)
    ).rejects.toThrow();

    const state = createInitialRuntimeState();
    const skeleton = createOpeningLocalSkeleton({
      state,
      openingSessionId: 'opening_delete'
    });
    const draft = await createOpeningSessionDraft({ setup: {}, skeleton });
    await repository.save(draft);
    await repository.delete(draft.openingSessionId);
    expect(await repository.load(draft.openingSessionId)).toBeNull();

    await repository.save(draft);
    await repository.clearAll();
    expect(await repository.list()).toEqual([]);
  });
});

// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  parseGeneratedCustomCharacterDraft
} from './characterCreation';
import {
  promoteCustomCharacterToGlobal,
  saveCustomCharacterWorkingDraft,
  saveCustomCharacterRevision,
  setCustomCharacterAvailability,
  setManyCustomCharacterAvailability
} from './characterManagement';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';

let databaseSequence = 0;
let repository: IndexedDbCustomContentRepository;

function draft() {
  return parseGeneratedCustomCharacterDraft({
    displayName: '林若晴',
    aliases: ['阿晴'],
    gender: '女',
    profileSummary: '法证人员。',
    backgroundSummary: '熟悉证物流程。',
    corePersonality: ['冷静'],
    values: ['真相'],
    coreMotivations: ['保护证据'],
    majorRelationships: [],
    temporalPolicy: 'preserve_life_stage',
    lockedFields: [],
    adaptableFields: []
  });
}

const hkDeployment = [
  {
    worldpackId: 'hk_1988',
    mode: 'native',
    defaultEnabledForNewGame: true
  }
] as const;

beforeEach(() => {
  databaseSequence += 1;
  repository = new IndexedDbCustomContentRepository(
    `character-management-${databaseSequence}`
  );
});

describe('custom character revision management', () => {
  it('persists an incomplete working draft outside the formal revision stores', async () => {
    const incomplete = draft();
    incomplete.displayName = '';
    incomplete.corePersonality = [];
    const saved = await saveCustomCharacterWorkingDraft({
      repository,
      input: {
        description: '一名尚未命名的线人。',
        draft: incomplete,
        deployments: [],
        global: true,
        projectIds: [],
        generationIssues: [
          {
            code: 'required_field_missing',
            path: 'displayName',
            summary: '姓名仍需补充。'
          }
        ],
        generationRecovery: 'local_fallback'
      },
      dependencies: {
        now: () => '2026-07-29T00:00:00.000Z'
      }
    });

    expect(await repository.getCharacterWorkingDraft(saved.workingDraftId))
      .toMatchObject({
        description: '一名尚未命名的线人。',
        draft: { displayName: '', corePersonality: [] }
      });
    expect(await repository.listCharacterAssets()).toEqual([]);
    expect(await repository.listCharacterRevisions('missing')).toEqual([]);
  });

  it('persists an AI draft as needs-review and disabled', async () => {
    const result = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [],
        global: true,
        projectIds: [],
        mode: 'needs_review'
      },
      dependencies: {
        createId: () => 'character-1',
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });

    expect(result.asset).toMatchObject({
      characterAssetId: 'character-1',
      latestRevision: 1,
      revisionCount: 1,
      global: true
    });
    expect(result.revision.lifecycle).toEqual({
      generationStatus: 'ready',
      reviewStatus: 'needs_review',
      availabilityStatus: 'disabled'
    });
    expect(result.revision.entryMode).toBe('natural');
    expect(result.revision.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires project scope and a worldpack before publishing', async () => {
    await expect(
      saveCustomCharacterRevision({
        repository,
        input: {
          draft: draft(),
          deployments: [],
          global: false,
          projectIds: [],
          mode: 'needs_review'
        }
      })
    ).rejects.toThrow('项目人物必须至少属于一个内容项目');

    await expect(
      saveCustomCharacterRevision({
        repository,
        input: {
          draft: draft(),
          deployments: [],
          global: true,
          projectIds: [],
          mode: 'publish'
        }
      })
    ).rejects.toThrow('发布前必须至少启用一个世界包');
  });

  it('publishes edits as a new immutable revision', async () => {
    const initial = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [],
        global: true,
        projectIds: [],
        mode: 'needs_review'
      },
      dependencies: {
        createId: () => 'character-2',
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });
    const edited = draft();
    edited.profileSummary = '资深法证人员。';
    const published = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: edited,
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'publish',
        existingAsset: initial.asset
      },
      dependencies: {
        now: () => '2026-07-26T01:00:00.000Z'
      }
    });

    expect(published.revision).toMatchObject({
      revision: 2,
      profileSummary: '资深法证人员。',
      lifecycle: {
        generationStatus: 'ready',
        reviewStatus: 'approved',
        availabilityStatus: 'enabled'
      }
    });
    expect(
      await repository.getCharacterRevision('character-2', 1)
    ).toMatchObject({
      profileSummary: '法证人员。',
      lifecycle: { reviewStatus: 'needs_review' }
    });
  });

  it('creates revisions for availability changes and supports bulk disable', async () => {
    const first = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: { createId: () => 'character-a' }
    });
    const second = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: { createId: () => 'character-b' }
    });

    await setManyCustomCharacterAvailability({
      repository,
      assets: [first.asset, second.asset],
      availabilityStatus: 'disabled',
      now: () => '2026-07-26T02:00:00.000Z'
    });

    expect(
      await repository.getCharacterRevision('character-a', 2)
    ).toMatchObject({
      lifecycle: { availabilityStatus: 'disabled' }
    });
    expect(
      await repository.getCharacterRevision('character-b', 2)
    ).toMatchObject({
      lifecycle: { availabilityStatus: 'disabled' }
    });
  });

  it('does not enable an unapproved draft and promotes project scope without cloning identity', async () => {
    const saved = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [...hkDeployment],
        global: false,
        projectIds: ['project-1'],
        mode: 'needs_review'
      },
      dependencies: {
        createId: () => 'character-project',
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });

    await expect(
      setCustomCharacterAvailability({
        repository,
        asset: saved.asset,
        availabilityStatus: 'enabled'
      })
    ).rejects.toThrow('只有已审核');

    const promoted = await promoteCustomCharacterToGlobal({
      repository,
      asset: saved.asset,
      now: () => '2026-07-26T03:00:00.000Z'
    });
    expect(promoted).toMatchObject({
      characterAssetId: 'character-project',
      global: true,
      projectIds: ['project-1'],
      latestRevision: 1
    });
    expect(
      await repository.getCharacterRevision('character-project', 1)
    ).toMatchObject({
      entryMode: 'follow_project'
    });
  });

  it('preflights every item before an atomic bulk enable', async () => {
    const approved = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: { createId: () => 'character-approved' }
    });
    const pending = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: draft(),
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'needs_review'
      },
      dependencies: { createId: () => 'character-pending' }
    });

    await expect(
      setManyCustomCharacterAvailability({
        repository,
        assets: [approved.asset, pending.asset],
        availabilityStatus: 'enabled'
      })
    ).rejects.toThrow('只有已审核');
    expect(
      await repository.getCharacterRevision('character-approved', 2)
    ).toBeNull();
  });
});

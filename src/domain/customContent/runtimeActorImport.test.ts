// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  createCustomCharacterDraftFromRuntimeActor,
  createRuntimeActorImportAssetId,
  importRuntimeActorToCustomLibrary
} from './runtimeActorImport';

let databaseSequence = 0;
let repository: IndexedDbCustomContentRepository;

beforeEach(() => {
  databaseSequence += 1;
  repository = new IndexedDbCustomContentRepository(
    `runtime-actor-import-${databaseSequence}`
  );
});

function actor() {
  return createActorDefaults({
    actorId: 'npc_station_sergeant',
    name: '何志强',
    englishName: 'Henry Ho',
    aliases: ['强哥'],
    callName: '何Sir',
    gender: 'male',
    currentIdentity: 'police',
    actualIdentitySummary: '旺角警署报案室的老资格警署警长。',
    publicIdentity: '警署警长',
    positionSummary: '报案室监督',
    visualAgeAnchor: '四十岁上下',
    profileSummary: '记性很好、说话硬的老差人。',
    appearance: '头发花白，制服熨得很直。',
    clothing: '夏季军装制服。',
    personality: '严厉、重规矩，观察人很细',
    speechStyle: '短句，带老派粤语口吻。',
    motivation: '维持警署秩序；保护下属',
    longTermGoal: '平稳熬到退休。',
    values: '规矩、责任',
    currentPlaceId: 'place_mong_kok_station',
    statusSummary: '正在值班。',
    relationshipSummary: '把玩家当成还要观察的新人。',
    attitudeTowardPlayer: '审视但不敌视。',
    longTermMemorySummary: '记得玩家漏写过投诉记录。',
    recentInteractionMemory: '刚提醒玩家注意报案室门口。'
  });
}

describe('runtime actor custom-library import', () => {
  it('projects reusable identity fields without carrying current-save state', () => {
    const draft = createCustomCharacterDraftFromRuntimeActor(actor());

    expect(draft).toMatchObject({
      displayName: '何志强',
      aliases: ['强哥', '何Sir', 'Henry Ho'],
      gender: '男',
      profileSummary: '记性很好、说话硬的老差人。',
      corePersonality: ['严厉', '重规矩', '观察人很细'],
      values: ['规矩', '责任'],
      coreMotivations: ['维持警署秩序', '保护下属', '平稳熬到退休。'],
      majorRelationships: [],
      entryMode: 'natural'
    });
    expect(draft.backgroundSummary).toContain('旺角警署报案室的老资格警署警长。');
    expect(draft.backgroundSummary).toContain('年龄印象：四十岁上下');
    expect(draft.backgroundSummary).toContain('说话风格：短句，带老派粤语口吻。');

    const serialized = JSON.stringify(draft);
    expect(serialized).not.toContain('place_mong_kok_station');
    expect(serialized).not.toContain('正在值班');
    expect(serialized).not.toContain('把玩家当成还要观察的新人');
    expect(serialized).not.toContain('审视但不敌视');
    expect(serialized).not.toContain('漏写过投诉记录');
    expect(serialized).not.toContain('刚提醒玩家');
  });

  it('saves one disabled needs-review draft with a stable source identity', async () => {
    const first = await importRuntimeActorToCustomLibrary({
      repository,
      worldpackId: 'hk_1988',
      actor: actor(),
      dependencies: {
        now: () => '2026-07-27T08:00:00.000Z'
      }
    });
    const expectedAssetId = await createRuntimeActorImportAssetId({
      worldpackId: 'hk_1988',
      actorId: 'npc_station_sergeant'
    });

    expect(first).toEqual({
      status: 'imported',
      characterAssetId: expectedAssetId,
      revision: 1
    });
    const asset = await repository.getCharacterAsset(expectedAssetId);
    const revision = await repository.getCharacterRevision(expectedAssetId, 1);
    expect(asset).toMatchObject({
      latestRevision: 1,
      revisionCount: 1,
      global: true,
      projectIds: []
    });
    expect(revision?.lifecycle).toEqual({
      generationStatus: 'ready',
      reviewStatus: 'needs_review',
      availabilityStatus: 'disabled'
    });
    expect(revision?.deployments).toEqual([
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: false
      }
    ]);

    const repeated = await importRuntimeActorToCustomLibrary({
      repository,
      worldpackId: 'hk_1988',
      actor: actor()
    });
    expect(repeated).toEqual({
      status: 'already_exists',
      characterAssetId: expectedAssetId,
      revision: 1
    });
    expect(await repository.listCharacterAssets()).toHaveLength(1);
    expect(await repository.listCharacterRevisions(expectedAssetId)).toHaveLength(1);
  });

  it('recognizes a runtime actor that is already bound to an existing library asset', async () => {
    await repository.saveRevisionBundle({
      assetKind: 'character',
      asset: {
        characterAssetId: 'character-original',
        latestRevision: 3,
        revisionCount: 3,
        global: true,
        projectIds: [],
        createdAt: '2026-07-20T00:00:00.000Z',
        updatedAt: '2026-07-27T00:00:00.000Z'
      },
      revision: {
        characterAssetId: 'character-original',
        revision: 3,
        checksum: 'existing-checksum',
        displayName: '何志强',
        aliases: [],
        gender: '男',
        profileSummary: '原人物库资产。',
        backgroundSummary: '原人物库资产。',
        corePersonality: ['严厉'],
        values: ['规矩'],
        coreMotivations: ['维持秩序'],
        majorRelationships: [],
        entryMode: 'natural',
        adaptationPolicy: {
          temporalPolicy: 'preserve_life_stage',
          lockedFields: [],
          adaptableFields: []
        },
        deployments: [],
        sourceSpans: [],
        lifecycle: {
          generationStatus: 'ready',
          reviewStatus: 'approved',
          availabilityStatus: 'enabled'
        }
      }
    });

    await expect(
      importRuntimeActorToCustomLibrary({
        repository,
        worldpackId: 'hk_1988',
        actor: actor(),
        sourceCharacterAssetId: 'character-original'
      })
    ).resolves.toEqual({
      status: 'already_exists',
      characterAssetId: 'character-original',
      revision: 3
    });
    expect(await repository.listCharacterAssets()).toHaveLength(1);
  });
});

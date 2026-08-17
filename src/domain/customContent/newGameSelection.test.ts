import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { composeOpeningBlueprintPrompt } from '../opening/composeOpeningBlueprintPrompt';
import { composeOpeningInitializationPrompt } from '../opening/composeOpeningInitializationPrompt';
import type { OpeningBlueprint } from '../opening/openingBlueprintSchema';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';
import {
  createCustomContentRevisionRef,
  customContentRevisionRefKey
} from './assetFoundation';
import type {
  CustomCharacterAsset,
  CustomCharacterRevision,
  CustomContentDependency,
  CustomContentProjectAsset,
  CustomContentProjectRevision,
  CustomEventGroupAsset,
  CustomEventGroupRevision
} from './assetTypes';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';
import {
  approvePreparedNewGameCustomContent,
  createNewGameCustomContentSelectionKey,
  loadNewGameCustomContentLibrary,
  prepareNewGameCustomContent,
  type NewGameCustomContentSelection
} from './newGameSelection';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

const approvedLifecycle = {
  generationStatus: 'ready' as const,
  reviewStatus: 'approved' as const,
  availabilityStatus: 'enabled' as const
};
const nativeDeployment = {
  worldpackId: 'hk_1988',
  mode: 'native' as const,
  defaultEnabledForNewGame: true
};

function character(
  id: string,
  options: { global?: boolean; manual?: boolean } = {}
): {
  asset: CustomCharacterAsset;
  revision: CustomCharacterRevision;
} {
  return {
    asset: {
      characterAssetId: id,
      latestRevision: 1,
      revisionCount: 1,
      global: options.global ?? false,
      projectIds: options.global ? [] : ['project-night'],
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    },
    revision: {
      characterAssetId: id,
      revision: 1,
      checksum: `checksum-${id}`,
      displayName: id === 'character-global' ? '独立记者' : '林法证',
      aliases: [],
      gender: 'female',
      profileSummary: '熟悉夜班证物流程。',
      backgroundSummary: '长期处理封条与交接记录。',
      corePersonality: ['冷静'],
      values: ['真相'],
      coreMotivations: ['保护证据链'],
      majorRelationships: [],
      entryMode: options.global ? 'asap_contact' : 'follow_project',
      adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(
        options.manual ? { temporalPolicy: 'manual' } : {}
      ),
      deployments: [nativeDeployment],
      sourceSpans: [],
      lifecycle: approvedLifecycle
    }
  };
}

function project(): {
  asset: CustomContentProjectAsset;
  revision: CustomContentProjectRevision;
} {
  return {
    asset: {
      projectId: 'project-night',
      latestRevision: 1,
      revisionCount: 1,
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    },
    revision: {
      projectId: 'project-night',
      revision: 1,
      checksum: 'checksum-project-night',
      title: '夜班证物疑云',
      summary: '一部长篇项目，只把当前焦点事件送入前台。',
      conversionMode: 'structural_adaptation',
      characterAssetIds: ['character-project'],
      eventGroupIds: ['event-seal'],
      deployments: [nativeDeployment],
      sourceDocumentIds: [],
      lifecycle: approvedLifecycle
    }
  };
}

function eventGroup(
  projectCharacter: CustomCharacterRevision
): {
  asset: CustomEventGroupAsset;
  revision: CustomEventGroupRevision;
} {
  const characterRef = createCustomContentRevisionRef(projectCharacter);
  return {
    asset: {
      eventGroupId: 'event-seal',
      projectId: 'project-night',
      latestRevision: 1,
      revisionCount: 1,
      createdAt: '2026-07-26T00:00:00.000Z',
      updatedAt: '2026-07-26T00:00:00.000Z'
    },
    revision: {
      eventGroupId: 'event-seal',
      projectId: 'project-night',
      revision: 1,
      checksum: 'checksum-event-seal',
      title: '封条异常',
      summary: '证物封条编号出现可追查的异常。',
      invariantCore: ['封条编号不一致'],
      mutableSlots: ['异常被谁先发现'],
      forbiddenAdaptations: ['不得预设玩家已经接案'],
      characterRefs: [characterRef],
      roleSlots: [
        {
          roleSlotId: 'forensic_contact',
          title: '法证联系人',
          summary: '提供证物流程入口。',
          bindingMode: 'fixed_character',
          fixedCharacterRef: characterRef,
          requirements: []
        }
      ],
      stages: [],
      entryMode: 'asap',
      reusePolicy: 'save_single_use',
      inheritProjectDeployments: true,
      sourceSpans: [],
      lifecycle: approvedLifecycle
    }
  };
}

function dependency(
  owner: ReturnType<typeof createCustomContentRevisionRef>,
  target: ReturnType<typeof createCustomContentRevisionRef>
): CustomContentDependency {
  return {
    dependencyId: `dependency:${customContentRevisionRefKey(owner)}:${customContentRevisionRefKey(target)}`,
    owner,
    target,
    kind: 'required'
  };
}

async function seedRepository(
  name: string,
  options: {
    manualGlobal?: boolean;
    projectCharacterGlobal?: boolean;
  } = {}
): Promise<IndexedDbCustomContentRepository> {
  const repository = new IndexedDbCustomContentRepository(name);
  const projectCharacter = character('character-project', {
    global: options.projectCharacterGlobal
  });
  const globalCharacter = character('character-global', {
    global: true,
    manual: options.manualGlobal
  });
  const projectRecord = project();
  const eventRecord = eventGroup(projectCharacter.revision);
  const projectRef = createCustomContentRevisionRef(projectRecord.revision);
  await repository.saveRevisionBundles([
    {
      assetKind: 'content_project',
      asset: projectRecord.asset,
      revision: projectRecord.revision,
      dependencies: [
        dependency(
          projectRef,
          createCustomContentRevisionRef(projectCharacter.revision)
        ),
        dependency(
          projectRef,
          createCustomContentRevisionRef(eventRecord.revision)
        )
      ]
    },
    {
      assetKind: 'character',
      asset: projectCharacter.asset,
      revision: projectCharacter.revision
    },
    {
      assetKind: 'character',
      asset: globalCharacter.asset,
      revision: globalCharacter.revision
    },
    {
      assetKind: 'event_group',
      asset: eventRecord.asset,
      revision: eventRecord.revision,
      dependencies: [
        dependency(
          createCustomContentRevisionRef(eventRecord.revision),
          createCustomContentRevisionRef(projectCharacter.revision)
        )
      ]
    }
  ]);
  return repository;
}

async function publishSecondProjectCharacterRevision(
  repository: IndexedDbCustomContentRepository
): Promise<void> {
  const asset = (await repository.listCharacterAssets()).find(
    (item) => item.characterAssetId === 'character-project'
  );
  const first = await repository.getCharacterRevision('character-project', 1);
  if (!asset || !first) throw new Error('测试人物种子缺失。');
  await repository.saveCharacterRevisionBundles([
    {
      assetKind: 'character',
      asset: {
        ...asset,
        latestRevision: 2,
        revisionCount: 2,
        updatedAt: '2026-07-27T00:00:00.000Z'
      },
      revision: {
        ...first,
        revision: 2,
        checksum: 'checksum-character-project-v2',
        profileSummary: '更新后的全局人物档案。'
      }
    }
  ]);
}

function projectSelection(): NewGameCustomContentSelection {
  const draft = {
    kind: 'content_project' as const,
    assetId: 'project-night',
    revision: 1,
    focusEventGroupId: 'event-seal',
    focusEventGroupRevision: 1
  };
  return {
    ...draft,
    selectionKey: createNewGameCustomContentSelectionKey(draft)
  };
}

const dbNames: string[] = [];

afterEach(async () => {
  await Promise.all(
    dbNames.splice(0).map(
      (name) =>
        new Promise<void>((resolve) => {
          const request = indexedDB.deleteDatabase(name);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
          request.onblocked = () => resolve();
        })
    )
  );
});

describe('new game custom content selection', () => {
  it('lists only standalone global characters and exposes a project focus event', async () => {
    const dbName = `new-game-library-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);

    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });

    expect(library.characters.map((item) => item.title)).toEqual(['独立记者']);
    expect(library.events[0]).toMatchObject({
      title: '封条异常',
      projectTitle: '夜班证物疑云',
      deploymentMode: 'native'
    });
    expect(library.projects[0]).toMatchObject({
      title: '夜班证物疑云',
      focusTitle: '封条异常'
    });
  });

  it('binds a selected project as one current focus event and authorizes it as the only opening support', async () => {
    const dbName = `new-game-project-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);
    const state = createInitialRuntimeState({
      dramaticOpeningId: 'mentor_lead'
    });
    const selected = projectSelection();

    const prepared = await prepareNewGameCustomContent({
      repository,
      state,
      selections: [selected],
      openingSupportSelectionKey: selected.selectionKey,
      now: '2026-07-26T10:00:00.000Z'
    });

    expect(prepared.reviewItems).toEqual([]);
    expect(prepared.state.customContent?.projectBindings).toHaveLength(1);
    expect(prepared.state.customContent?.eventGroupBindings).toHaveLength(1);
    expect(prepared.state.customContent?.characterBindings).toHaveLength(1);
    expect(prepared.state.customContent?.eventEntryIntents[0]).toMatchObject({
      mode: 'asap',
      status: 'seeking_anchor',
      priorityOrder: 1
    });
    expect(prepared.state.customContent?.eventInstances[0].status).toBe(
      'seeking_anchor'
    );
    expect(
      prepared.state.dramaticContent?.openingSupportSourceRef
    ).toMatchObject({
      providerId: 'custom-event-group',
      sourceType: 'custom_event_group_instance'
    });
    expect(Object.keys(prepared.state.actors)).toEqual(['player']);

    const prompt = composeOpeningBlueprintPrompt({
      setup: { dramaticOpeningId: 'mentor_lead' },
      initialState: prepared.state
    });
    expect(prompt).toContain('"providerId":"custom-event-group"');
    expect(prompt).toContain('玩家明确选择的第一幕自定义支持内容');
    expect(prompt).toContain('事件所需人物：林法证');
    expect(prompt).toContain('Runtime Actor=custom-actor:character-project');
    expect(prompt).toContain('仍计入 maxNewActors=4 的总上限');

    const support = resolveOpeningCustomContentSupport({
      state: prepared.state
    });
    const initializationPrompt = composeOpeningInitializationPrompt(
      {
        openingSessionId: 'opening_custom_support',
        openingFacts: {
          placeId: 'place_station',
          sceneId: 'scene_night_shift',
          situationSummary: '夜班证物交接正在进行。',
          centralMatter: '核对异常封条。',
          playerDecisionBoundary: '玩家自行决定是否追查异常。'
        },
        initialActors: [],
        actionIntents: [
          {
            actionId: 'action_check_seal',
            intent: '先核对封条编号。',
            relatedActorIds: [],
            requiredFacts: ['封条编号存在异常']
          }
        ],
        dramaPlan: {
          planId: 'drama_plan_opening_mentor_lead',
          planningScope: 'opening',
          mode: 'surface',
          primarySource: {
            providerId: 'opening-registry',
            sourceType: 'dramatic_opening_definition',
            sourceId: 'mentor_lead'
          },
          supportSources: [support!.source.ref],
          sceneFunction: 'choice',
          intensity: 'medium',
          playerMayIgnore: true,
          maxNewActors: 4,
          reasonSummary: '把玩家选择的事件作为可拒绝的第一幕入口。'
        }
      } as unknown as OpeningBlueprint,
      'compact',
      {
        playerActorId: prepared.state.player.actorId,
        currentIdentity: prepared.state.player.currentIdentity,
        originBackground: prepared.state.player.originBackground,
        initialEconomy: prepared.state.player.economy,
        initialActorIds: Object.keys(prepared.state.actors),
        initialOrganizationIds: Object.keys(prepared.state.organizations),
        openingCustomSupport: support!.payload
      }
    );
    expect(initializationPrompt).toContain(
      '已通过本地校验的第一幕自定义支持执行载荷'
    );
    expect(initializationPrompt).toContain('事件所需人物：林法证');
    expect(initializationPrompt).toContain(
      'Runtime Actor=custom-actor:character-project'
    );
    expect(initializationPrompt).toContain('禁止改写：');
  });

  it('never injects a selected custom source into a natural opening', async () => {
    const dbName = `new-game-natural-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);
    const selected = projectSelection();

    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState(),
      selections: [selected],
      openingSupportSelectionKey: selected.selectionKey,
      now: '2026-07-26T10:00:00.000Z'
    });

    expect(
      prepared.state.dramaticContent?.openingSupportSourceRef
    ).toBeUndefined();
    expect(prepared.state.customContent?.eventEntryIntents[0].status).toBe(
      'seeking_anchor'
    );
  });

  it('coalesces a separately selected event character without requiring first-act support', async () => {
    const dbName = `new-game-shared-character-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName, {
      projectCharacterGlobal: true
    });
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selectedCharacter = library.characters.find(
      (option) => option.selection.assetId === 'character-project'
    )!.selection;
    const selectedEvent = library.events[0].selection;

    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState({
        dramaticOpeningId: 'classic_hong_kong'
      }),
      selections: [selectedCharacter, selectedEvent],
      now: '2026-07-30T09:00:00.000Z'
    });

    expect(prepared.reviewItems).toEqual([]);
    expect(prepared.state.customContent?.characterBindings).toHaveLength(1);
    expect(prepared.state.customContent?.eventGroupBindings).toHaveLength(1);
    expect(prepared.state.customContent?.characterEntryIntents).toMatchObject([
      {
        mode: 'asap_contact',
        status: 'seeking_anchor'
      }
    ]);
    expect(prepared.state.customContent?.eventEntryIntents).toMatchObject([
      {
        mode: 'asap',
        status: 'seeking_anchor'
      }
    ]);
    expect(prepared.state.customContent?.priorityItems).toHaveLength(2);
    expect(
      prepared.state.dramaticContent?.openingSupportSourceRef
    ).toBeUndefined();
    expect(Object.keys(prepared.state.actors)).toEqual(['player']);
  });

  it('reuses the event-frozen character revision for a newer global card and first-act reference', async () => {
    const dbName = `new-game-shared-character-revision-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName, {
      projectCharacterGlobal: true
    });
    await publishSecondProjectCharacterRevision(repository);
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selectedCharacter = library.characters.find(
      (option) => option.selection.assetId === 'character-project'
    )!.selection;
    const selectedEvent = library.events[0].selection;
    expect(selectedCharacter.revision).toBe(2);

    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState({
        dramaticOpeningId: 'classic_hong_kong'
      }),
      selections: [selectedCharacter, selectedEvent],
      openingSupportSelectionKey: selectedCharacter.selectionKey,
      now: '2026-07-30T09:10:00.000Z'
    });

    expect(prepared.state.customContent?.characterBindings).toMatchObject([
      {
        assetId: 'character-project',
        revision: 1
      }
    ]);
    expect(prepared.state.customContent?.characterEntryIntents).toHaveLength(1);
    expect(
      prepared.state.customContent?.recentDiagnostics
    ).toContainEqual(
      expect.objectContaining({
        code: 'character_binding_revision_reused',
        relatedAssetId: 'character-project'
      })
    );
    expect(
      prepared.state.dramaticContent?.openingSupportSourceRef
    ).toMatchObject({
      providerId: 'custom-character',
      sourceType: 'custom_character_binding',
      sourceId: expect.stringContaining(
        'binding:character:character-project:1:'
      )
    });
  });

  it('resumes an approved adaptation without silently consuming a priority slot', async () => {
    const dbName = `new-game-review-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName, { manualGlobal: true });
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selected = library.characters[0].selection;

    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState(),
      selections: [selected],
      now: '2026-07-26T10:00:00.000Z'
    });
    expect(prepared.reviewItems).toMatchObject([
      {
        kind: 'character',
        title: '独立记者',
        status: 'needs_review'
      }
    ]);
    expect(
      prepared.state.customContent?.characterEntryIntents[0].status
    ).toBe('paused');

    const approved = approvePreparedNewGameCustomContent({
      state: prepared.state,
      selections: [selected],
      now: '2026-07-26T10:01:00.000Z'
    });
    expect(approved.customContent?.characterEntryIntents[0]).toMatchObject({
      status: 'seeking_anchor',
      priorityOrder: undefined
    });
    expect(approved.customContent?.priorityItems).toEqual([]);
  });

  it('restores an explicitly selected priority after adaptation review', async () => {
    const dbName = `new-game-review-priority-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName, { manualGlobal: true });
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selected = {
      ...library.characters[0].selection,
      prioritized: true
    };
    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState(),
      selections: [selected],
      now: '2026-07-28T09:00:00.000Z'
    });

    const approved = approvePreparedNewGameCustomContent({
      state: prepared.state,
      selections: [selected],
      now: '2026-07-28T09:01:00.000Z'
    });

    expect(approved.customContent?.characterEntryIntents[0]).toMatchObject({
      mode: 'asap_contact',
      status: 'seeking_anchor',
      priorityOrder: 1
    });
    expect(approved.customContent?.priorityItems).toHaveLength(1);
  });

  it('binds more than three native selections while limiting opening priorities to three', async () => {
    const dbName = `new-game-many-native-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);
    const extras = Array.from({ length: 4 }, (_, index) =>
      character(`character-global-${index + 2}`, { global: true })
    );
    await repository.saveRevisionBundles(
      extras.map((record) => ({
        assetKind: 'character' as const,
        asset: record.asset,
        revision: record.revision
      }))
    );
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selections = library.characters.slice(0, 5).map((option, index) => ({
      ...option.selection,
      prioritized: index < 3
    }));

    const prepared = await prepareNewGameCustomContent({
      repository,
      state: createInitialRuntimeState(),
      selections,
      now: '2026-07-28T10:00:00.000Z'
    });

    expect(prepared.state.customContent?.characterBindings).toHaveLength(5);
    expect(prepared.state.customContent?.priorityItems).toHaveLength(3);
    expect(
      prepared.state.customContent?.characterEntryIntents.map((intent) => ({
        mode: intent.mode,
        status: intent.status,
        priorityOrder: intent.priorityOrder
      }))
    ).toEqual([
      { mode: 'asap_contact', status: 'seeking_anchor', priorityOrder: 1 },
      { mode: 'asap_contact', status: 'seeking_anchor', priorityOrder: 2 },
      { mode: 'asap_contact', status: 'seeking_anchor', priorityOrder: 3 },
      { mode: 'natural', status: 'queued', priorityOrder: undefined },
      { mode: 'natural', status: 'queued', priorityOrder: undefined }
    ]);
    expect(Object.keys(prepared.state.actors)).toEqual(['player']);
    const prompt = composeOpeningBlueprintPrompt({
      setup: { dramaticOpeningId: 'mentor_lead' },
      initialState: prepared.state
    });
    expect(prompt).not.toContain('custom-actor:character-global');
    expect(prompt).not.toContain('独立记者');
  });

  it('refuses non-priority AI adaptation so a large selection cannot block opening', async () => {
    const dbName = `new-game-non-priority-adaptation-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);
    const adapted = character('character-adapted', { global: true });
    adapted.revision.deployments = [
      {
        worldpackId: 'hk_1988',
        mode: 'ai_adapted',
        defaultEnabledForNewGame: true
      }
    ];
    await repository.saveRevisionBundles([
      {
        assetKind: 'character',
        asset: adapted.asset,
        revision: adapted.revision
      }
    ]);
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });
    const selection = library.characters.find(
      (option) => option.selection.assetId === 'character-adapted'
    )!.selection;

    await expect(
      prepareNewGameCustomContent({
        repository,
        state: createInitialRuntimeState(),
        selections: [{ ...selection, prioritized: false }]
      })
    ).rejects.toThrow('必须设为本局重点');
  });

  it('rejects selecting the same focus event through both project and event cards', async () => {
    const dbName = `new-game-duplicate-${crypto.randomUUID()}`;
    dbNames.push(dbName);
    const repository = await seedRepository(dbName);
    const library = await loadNewGameCustomContentLibrary({
      repository,
      worldpackId: 'hk_1988'
    });

    await expect(
      prepareNewGameCustomContent({
        repository,
        state: createInitialRuntimeState(),
        selections: [
          library.projects[0].selection,
          library.events[0].selection
        ]
      })
    ).rejects.toThrow('重复选择');
  });
});

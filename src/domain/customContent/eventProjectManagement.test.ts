// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createCustomContentRevisionRef } from './assetFoundation';
import { saveCustomCharacterRevision } from './characterManagement';
import {
  createReusableCustomEventCharacterCandidate,
  parseGeneratedCustomEventProjectDraft
} from './eventProjectCreation';
import {
  saveCustomEventProjectRevision,
  setCustomEventGroupAvailability
} from './eventProjectManagement';
import { IndexedDbCustomContentRepository } from './IndexedDbCustomContentRepository';

let databaseSequence = 0;
let repository: IndexedDbCustomContentRepository;

function draft() {
  return parseGeneratedCustomEventProjectDraft({
    project: {
      title: '证物封条疑云',
      summary: '一个短事件项目。',
      conversionMode: 'structural_adaptation'
    },
    characterCandidates: [
      {
        candidateKey: 'forensic',
        character: {
          displayName: '林若晴',
          aliases: [],
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
        }
      }
    ],
    eventGroups: [
      {
        eventGroupKey: 'seal-arc',
        title: '封条异常',
        summary: '封条编号与登记册不一致。',
        invariantCore: ['封条存在异常'],
        mutableSlots: ['原因'],
        forbiddenAdaptations: [],
        characterCandidateKeys: ['forensic'],
        roleSlots: [
          {
            roleSlotKey: 'witness',
            title: '证物见证人',
            summary: '说明封存流程。',
            bindingMode: 'fixed_character',
            fixedCharacterKey: 'forensic',
            requirements: []
          }
        ],
        stages: [
          {
            stageKey: 'discover',
            title: '发现',
            summary: '核对时发现异常。',
            establishedSourceFacts: [],
            continuationSourceFacts: [],
            hardSourceConstraints: [],
            foreshadowingOptions: [],
            eventNodes: [
              {
                nodeKey: 'check-register',
                title: '核对登记册',
                summary: '检查编号。',
                prerequisites: [],
                entryConditions: [],
                blockers: [],
                characterUsages: [
                  {
                    usageKey: 'usage-witness',
                    roleSlotKey: 'witness',
                    characterCandidateKey: 'forensic',
                    usageSummary: '说明封存流程。',
                    required: true
                  }
                ],
                knowledgeBoundary: {
                  knownBy: ['证物见证人'],
                  hiddenFrom: [],
                  readerOnly: false
                },
                possibleOutcomes: ['发现登记差异'],
                downstreamEffects: ['可以继续调查']
              }
            ],
            completionHints: ['完成核对'],
            nextStageHints: []
          }
        ],
        entryMode: 'asap',
        reusePolicy: 'save_single_use',
        inheritProjectDeployments: true
      }
    ]
  });
}

const hkDeployment = [
  {
    worldpackId: 'hk_1988',
    mode: 'native',
    defaultEnabledForNewGame: true
  }
] as const;

function idFactory() {
  const counts = new Map<string, number>();
  return (prefix: 'project' | 'character' | 'event-group') => {
    const count = (counts.get(prefix) ?? 0) + 1;
    counts.set(prefix, count);
    return `${prefix}-${count}`;
  };
}

beforeEach(() => {
  databaseSequence += 1;
  repository = new IndexedDbCustomContentRepository(
    `event-project-management-${databaseSequence}`
  );
});

describe('custom short-event project management', () => {
  it('publishes project, characters, events, and dependency edges atomically', async () => {
    const result = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: draft(),
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish'
      },
      dependencies: {
        createId: idFactory(),
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });

    expect(result.projectRevision.lifecycle).toEqual({
      generationStatus: 'ready',
      reviewStatus: 'approved',
      availabilityStatus: 'enabled'
    });
    expect(result.projectRevision.characterAssetIds).toEqual(['character-1']);
    expect(result.projectRevision.eventGroupIds).toEqual(['event-group-1']);
    expect(result.characterRevisions[0].entryMode).toBe('follow_project');
    expect(result.eventGroupRevisions[0]).toMatchObject({
      projectId: 'project-1',
      inheritProjectDeployments: true
    });
    expect(
      result.eventGroupRevisions[0].roleSlots[0].fixedCharacterRef
    ).toMatchObject({
      assetKind: 'character',
      assetId: 'character-1',
      revision: 1
    });

    const projectDependencies = await repository.listDependenciesForOwner(
      createCustomContentRevisionRef(result.projectRevision)
    );
    const eventDependencies = await repository.listDependenciesForOwner(
      createCustomContentRevisionRef(result.eventGroupRevisions[0])
    );
    expect(projectDependencies).toHaveLength(2);
    expect(eventDependencies).toHaveLength(1);
    expect(await repository.getProjectAsset('project-1')).toEqual(
      result.projectAsset
    );
  });

  it('requires project and override deployments before publishing', async () => {
    await expect(
      saveCustomEventProjectRevision({
        repository,
        input: {
          draft: draft(),
          projectDeployments: [],
          eventDeploymentOverrides: {},
          mode: 'publish'
        }
      })
    ).rejects.toThrow('发布项目前必须至少启用一个世界包');

    const overrideDraft = draft();
    overrideDraft.eventGroups[0].inheritProjectDeployments = false;
    await expect(
      saveCustomEventProjectRevision({
        repository,
        input: {
          draft: overrideDraft,
          projectDeployments: [...hkDeployment],
          eventDeploymentOverrides: {},
          mode: 'publish'
        }
      })
    ).rejects.toThrow('覆盖项目投放时必须至少启用一个世界包');
  });

  it('creates new immutable revisions when a saved draft is reviewed and published', async () => {
    const createId = idFactory();
    const initial = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: draft(),
        projectDeployments: [],
        eventDeploymentOverrides: {},
        mode: 'needs_review'
      },
      dependencies: {
        createId,
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });
    const editedDraft = draft();
    editedDraft.eventGroups[0].summary = '玩家审核后的事件摘要。';
    const published = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: editedDraft,
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish',
        existing: {
          projectAsset: initial.projectAsset,
          projectRevision: initial.projectRevision,
          characterAssets: {
            forensic: initial.characterAssets[0]
          },
          eventGroupAssets: {
            'seal-arc': initial.eventGroupAssets[0]
          }
        }
      },
      dependencies: {
        createId,
        now: () => '2026-07-26T01:00:00.000Z'
      }
    });

    expect(published.projectRevision.revision).toBe(2);
    expect(published.characterRevisions[0].revision).toBe(2);
    expect(published.eventGroupRevisions[0]).toMatchObject({
      revision: 2,
      summary: '玩家审核后的事件摘要。'
    });
    expect(
      await repository.getEventGroupRevision('event-group-1', 1)
    ).toMatchObject({
      summary: '封条编号与登记册不一致。'
    });
  });

  it('publishes node usage of the current save protagonist through the late-bound role slot', async () => {
    const current = draft();
    current.eventGroups[0].roleSlots.push({
      roleSlotKey: 'current-player',
      title: '当前存档主角',
      summary: '进入存档时绑定该局玩家角色。',
      bindingMode: 'current_player',
      requirements: []
    });
    current.eventGroups[0].stages[0].eventNodes[0].characterUsages.push({
      usageKey: 'usage-current-player',
      roleSlotKey: 'current-player',
      characterCandidateKey: 'forensic',
      usageSummary: '由玩家角色亲自核对证物。',
      required: true
    });

    const published = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: current,
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish'
      },
      dependencies: { createId: idFactory() }
    });

    const eventGroup = published.eventGroupRevisions[0];
    expect(eventGroup.roleSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          roleSlotId: 'current-player',
          bindingMode: 'current_player',
          fixedCharacterRef: undefined
        })
      ])
    );
    const usage = eventGroup.stages[0].eventNodes[0].characterUsages.find(
      (candidate) => candidate.usageId === 'usage-current-player'
    );
    expect(usage).toMatchObject({
      roleSlotId: 'current-player',
      usageSummary: '由玩家角色亲自核对证物。'
    });
    expect(usage?.characterRef).toBeUndefined();
  });

  it('reuses one immutable global character revision across multiple event projects', async () => {
    const baseDraft = draft();
    const sharedCharacter = await saveCustomCharacterRevision({
      repository,
      input: {
        draft: baseDraft.characterCandidates[0].character,
        deployments: [...hkDeployment],
        global: true,
        projectIds: [],
        mode: 'publish'
      },
      dependencies: {
        createId: () => 'character-shared',
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });
    const createId = idFactory();
    const createEventDraft = (suffix: string) => {
      const current = draft();
      const sharedCandidate = createReusableCustomEventCharacterCandidate(
        sharedCharacter.revision
      );
      current.project.title = `共享人物事件 ${suffix}`;
      current.eventGroups[0].eventGroupKey = `seal-arc-${suffix}`;
      current.characterCandidates = [sharedCandidate];
      current.eventGroups[0].characterCandidateKeys = [
        sharedCandidate.candidateKey
      ];
      current.eventGroups[0].roleSlots[0].fixedCharacterKey =
        sharedCandidate.candidateKey;
      current.eventGroups[0].stages[0].eventNodes[0].characterUsages[0]
        .characterCandidateKey = sharedCandidate.candidateKey;
      current.eventGroups[0].stages[0].eventNodes[0].knowledgeBoundary.knownBy =
        [sharedCandidate.candidateKey];
      return current;
    };

    const first = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: createEventDraft('一'),
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish'
      },
      dependencies: { createId }
    });
    const second = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: createEventDraft('二'),
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish'
      },
      dependencies: { createId }
    });

    expect(first.characterAssets).toEqual([]);
    expect(first.characterRevisions).toEqual([]);
    expect(second.characterAssets).toEqual([]);
    expect(second.characterRevisions).toEqual([]);
    expect(first.projectRevision.characterAssetIds).toEqual([
      'character-shared'
    ]);
    expect(second.projectRevision.characterAssetIds).toEqual([
      'character-shared'
    ]);
    expect(first.eventGroupRevisions[0].roleSlots[0].fixedCharacterRef).toEqual(
      createCustomContentRevisionRef(sharedCharacter.revision)
    );
    expect(second.eventGroupRevisions[0].roleSlots[0].fixedCharacterRef).toEqual(
      createCustomContentRevisionRef(sharedCharacter.revision)
    );
    expect(
      first.eventGroupRevisions[0].stages[0].eventNodes[0].knowledgeBoundary
        .knownBy
    ).toEqual(['witness']);
    expect(
      (await repository.getCharacterAsset('character-shared'))?.latestRevision
    ).toBe(1);
    expect(
      await repository.listCharacterRevisions('character-shared')
    ).toHaveLength(1);
  });

  it('toggles availability through a new event revision and preserves dependencies', async () => {
    const initial = await saveCustomEventProjectRevision({
      repository,
      input: {
        draft: draft(),
        projectDeployments: [...hkDeployment],
        eventDeploymentOverrides: {},
        mode: 'publish'
      },
      dependencies: {
        createId: idFactory(),
        now: () => '2026-07-26T00:00:00.000Z'
      }
    });
    const disabled = await setCustomEventGroupAvailability({
      repository,
      asset: initial.eventGroupAssets[0],
      availabilityStatus: 'disabled',
      now: () => '2026-07-26T02:00:00.000Z'
    });

    expect(disabled.revision).toMatchObject({
      revision: 2,
      lifecycle: {
        availabilityStatus: 'disabled'
      }
    });
    expect(
      await repository.listDependenciesForOwner(
        createCustomContentRevisionRef(disabled.revision)
      )
    ).toHaveLength(1);
  });
});

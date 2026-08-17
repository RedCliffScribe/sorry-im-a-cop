import { describe, expect, it, vi } from 'vitest';
import type { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import { loadCustomContentWorkshopLibrary } from './workshopLibrary';

describe('loadCustomContentWorkshopLibrary', () => {
  it('loads latest revisions and resolves inherited project deployments', async () => {
    const repository = {
      listProjectAssets: vi.fn().mockResolvedValue([
        {
          projectId: 'project_1',
          latestRevision: 2,
          revisionCount: 2,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T03:00:00.000Z'
        }
      ]),
      listCharacterAssets: vi.fn().mockResolvedValue([
        {
          characterAssetId: 'character_1',
          latestRevision: 3,
          revisionCount: 3,
          global: true,
          projectIds: ['project_1'],
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T02:00:00.000Z'
        }
      ]),
      listEventGroupAssets: vi.fn().mockResolvedValue([
        {
          eventGroupId: 'event_1',
          projectId: 'project_1',
          latestRevision: 1,
          revisionCount: 1,
          createdAt: '2026-07-26T00:00:00.000Z',
          updatedAt: '2026-07-26T01:00:00.000Z'
        }
      ]),
      getProjectRevision: vi.fn().mockResolvedValue({
        projectId: 'project_1',
        revision: 2,
        checksum: 'project_checksum',
        title: '项目',
        summary: '项目摘要',
        conversionMode: 'structural_adaptation',
        characterAssetIds: ['character_1'],
        eventGroupIds: ['event_1'],
        deployments: [
          {
            worldpackId: 'hk_1988',
            mode: 'native',
            defaultEnabledForNewGame: true
          }
        ],
        sourceDocumentIds: [],
        lifecycle: {
          generationStatus: 'ready',
          reviewStatus: 'approved',
          availabilityStatus: 'enabled'
        }
      }),
      getCharacterRevision: vi.fn().mockResolvedValue({
        characterAssetId: 'character_1',
        revision: 3,
        checksum: 'character_checksum',
        displayName: '人物甲',
        aliases: [],
        gender: '女',
        profileSummary: '人物摘要',
        backgroundSummary: '',
        corePersonality: [],
        values: [],
        coreMotivations: [],
        majorRelationships: [],
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
      }),
      getEventGroupRevision: vi.fn().mockResolvedValue({
        eventGroupId: 'event_1',
        projectId: 'project_1',
        revision: 1,
        checksum: 'event_checksum',
        title: '事件甲',
        summary: '事件摘要',
        invariantCore: [],
        mutableSlots: [],
        forbiddenAdaptations: [],
        characterRefs: [],
        roleSlots: [],
        stages: [],
        entryMode: 'natural',
        reusePolicy: 'save_single_use',
        inheritProjectDeployments: true,
        sourceSpans: [],
        lifecycle: {
          generationStatus: 'ready',
          reviewStatus: 'approved',
          availabilityStatus: 'enabled'
        }
      }),
      listDependenciesForTarget: vi.fn().mockResolvedValue([])
    } as unknown as IndexedDbCustomContentRepository;

    const library = await loadCustomContentWorkshopLibrary(repository);

    expect(library.projectCount).toBe(1);
    expect(library.projects).toEqual([
      {
        id: 'project_1',
        title: '项目',
        revision: 2
      }
    ]);
    expect(library.characters[0]).toMatchObject({
      id: 'character_1',
      title: '人物甲',
      revision: 3,
      global: true
    });
    expect(library.events[0]).toMatchObject({
      id: 'event_1',
      title: '事件甲',
      revision: 1,
      deployments: [
        {
          worldpackId: 'hk_1988',
          mode: 'native',
          defaultEnabledForNewGame: true
        }
      ]
    });
  });

  it('lists incomplete character working drafts without creating a formal revision', async () => {
    const repository = {
      listProjectAssets: vi.fn().mockResolvedValue([]),
      listCharacterAssets: vi.fn().mockResolvedValue([]),
      listCharacterWorkingDrafts: vi.fn().mockResolvedValue([
        {
          workingDraftId: 'working-draft-1',
          description: '一名尚未命名的线人。',
          draft: {
            displayName: '',
            aliases: [],
            gender: '',
            profileSummary: '一名尚未命名的线人。',
            backgroundSummary: '一名尚未命名的线人。',
            corePersonality: [],
            values: [],
            coreMotivations: [],
            majorRelationships: [],
            entryMode: 'natural',
            adaptationPolicy: {
              temporalPolicy: 'preserve_life_stage',
              lockedFields: [],
              adaptableFields: []
            }
          },
          deployments: [],
          global: true,
          projectIds: [],
          generationIssues: [],
          createdAt: '2026-07-29T00:00:00.000Z',
          updatedAt: '2026-07-29T00:00:00.000Z'
        }
      ]),
      listEventGroupAssets: vi.fn().mockResolvedValue([])
    } as unknown as IndexedDbCustomContentRepository;

    const library = await loadCustomContentWorkshopLibrary(repository);

    expect(library.characters).toEqual([
      expect.objectContaining({
        id: 'working-draft-1',
        title: '未命名人物草稿',
        revision: 0,
        lifecycle: expect.objectContaining({ reviewStatus: 'draft' }),
        characterWorkingDraft: expect.objectContaining({
          workingDraftId: 'working-draft-1'
        })
      })
    ]);
  });
});

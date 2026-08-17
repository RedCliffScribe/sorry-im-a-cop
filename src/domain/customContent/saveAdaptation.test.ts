import { describe, expect, it } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createInitialRuntimeState } from '../runtime/initialState';
import { HK_1988_ADAPTATION_DESCRIPTOR } from '../worldpack/adaptationRegistry';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomEventGroupRevision
} from './assetTypes';
import {
  createNativeCustomSaveAdaptationBundle,
  generateCustomSaveAdaptationBundle,
  parseGeneratedCustomSaveAdaptation
} from './saveAdaptation';
import { createDefaultCustomCharacterAdaptationPolicy } from './worldAdaptation';

const approvedLifecycle = {
  generationStatus: 'ready' as const,
  reviewStatus: 'approved' as const,
  availabilityStatus: 'enabled' as const
};

function character(
  overrides: Partial<CustomCharacterRevision> = {}
): CustomCharacterRevision {
  return {
    characterAssetId: 'character-lin',
    revision: 1,
    checksum: 'checksum-character-lin',
    displayName: '林若晴',
    aliases: [],
    gender: 'female',
    profileSummary: '负责核对证物流程的法证人员。',
    backgroundSummary: '熟悉夜班证物封存程序。',
    corePersonality: ['冷静'],
    values: ['真相'],
    coreMotivations: ['保护证据'],
    majorRelationships: [],
    entryMode: 'follow_project',
    adaptationPolicy: createDefaultCustomCharacterAdaptationPolicy(),
    deployments: [
      {
        worldpackId: 'hk_1988',
        mode: 'native',
        defaultEnabledForNewGame: true
      }
    ],
    sourceSpans: [],
    lifecycle: approvedLifecycle,
    ...overrides
  };
}

const project: CustomContentProjectRevision = {
  projectId: 'project-evidence',
  revision: 1,
  checksum: 'checksum-project-evidence',
  title: '夜班证物疑云',
  summary: '夜班法证人员发现封条编号与登记册不一致。',
  conversionMode: 'structural_adaptation',
  characterAssetIds: ['character-lin'],
  eventGroupIds: ['event-seal'],
  deployments: [
    {
      worldpackId: 'hk_1988',
      mode: 'native',
      defaultEnabledForNewGame: true
    }
  ],
  sourceDocumentIds: [],
  lifecycle: approvedLifecycle
};

const eventGroup: CustomEventGroupRevision = {
  eventGroupId: 'event-seal',
  projectId: project.projectId,
  revision: 1,
  checksum: 'checksum-event-seal',
  title: '封条异常',
  summary: '证物封条编号异常，需要核对封存流程。',
  invariantCore: ['封条编号与登记册不一致'],
  mutableSlots: [],
  forbiddenAdaptations: [],
  characterRefs: [],
  roleSlots: [],
  stages: [],
  entryMode: 'asap',
  reusePolicy: 'save_single_use',
  inheritProjectDeployments: true,
  sourceSpans: [],
  lifecycle: approvedLifecycle
};

describe('custom save adaptation', () => {
  it('creates stable native snapshots without creating runtime facts', () => {
    const state = createInitialRuntimeState();
    const actorsBefore = state.actors;
    const dynamicEventsBefore = state.dynamicEvents;

    const bundle = createNativeCustomSaveAdaptationBundle({
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: {
        project,
        characters: [
          character({
            sourceProfile: {
              temporalAnchor: {
                lifeStage: '初入职场',
                exactAge: 24,
                birthDate: '1964-03-08'
              },
              publicIdentity: '法证科技术员',
              occupation: '法证人员',
              socialPosition: '警务协作人员',
              appearance: '常穿整洁套装',
              speechStyle: '措辞克制',
              longTermGoal: '维护证据链',
              usualPlaceHints: ['法证科'],
              contactRoutes: ['证物复核']
            }
          })
        ],
        eventGroup
      },
      createdAt: '2026-07-26T03:00:00.000Z'
    });

    expect(bundle.project).toMatchObject({
      projectId: project.projectId,
      worldpackId: 'hk_1988',
      worldpackDescriptorVersion: 1,
      status: 'ready'
    });
    expect(bundle.characters[0]).toMatchObject({
      characterAssetId: 'character-lin',
      runtimeActorId: 'custom-actor:character-lin',
      adaptedBirthDate: '1964-03-08',
      adaptedAgeAtAnchor: 24,
      adaptedPublicIdentity: '法证科技术员',
      adaptedOccupation: '法证人员',
      adaptedSocialPosition: '警务协作人员',
      adaptedPlaceRefs: ['法证科'],
      adaptedContactRoutes: ['证物复核'],
      status: 'ready'
    });
    expect(bundle.eventGroup).toMatchObject({
      eventGroupId: 'event-seal',
      status: 'ready'
    });
    expect(state.actors).toBe(actorsBefore);
    expect(state.dynamicEvents).toBe(dynamicEventsBefore);
  });

  it('strictly rejects extra provider fields', () => {
    expect(() =>
      parseGeneratedCustomSaveAdaptation({
        characters: [],
        unexpected: true
      })
    ).toThrow();
  });

  it('reuses a frozen project baseline when lazily adapting one character', async () => {
    const client: NarratorClient = {
      async complete() {
        return {
          characters: [
            {
              characterAssetId: 'character-lin',
              adaptedPublicIdentity: '法证人员林若晴',
              adaptedOccupation: '法证人员',
              adaptedSocialPosition: '专业技术人员',
              adaptedOrganizationRefs: [],
              adaptedPlaceRefs: [],
              adaptedBackgroundSummary: '负责夜班证物核对。',
              adaptedContactRoutes: ['经证物室接触'],
              status: 'ready'
            }
          ]
        };
      }
    };
    const existingProjectAdaptationId =
      'adaptation:project:project-evidence:1:hk_1988:v1';
    const bundle = await generateCustomSaveAdaptationBundle({
      client,
      state: createInitialRuntimeState(),
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: {
        projectContext: project,
        projectAdaptationId: existingProjectAdaptationId,
        characters: [character()]
      }
    });

    expect(bundle.project).toBeUndefined();
    expect(bundle.characters[0]).toMatchObject({
      projectAdaptationId: existingProjectAdaptationId,
      runtimeActorId: 'custom-actor:character-lin',
      status: 'needs_review'
    });
  });

  it('downgrades AI output to needs_review and reports age mismatch', async () => {
    let adaptationProtocol = '';
    const client: NarratorClient = {
      async complete(input) {
        adaptationProtocol =
          typeof input === 'string'
            ? input
            : (input.messages.find(
                (message) => message.sourceId === 'custom-save-adaptation-v1'
              )?.content ?? '');
        return {
          project: {
            chronologyMapping: ['锚定 1988 年'],
            characterAgeRelations: [],
            placeMappings: {},
            organizationMappings: {},
            technologyMappings: {},
            culturalAndLegalAdaptation: ['使用港英时期制度'],
            hardWorldConstraints: ['不得出现互联网'],
            status: 'ready'
          },
          characters: [
            {
              characterAssetId: 'character-lin',
              adaptedBirthDate: '1960-01-01',
              adaptedAgeAtAnchor: 20,
              adaptedPublicIdentity: '法证人员林若晴',
              adaptedOccupation: '政府化验所法证人员',
              adaptedSocialPosition: '专业技术人员',
              adaptedOrganizationRefs: [],
              adaptedPlaceRefs: [],
              adaptedBackgroundSummary: '负责夜班证物核对。',
              adaptedContactRoutes: ['经证物室接触'],
              status: 'ready'
            }
          ],
          eventGroup: {
            adaptedSummary: '核对证物封条异常。',
            adaptedInvariantCore: ['编号不一致'],
            adaptedMutableElements: [],
            adaptedRoleBindings: [],
            adaptedEntryRoutes: ['证物室核对'],
            technologySubstitutions: [],
            institutionSubstitutions: [],
            placeSubstitutions: [],
            unresolvedConflicts: [],
            status: 'ready'
          }
        };
      }
    };
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 1, day: 2, hour: 8, minute: 0 }
    });

    const bundle = await generateCustomSaveAdaptationBundle({
      client,
      state,
      descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
      source: {
        project,
        characters: [character()],
        eventGroup
      },
      createdAt: '2026-07-26T03:00:00.000Z'
    });

    expect(bundle.project?.status).toBe('needs_review');
    expect(bundle.eventGroup?.status).toBe('needs_review');
    expect(bundle.characters[0]).toMatchObject({
      adaptedBirthDate: '1960-01-01',
      adaptedAgeAtAnchor: 20,
      status: 'needs_review'
    });
    expect(bundle.diagnostics).toEqual([
      expect.objectContaining({
        code: 'adapted_age_birth_date_mismatch',
        severity: 'warning'
      })
    ]);
    expect(adaptationProtocol).toContain(
      '"chronologyMapping": ["字符串"]'
    );
    expect(adaptationProtocol).toContain(
      '"placeMappings": {"来源地点ID或名称": "当前世界地点ID或名称"}'
    );
    expect(adaptationProtocol).toContain(
      '所有列表字段必须是 JSON array'
    );
    expect(adaptationProtocol).toContain(
      '所有 *Mappings 字段必须是键和值均为字符串的 JSON object'
    );
  });

  it('rejects provider character sets that do not match bound revisions', async () => {
    const client: NarratorClient = {
      async complete() {
        return {
          characters: [
            {
              characterAssetId: 'character-other',
              adaptedPublicIdentity: '其他人物',
              adaptedOccupation: '未知',
              adaptedSocialPosition: '未知',
              adaptedOrganizationRefs: [],
              adaptedPlaceRefs: [],
              adaptedBackgroundSummary: '未知',
              adaptedContactRoutes: [],
              status: 'ready'
            }
          ]
        };
      }
    };

    await expect(
      generateCustomSaveAdaptationBundle({
        client,
        state: createInitialRuntimeState(),
        descriptor: HK_1988_ADAPTATION_DESCRIPTOR,
        source: {
          characters: [character()]
        }
      })
    ).rejects.toThrow('人物集合');
  });
});

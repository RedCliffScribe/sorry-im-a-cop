import { describe, expect, it } from 'vitest';
import type { CustomEventProjectDraft } from './eventProjectCreation';
import {
  parseCustomSourceProjectDraftResult,
  parseGeneratedCustomSourceProjectBuildPayload
} from './sourceProjectBuildSchemas';

const timestamp = '2026-07-26T16:00:00.000Z';

function draft(): CustomEventProjectDraft {
  return {
    project: {
      title: '仓库暗线',
      summary: '从雨夜货车推进到仓库收据矛盾。',
      conversionMode: 'structural_adaptation'
    },
    characterCandidates: [
      {
        candidateKey: 'liang-jingyi',
        character: {
          displayName: '梁静仪',
          aliases: ['阿仪'],
          gender: 'female',
          profileSummary: '负责核对证物与收据的调查员。',
          backgroundSummary: '熟悉仓库流程。',
          corePersonality: ['谨慎'],
          values: ['证据'],
          coreMotivations: ['查清矛盾'],
          majorRelationships: [],
          entryMode: 'follow_project',
          adaptationPolicy: {
            temporalPolicy: 'preserve_life_stage',
            lockedFields: ['corePersonality'],
            adaptableFields: ['backgroundSummary']
          }
        }
      }
    ],
    eventGroups: [
      {
        eventGroupKey: 'warehouse-truck',
        title: '雨夜货车',
        summary: '调查匿名货车与仓库收据的关联。',
        invariantCore: ['货车线索与收据矛盾来自同一调查链。'],
        mutableSlots: ['调查地点'],
        forbiddenAdaptations: ['不得提前确认司机身份。'],
        characterCandidateKeys: ['liang-jingyi'],
        roleSlots: [],
        stages: [
          {
            stageKey: 'trace-receipt',
            title: '核对收据',
            summary: '对照夜班记录。',
            establishedSourceFacts: [
              { factKey: 'receipt-exists', summary: '原作中存在仓库收据。' }
            ],
            continuationSourceFacts: [],
            hardSourceConstraints: [],
            foreshadowingOptions: [],
            eventNodes: [
              {
                nodeKey: 'compare-records',
                title: '比对记录',
                summary: '发现记录之间不一致。',
                prerequisites: [],
                entryConditions: [],
                blockers: [],
                characterUsages: [
                  {
                    usageKey: 'investigator',
                    characterCandidateKey: 'liang-jingyi',
                    usageSummary: '负责比对。',
                    required: true
                  }
                ],
                knowledgeBoundary: {
                  knownBy: ['调查员'],
                  hiddenFrom: ['夜班主管'],
                  readerOnly: false
                },
                possibleOutcomes: ['确认矛盾存在'],
                downstreamEffects: ['继续追查司机']
              }
            ],
            completionHints: ['记录完成比对'],
            nextStageHints: []
          }
        ],
        entryMode: 'asap',
        reusePolicy: 'save_single_use',
        inheritProjectDeployments: true
      }
    ]
  };
}

function generatedPayload() {
  const normalized = draft();
  return {
    draft: {
      ...normalized,
      characterCandidates: normalized.characterCandidates.map((candidate) => ({
        candidateKey: candidate.candidateKey,
        character: {
          displayName: candidate.character.displayName,
          aliases: candidate.character.aliases,
          gender: candidate.character.gender,
          profileSummary: candidate.character.profileSummary,
          backgroundSummary: candidate.character.backgroundSummary,
          corePersonality: candidate.character.corePersonality,
          values: candidate.character.values,
          coreMotivations: candidate.character.coreMotivations,
          majorRelationships: [],
          entryMode: 'natural',
          temporalPolicy: candidate.character.adaptationPolicy.temporalPolicy,
          lockedFields: candidate.character.adaptationPolicy.lockedFields,
          adaptableFields: candidate.character.adaptationPolicy.adaptableFields
        }
      }))
    },
    eventGroupSources: [
      { eventGroupKey: 'warehouse-truck', storyArcIds: ['arc-1'] }
    ],
    characterCandidateSources: [
      {
        candidateKey: 'liang-jingyi',
        sourceObservationIds: ['observation-1'],
        characterMergeSuggestionIds: ['merge-1']
      }
    ],
    contentGaps: ['司机身份仍未知。'],
    consistencyIssues: []
  };
}

const boundary = {
  conversionMode: 'structural_adaptation' as const,
  sourceAggregationResultRefs: ['arc-result-1'],
  storyArcIds: ['arc-1'],
  sourceObservationIds: ['observation-1'],
  characterMergeSuggestionIds: ['merge-1']
};

describe('source project build schemas', () => {
  it('accepts a traceable multi-event project payload and persisted result', () => {
    const payload = parseGeneratedCustomSourceProjectBuildPayload(
      generatedPayload(),
      boundary
    );
    expect(payload.draft.eventGroups[0].entryMode).toBe('asap');
    expect(payload.eventGroupSources[0].storyArcIds).toEqual(['arc-1']);

    const result = parseCustomSourceProjectDraftResult({
      projectDraftResultId: 'project-draft-result-1',
      taskId: 'build-project-task-1',
      unitId: 'build-project-unit-1',
      sourceDocumentId: 'source-1',
      sourceStructureId: 'structure-1',
      sourceAggregationResultRefs: ['arc-result-1'],
      storyArcIds: ['arc-1'],
      sourceObservationIds: ['observation-1'],
      characterMergeSuggestionIds: ['merge-1'],
      conversionMode: 'structural_adaptation',
      draft: draft(),
      eventGroupSources: generatedPayload().eventGroupSources,
      characterCandidateSources: generatedPayload().characterCandidateSources,
      contentGaps: generatedPayload().contentGaps,
      consistencyIssues: [],
      reviewStatus: 'needs_review',
      apiProfileId: 'profile-1',
      model: 'model-1',
      inputTokens: 500,
      outputTokens: 800,
      usageSource: 'provider',
      createdAt: timestamp,
      updatedAt: timestamp
    });
    expect(result).toMatchObject({
      projectDraftResultId: 'project-draft-result-1',
      reviewStatus: 'needs_review',
      draft: { project: { title: '仓库暗线' } }
    });
  });

  it('rejects conversion changes, untraceable candidates, and reused arcs', () => {
    const wrongMode = generatedPayload();
    wrongMode.draft.project.conversionMode = 'character_retention';
    expect(() =>
      parseGeneratedCustomSourceProjectBuildPayload(wrongMode, boundary)
    ).toThrow('不得改变用户授权的转换模式');

    const untraceable = generatedPayload();
    untraceable.characterCandidateSources[0] = {
      candidateKey: 'liang-jingyi',
      sourceObservationIds: ['outside-observation'],
      characterMergeSuggestionIds: []
    };
    expect(() =>
      parseGeneratedCustomSourceProjectBuildPayload(untraceable, boundary)
    ).toThrow('授权输入之外');

    const reused = generatedPayload();
    reused.eventGroupSources.push({
      eventGroupKey: 'warehouse-truck',
      storyArcIds: ['arc-1']
    });
    expect(() =>
      parseGeneratedCustomSourceProjectBuildPayload(reused, boundary)
    ).toThrow('必须唯一');
  });
});

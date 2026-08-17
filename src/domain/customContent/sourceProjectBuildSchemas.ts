import { z } from 'zod';
import type {
  CustomEventProjectDraft,
  CustomEventProjectConsistencyIssue
} from './eventProjectCreation';
import {
  parseCustomEventProjectDraft,
  parseGeneratedCustomEventProjectDraft
} from './eventProjectCreation';
import type { CustomContentConversionMode } from './assetTypes';

const id = z.string().trim().min(1);
const boundedText = z.string().trim().min(1).max(8_000);

const eventGroupSourceSchema = z.strictObject({
  eventGroupKey: id,
  storyArcIds: z.array(id).min(1).max(64)
});

const characterCandidateSourceSchema = z.strictObject({
  candidateKey: id,
  sourceObservationIds: z.array(id).max(512),
  characterMergeSuggestionIds: z.array(id).max(128)
});

const consistencyIssueSchema = z.strictObject({
  code: id,
  severity: z.enum(['info', 'warning', 'blocking']),
  path: z.string().trim().min(1).optional(),
  summary: boundedText,
  suggestion: z.string().trim().min(1).optional()
});

const generatedProjectBuildPayloadSchema = z.strictObject({
  draft: z.unknown(),
  eventGroupSources: z.array(eventGroupSourceSchema).min(1).max(64),
  characterCandidateSources: z
    .array(characterCandidateSourceSchema)
    .max(256),
  contentGaps: z.array(boundedText).max(256).default([]),
  consistencyIssues: z.array(consistencyIssueSchema).max(256).default([])
});

const sourceProjectDraftResultEnvelopeSchema = z.strictObject({
  projectDraftResultId: id,
  taskId: id,
  unitId: id,
  sourceDocumentId: id,
  sourceStructureId: id,
  sourceAggregationResultRefs: z.array(id).min(1).max(128),
  storyArcIds: z.array(id).min(1).max(512),
  sourceObservationIds: z.array(id).max(2_048),
  characterMergeSuggestionIds: z.array(id).max(512),
  conversionMode: z.enum([
    'structural_adaptation',
    'character_retention',
    'source_direction_priority'
  ]),
  draft: z.unknown(),
  eventGroupSources: z.array(eventGroupSourceSchema).min(1).max(64),
  characterCandidateSources: z
    .array(characterCandidateSourceSchema)
    .max(256),
  contentGaps: z.array(boundedText).max(256),
  consistencyIssues: z.array(consistencyIssueSchema).max(256),
  reviewStatus: z.enum(['needs_review', 'approved', 'rejected']),
  apiProfileId: id,
  model: id,
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  usageSource: z.enum(['provider', 'estimated']),
  estimatedCost: z.number().nonnegative().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export interface CustomSourceEventGroupSource {
  eventGroupKey: string;
  storyArcIds: string[];
}

export interface CustomSourceCharacterCandidateSource {
  candidateKey: string;
  sourceObservationIds: string[];
  characterMergeSuggestionIds: string[];
}

export interface CustomSourceProjectBuildPayload {
  draft: CustomEventProjectDraft;
  eventGroupSources: CustomSourceEventGroupSource[];
  characterCandidateSources: CustomSourceCharacterCandidateSource[];
  contentGaps: string[];
  consistencyIssues: CustomEventProjectConsistencyIssue[];
}

export interface CustomSourceProjectDraftResult
  extends CustomSourceProjectBuildPayload {
  projectDraftResultId: string;
  taskId: string;
  unitId: string;
  sourceDocumentId: string;
  sourceStructureId: string;
  sourceAggregationResultRefs: string[];
  storyArcIds: string[];
  sourceObservationIds: string[];
  characterMergeSuggestionIds: string[];
  conversionMode: CustomContentConversionMode;
  reviewStatus: 'needs_review' | 'approved' | 'rejected';
  apiProfileId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'estimated';
  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomSourceProjectBuildBoundary {
  conversionMode: CustomContentConversionMode;
  sourceAggregationResultRefs: readonly string[];
  storyArcIds: readonly string[];
  sourceObservationIds: readonly string[];
  characterMergeSuggestionIds: readonly string[];
}

function assertUnique(label: string, values: readonly string[]): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label}必须唯一。`);
  }
}

function assertExactKeys(
  label: string,
  expected: readonly string[],
  actual: readonly string[]
): void {
  assertUnique(label, actual);
  const expectedSet = new Set(expected);
  if (
    expectedSet.size !== actual.length ||
    actual.some((value) => !expectedSet.has(value))
  ) {
    throw new Error(`${label}必须与生成草稿中的稳定键一一对应。`);
  }
}

function assertSubset(
  label: string,
  values: readonly string[],
  allowed: ReadonlySet<string>
): void {
  assertUnique(label, values);
  if (values.some((value) => !allowed.has(value))) {
    throw new Error(`${label}包含本次授权输入之外的引用。`);
  }
}

function validateProjectBuildPayload(
  parsed: z.infer<typeof generatedProjectBuildPayloadSchema>,
  draft: CustomEventProjectDraft,
  boundary: CustomSourceProjectBuildBoundary
): CustomSourceProjectBuildPayload {
  if (draft.project.conversionMode !== boundary.conversionMode) {
    throw new Error('长篇项目草稿不得改变用户授权的转换模式。');
  }

  assertUnique('授权的聚合结果引用', boundary.sourceAggregationResultRefs);
  assertUnique('授权的故事弧引用', boundary.storyArcIds);
  assertUnique('授权的观察引用', boundary.sourceObservationIds);
  assertUnique('授权的人物合并建议引用', boundary.characterMergeSuggestionIds);
  assertExactKeys(
    '事件组来源映射',
    draft.eventGroups.map((group) => group.eventGroupKey),
    parsed.eventGroupSources.map((source) => source.eventGroupKey)
  );
  assertExactKeys(
    '人物候选来源映射',
    draft.characterCandidates.map((candidate) => candidate.candidateKey),
    parsed.characterCandidateSources.map((source) => source.candidateKey)
  );

  const allowedArcIds = new Set(boundary.storyArcIds);
  const usedArcIds = parsed.eventGroupSources.flatMap(
    (source) => source.storyArcIds
  );
  assertSubset('事件组故事弧来源', usedArcIds, allowedArcIds);
  if (
    usedArcIds.length !== allowedArcIds.size ||
    allowedArcIds.size !== boundary.storyArcIds.length
  ) {
    throw new Error('每个授权故事弧必须且只能归属于一个事件组。');
  }

  const allowedObservationIds = new Set(boundary.sourceObservationIds);
  const allowedSuggestionIds = new Set(
    boundary.characterMergeSuggestionIds
  );
  for (const source of parsed.characterCandidateSources) {
    assertSubset(
      `人物候选 ${source.candidateKey} 的观察来源`,
      source.sourceObservationIds,
      allowedObservationIds
    );
    assertSubset(
      `人物候选 ${source.candidateKey} 的合并建议来源`,
      source.characterMergeSuggestionIds,
      allowedSuggestionIds
    );
    if (
      source.sourceObservationIds.length === 0 &&
      source.characterMergeSuggestionIds.length === 0
    ) {
      throw new Error(`人物候选 ${source.candidateKey} 缺少可追溯来源。`);
    }
  }

  return {
    draft,
    eventGroupSources: parsed.eventGroupSources,
    characterCandidateSources: parsed.characterCandidateSources,
    contentGaps: parsed.contentGaps,
    consistencyIssues: parsed.consistencyIssues
  };
}

export function parseGeneratedCustomSourceProjectBuildPayload(
  value: unknown,
  boundary: CustomSourceProjectBuildBoundary
): CustomSourceProjectBuildPayload {
  const parsed = generatedProjectBuildPayloadSchema.parse(value);
  return validateProjectBuildPayload(
    parsed,
    parseGeneratedCustomEventProjectDraft(parsed.draft),
    boundary
  );
}

export function parseCustomSourceProjectDraftResult(
  value: unknown
): CustomSourceProjectDraftResult {
  const envelope = sourceProjectDraftResultEnvelopeSchema.parse(value);
  const persistedPayload = {
    draft: envelope.draft,
    eventGroupSources: envelope.eventGroupSources,
    characterCandidateSources: envelope.characterCandidateSources,
    contentGaps: envelope.contentGaps,
    consistencyIssues: envelope.consistencyIssues
  };
  const payload = validateProjectBuildPayload(
    persistedPayload,
    parseCustomEventProjectDraft(persistedPayload.draft),
    {
      conversionMode: envelope.conversionMode,
      sourceAggregationResultRefs: envelope.sourceAggregationResultRefs,
      storyArcIds: envelope.storyArcIds,
      sourceObservationIds: envelope.sourceObservationIds,
      characterMergeSuggestionIds: envelope.characterMergeSuggestionIds
    }
  );
  return {
    projectDraftResultId: envelope.projectDraftResultId,
    taskId: envelope.taskId,
    unitId: envelope.unitId,
    sourceDocumentId: envelope.sourceDocumentId,
    sourceStructureId: envelope.sourceStructureId,
    sourceAggregationResultRefs: envelope.sourceAggregationResultRefs,
    storyArcIds: envelope.storyArcIds,
    sourceObservationIds: envelope.sourceObservationIds,
    characterMergeSuggestionIds: envelope.characterMergeSuggestionIds,
    conversionMode: envelope.conversionMode,
    ...payload,
    reviewStatus: envelope.reviewStatus,
    apiProfileId: envelope.apiProfileId,
    model: envelope.model,
    inputTokens: envelope.inputTokens,
    outputTokens: envelope.outputTokens,
    usageSource: envelope.usageSource,
    estimatedCost: envelope.estimatedCost,
    createdAt: envelope.createdAt,
    updatedAt: envelope.updatedAt
  };
}

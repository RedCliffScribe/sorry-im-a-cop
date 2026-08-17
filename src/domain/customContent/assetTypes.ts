import type {
  CustomCharacterAdaptationPolicy,
  CustomContentWorldDeployment
} from './worldAdaptation';

export type CustomContentAssetKind =
  | 'character'
  | 'event_group'
  | 'content_project';

export interface CustomContentRevisionRef {
  assetKind: CustomContentAssetKind;
  assetId: string;
  revision: number;
  checksum: string;
}

export interface CustomAssetLifecycle {
  generationStatus: 'idle' | 'processing' | 'ready' | 'failed';
  reviewStatus: 'draft' | 'needs_review' | 'approved';
  availabilityStatus: 'enabled' | 'disabled' | 'archived';
}

export type CustomContentConversionMode =
  | 'structural_adaptation'
  | 'character_retention'
  | 'source_direction_priority';

export interface CustomContentProjectAsset {
  projectId: string;
  latestRevision: number;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomCharacterAsset {
  characterAssetId: string;
  latestRevision: number;
  revisionCount: number;
  global: boolean;
  projectIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CustomEventGroupAsset {
  eventGroupId: string;
  projectId: string;
  latestRevision: number;
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomSourceSpan {
  sourceDocumentId: string;
  startOffset: number;
  endOffset: number;
  chapterId?: string;
  sequence: number;
  checksum: string;
}

export interface CustomContentProjectRevision {
  projectId: string;
  revision: number;
  checksum: string;
  title: string;
  summary: string;
  conversionMode: CustomContentConversionMode;
  characterAssetIds: string[];
  eventGroupIds: string[];
  deployments: CustomContentWorldDeployment[];
  sourceDocumentIds: string[];
  lifecycle: CustomAssetLifecycle;
}

export interface CustomCharacterRelationship {
  relationshipId: string;
  targetCharacterAssetId?: string;
  label: string;
  summary: string;
}

export type CustomCharacterEntryMode =
  | 'manual'
  | 'natural'
  | 'priority'
  | 'asap_contact'
  | 'follow_project';

export interface CustomCharacterSourceProfile {
  temporalAnchor?: {
    lifeStage?: string;
    exactAge?: number;
    birthDate?: string;
  };
  publicIdentity?: string;
  occupation?: string;
  socialPosition?: string;
  appearance?: string;
  speechStyle?: string;
  longTermGoal?: string;
  usualPlaceHints: string[];
  contactRoutes: string[];
}

export interface CustomCharacterRevision {
  characterAssetId: string;
  revision: number;
  checksum: string;
  displayName: string;
  aliases: string[];
  gender: string;
  profileSummary: string;
  backgroundSummary: string;
  corePersonality: string[];
  values: string[];
  coreMotivations: string[];
  majorRelationships: CustomCharacterRelationship[];
  sourceProfile?: CustomCharacterSourceProfile;
  entryMode: CustomCharacterEntryMode;
  adaptationPolicy: CustomCharacterAdaptationPolicy;
  deployments: CustomContentWorldDeployment[];
  sourceSpans: CustomSourceSpan[];
  lifecycle: CustomAssetLifecycle;
}

export type EventRoleBindingMode =
  | 'fixed_character'
  | 'current_player'
  | 'project_or_runtime'
  | 'global_allowed';

export interface CustomEventRoleSlot {
  roleSlotId: string;
  title: string;
  summary: string;
  bindingMode: EventRoleBindingMode;
  fixedCharacterRef?: CustomContentRevisionRef;
  requirements: string[];
}

export interface CustomEventCharacterUsage {
  usageId: string;
  roleSlotId?: string;
  characterRef?: CustomContentRevisionRef;
  usageSummary: string;
  required: boolean;
}

export type ImportedFactState =
  | 'source_only'
  | 'established_in_save'
  | 'invalidated_in_save';

export interface CustomImportedFact {
  factId: string;
  summary: string;
  state: ImportedFactState;
  sourceSpans: CustomSourceSpan[];
}

export interface CustomEventNode {
  nodeId: string;
  title: string;
  summary: string;
  prerequisites: string[];
  entryConditions: string[];
  blockers: string[];
  characterUsages: CustomEventCharacterUsage[];
  knowledgeBoundary: {
    knownBy: string[];
    hiddenFrom: string[];
    readerOnly: boolean;
  };
  possibleOutcomes: string[];
  downstreamEffects: string[];
}

export interface CustomEventStage {
  stageId: string;
  title: string;
  summary: string;
  establishedSourceFacts: CustomImportedFact[];
  continuationSourceFacts: CustomImportedFact[];
  hardSourceConstraints: CustomImportedFact[];
  foreshadowingOptions: string[];
  eventNodes: CustomEventNode[];
  completionHints: string[];
  nextStageHints: string[];
}

export interface CustomEventGroupRevision {
  eventGroupId: string;
  projectId: string;
  revision: number;
  checksum: string;
  title: string;
  summary: string;
  invariantCore: string[];
  mutableSlots: string[];
  forbiddenAdaptations: string[];
  characterRefs: CustomContentRevisionRef[];
  roleSlots: CustomEventRoleSlot[];
  stages: CustomEventStage[];
  entryMode: 'manual' | 'natural' | 'priority' | 'asap';
  reusePolicy: 'save_single_use' | 'repeatable_motif';
  deployments?: CustomContentWorldDeployment[];
  inheritProjectDeployments: boolean;
  sourceSpans: CustomSourceSpan[];
  lifecycle: CustomAssetLifecycle;
}

export type CustomContentAssetRecord =
  | CustomContentProjectAsset
  | CustomCharacterAsset
  | CustomEventGroupAsset;

export type CustomContentRevision =
  | CustomContentProjectRevision
  | CustomCharacterRevision
  | CustomEventGroupRevision;

export interface CustomSourceDocument {
  sourceDocumentId: string;
  projectId?: string;
  fileName: string;
  sourceFormat: 'txt' | 'markdown' | 'epub';
  mediaType: string;
  byteLength: number;
  characterCount?: number;
  checksum: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomSourceOffsetUnit = 'utf16_code_unit';

export type CustomSourceChapterDetectionMethod =
  | 'explicit_heading'
  | 'markdown_heading'
  | 'epub_navigation'
  | 'epub_spine'
  | 'fallback';

export type CustomSourceChunkBoundaryKind =
  | 'chapter_boundary'
  | 'paragraph_boundary'
  | 'sentence_boundary'
  | 'size_limit';

export type CustomSourceTokenEstimator = 'approximate_mixed_text_v1';

export interface CustomSourceChapter {
  chapterId: string;
  sourceStructureId: string;
  sourceDocumentId: string;
  sequence: number;
  title?: string;
  detectionMethod: CustomSourceChapterDetectionMethod;
  sourceSpan: CustomSourceSpan;
  characterCount: number;
  estimatedTokenCount: number;
  tokenEstimator: CustomSourceTokenEstimator;
}

export interface CustomSourceChunk {
  chunkId: string;
  sourceStructureId: string;
  sourceDocumentId: string;
  chapterId: string;
  sequence: number;
  chapterSequence: number;
  boundaryKind: CustomSourceChunkBoundaryKind;
  sourceSpan: CustomSourceSpan;
  characterCount: number;
  estimatedTokenCount: number;
  tokenEstimator: CustomSourceTokenEstimator;
  overlapBeforeCharacterCount: number;
  overlapAfterCharacterCount: number;
}

export interface CustomSourceStructure {
  sourceStructureId: string;
  sourceDocumentId: string;
  parserVersion: string;
  offsetUnit: CustomSourceOffsetUnit;
  canonicalTextChecksum: string;
  characterCount: number;
  estimatedTokenCount: number;
  tokenEstimator: CustomSourceTokenEstimator;
  chapters: CustomSourceChapter[];
  chunks: CustomSourceChunk[];
  createdAt: string;
  updatedAt: string;
}

export type CustomContentProcessingTaskKind =
  | 'parse_source'
  | 'chunk_source'
  | 'extract_local'
  | 'aggregate_chapter'
  | 'aggregate_stage'
  | 'aggregate_arc'
  | 'build_project';

export type CustomContentProcessingTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'failed'
  | 'completed'
  | 'cancelled';

export interface CustomSourceProcessingChunkingConfig {
  targetTokenCount: number;
  maxTokenCount: number;
  overlapTokenCount: number;
}

export interface CustomSourceProcessingTaskConfig {
  sourceFormat: 'txt' | 'markdown' | 'epub';
  encoding: 'auto' | 'utf-8' | 'utf-16le' | 'utf-16be';
  parserVersion: string;
  canonicalTextChecksum?: string;
  chunking?: CustomSourceProcessingChunkingConfig;
}

export interface CustomAiProcessingPricing {
  currency: 'USD';
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
}

export interface CustomAiProcessingTaskConfig {
  sourceStructureId: string;
  promptVersion:
    | 'phase9-local-extraction-v1'
    | 'phase9-chapter-aggregation-v1'
    | 'phase9-stage-aggregation-v1'
    | 'phase9-story-arc-aggregation-v1'
    | 'phase9-project-build-v1';
  maxOutputTokensPerUnit: number;
  authorizedTotalTokens: number;
  authorizedAt: string;
  pricing?: CustomAiProcessingPricing;
  inputTaskIds?: string[];
  aggregationLevel?: 'chapter' | 'stage' | 'arc';
  conversionMode?: CustomContentConversionMode;
  maxLowerResultsPerUnit?: number;
}

export type CustomContentProcessingPauseReason =
  | 'user'
  | 'token_limit'
  | 'cost_limit'
  | 'rate_limit'
  | 'page_interrupted';

export interface CustomContentProcessingTask {
  taskId: string;
  taskKind: CustomContentProcessingTaskKind;
  projectId?: string;
  sourceDocumentId?: string;
  status: CustomContentProcessingTaskStatus;
  apiProfileId?: string;
  model?: string;
  concurrency: 1 | 2 | 3;
  maxRetries: number;
  completedUnitCount: number;
  totalUnitCount: number;
  estimatedInputTokens: number;
  consumedInputTokens: number;
  consumedOutputTokens: number;
  estimatedCost?: number;
  consumedCost?: number;
  costLimit?: number;
  cursor?: string;
  inputChecksum?: string;
  sourceProcessing?: CustomSourceProcessingTaskConfig;
  aiProcessing?: CustomAiProcessingTaskConfig;
  stateRevision?: number;
  pauseReason?: CustomContentProcessingPauseReason;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomContentProcessingUnit {
  unitId: string;
  taskId: string;
  sequence: number;
  status: CustomContentProcessingTaskStatus;
  sourceSpan?: CustomSourceSpan;
  inputRefs?: string[];
  retryCount: number;
  resultRef?: string;
  lastError?: string;
  updatedAt: string;
}

export interface CustomLocalExtractionNote {
  observationId: string;
  summary: string;
}

export interface CustomLocalCharacterObservation
  extends CustomLocalExtractionNote {
  displayName: string;
  aliases: string[];
}

export interface CustomLocalEventObservation
  extends CustomLocalExtractionNote {
  title?: string;
}

export interface CustomLocalInformationVisibility
  extends CustomLocalExtractionNote {
  holder: string;
  information: string;
}

export interface CustomLocalExtractionContinuation {
  summary: string;
  openThreads: string[];
}

export interface CustomLocalExtractionResult {
  extractionResultId: string;
  taskId: string;
  unitId: string;
  sourceDocumentId: string;
  sourceStructureId: string;
  chunkId: string;
  sourceSpan: CustomSourceSpan;
  localSummary: string;
  establishedFacts: CustomLocalExtractionNote[];
  characterObservations: CustomLocalCharacterObservation[];
  eventObservations: CustomLocalEventObservation[];
  informationVisibility: CustomLocalInformationVisibility[];
  unresolvedContradictions: CustomLocalExtractionNote[];
  continuation: CustomLocalExtractionContinuation;
  apiProfileId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  usageSource: 'provider' | 'estimated';
  estimatedCost?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomSourceCarryLedgerEntry {
  carryLedgerEntryId: string;
  extractionTaskId: string;
  extractionResultId: string;
  unitId: string;
  sourceDocumentId: string;
  sourceStructureId: string;
  chunkId: string;
  sequence: number;
  sourceSpan: CustomSourceSpan;
  continuation: CustomLocalExtractionContinuation;
  characterObservationIds: string[];
  eventObservationIds: string[];
  unresolvedContradictionObservationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type CustomSourceAggregationLevel = 'chapter' | 'stage' | 'arc';

export interface CustomSourceCharacterMergeSuggestion {
  suggestionId: string;
  displayName: string;
  aliases: string[];
  sourceObservationIds: string[];
  rationale: string;
}

export interface CustomSourceStoryArc {
  storyArcId: string;
  title: string;
  summary: string;
  sourceResultRefs: string[];
  sourceObservationIds: string[];
  characterMergeSuggestionIds: string[];
  invariantCore: string[];
  mutableSlots: string[];
  forbiddenAdaptations: string[];
  contentGaps: string[];
  continuationHints: string[];
}

export interface CustomSourceAggregationResult {
  aggregationResultId: string;
  taskId: string;
  unitId: string;
  aggregationLevel: CustomSourceAggregationLevel;
  sourceDocumentId: string;
  sourceStructureId: string;
  sourceSpans: CustomSourceSpan[];
  lowerResultRefs: string[];
  chapterIds: string[];
  summary: string;
  establishedFacts: CustomLocalExtractionNote[];
  characterMergeSuggestions: CustomSourceCharacterMergeSuggestion[];
  eventThreads: CustomLocalExtractionNote[];
  informationVisibility: CustomLocalInformationVisibility[];
  unresolvedContradictions: CustomLocalExtractionNote[];
  contentGaps: CustomLocalExtractionNote[];
  continuation: CustomLocalExtractionContinuation;
  storyArcs?: CustomSourceStoryArc[];
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

export type CustomContentDependencyKind =
  | 'required'
  | 'optional'
  | 'role_slot_fallback';

export interface CustomContentDependency {
  dependencyId: string;
  owner: CustomContentRevisionRef;
  target: CustomContentRevisionRef;
  kind: CustomContentDependencyKind;
}

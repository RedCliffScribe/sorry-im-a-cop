import type { CurrentIdentity, GameTime, RuntimeState } from '../runtime/types';

export type DramaPacingPreset =
  | 'original'
  | 'life'
  | 'balanced'
  | 'dramatic'
  | 'cinematic'
  | 'custom';

export type DramaMaterialLevel = 'minimal' | 'restrained' | 'standard' | 'rich' | 'extended';
export type DramaChannelLevel = 'off' | 'low' | 'medium' | 'high';
export type DramaPlanningRouteMode = 'auto' | 'follow-main' | 'use-auxiliary';
/** Resolved per-turn planning scope. This is not a user-facing settings value. */
export type DramaPlanningRoute = 'auto' | 'custom_intent_only' | 'official_dlc_only';
export type DramaPreferenceLevel = 'low' | 'medium' | 'high' | 'very_high';
export type DramaQuietSpaceLevel = 'very_low' | 'low' | 'medium' | 'high';
export type DramaCoincidenceTolerance = 'strict' | 'normal' | 'cinematic';
export type DramaEscalationLevel = 'low' | 'medium' | 'high';

export type DramaChannelId =
  | 'work_livelihood'
  | 'relationships'
  | 'cases_law'
  | 'organizations'
  | 'city_news'
  | 'era_storypack'
  | 'screen_characters'
  | 'custom_characters'
  | 'custom_events';

export type DramaChannelSettings = Record<DramaChannelId, DramaChannelLevel>;

export interface DramaticContentSettings {
  pacing: DramaPacingPreset;
  materialLevel: DramaMaterialLevel;
  planningRoute: DramaPlanningRouteMode;
  channels: DramaChannelSettings;
  custom?: {
    dynamicLimit?: number;
    staticLimit?: number;
    supportLimit?: number;
    quietWindowTurns?: number;
    worldInitiative?: DramaPreferenceLevel;
    existingDynamicsReturn?: DramaPreferenceLevel;
    newSeedExposure?: DramaPreferenceLevel;
    quietSpace?: DramaQuietSpaceLevel;
    coincidenceTolerance?: DramaCoincidenceTolerance;
    majorEscalation?: DramaEscalationLevel;
    relationshipInitiative?: DramaEscalationLevel;
  };
}

export interface DramaMaterialBudget {
  dynamicLimit: number;
  staticLimit: number;
  supportLimit: number;
  quietWindowTurns: number;
}

export interface CanonicalPlayerRoleContext {
  identity: CurrentIdentity;
  publicRole: string;
  organizationId?: string;
  organizationName?: string;
  placeId?: string;
  unitSummary?: string;
  positionSummary?: string;
  dutySummary?: string;
  decisionScopeSummary?: string;
  accessSummary?: string;
  stableContactActorIds: string[];
  activeMatterIds: string[];
}

export type DramaSourceStatus =
  | 'confirmed_fact'
  | 'public_claim'
  | 'rumor'
  | 'active_process'
  | 'undecided_suggestion'
  | 'static_seed';

export type DramaSourceReusePolicy =
  | 'context_reusable'
  | 'motif_reusable'
  | 'entity_singleton'
  | 'save_single_use';

/**
 * Optional case-ID continuity guard declared by a content source. Most
 * sources may open a new case normally. Persistent incident arcs can opt into
 * reusing their one already-linked case once that link exists in Runtime.
 */
export type DramaCaseContinuityPolicy =
  | 'allow_new'
  | 'reuse_linked_when_present';

// Source types are deliberately open. Worldpacks and future internal providers
// may register new structured source kinds without changing the core protocol.
export type DramaSourceType = string;

export interface DramaSourceRef {
  providerId: string;
  sourceType: DramaSourceType;
  sourceId: string;
  /** Official DLC provenance is retained across planning and execution. */
  dlcId?: string;
}

/**
 * Local-only legacy exposure evidence. Every term in `allTerms` must occur in
 * one durable record; when `anyTerms` is present, at least one of those terms
 * must occur in that same record. These signatures are never prompt facts.
 */
export interface DramaExposureEvidenceTextSignature {
  allTerms: string[];
  anyTerms?: string[];
}

export interface PlanningSource {
  ref: DramaSourceRef;
  /**
   * Stable Actor IDs that can prove this source has already entered an older
   * save even when its bounded execution receipts are no longer available.
   * These IDs are used only for exact exposure recovery; they are not facts
   * sent to the planner and must be unique to this content source.
   */
  exposureEvidenceActorIds?: string[];
  /**
   * Text signatures used only to recover exposure from older saves whose
   * execution receipt or canonical Actor IDs were not persisted.
   */
  exposureEvidenceTextSignatures?: DramaExposureEvidenceTextSignature[];
  /**
   * Stable foreground arc used to collapse several projections of the same
   * underlying matter. This is orchestration metadata, not world state.
   */
  arcKey?: string;
  /**
   * A clustered source keeps the concrete projected refs that supplied its
   * evidence. `ref` remains the planner-facing representative for backwards
   * compatibility.
   */
  evidenceRefs?: DramaSourceRef[];
  title: string;
  plannerSummary: string;
  sourceStatus: DramaSourceStatus;
  reusePolicy: DramaSourceReusePolicy;
  /**
   * User-requested sources are explicit per-save intent. They outrank ordinary
   * optional seeds but never become mandatory world facts.
   */
  priorityClass: 'normal' | 'user_requested';
  channelIds: DramaChannelId[];
  softAffinities: Record<string, string[]>;
  mandatory: boolean;
  score: number;
  relatedActorIds: string[];
  relatedOrganizationIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  caseContinuityPolicy?: DramaCaseContinuityPolicy;
  /**
   * Optional structural contract for a persistent narrative arc. Providers
   * may declare the stage/node inventory without moving any story facts into
   * the runtime state. Missing metadata means the generic validator can still
   * enforce shape and continuity, but cannot assert provider-specific IDs.
   */
  arcProgressContract?: NarrativeArcProgressContract;
  /**
   * Stable content identity shared by first exposure and persisted-arc
   * continuations. It is execution metadata only and is never a world fact.
   */
  contentIdentity?: NarrativeArcContentIdentity;
  /**
   * Provider-declared compact projections. The generic arc projector selects
   * exactly one current stage and removes this inventory before planning.
   */
  arcStageProjections?: Readonly<Record<string, NarrativeArcStageProjection>>;
  /** Current persisted stage selected by the generic arc projector. */
  arcStageContext?: NarrativeArcStageContext;
}

export interface NarrativeArcContentIdentity {
  providerId: string;
  contentId: string;
  version: string;
  arcKey: string;
  dlcId?: string;
  worldpackId?: string;
}

export interface NarrativeArcStageProjection {
  stageId: string;
  title: string;
  plannerSummary: string;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
}

export interface NarrativeArcGroundedFactSummary {
  ref: DramaWritebackRef;
  summary: string;
}

/**
 * Bounded, per-turn continuity evidence compiled from one persisted arc and
 * the current RuntimeState. It is prompt metadata, never a second fact store.
 */
export interface NarrativeArcContinuationSnapshot {
  usedNodeIds: string[];
  lastProgressTurn: number;
  progressSummary?: string;
  groundedSummary: string;
  appliedWritebackRefs: DramaWritebackRef[];
  groundedFacts: NarrativeArcGroundedFactSummary[];
  unresolvedContext: string[];
}

export interface NarrativeArcStageContext {
  arcInstanceId: string;
  currentStageId: string;
  mode: 'continuation';
  continuationSnapshot: NarrativeArcContinuationSnapshot;
}

export interface DramaPayloadResolutionOptions {
  narrativeArc?: NarrativeArcStageContext;
}

export interface NarrativeArcProgressContract {
  stageIds: string[];
  nodeIdsByStage: Record<string, string[]>;
  allowedNextStageIds?: Record<string, string[]>;
  /** When present, only these persisted stages may accept decision=complete. */
  completionStageIds?: string[];
}

export interface ExecutionPayload {
  ref: DramaSourceRef;
  detailedContext: string;
  confirmedFacts: string[];
  mutableElements: string[];
  forbiddenAdaptations: string[];
  contentIdentity?: NarrativeArcContentIdentity;
  /**
   * Optional provider-declared continuity metadata. This is execution
   * metadata only; the persisted source of truth remains NarrativeArcInstance.
   */
  arcKey?: string;
  initialStageId?: string;
  currentStageId?: string;
  arcProgressContract?: NarrativeArcProgressContract;
}

export type DramaPlanMode =
  | 'quiet'
  | 'continue_existing'
  | 'foreshadow'
  | 'surface'
  | 'escalate'
  | 'aftershock'
  | 'payoff';

export type DramaSceneFunction =
  | 'rest'
  | 'texture'
  | 'information'
  | 'relationship'
  | 'pressure'
  | 'foreshadow'
  | 'choice'
  | 'aftershock'
  | 'payoff';

export type DramaIntensity = 'none' | 'low' | 'medium' | 'high';

export interface DramaPlan {
  planId: string;
  planningScope: 'opening' | 'turn';
  mode: DramaPlanMode;
  primarySource: DramaSourceRef | null;
  supportSources: DramaSourceRef[];
  sceneFunction: DramaSceneFunction;
  intensity: DramaIntensity;
  playerMayIgnore: boolean;
  maxNewActors: number;
  adaptationSummary?: string;
  reasonSummary: string;
}

export type DramaPlanOrigin = 'auxiliary' | 'main_two_pass' | 'local_fallback';

/**
 * Ephemeral per-turn gate. It narrows what may take foreground attention but
 * never becomes a second source of truth.
 */
export interface ForegroundContract {
  planId: string;
  mode: DramaPlanMode;
  origin: DramaPlanOrigin;
  primaryArcKey?: string;
  selectedSourceRefs: DramaSourceRef[];
  evidenceSourceRefs: DramaSourceRef[];
  mandatorySourceRefs: DramaSourceRef[];
  allowedActorIds: string[];
  allowedOrganizationIds: string[];
  allowedPlaceIds: string[];
  allowedCaseIds: string[];
  caseContinuityPolicy?: DramaCaseContinuityPolicy;
  /** Case IDs linked directly to the selected primary source, not support material. */
  caseContinuityCaseIds?: string[];
  allowedMatterIds: string[];
  allowedRelationshipThreadIds: string[];
  allowedCityTrackIds: string[];
  maxForegroundArcs: number;
  maxNewActors: number;
  maxNewDurableThreads: number;
}

export type DramaExecutionStatus =
  | 'not_used'
  | 'used_as_texture'
  | 'partially_used'
  | 'used_persistently';

export interface DramaWritebackRef {
  kind: string;
  id: string;
}

export type CustomEventProgressDecision =
  | 'stay'
  | 'advance'
  | 'complete'
  | 'diverge';

export interface CustomEventFactStateChange {
  factId: string;
  state: 'established_in_save' | 'invalidated_in_save';
  supportingWritebackRefs: DramaWritebackRef[];
}

/**
 * A bounded receipt for advancing one already selected custom event instance.
 * It never replaces Runtime writeback: every transition must be supported by
 * refs in the same validated DramaExecutionTrace.
 */
export interface CustomEventProgressTrace {
  instanceId: string;
  stageId: string;
  usedNodeIds: string[];
  decision: CustomEventProgressDecision;
  nextStageId?: string;
  supportingWritebackRefs: DramaWritebackRef[];
  factStateChanges: CustomEventFactStateChange[];
}

export type NarrativeArcType =
  | 'official_dlc'
  | 'custom_content'
  | 'storypack'
  | 'dynamic_event';

export type NarrativeArcStatus =
  | 'active'
  | 'paused'
  | 'completed'
  | 'abandoned';

export type NarrativeArcProgressDecision =
  | 'remain'
  | 'advance_stage'
  | 'complete'
  | 'abandon';

export interface NarrativeArcInstance {
  arcInstanceId: string;
  sourceRef: DramaSourceRef;
  arcType: NarrativeArcType;
  status: NarrativeArcStatus;
  currentStageId?: string;
  previousStageId?: string;
  usedNodeIds: string[];
  createdTurn: number;
  lastProgressTurn: number;
  writebackRefs: DramaWritebackRef[];
  lastSummary?: string;
}

export interface NarrativeArcProgressTrace {
  arcInstanceId: string;
  sourceRef: DramaSourceRef;
  decision: NarrativeArcProgressDecision;
  currentStageId?: string;
  previousStageId?: string;
  nextStageId?: string;
  usedNodeIds: string[];
  supportingWritebackRefs: DramaWritebackRef[];
  summary?: string;
}

/**
 * Fine-grained, diagnostic-only reasons for an execution receipt being
 * rejected. These codes describe the existing gates; they do not introduce a
 * second acceptance policy.
 */
export type NarrativeArcProgressRejectReason =
  | 'progress_schema_invalid'
  | 'execution_status_not_persistent'
  | 'arc_instance_missing'
  | 'arc_source_mismatch'
  | 'source_not_selected'
  | 'source_not_used'
  | 'current_stage_mismatch'
  | 'next_stage_missing'
  | 'next_stage_unknown'
  | 'transition_not_allowed'
  | 'node_id_unknown'
  | 'node_not_in_current_contract'
  | 'duplicate_progress_candidate'
  | 'conflicting_progress_candidate'
  | 'supporting_writeback_ref_invalid'
  | 'supporting_writeback_ref_not_in_raw_response'
  | 'supporting_writeback_ref_dropped_by_validation'
  | 'supporting_writeback_ref_not_applied'
  | 'supporting_writeback_ref_not_subset'
  | 'writeback_ref_canonicalization_mismatch';

export interface NarrativeArcWritebackReferenceAudit {
  rawResponseRefs: DramaWritebackRef[];
  schemaValidatedRefs: DramaWritebackRef[];
  acceptedWritebackRefs: DramaWritebackRef[];
  appliedWritebackRefs: DramaWritebackRef[];
  appliedCheckAvailable?: boolean;
}

export interface NarrativeArcSupportingWritebackRefAudit {
  kind: string;
  originalRefId: string;
  normalizedRefId?: string;
  presentInRawResponse: boolean;
  passedSchemaValidation: boolean;
  acceptedByDomainGate: boolean;
  appliedToRuntime: boolean;
  appliedCheckAvailable?: boolean;
}

export interface NarrativeArcProgressValidationDiagnostic {
  requestId?: string;
  turnId?: string;
  arcInstanceId?: string;
  sourceRef?: DramaSourceRef;
  decision?: NarrativeArcProgressDecision | string;
  beforeStageId?: string;
  requestedCurrentStageId?: string;
  requestedNextStageId?: string;
  requestedNodeIds: string[];
  allowedNextStageIds?: string[];
  allowedNodeIds?: string[];
  candidatePresent: boolean;
  schemaValid: boolean;
  sourceValid: boolean;
  stageContractValid: boolean;
  writebackEvidenceValid: boolean;
  accepted: boolean;
  classification:
    | 'no_progress_candidate'
    | 'remain'
    | 'remain_rejected'
    | 'advance_accepted'
    | 'advance_rejected'
    | 'complete_accepted'
    | 'complete_rejected'
    | 'abandon_accepted'
    | 'abandon_rejected';
  rejectionReasons: NarrativeArcProgressRejectReason[];
  /** ID-only snapshots of the four writeback validation stages. */
  writebackReferenceAudit: NarrativeArcWritebackReferenceAudit;
  supportingWritebackRefs: NarrativeArcSupportingWritebackRefAudit[];
  /** Diagnostic-only findings that do not change the acceptance decision. */
  advisoryReasons?: NarrativeArcProgressRejectReason[];
}

export interface NarrativeArcSummary {
  arcInstanceId: string;
  sourceRef: DramaSourceRef;
  arcType: NarrativeArcType;
  status: NarrativeArcStatus;
  currentStageId?: string;
  summary: string;
  lastProgressTurn: number;
}

export interface DramaExecutionTrace {
  planId: string;
  status: DramaExecutionStatus;
  usedSourceRefs: DramaSourceRef[];
  resultingWritebackRefs: DramaWritebackRef[];
  customEventProgress?: CustomEventProgressTrace[];
  narrativeArcProgress?: NarrativeArcProgressTrace[];
}

export interface DramaPlanningContext {
  planningScope: 'opening' | 'turn';
  planningMode: 'full' | 'custom_intent_only' | 'official_dlc_only';
  /** The resolved scope used to build this context; omitted by legacy callers. */
  planningRoute?: DramaPlanningRoute;
  turnCounter: number;
  currentTime: GameTime;
  playerInput?: string;
  playerRoleContext: CanonicalPlayerRoleContext;
  currentPlaceId: string;
  currentSceneId?: string;
  settings: DramaticContentSettings;
  pacing: DramaPacingPreset;
  materialBudget: DramaMaterialBudget;
  recentTurnSummaries: Array<{
    turnId: string;
    summary: string;
  }>;
  requiredContextSources: PlanningSource[];
  userPrioritySources: PlanningSource[];
  optionalDynamicSources: PlanningSource[];
  staticSeedSources: PlanningSource[];
  /** Compact, player-selected official DLC sources kept separate from ordinary seeds. */
  officialDlcSources?: PlanningSource[];
  /** Compact summaries for exposed, unfinished narrative arcs. */
  narrativeArcSummaries?: NarrativeArcSummary[];
  recentExecutions: DramaExecutionReceipt[];
  filterRuleIds: string[];
}

export interface DramaPlanningDiagnostic {
  code:
    | 'planning_failed'
    | 'planning_schema_invalid'
    | 'planning_mode_normalized'
    | 'plan_source_missing'
    | 'execution_trace_source_missing'
    | 'execution_trace_schema_invalid'
    | 'execution_trace_missing'
    | 'execution_trace_official_dlc_exposure_recovered'
    | 'execution_trace_plan_mismatch'
    | 'execution_trace_writeback_missing'
    | 'execution_trace_writeback_not_applied'
    | 'execution_trace_status_invalid'
    | 'execution_trace_custom_progress_invalid'
    | 'execution_trace_narrative_arc_progress_invalid'
    | 'arc_created'
    | 'arc_creation_failed';
  message: string;
  turnCounter: number;
  /** Bounded, ID-only evidence for Narrative Arc receipt rejection. */
  narrativeArcProgressAudit?: NarrativeArcProgressValidationDiagnostic;
}

export interface DramaInstanceRecord {
  instanceId: string;
  arcKey?: string;
  sourceRefs: DramaSourceRef[];
  resultingWritebackRefs: DramaWritebackRef[];
  createdTurnId: string;
  lastPlannedTurn?: number;
  lastUsedTurn?: number;
  surfaceCount?: number;
  cooldownUntilTurn?: number;
  status: 'active' | 'resolved' | 'archived';
}

export interface DramaExecutionReceipt {
  turnCounter: number;
  pacing: DramaPacingPreset;
  planningRoute: DramaPlanningRouteMode;
  materialLevel: DramaMaterialLevel;
  storypackInfluence: RuntimeState['world']['storypackInfluence'];
  screenCharacterSeedsEnabled: boolean;
  planningContextBuilt?: boolean;
  planningMode?: DramaPlanningContext['planningMode'];
  resolvedPlanningRoute?: DramaPlanningRoute;
  officialDlcSourceCount?: number;
  officialDlcSelected?: boolean;
  officialDlcExecuted?: boolean;
  plannerApiInvoked?: boolean;
  planOrigin?: DramaPlanOrigin;
  planningCalled: boolean;
  planningSucceeded: boolean;
  planningDurationMs: number;
  inputCandidateCount: number;
  inputCharacterCount: number;
  estimatedInputTokens: number;
  planMode?: DramaPlanMode;
  primarySourceRef?: DramaSourceRef;
  supportSourceRefs: DramaSourceRef[];
  usedSourceRefs: DramaSourceRef[];
  traceStatus?: DramaExecutionStatus;
  persistentWriteCount: number;
  foregroundArcCount?: number;
  newActorCount?: number;
  sourceRepeatDistance?: number;
  degradeReason?: string;
  filterRuleIds: string[];
  /** Bounded, ID-only Narrative Arc progress classifications for diagnostics. */
  narrativeArcProgressAudits?: NarrativeArcProgressValidationDiagnostic[];
}

export interface DramaticContentRuntimeState {
  openingId?: string;
  /**
   * Player-authorized custom source for the first act. The opening registry
   * definition remains the primary source; this ref can only be validated as
   * the single support source after its save adaptation is ready.
   */
  openingSupportSourceRef?: DramaSourceRef;
  settings?: DramaticContentSettings;
  instances: DramaInstanceRecord[];
  recentDiagnostics: DramaPlanningDiagnostic[];
  recentExecutions?: DramaExecutionReceipt[];
  /**
   * Durable, set-like official DLC exposure ledger. Unlike recentExecutions,
   * it is not a per-turn history and therefore is not truncated as a save gets
   * older. It prevents an already surfaced story or one-shot rumor from being
   * offered as a fresh first exposure again.
   */
  exposedOfficialDlcSourceRefs?: DramaSourceRef[];
}

export function dramaSourceKey(ref: DramaSourceRef): string {
  return `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`;
}

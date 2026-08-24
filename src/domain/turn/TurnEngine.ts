import { composePrompt } from '../context/composePrompt';
import { selectContext, type PromptContext } from '../context/selectContext';
import { applyCustomContentDramaExecution } from '../customContent/dramaExecution';
import { refreshPristineCitySituationTrackSeeds } from '../cityPower/initialCitySituationTracks';
import { buildForegroundEvolutionDelta } from '../backgroundEvolution/foregroundDelta';
import { reconcileForegroundNpcTracks } from '../backgroundEvolution/foregroundReconciliation';
import { runBackgroundEvolution } from '../backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../backgroundEvolution/selection';
import { isGameTimeDue } from '../deferred/deferredEventProjector';
import { compressRuntimeMemories } from '../memory/compressRuntimeMemories';
import { embedRuntimeMemories } from '../memory/embedRuntimeMemories';
import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import type {
  NarratorAttemptRecord,
  NarratorAttemptStartRecord,
  NarratorClient,
  NarratorRequestPurpose
} from '../narrator/NarratorClient';
import { NarratorAttemptError } from '../narrator/NarratorErrors';
import { compileCreativeNarratorRequest } from '../prompts/creativePromptCompiler';
import {
  createNarrativeLengthRetryPrompt,
  extractNarrativeText,
  measureNarrativeLength,
  type NarrativeLengthMeasurement
} from '../narrator/narrativeLengthGuard';
import { maybeGenerateAuxiliaryNews } from '../news/auxiliaryNewsGeneration';
import { reconcileNewsIssueLifecycle } from '../news/newsIssueLifecycle';
import { runNpcSimulation, type NpcSimulationPackage } from '../npc/npcSimulation';
import {
  enforceCivilianLivelihoodWritebackAtomicity,
  shouldRepairCivilianLivelihoodWriteback
} from '../livelihood/civilianLivelihoodWriteback';
import { deriveActorAgeAt } from '../runtime/actorAge';
import {
  completedActorProfileEnrichmentFields,
  missingActorProfileEnrichmentFields,
  normalizePendingActorProfileEnrichment,
  retainRequestedActorProfileFields
} from '../runtime/actorProfileEnrichment';
import type {
  Actor,
  ActorProfileEnrichmentField,
  AssetItem,
  DeferredEvent,
  GameTime,
  PendingActorProfileEnrichment,
  PendingActorWritebackRecovery,
  Place,
  RuntimeState,
  StoryDiagnosticIssue,
  TurnApiUsage
} from '../runtime/types';
import type {
  FeatureModelRoute,
  GameSettings,
  MemoryCompressionSettings,
  PromptSettings,
  TavernManagementSettings
} from '../settings/types';
import { isSpendableCashAsset } from '../assets/assetWritebackPolicy';
import type { PlayerPoliceRoleProfilePatch } from '../identity/playerPoliceRoleProfile';
import {
  evaluateFixedActorIdentityPatch,
  fixedActorIdentityMergeConflicts
} from '../identity/fixedActorIdentityGuard';
import { VEHICLE_ASSET_WRITEBACK_CONTRACT } from '../assets/assetWritebackContract';
import {
  indexRawAssetItemsById,
  isVehicleAssetIntent,
  reconcileVehicleAssetIntent,
  recoverVehicleAssetIntents
} from '../assets/assetWritebackIntent';
import { recoverCaseWritebackIntents } from '../cases/caseWritebackIntent';
import { repairExternalCaseLeadWritebacks } from '../cases/caseLeadRecovery';
import {
  repairCaseActionIntents,
  resolveCaseActionIntents,
  type CaseActionIntent
} from '../cases/caseActionIntent';
import { resolvePromptText } from '../prompts/promptRegistry';
import {
  resolvePlayerVitalsLifecycleReview,
  type PlayerVitalsLifecycleReview
} from '../vitals/playerVitalsLifecycle';
import { applyNarratorResponse, missingMinimumNewActorFields } from '../writeback/applyWriteback';
import {
  actorMemorySuggestionSchema,
  actorPatchSchema,
  assetItemSchema,
  assetRemoveItemSchema,
  caseEvidencePatchSchema,
  casePatchSchema,
  currentMatterPatchSchema,
  deferredEventPatchSchema,
  financePatchSchema,
  canonicalLocalJudgementCheckSchema,
  locationPatchSchema,
  memorySuggestionSchema,
  playerCivilianRoleProfilePatchSchema,
  playerPoliceRoleProfilePatchSchema,
  playerPatchSchema,
  pregnancyLifecycleReviewSchema,
  pregnancyResolutionPatchSchema,
  pregnancyRiskPatchSchema,
  relationshipThreadPatchSchema,
  vitalsPatchSchema,
  type NarratorResponse
} from '../writeback/schema';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import { TurnUsageMeter } from './TurnUsageMeter';
import {
  allDramaPlanningSources,
  assembleDramaPlanningContext,
  assembleOfficialDlcPlanningContext
} from '../drama/assemblePlanningContext';
import { createFallbackDramaPlan, planDramaticTurn } from '../drama/planner';
import { recordDramaTurn } from '../drama/runtime';
import {
  applyNarrativeArcProgress,
  bridgeNarrativeArcCreation,
  buildNarrativeArcPlanningSources
} from '../drama/narrativeArc';
import { normalizeDramaticContentSettings } from '../drama/settings';
import {
  collectLocalJudgementSources,
  createBalancedLocalD100Roll,
  LOCAL_JUDGEMENT_RULESET_VERSION,
  resolveLocalJudgementIntent,
  type LocalJudgementIntent
} from '../conflict/localJudgement';
import {
  normalizeJudgementCheckIntent,
  normalizeJudgementOutcome
} from '../conflict/judgementIntent';
import {
  createJudgementStructureRepairRequest,
  mergeJudgementStructureRepair,
  parseJudgementStructureRepair
} from '../conflict/judgementStructureRepair';
import type {
  JudgementRecoveryStageRecord,
  JudgementRecoveryTrace
} from '../conflict/judgementRecoveryTrace';
import {
  createJudgementNarrativeRepairRequest,
  mergeJudgementNarrativeRepair,
  parseJudgementNarrativeRepair
} from '../conflict/judgementNarrativeRepair';
import {
  createJudgementPreflightRepairRequest,
  createJudgementPreflightRequest,
  normalizeJudgementPreflight,
  resolveJudgementPreflight,
  type JudgementResolutionEnvelope
} from '../conflict/judgementPreflight';
import { normalizeCombatEventIntent } from '../conflict/combatEventIntent';
import { normalizeGameDifficulty } from '../settings/gameDifficulty';
import {
  evaluateRelationshipCreationEvidence,
  normalizeRelationshipEvidenceRefs
} from '../relationship/relationshipEvidence';
import { preserveRelationshipContinuity } from '../relationship/relationshipContinuity';
import { resolveRelationshipThreadIdentity } from '../relationship/relationshipIdentity';
import {
  reconcileDramaExecutionTraceAfterWriteback,
  validateDramaExecutionTrace
} from '../drama/trace';
import {
  buildOfficialDlcDramaAudit,
  type OfficialDlcDramaAuditRecord
} from '../dlc/dramaAudit';
import {
  listGeneratedOfficialDlcSources,
  listOfficialDlcSourcesForAudit,
  listProjectedDramaSources,
  getProjectedDramaPayload
} from '../drama/sourceRegistry';
import { resolveOfficialDlcPlanning } from '../dlc/planning';
import { createForegroundContract, focusPromptContext } from '../drama/coherence';
import { enforceDramaCaseContinuity } from '../drama/caseContinuity';
import type {
  DramaExecutionTrace,
  DramaExecutionReceipt,
  DramaPlan,
  DramaPlanOrigin,
  DramaPlanningDiagnostic,
  ForegroundContract,
  NarrativeArcProgressValidationDiagnostic
} from '../drama/types';

type ActorIdentityMergeConfidence = 'high' | 'medium' | 'low';

export type TurnExecutionStage =
  | 'recalling_memory'
  | 'planning_drama'
  | 'simulating_npcs'
  | 'preflighting_judgement'
  | 'repairing_judgement_preflight'
  | 'generating_narrative'
  | 'regenerating_narrative'
  | 'normalizing_judgement'
  | 'repairing_judgement_structure'
  | 'regenerating_judgement'
  | 'repairing_judgement_narrative'
  | 'repairing_judgement_response'
  | 'validating_writeback'
  | 'applying_turn_results'
  | 'evolving_background'
  | 'updating_city_news'
  | 'compressing_memory'
  | 'embedding_memory'
  | 'finalizing_turn';

export interface RunPlayerTurnInput {
  state: RuntimeState;
  playerInput: string;
  caseActionIntent?: CaseActionIntent;
  requestId?: string;
  narrator: NarratorClient;
  memoryEmbedding?: MemoryEmbeddingClient;
  memorySummary?: NarratorClient | null;
  writebackRepair?: NarratorClient | null;
  writebackRepairMode?: FeatureModelRoute['mode'];
  npcSimulation?: NarratorClient | null;
  backgroundEvolution?: NarratorClient | null;
  auxiliaryGeneration?: NarratorClient | null;
  auxiliaryGenerationMode?: FeatureModelRoute['mode'];
  memoryCompression?: MemoryCompressionSettings;
  gameSettings?: GameSettings;
  promptSettings?: PromptSettings;
  tavernSettings?: TavernManagementSettings;
  onNarrativeDelta?: (delta: string) => void;
  onNarrativeReset?: () => void;
  onRawText?: (rawText: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoningText?: (reasoningText: string) => void;
  onNarratorAttemptStart?: (attempt: NarratorAttemptStartRecord) => void;
  onNarratorAttempt?: (attempt: NarratorAttemptRecord) => void;
  signal?: AbortSignal;
  onStageChange?: (stage: TurnExecutionStage) => void;
  onJudgementRecoveryTrace?: (trace: JudgementRecoveryTrace) => void;
  onOfficialDlcDramaAudit?: (records: OfficialDlcDramaAuditRecord[]) => void;
  judgementRoll?: number;
  enableJudgementPreflight?: boolean;
}

function throwIfTurnAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Aborted', 'AbortError');
}

function bindTurnRequestDiagnostics(
  client: NarratorClient,
  signal: AbortSignal | undefined,
  onAttemptStart: ((attempt: NarratorAttemptStartRecord) => void) | undefined,
  onAttempt: ((attempt: NarratorAttemptRecord) => void) | undefined
): NarratorClient {
  if (!signal && !onAttemptStart && !onAttempt) return client;
  return {
    configuredMaxTokens: client.configuredMaxTokens,
    complete: (prompt, options) =>
      client.complete(prompt, {
        ...options,
        ...(signal ? { signal } : {}),
        onAttemptStart: (attempt) => {
          options?.onAttemptStart?.(attempt);
          if (options?.onAttemptStart !== onAttemptStart) onAttemptStart?.(attempt);
        },
        onAttempt: (attempt) => {
          options?.onAttempt?.(attempt);
          if (options?.onAttempt !== onAttempt) onAttempt?.(attempt);
        }
      })
  };
}

type DeferredEventPatch = NarratorResponse['writeback']['deferredEventPatches'][number];
type ActorPatch = NarratorResponse['writeback']['actorPatches'][number];
type AssetPatch = NonNullable<NarratorResponse['writeback']['assetPatch']>;
type CasePatch = NarratorResponse['writeback']['casePatches'][number];
type CaseEvidencePatch = NarratorResponse['writeback']['caseEvidencePatches'][number];
type CurrentMatterPatch = NarratorResponse['writeback']['currentMatterPatches'][number];
type MemorySuggestion = NarratorResponse['writeback']['memories'][number];
type ActorMemorySuggestion = NarratorResponse['writeback']['actorMemories'][number];
type PlayerPatch = NonNullable<NarratorResponse['writeback']['playerPatch']>;
type LocationPatch = NonNullable<NarratorResponse['writeback']['locationPatch']>;
type PregnancyRiskPatch = NarratorResponse['writeback']['pregnancyRiskPatches'][number];
type PregnancyResolutionPatch = NarratorResponse['writeback']['pregnancyResolutionPatches'][number];
type PregnancyLifecycleReview = NonNullable<NarratorResponse['pregnancyLifecycleReview']>;
type PregnancyLifecycleReviewEvent = PregnancyLifecycleReview['events'][number];
type RelationshipThreadPatch = NarratorResponse['writeback']['relationshipThreadPatches'][number];
type FinancePatch = NonNullable<NarratorResponse['writeback']['financePatch']>;
type CivilianRoleProfilePatch = NonNullable<NarratorResponse['writeback']['civilianRoleProfilePatch']>;

const JUDGEMENT_PREFLIGHT_STAGE_MAX_TOKENS = 8_192;

function finalizeLocalJudgementResponse({
  state,
  response,
  expectedRoll,
  intents,
  combatIntent,
  reportedJudgementPatchCount
}: {
  state: RuntimeState;
  response: NarratorResponse;
  expectedRoll: number;
  intents: LocalJudgementIntent[];
  combatIntent?: JudgementResolutionEnvelope['combatIntent'];
  reportedJudgementPatchCount?: number;
}): {
  response: NarratorResponse;
  issues: string[];
  diagnostics: StoryDiagnosticIssue[];
  outcomeMismatchCheckIds: string[];
} {
  const issues: string[] = [];
  const diagnostics: StoryDiagnosticIssue[] = [];
  const outcomeMismatchCheckIds: string[] = [];
  if (intents.length > 1) {
    issues.push(`每回合最多一次判定，实际返回 ${intents.length} 次。`);
  }
  if (
    reportedJudgementPatchCount !== undefined &&
    reportedJudgementPatchCount > 1
  ) {
    issues.push(
      `主叙事回显了 ${reportedJudgementPatchCount} 条判定，但本回合只允许预检确认的一条判定。`
    );
  }
  if (combatIntent === 'none' && response.writeback.combatEventPatches.length > 0) {
    issues.push('判定预检未确认重大对抗，但主叙事返回了 combatEventPatches。');
  }
  if (
    combatIntent &&
    combatIntent !== 'none' &&
    response.writeback.combatEventPatches.length === 0
  ) {
    issues.push(`判定预检确认 ${combatIntent} 重大对抗，但主叙事缺少 combatEventPatches。`);
  }

  const allowedActorIds = new Set([
    ...Object.keys(state.actors),
    ...response.writeback.actorPatches.map((patch) => patch.actorId)
  ]);
  const allowedPlaceIds = new Set([
    ...Object.keys(state.places),
    ...response.writeback.placePatches.map((patch) => patch.placeId)
  ]);
  const allowedCaseIds = new Set([
    ...Object.keys(state.cases),
    ...response.writeback.casePatches.map((patch) => patch.caseId)
  ]);
  const resolvedChecks: unknown[] = [];
  for (const [patchIndex, patch] of intents.entries()) {
    if (patch.rulesetVersion !== LOCAL_JUDGEMENT_RULESET_VERSION) {
      issues.push(
        `判定 ${patch.checkId} 必须使用 rulesetVersion="${LOCAL_JUDGEMENT_RULESET_VERSION}"。`
      );
      continue;
    }
    const relatedActorIds = patch.relatedActorIds.filter((actorId) => {
      if (!allowedActorIds.has(actorId)) {
        diagnostics.push({
          path: ['writeback', 'judgementCheckPatches', patchIndex, 'relatedActorIds'],
          code: 'local_judgement_reference_removed',
          message: `判定 ${patch.checkId} 引用了不存在的人物 ${actorId}，已移除该引用。`
        });
        return false;
      }
      return true;
    });
    const relatedPlaceIds = patch.relatedPlaceIds.filter((placeId) => {
      if (!allowedPlaceIds.has(placeId)) {
        diagnostics.push({
          path: ['writeback', 'judgementCheckPatches', patchIndex, 'relatedPlaceIds'],
          code: 'local_judgement_reference_removed',
          message: `判定 ${patch.checkId} 引用了不存在的地点 ${placeId}，已移除该引用。`
        });
        return false;
      }
      return true;
    });
    const relatedCaseIds = patch.relatedCaseIds.filter((caseId) => {
      if (!allowedCaseIds.has(caseId)) {
        diagnostics.push({
          path: ['writeback', 'judgementCheckPatches', patchIndex, 'relatedCaseIds'],
          code: 'local_judgement_reference_removed',
          message: `判定 ${patch.checkId} 引用了不存在的案件 ${caseId}，已移除该引用。`
        });
        return false;
      }
      return true;
    });
    const resolution = resolveLocalJudgementIntent({
      state,
      intent: {
        ...patch,
        ...(patch.relatedCombatEventId
          ? {}
          : response.writeback.combatEventPatches.length === 1
            ? {
                relatedCombatEventId:
                  response.writeback.combatEventPatches[0].combatId
              }
            : {}),
        relatedActorIds,
        relatedPlaceIds,
        relatedCaseIds
      } as LocalJudgementIntent,
      expectedRoll
    });
    issues.push(...resolution.issues.map((issue) => `判定 ${patch.checkId}：${issue}`));
    diagnostics.push(
      ...resolution.diagnostics.map((diagnostic) => ({
        ...diagnostic,
        path: [
          'writeback',
          'judgementCheckPatches',
          patchIndex,
          ...diagnostic.path
        ]
      }))
    );
    if (resolution.outcomeMismatch) {
      outcomeMismatchCheckIds.push(patch.checkId);
    }
    if (resolution.check) resolvedChecks.push(resolution.check);
  }

  const checkIds = new Set([
    ...Object.keys(state.judgementChecks),
    ...resolvedChecks.map((check) => (check as { checkId: string }).checkId)
  ]);
  const normalizedCombatPatches = response.writeback.combatEventPatches.map(
    (combat, combatIndex) => {
      if (intents.length === 0) {
        issues.push(`对抗记录 ${combat.combatId} 缺少本回合本地判定。`);
        return combat;
      }
      const judgementCheckIds = combat.judgementCheckIds.filter((checkId) => {
        if (!checkIds.has(checkId)) {
          diagnostics.push({
            path: ['writeback', 'combatEventPatches', combatIndex, 'judgementCheckIds'],
            code: 'local_judgement_combat_reference_normalized',
            message: `对抗记录 ${combat.combatId} 引用了不存在的判定 ${checkId}，已移除该引用。`
          });
          return false;
        }
        return true;
      });
      for (const check of resolvedChecks as Array<{ checkId: string }>) {
        if (judgementCheckIds.includes(check.checkId)) continue;
        judgementCheckIds.push(check.checkId);
        diagnostics.push({
          path: ['writeback', 'combatEventPatches', combatIndex, 'judgementCheckIds'],
          code: 'local_judgement_combat_reference_normalized',
          message: `对抗记录 ${combat.combatId} 已绑定本回合规范判定 ${check.checkId}。`
        });
      }
      return {
        ...combat,
        judgementCheckIds
      };
    }
  );

  if (issues.length > 0) {
    return {
      response,
      issues,
      diagnostics,
      outcomeMismatchCheckIds
    };
  }
  const finalSchemaIssues: string[] = [];
  for (const [index, check] of resolvedChecks.entries()) {
    const parsed = canonicalLocalJudgementCheckSchema.safeParse(check);
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      finalSchemaIssues.push(
        `writeback.judgementCheckPatches.${index}.${issue.path.join('.')}：${issue.message}`
      );
    }
  }
  if (finalSchemaIssues.length > 0) {
    return {
      response,
      issues: finalSchemaIssues,
      diagnostics,
      outcomeMismatchCheckIds
    };
  }
  return {
    issues: [],
    diagnostics,
    outcomeMismatchCheckIds,
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        judgementCheckPatches:
          resolvedChecks as NarratorResponse['writeback']['judgementCheckPatches'],
        combatEventPatches: normalizedCombatPatches
      }
    }
  };
}

function structuredResponseFailureIssues(error: unknown): string[] {
  if (error instanceof NarratorAttemptError) {
    return [error.attempt.errorMessage ?? error.message];
  }
  const candidateIssues = (error as {
    issues?: Array<{ path?: PropertyKey[]; message?: string }>;
  } | null)?.issues;
  if (Array.isArray(candidateIssues) && candidateIssues.length > 0) {
    return candidateIssues.map((issue) => {
      const path = issue.path?.map(String).join('.') || 'response';
      return `${path}：${issue.message ?? '结构不符合合同'}`;
    });
  }
  return [error instanceof Error ? error.message : String(error)];
}

function reportedJudgementOutcomeFromRawPatches(
  patches: unknown[]
): ReturnType<typeof normalizeJudgementOutcome> {
  if (patches.length !== 1) return undefined;
  const patch = patches[0];
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return undefined;
  }
  return normalizeJudgementOutcome(
    (patch as Record<string, unknown>).outcome
  );
}

function appendJudgementRecoveryStage(
  trace: JudgementRecoveryTrace,
  stage: JudgementRecoveryStageRecord
): JudgementRecoveryTrace {
  return {
    ...trace,
    stages: [...trace.stages, stage],
    ...(stage.status === 'failed' ? { finishedAt: stage.occurredAt } : {})
  };
}

type CompatibleRepairDomain =
  | 'assetLifecycle'
  | 'civilianLivelihood'
  | 'incidentOrigin'
  | 'location'
  | 'playerClothing'
  | 'policeAssignment'
  | 'pregnancyLifecycle'
  | 'playerVitals'
  | 'relationshipThreads';

interface CompatibleWritebackRepairPlan {
  domains: CompatibleRepairDomain[];
  pregnancyLifecycleDecision: PregnancyLifecycleRepairDecision;
  playerVitalsDecision: PlayerVitalsRepairDecision;
  locationCandidatePlaceIds: string[];
  relationshipCandidateActorIds: string[];
  relationshipEvidenceActorIds: string[];
  relationshipCandidateThreadIds: string[];
  relationshipCandidateActorIdsByThreadId: Record<string, string[]>;
  relationshipOmissionCandidates: RelationshipOmissionCandidate[];
}

interface RelationshipOmissionCandidate {
  threadId: string;
  actorId: string;
  basisHint: 'repeated_contact' | 'ongoing_joint_matter';
  historicalEvidenceIds: string[];
  structuredSignals: string[];
}

interface ActorIdentityMergeDecision {
  sourceActorId: string;
  targetActorId: string;
  confidence: ActorIdentityMergeConfidence;
  canonicalName?: string;
  canonicalEnglishName?: string;
  aliases: string[];
  evidence: string[];
}

function appendDiagnosticsToLatestStoryEntry(state: RuntimeState, diagnostics: StoryDiagnosticIssue[]): RuntimeState {
  if (diagnostics.length === 0 || state.storyLog.length === 0) return state;

  const storyLog = [...state.storyLog];
  const latest = storyLog[storyLog.length - 1];
  storyLog[storyLog.length - 1] = {
    ...latest,
    writebackDiagnostics: [...(latest.writebackDiagnostics ?? []), ...diagnostics]
  };

  return {
    ...state,
    storyLog
  };
}

interface ForegroundWritebackTouches {
  actorIds: string[];
  directActorIds: string[];
  caseIds: string[];
  relationshipThreadIds: string[];
  cityTrackIds: string[];
  organizationIds: string[];
}

function collectForegroundWritebackTouches(
  response: NarratorResponse,
  actorIdAliases: Record<string, string>
): ForegroundWritebackTouches {
  const actorIds = new Set<string>();
  const directActorIds = new Set<string>();
  const caseIds = new Set<string>();
  const relationshipThreadIds = new Set<string>();
  const cityTrackIds = new Set<string>();
  const organizationIds = new Set<string>();
  const actorId = (id: string | undefined) => (id ? actorIdAliases[id] ?? id : undefined);
  const addActor = (id: string | undefined) => {
    const resolved = actorId(id);
    if (resolved) actorIds.add(resolved);
  };
  const addActors = (ids: string[] | undefined) => ids?.forEach(addActor);
  const addDirectActor = (id: string | undefined) => {
    const resolved = actorId(id);
    if (!resolved) return;
    actorIds.add(resolved);
    directActorIds.add(resolved);
  };
  const addDirectActors = (ids: string[] | undefined) => ids?.forEach(addDirectActor);
  const addCases = (ids: string[] | undefined) => ids?.forEach((id) => caseIds.add(id));
  const addOrganizations = (ids: string[] | undefined) => ids?.forEach((id) => organizationIds.add(id));

  response.writeback.actorPatches.forEach((patch) => {
    addDirectActor(patch.actorId);
    addOrganizations(patch.organizationIds);
    addOrganizations(patch.organizationRelations?.map((relation) => relation.organizationId));
  });
  response.writeback.actorMemories.forEach((patch) => addDirectActor(patch.actorId));
  response.writeback.pregnancyRiskPatches.forEach((patch) => {
    addDirectActor(patch.actorId);
    addActor(patch.fatherActorId);
  });
  response.writeback.pregnancyResolutionPatches.forEach((patch) => {
    addDirectActor(patch.actorId);
    addActor(patch.fatherActorId);
  });
  response.writeback.scenePatches.forEach((patch) => addDirectActors(patch.presentActorIds));
  response.writeback.casePatches.forEach((patch) => {
    caseIds.add(patch.caseId);
    addActor(patch.leadActorId);
    addActors(patch.relatedActorIds);
    addActors(patch.involvedActorIds);
    addOrganizations(patch.relatedOrganizationIds);
  });
  response.writeback.caseEvidencePatches.forEach((patch) => {
    caseIds.add(patch.caseId);
    addActor(patch.submittedByActorId);
    addActors(patch.relatedActorIds);
  });
  response.writeback.deferredEventPatches.forEach((patch) => {
    addActor(patch.relatedIds.actorId);
    if (patch.relatedIds.caseId) caseIds.add(patch.relatedIds.caseId);
    if (patch.relatedIds.organizationId) organizationIds.add(patch.relatedIds.organizationId);
  });
  response.writeback.currentMatterPatches.forEach((patch) => {
    addActors(patch.relatedActorIds);
    addCases(patch.relatedCaseIds);
    addOrganizations(patch.relatedOrganizationIds);
  });
  response.writeback.signalPatches.forEach((patch) => {
    addActors(patch.relatedActorIds);
    addCases(patch.relatedCaseIds);
    addOrganizations(patch.relatedOrganizationIds);
  });
  response.writeback.newsIssuePatches.forEach((patch) => {
    patch.articles.forEach((article) => {
      addActors(article.relatedActorIds);
      addCases(article.relatedCaseIds);
      addOrganizations(article.relatedOrganizationIds);
    });
  });
  response.writeback.relationshipThreadPatches.forEach((patch) => {
    relationshipThreadIds.add(patch.threadId);
    addDirectActor(patch.primaryActorId);
    addDirectActors(patch.relatedActorIds);
  });
  response.writeback.judgementCheckPatches.forEach((patch) => {
    addDirectActors(patch.relatedActorIds);
    addCases(patch.relatedCaseIds);
  });
  response.writeback.combatEventPatches.forEach((patch) => {
    addDirectActors(patch.relatedActorIds);
    patch.participants.forEach((participant) => addDirectActor(participant.actorId));
    addCases(patch.relatedCaseIds);
  });
  response.writeback.organizationPatches.forEach((patch) => {
    organizationIds.add(patch.organizationId);
    addActors(patch.relatedActorIds);
    addCases(patch.relatedCaseIds);
  });
  response.writeback.citySituationTrackPatches.forEach((patch) => {
    cityTrackIds.add(patch.trackId);
    addOrganizations(patch.relatedOrganizationIds);
  });
  response.writeback.grayNetworkPatches.forEach((patch) => {
    addOrganizations(patch.knownOrganizations?.flatMap((organization) => organization.organizationId ? [organization.organizationId] : []));
    patch.keyPlaces?.forEach((place) => addOrganizations(place.relatedOrganizationIds));
    patch.relatedPeople?.forEach((person) => addOrganizations(person.relatedOrganizationIds));
    patch.relationClues?.forEach((clue) => addOrganizations(clue.relatedOrganizationIds));
  });

  return {
    actorIds: [...actorIds],
    directActorIds: [...directActorIds],
    caseIds: [...caseIds],
    relationshipThreadIds: [...relationshipThreadIds],
    cityTrackIds: [...cityTrackIds],
    organizationIds: [...organizationIds]
  };
}

function collectDueDeferredEventDiagnostics(
  dueEvents: DeferredEvent[],
  deferredEventPatches: Array<{ eventId: string; status?: 'pending' | 'resolved' | 'cancelled'; triggerAt?: GameTime }>,
  currentTime: GameTime
): StoryDiagnosticIssue[] {
  if (dueEvents.length === 0) return [];

  const patchesByEventId = new Map(deferredEventPatches.map((patch) => [patch.eventId, patch]));
  const diagnostics: StoryDiagnosticIssue[] = [];

  for (const event of dueEvents) {
    const patch = patchesByEventId.get(event.eventId);
    if (!patch) {
      diagnostics.push({
        path: ['writeback', 'deferredEventPatches', event.eventId],
        code: 'unhandled_due_deferred_event',
        message: `Due deferred event "${event.eventId}" was projected into the prompt but no deferredEventPatches item handled it.`
      });
      continue;
    }

    if ((patch.status ?? 'pending') === 'pending' && (!patch.triggerAt || isGameTimeDue(patch.triggerAt, currentTime))) {
      diagnostics.push({
        path: ['writeback', 'deferredEventPatches', event.eventId, 'triggerAt'],
        code: 'unhandled_due_deferred_event',
        message: `Due deferred event "${event.eventId}" remained pending without a later triggerAt.`
      });
    }
  }

  return diagnostics;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function addMinutes(time: GameTime, elapsedMinutes: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute + elapsedMinutes));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

function gameTimeToUtcMs(time: GameTime): number {
  return Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute);
}

function getTurnEndTime(startTime: GameTime, response: NarratorResponse): GameTime {
  const timePatch = response.timePatch;
  if (!timePatch) return { ...startTime };

  const elapsedTime =
    timePatch.elapsedMinutes === undefined ? undefined : addMinutes(startTime, timePatch.elapsedMinutes);
  if (!timePatch.targetTime) return elapsedTime ?? { ...startTime };

  const targetTime = { ...timePatch.targetTime };
  if (gameTimeToUtcMs(targetTime) >= gameTimeToUtcMs(startTime)) return targetTime;

  return elapsedTime ?? { ...startTime };
}

function createDeferredEventRepairPrompt(
  dueEvents: DeferredEvent[],
  response: NarratorResponse,
  turnEndTime: GameTime,
  playerInput: string,
  promptSettings?: PromptSettings
): string {
  return [
    resolvePromptText('repair.deferredEvent', promptSettings),
    '主叙事模型已经输出正文，但遗漏或错误顺延了到期 deferredEvent 的 deferredEventPatches。',
    '请根据到期事件、玩家行动和主叙事写回，返回 JSON：{"deferredEventPatches":[...]}。',
    '规则：',
    '每个 patch 必须包含 eventId、sourceModule、relatedIds、title、summary、triggerAt、visibility、promptInstruction、status。',
    '',
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `dueEvents=${JSON.stringify(dueEvents)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        casePatches: response.writeback.casePatches,
        caseEvidencePatches: response.writeback.caseEvidencePatches,
        deferredEventPatches: response.writeback.deferredEventPatches
      }
    })}`
  ].join('\n');
}

function parseDeferredEventRepairResponse(
  value: unknown,
  dueEvents: DeferredEvent[]
): { patches: DeferredEventPatch[]; diagnostics: StoryDiagnosticIssue[] } {
  const dueEventIds = new Set(dueEvents.map((event) => event.eventId));
  const diagnostics: StoryDiagnosticIssue[] = [];
  let rawPatches: unknown;

  if (isRecord(value) && Array.isArray(value.deferredEventPatches)) {
    rawPatches = value.deferredEventPatches;
  } else if (isRecord(value) && isRecord(value.writeback) && Array.isArray(value.writeback.deferredEventPatches)) {
    rawPatches = value.writeback.deferredEventPatches;
  }

  if (!Array.isArray(rawPatches)) {
    return {
      patches: [],
      diagnostics: [
        {
          path: ['writebackRepair', 'deferredEventPatches'],
          code: 'writeback_repair_invalid',
          message: 'Writeback repair did not return a deferredEventPatches array.'
        }
      ]
    };
  }

  const patches: DeferredEventPatch[] = [];
  rawPatches.forEach((item, index) => {
    const parsed = deferredEventPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'deferredEventPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }

    if (!dueEventIds.has(parsed.data.eventId)) {
      diagnostics.push({
        path: ['writebackRepair', 'deferredEventPatches', index, 'eventId'],
        code: 'writeback_repair_unrelated_event',
        message: `Writeback repair returned unrelated deferred event "${parsed.data.eventId}".`
      });
      return;
    }

    patches.push(parsed.data);
  });

  return { patches, diagnostics };
}

function mergeDeferredEventPatches(response: NarratorResponse, patches: DeferredEventPatch[]): NarratorResponse {
  if (patches.length === 0) return response;

  const merged = new Map(response.writeback.deferredEventPatches.map((patch) => [patch.eventId, patch]));
  for (const patch of patches) {
    merged.set(patch.eventId, patch);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      deferredEventPatches: [...merged.values()]
    }
  };
}

function parseRawObject(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function rawActorPatchesFromResponse(value: unknown): unknown[] {
  const parsed = parseRawObject(value);
  if (!isRecord(parsed) || !isRecord(parsed.writeback) || !Array.isArray(parsed.writeback.actorPatches)) {
    return [];
  }

  return parsed.writeback.actorPatches;
}

function issuePathStartsWith(path: Array<string | number>, prefix: Array<string | number>): boolean {
  return prefix.every((segment, index) => path[index] === segment);
}

function parsePathIndex(value: string | number | undefined): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;

  return Number(value);
}

function collectRepairableActorPatchIndices(
  warnings: StoryDiagnosticIssue[] | undefined,
  rawActorPatches: unknown[]
): number[] {
  if (!warnings?.length || rawActorPatches.length === 0) return [];

  let repairAll = false;
  const indices = new Set<number>();
  for (const warning of warnings) {
    if (!issuePathStartsWith(warning.path, ['writeback', 'actorPatches'])) continue;

    const index = parsePathIndex(warning.path[2]);
    if (index === undefined) {
      repairAll = true;
      continue;
    }
    if (index < rawActorPatches.length) indices.add(index);
  }

  return repairAll ? rawActorPatches.map((_, index) => index) : [...indices];
}

function actorPatchId(value: unknown): string | undefined {
  return isRecord(value) && typeof value.actorId === 'string' && value.actorId.trim() ? value.actorId : undefined;
}

function createActorPatchRepairPrompt({
  actorPatches,
  warnings,
  newActorRepairRequirements,
  playerInput,
  promptSettings
}: {
  actorPatches: unknown[];
  warnings: StoryDiagnosticIssue[];
  newActorRepairRequirements: Array<{
    actorId: string;
    missingMinimumFields: string[];
    schemaIssues: Array<{ path: string; message: string }>;
  }>;
  playerInput: string;
  promptSettings?: PromptSettings;
}): string {
  return [
    resolvePromptText('repair.actorPatch', promptSettings),
    '主叙事模型已经输出正文。你只负责修复未通过本地结构校验、或缺少最低创建字段的 actorPatch。',
    '请返回 JSON：{"actorPatches":[{"actorId":"...", "仅返回需要修正的字段":"..."}]}。',
    '规则：',
    '1. 这是轻量结构修复，不是人物重建，也不是身份审核。禁止重新生成完整人物档案。',
    '2. 每个修复项必须保留原 actorId，只返回 validationWarnings 或 newActorRepairRequirements 明确指出的字段。系统会把修复字段合并回主叙事原始 actorPatch。',
    '3. 主叙事首次创建 NPC 时仍应输出完整人物档案；本地最低放行合同只是异常容错，不代表可以主动省略档案。',
    '4. 新 NPC 的最低创建条件为：非空 name、明确 gender（不得为 unknown）、有效年龄锚点（合法 birthDate 或 0—130 的整数 computedAge），以及 currentIdentity / publicIdentity 至少一项。缺少其中任一项都不得创建。',
    '5. 不要新增 personality、speechStyle、motivation、longTermGoal、values、relationships、secrets、inventory 或背景故事，除非它本来就存在且是被点名的结构错误字段。',
    '6. 场景称呼或外号如果需要修正，只放进 callName / aliases；不能凭空编造正式姓名。',
    'actorPatch.presence 只允许 present / nearby / mentioned / absent；远场人物使用 mentioned 或 absent，不得返回 remote。',
    'equipment 如果过长，保留最能代表当前随身装备的项目，其余可省略。',
    '重复人物检测与 canonical actorId 决策由独立 Actor Identity Review 负责；本任务不得合并、拒绝或改写人物身份。',
    '',
    `playerInput=${JSON.stringify(playerInput)}`,
    `newActorRepairRequirements=${JSON.stringify(newActorRepairRequirements)}`,
    `validationWarnings=${JSON.stringify(warnings)}`,
    `actorPatches=${JSON.stringify(actorPatches)}`
  ].join('\n');
}

interface ActorPatchRepairResult {
  patches: ActorPatch[];
  approvedNewActorIds: Set<string>;
  diagnostics: StoryDiagnosticIssue[];
}

function mergeActorPatchRepair(original: unknown, repair: ActorPatch): unknown {
  if (!isRecord(original)) return repair;

  const mergeRecordField = (key: keyof ActorPatch) => {
    const originalValue = original[key];
    const repairedValue = repair[key];
    return isRecord(originalValue) && isRecord(repairedValue)
      ? { ...originalValue, ...repairedValue }
      : repairedValue ?? originalValue;
  };

  return {
    ...original,
    ...repair,
    actorId: repair.actorId,
    attributes: mergeRecordField('attributes'),
    roleProfiles: mergeRecordField('roleProfiles'),
    worldpackActorData: mergeRecordField('worldpackActorData')
  };
}

function parseActorPatchRepairResponse(
  value: unknown,
  requestedActorIds: Set<string>,
  newActorRepairOriginals: Map<string, unknown>,
  newActorRepairTimes: Map<string, GameTime>
): ActorPatchRepairResult {
  const root = isRecord(value) && isRecord(value.writeback) ? value.writeback : value;
  const rawPatches = isRecord(root) ? root.actorPatches : undefined;
  const patches: ActorPatch[] = [];
  const approvedNewActorIds = new Set<string>();
  const diagnostics: StoryDiagnosticIssue[] = [];

  if (Array.isArray(rawPatches)) rawPatches.forEach((item, index) => {
    const parsed = actorPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'actorPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }

    if (requestedActorIds.size > 0 && !requestedActorIds.has(parsed.data.actorId)) {
      diagnostics.push({
        path: ['writebackRepair', 'actorPatches', index, 'actorId'],
        code: 'writeback_repair_unrelated_actor',
        message: `Writeback repair returned unrelated actor "${parsed.data.actorId}".`
      });
      return;
    }

    const original = newActorRepairOriginals.get(parsed.data.actorId);
    if (!original) {
      patches.push(parsed.data);
      return;
    }

    const merged = actorPatchSchema.safeParse(mergeActorPatchRepair(original, parsed.data));
    if (!merged.success) {
      for (const issue of merged.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'actorPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    const sourceGameTime = newActorRepairTimes.get(parsed.data.actorId);
    if (!sourceGameTime) {
      diagnostics.push({
        path: ['writebackRepair', 'actorPatches', index],
        code: 'actor_minimum_creation_repair_context_missing',
        message: `Lightweight actor repair for "${parsed.data.actorId}" was ignored because its source game time is unavailable.`
      });
      return;
    }
    const missingMinimumFields = missingMinimumNewActorFields(merged.data, sourceGameTime);
    if (missingMinimumFields.length > 0) {
      diagnostics.push({
        path: ['writebackRepair', 'actorPatches', index],
        code: 'actor_minimum_creation_repair_incomplete',
        message: `Lightweight actor repair for "${parsed.data.actorId}" is still missing minimum creation fields: ${missingMinimumFields.join(', ')}.`
      });
      return;
    }

    patches.push(merged.data);
    approvedNewActorIds.add(parsed.data.actorId);
  });

  if (!Array.isArray(rawPatches)) {
    diagnostics.push({
      path: ['writebackRepair', 'actorPatches'],
      code: 'writeback_repair_invalid',
      message: 'Lightweight actor repair did not return an actorPatches array.'
    });
  }

  return { patches, approvedNewActorIds, diagnostics };
}

function mergeActorPatches(response: NarratorResponse, patches: ActorPatch[]): NarratorResponse {
  if (patches.length === 0) return response;

  const merged = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
  for (const patch of patches) {
    merged.set(patch.actorId, patch);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorPatches: [...merged.values()]
    }
  };
}

interface ActorWritebackRecoveryPayload {
  actorPatch: unknown;
  actorMemories: ActorMemorySuggestion[];
  relationshipThreadPatches: RelationshipThreadPatch[];
  pregnancyRiskPatches: PregnancyRiskPatch[];
  pregnancyResolutionPatches: PregnancyResolutionPatch[];
}

type ActorWritebackRecoverySourceKind = 'history' | 'pending' | 'current';

interface ActorWritebackRecoveryCandidate extends ActorWritebackRecoveryPayload {
  recoveryId: string;
  sourceTurnId: string;
  sourceGameTime: GameTime;
  actorId: string;
  attemptCount: number;
  sourceKind: ActorWritebackRecoverySourceKind;
  lastAttemptTurn?: number;
  nextRetryTurn?: number;
  consecutiveFailureCount: number;
  lastFailureKind?: PendingActorWritebackRecovery['lastFailureKind'];
  lastRouteMode?: PendingActorWritebackRecovery['lastRouteMode'];
}

const ACTOR_RECOVERY_BATCH_SIZE = 2;
const ACTOR_RECOVERY_MAX_BACKOFF_TURNS = 8;
const MAX_DURABLE_NEW_ACTORS_PER_TURN = 3;

function rawWritebackArray(value: unknown, key: string): unknown[] {
  const parsed = parseRawObject(value);
  if (!isRecord(parsed) || !isRecord(parsed.writeback)) return [];

  const array = parsed.writeback[key];
  return Array.isArray(array) ? array : [];
}

function normalizeActorRecoveryPatch(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const normalized: Record<string, unknown> = { ...value };
  if (typeof normalized.name === 'string') normalized.name = normalized.name.trim();
  if (typeof normalized.publicIdentity === 'string') {
    normalized.publicIdentity = normalized.publicIdentity.trim();
  }
  if (typeof normalized.computedAge === 'string') {
    const ageText = normalized.computedAge.trim();
    const age = Number(ageText);
    if (ageText && Number.isInteger(age) && age >= 0 && age <= 130) {
      normalized.computedAge = age;
    }
  }
  if (typeof normalized.gender === 'string') {
    const gender = normalized.gender.trim().toLowerCase().replace(/[\s_-]+/g, '');
    if (['male', 'man', 'm', '男', '男性'].includes(gender)) normalized.gender = 'male';
    else if (['female', 'woman', 'f', '女', '女性'].includes(gender)) normalized.gender = 'female';
    else if (['nonbinary', '非二元'].includes(gender)) normalized.gender = 'nonbinary';
  }
  return normalized;
}

function uniqueActorMemories(memories: ActorMemorySuggestion[]): ActorMemorySuggestion[] {
  const merged = new Map<string, ActorMemorySuggestion>();
  for (const memory of memories) {
    merged.set(`${memory.actorId}\u0000${memory.text}`, memory);
  }
  return [...merged.values()];
}

function uniqueRelationshipThreadPatches(patches: RelationshipThreadPatch[]): RelationshipThreadPatch[] {
  const merged = new Map<string, RelationshipThreadPatch>();
  for (const patch of patches) {
    merged.set(patch.threadId, patch);
  }
  return [...merged.values()];
}

function uniquePregnancyRiskPatches(patches: PregnancyRiskPatch[]): PregnancyRiskPatch[] {
  const merged = new Map<string, PregnancyRiskPatch>();
  for (const patch of patches) {
    const paternityKey = (patch.paternityCandidates ?? [])
      .map((candidate) => `${candidate.actorId ?? ''}|${candidate.name ?? ''}|${candidate.visibility ?? ''}`)
      .sort()
      .join('\u0001');
    merged.set(
      `${patch.actorId}\u0000${patch.fatherActorId ?? ''}\u0000${paternityKey}\u0000${patch.riskType}\u0000${patch.summary}`,
      patch
    );
  }
  return [...merged.values()];
}

function uniquePregnancyResolutionPatches(patches: PregnancyResolutionPatch[]): PregnancyResolutionPatch[] {
  const merged = new Map<string, PregnancyResolutionPatch>();
  for (const patch of patches) {
    merged.set(`${patch.actorId}\u0000${patch.fatherActorId ?? ''}\u0000${patch.outcome}\u0000${patch.summary}`, patch);
  }
  return [...merged.values()];
}

function parseActorMemoriesForRecovery(value: unknown, actorId: string): ActorMemorySuggestion[] {
  return rawWritebackArray(value, 'actorMemories').flatMap((item) => {
    const parsed = actorMemorySuggestionSchema.safeParse(item);
    return parsed.success && parsed.data.actorId === actorId ? [parsed.data] : [];
  });
}

function relationshipPatchReferencesActor(patch: RelationshipThreadPatch, actorId: string): boolean {
  return patch.primaryActorId === actorId || patch.relatedActorIds?.includes(actorId) === true;
}

function relationshipPatchActorIds(patch: RelationshipThreadPatch): string[] {
  return uniqueStrings([patch.primaryActorId, ...(patch.relatedActorIds ?? [])]);
}

function pregnancyPatchActorIds(patch: PregnancyRiskPatch | PregnancyResolutionPatch): string[] {
  return uniqueStrings([
    patch.actorId,
    patch.fatherActorId,
    ...('paternityCandidates' in patch
      ? (patch.paternityCandidates ?? []).map((candidate) => candidate.actorId)
      : [])
  ]);
}

function withholdNewActorWritebacks(response: NarratorResponse, actorIds: Set<string>): NarratorResponse {
  if (actorIds.size === 0) return response;

  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorPatches: response.writeback.actorPatches.filter((patch) => !actorIds.has(patch.actorId)),
      actorMemories: response.writeback.actorMemories.filter((memory) => !actorIds.has(memory.actorId)),
      relationshipThreadPatches: response.writeback.relationshipThreadPatches.filter(
        (patch) => ![...actorIds].some((actorId) => relationshipPatchReferencesActor(patch, actorId))
      ),
      pregnancyRiskPatches: response.writeback.pregnancyRiskPatches.filter(
        (patch) => !pregnancyPatchActorIds(patch).some((actorId) => actorIds.has(actorId))
      ),
      pregnancyResolutionPatches: response.writeback.pregnancyResolutionPatches.filter(
        (patch) => !pregnancyPatchActorIds(patch).some((actorId) => actorIds.has(actorId))
      )
    }
  };
}

function parseRelationshipPatchesForRecovery(value: unknown, actorId: string): RelationshipThreadPatch[] {
  return rawWritebackArray(value, 'relationshipThreadPatches').flatMap((item) => {
    const parsed = relationshipThreadPatchSchema.safeParse(item);
    return parsed.success && relationshipPatchReferencesActor(parsed.data, actorId) ? [parsed.data] : [];
  });
}

function parsePregnancyRiskPatchesForRecovery(value: unknown, actorId: string): PregnancyRiskPatch[] {
  return rawWritebackArray(value, 'pregnancyRiskPatches').flatMap((item) => {
    const parsed = pregnancyRiskPatchSchema.safeParse(item);
    return parsed.success && pregnancyPatchActorIds(parsed.data).includes(actorId) ? [parsed.data] : [];
  });
}

function parsePregnancyResolutionPatchesForRecovery(value: unknown, actorId: string): PregnancyResolutionPatch[] {
  return rawWritebackArray(value, 'pregnancyResolutionPatches').flatMap((item) => {
    const parsed = pregnancyResolutionPatchSchema.safeParse(item);
    return parsed.success && pregnancyPatchActorIds(parsed.data).includes(actorId) ? [parsed.data] : [];
  });
}

function createActorRecoveryCandidate({
  state,
  sourceTurnId,
  sourceGameTime,
  rawResponse,
  actorPatch,
  sourceKind,
  attemptCount = 0,
  recoveryId,
  lastAttemptTurn,
  nextRetryTurn,
  consecutiveFailureCount = 0,
  lastFailureKind,
  lastRouteMode
}: {
  state: RuntimeState;
  sourceTurnId: string;
  sourceGameTime: GameTime;
  rawResponse: unknown;
  actorPatch: unknown;
  sourceKind: ActorWritebackRecoverySourceKind;
  attemptCount?: number;
  recoveryId?: string;
  lastAttemptTurn?: number;
  nextRetryTurn?: number;
  consecutiveFailureCount?: number;
  lastFailureKind?: PendingActorWritebackRecovery['lastFailureKind'];
  lastRouteMode?: PendingActorWritebackRecovery['lastRouteMode'];
}): ActorWritebackRecoveryCandidate | undefined {
  const actorId = actorPatchId(actorPatch);
  if (!actorId || state.actors[actorId]) return undefined;

  return {
    recoveryId: recoveryId ?? `${sourceTurnId}:${actorId}`,
    sourceTurnId,
    sourceGameTime: { ...sourceGameTime },
    actorId,
    actorPatch: normalizeActorRecoveryPatch(actorPatch),
    actorMemories: parseActorMemoriesForRecovery(rawResponse, actorId),
    relationshipThreadPatches: parseRelationshipPatchesForRecovery(rawResponse, actorId),
    pregnancyRiskPatches: parsePregnancyRiskPatchesForRecovery(rawResponse, actorId),
    pregnancyResolutionPatches: parsePregnancyResolutionPatchesForRecovery(rawResponse, actorId),
    attemptCount,
    sourceKind,
    lastAttemptTurn,
    nextRetryTurn,
    consecutiveFailureCount,
    lastFailureKind,
    lastRouteMode
  };
}

function parsePendingActorRecovery(
  state: RuntimeState,
  pending: PendingActorWritebackRecovery
): ActorWritebackRecoveryCandidate | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(pending.writebackJson);
  } catch {
    return undefined;
  }
  if (!isRecord(payload)) return undefined;

  return createActorRecoveryCandidate({
    state,
    sourceTurnId: pending.sourceTurnId,
    sourceGameTime: pending.sourceGameTime,
    rawResponse: {
      writeback: {
        actorMemories: Array.isArray(payload.actorMemories) ? payload.actorMemories : [],
        relationshipThreadPatches: Array.isArray(payload.relationshipThreadPatches)
          ? payload.relationshipThreadPatches
          : [],
        pregnancyRiskPatches: Array.isArray(payload.pregnancyRiskPatches) ? payload.pregnancyRiskPatches : [],
        pregnancyResolutionPatches: Array.isArray(payload.pregnancyResolutionPatches)
          ? payload.pregnancyResolutionPatches
          : []
      }
    },
    actorPatch: payload.actorPatch,
    sourceKind: 'pending',
    attemptCount: pending.attemptCount,
    recoveryId: pending.recoveryId,
    lastAttemptTurn: pending.lastAttemptTurn,
    nextRetryTurn: pending.nextRetryTurn,
    consecutiveFailureCount: pending.consecutiveFailureCount ?? 0,
    lastFailureKind: pending.lastFailureKind,
    lastRouteMode: pending.lastRouteMode
  });
}

function mergeActorRecoveryCandidate(
  previous: ActorWritebackRecoveryCandidate | undefined,
  next: ActorWritebackRecoveryCandidate
): ActorWritebackRecoveryCandidate {
  if (!previous) return next;

  const retryMetadata = next.sourceKind === 'pending' ? next : previous.sourceKind === 'pending' ? previous : undefined;

  return {
    ...previous,
    sourceTurnId: next.sourceTurnId,
    sourceGameTime: next.sourceGameTime,
    actorPatch: next.actorPatch,
    actorMemories: uniqueActorMemories([...previous.actorMemories, ...next.actorMemories]),
    relationshipThreadPatches: uniqueRelationshipThreadPatches([
      ...previous.relationshipThreadPatches,
      ...next.relationshipThreadPatches
    ]),
    pregnancyRiskPatches: uniquePregnancyRiskPatches([
      ...previous.pregnancyRiskPatches,
      ...next.pregnancyRiskPatches
    ]),
    pregnancyResolutionPatches: uniquePregnancyResolutionPatches([
      ...previous.pregnancyResolutionPatches,
      ...next.pregnancyResolutionPatches
    ]),
    attemptCount: Math.max(previous.attemptCount, next.attemptCount),
    sourceKind: next.sourceKind,
    recoveryId: retryMetadata?.recoveryId ?? next.recoveryId,
    lastAttemptTurn: retryMetadata?.lastAttemptTurn,
    nextRetryTurn: retryMetadata?.nextRetryTurn,
    consecutiveFailureCount: retryMetadata?.consecutiveFailureCount ?? 0,
    lastFailureKind: retryMetadata?.lastFailureKind,
    lastRouteMode: retryMetadata?.lastRouteMode
  };
}

function collectActorRecoveryCandidates({
  state,
  rawResponse
}: {
  state: RuntimeState;
  rawResponse: unknown;
}): ActorWritebackRecoveryCandidate[] {
  const candidates = new Map<string, ActorWritebackRecoveryCandidate>();
  const addCandidate = (candidate: ActorWritebackRecoveryCandidate | undefined) => {
    if (!candidate) return;
    candidates.set(candidate.actorId, mergeActorRecoveryCandidate(candidates.get(candidate.actorId), candidate));
  };

  for (const entry of state.storyLog.slice(-30)) {
    if (entry.speaker !== 'narrator' || !entry.rawNarratorResponse) continue;
    for (const actorPatch of rawActorPatchesFromResponse(entry.rawNarratorResponse)) {
      addCandidate(
        createActorRecoveryCandidate({
          state,
          sourceTurnId: entry.turnId,
          sourceGameTime: entry.gameTime,
          rawResponse: entry.rawNarratorResponse,
          actorPatch,
          sourceKind: 'history'
        })
      );
    }
  }

  for (const pending of state.pendingActorWritebackRecoveries ?? []) {
    addCandidate(parsePendingActorRecovery(state, pending));
  }

  const sourceTurnId = `turn_${String(state.turnCounter + 1).padStart(4, '0')}`;
  for (const actorPatch of rawActorPatchesFromResponse(rawResponse)) {
    addCandidate(
      createActorRecoveryCandidate({
        state,
        sourceTurnId,
        sourceGameTime: state.time,
        rawResponse,
        actorPatch,
        sourceKind: 'current'
      })
    );
  }

  return [...candidates.values()];
}

function mergeRecoveredActorDependencies(
  state: RuntimeState,
  response: NarratorResponse,
  candidates: ActorWritebackRecoveryCandidate[],
  repairedActorIds: Set<string>
): NarratorResponse {
  const restoredMemories = candidates
    .filter((candidate) => repairedActorIds.has(candidate.actorId))
    .flatMap((candidate) => candidate.actorMemories);
  const restoredThreads = candidates
    .filter((candidate) => repairedActorIds.has(candidate.actorId))
    .flatMap((candidate) => candidate.relationshipThreadPatches);
  const restoredPregnancyRisks = candidates
    .filter((candidate) => repairedActorIds.has(candidate.actorId))
    .flatMap((candidate) => candidate.pregnancyRiskPatches);
  const restoredPregnancyResolutions = candidates
    .filter((candidate) => repairedActorIds.has(candidate.actorId))
    .flatMap((candidate) => candidate.pregnancyResolutionPatches);
  const availableActorIds = new Set([
    state.player.actorId,
    'player',
    ...Object.keys(state.actors),
    ...repairedActorIds
  ]);
  const safeThreads = restoredThreads.filter((patch) =>
    relationshipPatchActorIds(patch).every((actorId) => availableActorIds.has(actorId))
  );
  const safePregnancyRisks = restoredPregnancyRisks.filter((patch) =>
    pregnancyPatchActorIds(patch).every((actorId) => availableActorIds.has(actorId))
  );
  const safePregnancyResolutions = restoredPregnancyResolutions.filter((patch) =>
    pregnancyPatchActorIds(patch).every((actorId) => availableActorIds.has(actorId))
  );
  if (
    restoredMemories.length === 0 &&
    safeThreads.length === 0 &&
    safePregnancyRisks.length === 0 &&
    safePregnancyResolutions.length === 0
  ) {
    return response;
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorMemories: uniqueActorMemories([...response.writeback.actorMemories, ...restoredMemories]),
      relationshipThreadPatches: uniqueRelationshipThreadPatches([
        ...response.writeback.relationshipThreadPatches,
        ...safeThreads
      ]),
      pregnancyRiskPatches: uniquePregnancyRiskPatches([
        ...response.writeback.pregnancyRiskPatches,
        ...safePregnancyRisks
      ]),
      pregnancyResolutionPatches: uniquePregnancyResolutionPatches([
        ...response.writeback.pregnancyResolutionPatches,
        ...safePregnancyResolutions
      ])
    }
  };
}

function serializePendingActorRecovery(
  candidate: ActorWritebackRecoveryCandidate,
  overrides: Partial<
    Pick<
      PendingActorWritebackRecovery,
      | 'attemptCount'
      | 'lastAttemptTurn'
      | 'nextRetryTurn'
      | 'consecutiveFailureCount'
      | 'lastFailureKind'
      | 'lastRouteMode'
    >
  > = {}
): PendingActorWritebackRecovery {
  return {
    recoveryId: candidate.recoveryId,
    sourceTurnId: candidate.sourceTurnId,
    sourceGameTime: { ...candidate.sourceGameTime },
    actorId: candidate.actorId,
    writebackJson: JSON.stringify({
      actorPatch: candidate.actorPatch,
      actorMemories: candidate.actorMemories,
      relationshipThreadPatches: candidate.relationshipThreadPatches,
      pregnancyRiskPatches: candidate.pregnancyRiskPatches,
      pregnancyResolutionPatches: candidate.pregnancyResolutionPatches
    } satisfies ActorWritebackRecoveryPayload),
    attemptCount: overrides.attemptCount ?? candidate.attemptCount,
    lastAttemptTurn: overrides.lastAttemptTurn ?? candidate.lastAttemptTurn,
    nextRetryTurn: overrides.nextRetryTurn ?? candidate.nextRetryTurn,
    consecutiveFailureCount: overrides.consecutiveFailureCount ?? candidate.consecutiveFailureCount,
    lastFailureKind: overrides.lastFailureKind ?? candidate.lastFailureKind,
    lastRouteMode: overrides.lastRouteMode ?? candidate.lastRouteMode
  };
}

function actorRecoveryCandidateName(candidate: ActorWritebackRecoveryCandidate): string | undefined {
  if (!isRecord(candidate.actorPatch) || typeof candidate.actorPatch.name !== 'string') return undefined;
  const normalized = candidate.actorPatch.name.trim().toLocaleLowerCase().replace(/\s+/g, '');
  return normalized || undefined;
}

function selectActorRecoveryBatch(
  candidates: ActorWritebackRecoveryCandidate[],
  upcomingTurn: number
): ActorWritebackRecoveryCandidate[] {
  const ordered = [...candidates].sort((left, right) => {
    const priority = (candidate: ActorWritebackRecoveryCandidate) =>
      candidate.sourceKind === 'current' ? 0 : candidate.sourceKind === 'pending' ? 1 : 2;
    return priority(left) - priority(right) || left.sourceTurnId.localeCompare(right.sourceTurnId);
  });
  const selected: ActorWritebackRecoveryCandidate[] = [];
  const selectedNames = new Set<string>();
  for (const candidate of ordered) {
    if (selected.length >= ACTOR_RECOVERY_BATCH_SIZE) break;
    const retryIsDue = candidate.sourceKind === 'current' || (candidate.nextRetryTurn ?? 0) <= upcomingTurn;
    if (!retryIsDue) continue;
    const name = actorRecoveryCandidateName(candidate);
    if (name && selectedNames.has(name)) continue;
    selected.push(candidate);
    if (name) selectedNames.add(name);
  }
  return selected;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : error instanceof Error && error.name === 'AbortError';
}

function isTransientActorRepairError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|fetch failed|network|econn|enotfound|timeout|timed out|http\s*5\d\d|status\s*5\d\d/i.test(
    message
  );
}

function actorRecoveryBackoffTurns(consecutiveFailureCount: number): number {
  return Math.min(ACTOR_RECOVERY_MAX_BACKOFF_TURNS, 2 ** Math.min(3, Math.max(1, consecutiveFailureCount)));
}

function parseMinimumCreatableActorPatch(candidate: ActorWritebackRecoveryCandidate): ActorPatch | undefined {
  const parsed = actorPatchSchema.safeParse(candidate.actorPatch);
  if (!parsed.success || missingMinimumNewActorFields(parsed.data, candidate.sourceGameTime).length > 0) return undefined;
  return parsed.data;
}

async function repairActorPatches({
  state,
  rawResponse,
  response,
  playerInput,
  writebackRepair,
  writebackRepairFallback,
  primaryRouteMode,
  promptSettings,
  repairRequestPurpose = 'main_turn_actor_writeback_repair'
}: {
  state: RuntimeState;
  rawResponse: unknown;
  response: NarratorResponse;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
  writebackRepairFallback?: NarratorClient | null;
  primaryRouteMode: PendingActorWritebackRecovery['lastRouteMode'];
  promptSettings?: PromptSettings;
  repairRequestPurpose?: NarratorRequestPurpose;
}): Promise<{ state: RuntimeState; response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  const rawActorPatches = rawActorPatchesFromResponse(rawResponse);
  const currentNewActorIds = uniqueStrings(
    rawActorPatches
      .map((patch) => actorPatchId(patch))
      .filter((actorId): actorId is string => Boolean(actorId && !state.actors[actorId]))
  );
  const allowedCurrentNewActorIds = new Set(
    currentNewActorIds.slice(0, MAX_DURABLE_NEW_ACTORS_PER_TURN)
  );
  const overflowCurrentNewActorIds = new Set(
    currentNewActorIds.slice(MAX_DURABLE_NEW_ACTORS_PER_TURN)
  );
  const repairIndices = collectRepairableActorPatchIndices(response.validationWarnings, rawActorPatches);
  const scopedRawResponse = overflowCurrentNewActorIds.size
    ? {
        ...(isRecord(rawResponse) ? rawResponse : {}),
        writeback: {
          ...(isRecord(rawResponse) && isRecord(rawResponse.writeback) ? rawResponse.writeback : {}),
          actorPatches: rawActorPatches.filter((patch) => {
            const actorId = actorPatchId(patch);
            return !actorId || state.actors[actorId] || allowedCurrentNewActorIds.has(actorId);
          })
        }
      }
    : rawResponse;
  const recoveryCandidates = collectActorRecoveryCandidates({ state, rawResponse: scopedRawResponse });
  const allRecoveryActorIds = new Set(recoveryCandidates.map((candidate) => candidate.actorId));
  const directlyCreatablePatches = new Map<string, ActorPatch>();
  const repairCandidates: ActorWritebackRecoveryCandidate[] = [];
  for (const candidate of recoveryCandidates) {
    const parsed = parseMinimumCreatableActorPatch(candidate);
    if (parsed) directlyCreatablePatches.set(candidate.actorId, parsed);
    else repairCandidates.push(candidate);
  }
  const directlyCreatableActorIds = new Set(directlyCreatablePatches.keys());
  const repairActorIds = new Set(repairCandidates.map((candidate) => candidate.actorId));
  const responseForWriteback = withholdNewActorWritebacks(
    response,
    new Set([...repairActorIds, ...overflowCurrentNewActorIds])
  );
  const upcomingTurn = state.turnCounter + 1;
  const selectedRecoveryCandidates = selectActorRecoveryBatch(repairCandidates, upcomingTurn);
  const selectedRecoveryActorIds = new Set(selectedRecoveryCandidates.map((candidate) => candidate.actorId));
  const newActorRepairOriginals = new Map<string, unknown>();
  const newActorRepairTimes = new Map<string, GameTime>();
  const newActorRepairRequirements = selectedRecoveryCandidates.map((candidate) => {
    const parsed = actorPatchSchema.safeParse(candidate.actorPatch);
    const missingMinimumFields = parsed.success
      ? missingMinimumNewActorFields(parsed.data, candidate.sourceGameTime)
      : [];
    newActorRepairOriginals.set(candidate.actorId, candidate.actorPatch);
    newActorRepairTimes.set(candidate.actorId, candidate.sourceGameTime);
    return {
      actorId: candidate.actorId,
      missingMinimumFields,
      schemaIssues: parsed.success
        ? []
        : parsed.error.issues.slice(0, 12).map((issue) => ({
            path: issue.path.map((segment) => String(segment)).join('.'),
            message: issue.message
          }))
    };
  });

  const requestedPatchMap = new Map<string, unknown>();
  for (const index of repairIndices) {
    const patch = rawActorPatches[index];
    const actorId = actorPatchId(patch);
    if (actorId && allRecoveryActorIds.has(actorId)) continue;
    requestedPatchMap.set(actorId ?? `raw-index-${index}`, patch);
  }
  for (const candidate of selectedRecoveryCandidates) {
    requestedPatchMap.set(candidate.actorId, candidate.actorPatch);
  }

  const candidateRecoveryIds = new Set(recoveryCandidates.map((candidate) => candidate.recoveryId));
  const basePendingRecoveries = (state.pendingActorWritebackRecoveries ?? []).filter(
    (pending) =>
      !state.actors[pending.actorId] &&
      !candidateRecoveryIds.has(pending.recoveryId) &&
      !allRecoveryActorIds.has(pending.actorId)
  );

  if (requestedPatchMap.size === 0) {
    let directResponse = mergeActorPatches(responseForWriteback, [...directlyCreatablePatches.values()]);
    directResponse = mergeRecoveredActorDependencies(
      state,
      directResponse,
      recoveryCandidates,
      directlyCreatableActorIds
    );
    return {
      state: {
        ...state,
        pendingActorWritebackRecoveries: [
          ...basePendingRecoveries,
          ...repairCandidates.map((candidate) => serializePendingActorRecovery(candidate))
        ]
      },
      response: directResponse,
      diagnostics:
        directlyCreatableActorIds.size > 0
          ? [
              {
                path: ['writeback', 'actorPatches'],
                code: 'actor_minimum_creation_applied',
                message: `Accepted ${directlyCreatableActorIds.size} schema-valid actor patch(es) through the minimum creation contract without profile reconstruction.`
              }
            ]
          : []
    };
  }

  const actorPatchWarnings = (response.validationWarnings ?? []).filter((warning) =>
    issuePathStartsWith(warning.path, ['writeback', 'actorPatches'])
  );
  const repairedPatches = new Map<string, ActorPatch>();
  const approvedNewActorIds = new Set<string>(directlyCreatableActorIds);
  const repairDiagnostics: StoryDiagnosticIssue[] = [];
  let attemptsMade = 0;
  let routeUsed = primaryRouteMode;
  let terminalFailureKind: PendingActorWritebackRecovery['lastFailureKind'] | undefined;

  if (writebackRepair) {
    const runRepair = async (
      client: NarratorClient,
      routeMode: PendingActorWritebackRecovery['lastRouteMode']
    ): Promise<ActorPatchRepairResult> => {
      attemptsMade += 1;
      routeUsed = routeMode;
      const requestedActorIds = new Set(requestedPatchMap.keys());
      const repairPrompt = createActorPatchRepairPrompt({
        actorPatches: [...requestedPatchMap.values()],
        warnings: actorPatchWarnings,
        newActorRepairRequirements,
        playerInput,
        promptSettings
      });
      const repairRaw = await client.complete(repairPrompt, {
        requestPurpose: repairRequestPurpose
      });
      return parseActorPatchRepairResponse(
        repairRaw,
        requestedActorIds,
        newActorRepairOriginals,
        newActorRepairTimes
      );
    };

    let parsed: ActorPatchRepairResult | undefined;
    try {
      parsed = await runRepair(writebackRepair, primaryRouteMode);
    } catch (error) {
      if (isAbortError(error)) throw error;
      const transient = isTransientActorRepairError(error);
      terminalFailureKind = transient ? 'network' : 'protocol';
      repairDiagnostics.push({
        path: ['writebackRepair', 'actorPatches'],
        code: transient ? 'actor_writeback_repair_network_failed' : 'actor_writeback_repair_failed',
        message: transient
          ? 'Actor lightweight structural-repair route was temporarily unreachable.'
          : 'Actor lightweight structural-repair route returned an unrecoverable error.'
      });
      if (transient && writebackRepairFallback) {
        try {
          parsed = await runRepair(writebackRepairFallback, 'main-fallback');
          terminalFailureKind = undefined;
          repairDiagnostics.push({
            path: ['writebackRepair', 'actorPatches'],
            code: 'actor_writeback_repair_main_fallback_applied',
            message: 'Main narrator route completed lightweight actor structural repair after the custom route was unreachable.'
          });
        } catch (fallbackError) {
          if (isAbortError(fallbackError)) throw fallbackError;
          terminalFailureKind = isTransientActorRepairError(fallbackError) ? 'network' : 'protocol';
          repairDiagnostics.push({
            path: ['writebackRepair', 'actorPatches'],
            code: 'actor_writeback_repair_main_fallback_failed',
            message: 'Main narrator fallback could not complete lightweight actor structural repair.'
          });
        }
      }
    }

    if (parsed) {
      repairDiagnostics.push(...parsed.diagnostics);
      for (const patch of parsed.patches) repairedPatches.set(patch.actorId, patch);
      for (const actorId of parsed.approvedNewActorIds) approvedNewActorIds.add(actorId);
      if (parsed.diagnostics.length > 0 && selectedRecoveryCandidates.some((candidate) => !approvedNewActorIds.has(candidate.actorId))) {
        terminalFailureKind = 'protocol';
      }
    }
  }

  let repairedResponse = mergeActorPatches(responseForWriteback, [
    ...directlyCreatablePatches.values(),
    ...repairedPatches.values()
  ]);
  repairedResponse = mergeRecoveredActorDependencies(state, repairedResponse, selectedRecoveryCandidates, approvedNewActorIds);
  repairedResponse = mergeRecoveredActorDependencies(state, repairedResponse, recoveryCandidates, directlyCreatableActorIds);

  const pendingActorWritebackRecoveries = [...basePendingRecoveries];
  for (const candidate of repairCandidates) {
    if (approvedNewActorIds.has(candidate.actorId)) continue;
    const wasSelected = selectedRecoveryActorIds.has(candidate.actorId);
    if (!wasSelected || attemptsMade === 0) {
      pendingActorWritebackRecoveries.push(serializePendingActorRecovery(candidate));
      continue;
    }

    const failureKind: PendingActorWritebackRecovery['lastFailureKind'] = terminalFailureKind ?? 'protocol';
    const consecutiveFailureCount = (candidate.consecutiveFailureCount ?? 0) + 1;
    const retryDelay = actorRecoveryBackoffTurns(consecutiveFailureCount);
    pendingActorWritebackRecoveries.push(
      serializePendingActorRecovery(candidate, {
        attemptCount: candidate.attemptCount + attemptsMade,
        lastAttemptTurn: upcomingTurn,
        nextRetryTurn: upcomingTurn + retryDelay,
        consecutiveFailureCount,
        lastFailureKind: failureKind,
        lastRouteMode: routeUsed
      })
    );
  }

  const unresolvedSelected = selectedRecoveryCandidates.filter(
    (candidate) => !approvedNewActorIds.has(candidate.actorId)
  );
  const unselectedCount = repairCandidates.length - selectedRecoveryCandidates.length;
  const recoveryDiagnostics: StoryDiagnosticIssue[] = [];
  if (overflowCurrentNewActorIds.size > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_new_actor_limit_applied',
      message: `Kept ${overflowCurrentNewActorIds.size} non-essential new actor proposal(s) narrative-only because one turn may establish at most ${MAX_DURABLE_NEW_ACTORS_PER_TURN} durable actors.`
    });
  }
  if (selectedRecoveryCandidates.length > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_batch',
      message: `Repaired ${selectedRecoveryCandidates.length} structurally incomplete actor writeback package(s) from a queue of ${repairCandidates.length}.`
    });
  }
  if (unselectedCount > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_batch_limited',
      message: `Kept ${unselectedCount} actor writeback package(s) queued for later bounded recovery.`
    });
  }
  if (repairedPatches.size > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'writeback_repair_applied',
      message: `Writeback repair supplied ${repairedPatches.size} actor patch(es).`
    });
  }
  if (directlyCreatableActorIds.size > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_minimum_creation_applied',
      message: `Accepted ${directlyCreatableActorIds.size} schema-valid actor patch(es) through the minimum creation contract without profile reconstruction.`
    });
  }
  if (selectedRecoveryCandidates.some((candidate) => approvedNewActorIds.has(candidate.actorId))) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_applied',
      message: 'Recovered actor writeback together with schema-valid dependent memories, relationships, and pregnancy events.'
    });
  }
  if (unresolvedSelected.length > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_queued',
      message: `Deferred ${unresolvedSelected.length} structurally incomplete actor writeback package(s) with retry backoff.`
    });
  }

  return {
    state: {
      ...state,
      pendingActorWritebackRecoveries
    },
    response: repairedResponse,
    diagnostics: [...repairDiagnostics, ...recoveryDiagnostics]
  };
}

export interface SaveActorWritebackRepairResult {
  state: RuntimeState;
  pendingBefore: number;
  repairedCount: number;
  pendingAfter: number;
  diagnostics: StoryDiagnosticIssue[];
}

/**
 * Repairs only explicit pending actor writeback packages already stored in a save.
 * Story history is excluded and only actor-related domains are copied back, so
 * maintenance cannot rewrite narrative, time, money, cases or player identity.
 */
export async function repairPendingActorWritebacksInSave({
  state,
  narrator,
  promptSettings
}: {
  state: RuntimeState;
  narrator: NarratorClient;
  promptSettings?: PromptSettings;
}): Promise<SaveActorWritebackRepairResult> {
  const pendingBefore = state.pendingActorWritebackRecoveries?.length ?? 0;
  if (pendingBefore === 0) {
    return {
      state,
      pendingBefore,
      repairedCount: 0,
      pendingAfter: 0,
      diagnostics: []
    };
  }

  const maintenanceState: RuntimeState = {
    ...state,
    storyLog: []
  };
  const emptyResponse = validateNarratorResponse({
    writebackVersion: '1.7',
    narrativeText: '存档结构维护。',
    turnSummary: '只修复存档中已排队的人物建档结构。',
    suggestedActions: [],
    playerVitalsReview: {
      changed: false,
      reason: '存档结构维护不改变玩家身体状态。'
    },
    writeback: {}
  });
  const repairResult = await repairActorPatches({
    state: maintenanceState,
    rawResponse: { writeback: { actorPatches: [] } },
    response: emptyResponse,
    playerInput: '修复存档中已确认缺少最低建档字段的人物写回。',
    writebackRepair: narrator,
    primaryRouteMode: 'main-default',
    promptSettings,
    repairRequestPurpose: 'save_actor_writeback_repair'
  });
  const applied = applyNarratorResponse(repairResult.state, repairResult.response, {
    writebackDiagnostics: repairResult.diagnostics
  });
  const repairedCount = Object.keys(applied.actors).filter((actorId) => !state.actors[actorId]).length;
  if (repairedCount === 0) {
    return {
      state,
      pendingBefore,
      repairedCount: 0,
      pendingAfter: pendingBefore,
      diagnostics: repairResult.diagnostics
    };
  }

  const repairedState: RuntimeState = {
    ...state,
    actors: applied.actors,
    scenes: applied.scenes,
    memories: applied.memories,
    relationshipThreads: applied.relationshipThreads,
    pendingActorWritebackRecoveries: repairResult.state.pendingActorWritebackRecoveries,
    pendingActorProfileEnrichments: applied.pendingActorProfileEnrichments
  };
  return {
    state: repairedState,
    pendingBefore,
    repairedCount,
    pendingAfter: repairedState.pendingActorWritebackRecoveries.length,
    diagnostics: repairResult.diagnostics
  };
}

interface ActorProfileEnrichmentCandidate {
  actorId: string;
  responseActorId: string;
  sourceTurnId: string;
  sourceKind: 'current' | 'pending';
  missingFields: ActorProfileEnrichmentField[];
  patch: ActorPatch;
  attemptCount: number;
  lastAttemptTurn?: number;
  nextRetryTurn?: number;
  consecutiveFailureCount: number;
  lastFailureKind?: PendingActorProfileEnrichment['lastFailureKind'];
  lastRouteMode?: PendingActorProfileEnrichment['lastRouteMode'];
}

const ACTOR_PROFILE_ENRICHMENT_BATCH_SIZE = 2;
const ACTOR_PROFILE_ENRICHMENT_MAX_BACKOFF_TURNS = 8;

function actorProfileEnrichmentBackoffTurns(consecutiveFailureCount: number): number {
  return Math.min(
    ACTOR_PROFILE_ENRICHMENT_MAX_BACKOFF_TURNS,
    2 ** Math.min(3, Math.max(1, consecutiveFailureCount))
  );
}

function actorPatchForResolvedId(
  response: NarratorResponse,
  actorId: string,
  actorIdAliases: Record<string, string>
): ActorPatch | undefined {
  return response.writeback.actorPatches.find(
    (patch) => (actorIdAliases[patch.actorId] ?? patch.actorId) === actorId
  );
}

function collectActorProfileEnrichmentCandidates({
  state,
  response,
  actorIdAliases
}: {
  state: RuntimeState;
  response: NarratorResponse;
  actorIdAliases: Record<string, string>;
}): ActorProfileEnrichmentCandidate[] {
  const upcomingTurn = state.turnCounter + 1;
  const pendingCandidates = (state.pendingActorProfileEnrichments ?? [])
    .map(normalizePendingActorProfileEnrichment)
    .filter((pending): pending is PendingActorProfileEnrichment => Boolean(pending))
    .flatMap<ActorProfileEnrichmentCandidate>((pending) => {
      const actorId = actorIdAliases[pending.actorId] ?? pending.actorId;
      const actor = state.actors[actorId];
      if (!actor || (pending.nextRetryTurn ?? 0) > upcomingTurn) return [];
      const currentPatch = actorPatchForResolvedId(response, actorId, actorIdAliases);
      const completedByMain = currentPatch
        ? new Set(completedActorProfileEnrichmentFields(currentPatch, pending.missingFields))
        : new Set<ActorProfileEnrichmentField>();
      const missingFields = pending.missingFields.filter((field) => !completedByMain.has(field));
      if (missingFields.length === 0) return [];
      return [
        {
          actorId,
          responseActorId: currentPatch?.actorId ?? actorId,
          sourceTurnId: pending.sourceTurnId,
          sourceKind: 'pending',
          missingFields,
          patch:
            currentPatch ??
            ({
              actorId,
              name: actor.name,
              gender: actor.gender,
              birthDate: actor.birthDate,
              computedAge: deriveActorAgeAt(actor, state.time),
              currentIdentity: actor.currentIdentity,
              publicIdentity: actor.publicIdentity
            } as ActorPatch),
          attemptCount: pending.attemptCount,
          lastAttemptTurn: pending.lastAttemptTurn,
          nextRetryTurn: pending.nextRetryTurn,
          consecutiveFailureCount: pending.consecutiveFailureCount ?? 0,
          lastFailureKind: pending.lastFailureKind,
          lastRouteMode: pending.lastRouteMode
        }
      ];
    });

  const pendingActorIds = new Set(pendingCandidates.map((candidate) => candidate.actorId));
  const currentCandidates = response.writeback.actorPatches.flatMap<ActorProfileEnrichmentCandidate>((patch) => {
    const actorId = actorIdAliases[patch.actorId] ?? patch.actorId;
    if (state.actors[actorId] || pendingActorIds.has(actorId)) return [];
    if (missingMinimumNewActorFields(patch, state.time).length > 0) return [];
    const missingFields = missingActorProfileEnrichmentFields(patch);
    if (missingFields.length === 0) return [];
    return [
      {
        actorId,
        responseActorId: patch.actorId,
        sourceTurnId: `turn_${String(upcomingTurn).padStart(4, '0')}`,
        sourceKind: 'current',
        missingFields,
        patch,
        attemptCount: 0,
        consecutiveFailureCount: 0
      }
    ];
  });

  // Old deficits receive the first slots so a busy story cannot starve them forever;
  // any remaining capacity completes newly created people in the same turn.
  return [...pendingCandidates, ...currentCandidates].slice(0, ACTOR_PROFILE_ENRICHMENT_BATCH_SIZE);
}

function summarizeActorProfileEnrichmentCandidate(
  state: RuntimeState,
  candidate: ActorProfileEnrichmentCandidate
) {
  const actor = state.actors[candidate.actorId];
  return {
    actorId: candidate.responseActorId,
    canonicalActorId: candidate.actorId,
    requestedFields: candidate.missingFields,
    knownCore: {
      name: candidate.patch.name ?? actor?.name,
      gender: candidate.patch.gender ?? actor?.gender,
      birthDate: candidate.patch.birthDate ?? actor?.birthDate,
      computedAge: candidate.patch.computedAge ?? (actor ? deriveActorAgeAt(actor, state.time) : undefined),
      currentIdentity: candidate.patch.currentIdentity ?? actor?.currentIdentity,
      publicIdentity: candidate.patch.publicIdentity ?? actor?.publicIdentity,
      positionSummary: candidate.patch.positionSummary ?? actor?.positionSummary,
      currentPlaceId: candidate.patch.currentPlaceId ?? actor?.currentPlaceId
    },
    existingProfile: actor
      ? Object.fromEntries(
          candidate.missingFields.map((field) => [field, actor[field as keyof Actor]])
        )
      : candidate.patch
  };
}

function createActorProfileEnrichmentPrompt({
  state,
  response,
  playerInput,
  candidates,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  candidates: ActorProfileEnrichmentCandidate[];
  promptSettings?: PromptSettings;
}): string {
  return [
    resolvePromptText('repair.actorProfileEnrichment', promptSettings),
    '你是 NPC 普通档案补全器。人物已经通过本地最低建档校验；你只补足明确列出的普通档案字段。',
    '返回 JSON：{"actorPatches":[{"actorId":"...","被要求补全的字段":"..."}]}。',
    '规则：',
    '1. 每项必须原样保留 candidate.actorId，只返回 requestedFields 中列出的字段；不得更换姓名、年龄、性别、身份或 canonical actorId。',
    '2. 这是普通人物档案补全，不是身份审核，也不是重新创作人物。依据已知身份、场景、职业和主叙事事实补齐自然、互相一致的资料。',
    '3. 只有 requestedFields 包含 femaleProfile 时才可补 femaleProfile，且只补公开字段 addressToPlayer / appearanceDescription / bodyDescription / clothingStyle / personalityCore / affectionProgressionCondition / relationshipProgressionCondition；严禁返回 adultPrivateProfile、香闺秘档或怀孕资料。',
    '4. actualIdentitySummary 在没有卧底或伪装事实时，只概括人物实际社会身份；不得凭空制造秘密身份。',
    '5. roleProfiles 只补与 currentIdentity 对应的规范身份资料；attributes 必须完整提供 body/action/perception/thinking/negotiation/will 六项 0-100 数值，并按年龄、职业和经历拉开差异。',
    '6. relationshipSummary、attitudeTowardPlayer、interactionScore、trustTendency、entanglementSummary 必须反映当前真实接触；尚未建立关系时可写明确的初始中性事实，不得伪造亲密、仇恨或共同经历。interactionScore 表示已经形成的接触深度与牵连程度，既有人物不得重新估低或降低。',
    '7. longTermMemorySummary / recentInteractionMemory 只有在 requestedFields 明确列出时才可依据已知事实作保守概括；禁止新增 actorMemories、虚构历史事件或关系线程。',
    '8. 禁止返回秘密、物品、剧情正文或 suggestedActions。不得使用待补、未知、暂无资料、N/A、占位符或工程说明。无法可靠补全的字段宁可省略，系统会低频重试。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `turnSummary=${JSON.stringify(response.turnSummary)}`,
    `candidates=${JSON.stringify(candidates.map((candidate) => summarizeActorProfileEnrichmentCandidate(state, candidate)))}`
  ].join('\n');
}

function parseActorProfileEnrichmentResponse(
  value: unknown,
  candidates: ActorProfileEnrichmentCandidate[]
): { patches: ActorPatch[]; diagnostics: StoryDiagnosticIssue[] } {
  const root = isRecord(value) && isRecord(value.writeback) ? value.writeback : value;
  const rawPatches = isRecord(root) ? root.actorPatches : undefined;
  if (!Array.isArray(rawPatches)) {
    return {
      patches: [],
      diagnostics: [
        {
          path: ['writebackRepair', 'actorProfileEnrichment'],
          code: 'actor_profile_enrichment_invalid',
          message: 'Actor profile enrichment did not return an actorPatches array.'
        }
      ]
    };
  }

  const requestedByActorId = new Map(candidates.map((candidate) => [candidate.responseActorId, candidate]));
  const patches: ActorPatch[] = [];
  const diagnostics: StoryDiagnosticIssue[] = [];
  rawPatches.forEach((rawPatch, index) => {
    const parsed = actorPatchSchema.safeParse(rawPatch);
    if (!parsed.success) {
      parsed.error.issues.slice(0, 12).forEach((issue) => {
        diagnostics.push({
          path: ['writebackRepair', 'actorProfileEnrichment', index, ...issue.path.map((part) => String(part))],
          code: issue.code,
          message: issue.message
        });
      });
      return;
    }
    const candidate = requestedByActorId.get(parsed.data.actorId);
    if (!candidate) {
      diagnostics.push({
        path: ['writebackRepair', 'actorProfileEnrichment', index, 'actorId'],
        code: 'actor_profile_enrichment_unrelated_actor',
        message: `Actor profile enrichment returned unrelated actor "${parsed.data.actorId}".`
      });
      return;
    }
    const retained = retainRequestedActorProfileFields(parsed.data, candidate.missingFields);
    if (completedActorProfileEnrichmentFields(retained, candidate.missingFields).length > 0) {
      patches.push(retained);
    }
  });
  return { patches, diagnostics };
}

function mergeActorProfileEnrichmentPatches(
  response: NarratorResponse,
  patches: ActorPatch[]
): NarratorResponse {
  if (patches.length === 0) return response;
  const merged = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
  for (const patch of patches) {
    const previous = merged.get(patch.actorId);
    if (!previous) {
      merged.set(patch.actorId, patch);
      continue;
    }
    const parsed = actorPatchSchema.safeParse(mergeActorPatchRepair(previous, patch));
    if (parsed.success) merged.set(patch.actorId, parsed.data);
  }
  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorPatches: [...merged.values()]
    }
  };
}

async function enrichActorProfiles({
  state,
  response,
  playerInput,
  actorIdAliases,
  writebackRepair,
  writebackRepairFallback,
  primaryRouteMode,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  actorIdAliases: Record<string, string>;
  writebackRepair?: NarratorClient | null;
  writebackRepairFallback?: NarratorClient | null;
  primaryRouteMode: PendingActorProfileEnrichment['lastRouteMode'];
  promptSettings?: PromptSettings;
}): Promise<{ state: RuntimeState; response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  const candidates = collectActorProfileEnrichmentCandidates({ state, response, actorIdAliases });
  if (candidates.length === 0 || !writebackRepair) return { state, response, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [];
  let attemptsMade = 0;
  let routeUsed = primaryRouteMode;
  let terminalFailureKind: PendingActorProfileEnrichment['lastFailureKind'] | undefined;
  let patches: ActorPatch[] = [];
  const runEnrichment = async (
    client: NarratorClient,
    routeMode: PendingActorProfileEnrichment['lastRouteMode']
  ) => {
    attemptsMade += 1;
    routeUsed = routeMode;
    const raw = await client.complete(
      createActorProfileEnrichmentPrompt({ state, response, playerInput, candidates, promptSettings })
    );
    return parseActorProfileEnrichmentResponse(raw, candidates);
  };

  try {
    const result = await runEnrichment(writebackRepair, primaryRouteMode);
    patches = result.patches;
    diagnostics.push(...result.diagnostics);
    if (result.diagnostics.length > 0 && result.patches.length === 0) terminalFailureKind = 'protocol';
  } catch (error) {
    if (isAbortError(error)) throw error;
    const transient = isTransientActorRepairError(error);
    terminalFailureKind = transient ? 'network' : 'protocol';
    diagnostics.push({
      path: ['writebackRepair', 'actorProfileEnrichment'],
      code: transient ? 'actor_profile_enrichment_network_failed' : 'actor_profile_enrichment_failed',
      message: transient
        ? 'Actor ordinary-profile enrichment route was temporarily unreachable.'
        : 'Actor ordinary-profile enrichment route returned an unrecoverable error.'
    });
    if (transient && writebackRepairFallback) {
      try {
        const fallback = await runEnrichment(writebackRepairFallback, 'main-fallback');
        patches = fallback.patches;
        diagnostics.push(...fallback.diagnostics, {
          path: ['writebackRepair', 'actorProfileEnrichment'],
          code: 'actor_profile_enrichment_main_fallback_applied',
          message: 'Main narrator route completed actor ordinary-profile enrichment after the custom route was unreachable.'
        });
        terminalFailureKind = fallback.diagnostics.length > 0 && fallback.patches.length === 0 ? 'protocol' : undefined;
      } catch (fallbackError) {
        if (isAbortError(fallbackError)) throw fallbackError;
        terminalFailureKind = isTransientActorRepairError(fallbackError) ? 'network' : 'protocol';
        diagnostics.push({
          path: ['writebackRepair', 'actorProfileEnrichment'],
          code: 'actor_profile_enrichment_main_fallback_failed',
          message: 'Main narrator fallback could not complete actor ordinary-profile enrichment.'
        });
      }
    }
  }

  const patchByActorId = new Map(patches.map((patch) => [patch.actorId, patch]));
  const pendingByActorId = new Map<string, PendingActorProfileEnrichment>();
  for (const rawPending of state.pendingActorProfileEnrichments ?? []) {
    const pending = normalizePendingActorProfileEnrichment(rawPending);
    if (!pending) continue;
    const actorId = actorIdAliases[pending.actorId] ?? pending.actorId;
    pendingByActorId.set(actorId, { ...pending, actorId });
  }

  const upcomingTurn = state.turnCounter + 1;
  let completedFieldCount = 0;
  for (const candidate of candidates) {
    const enrichedPatch = patchByActorId.get(candidate.responseActorId);
    const completedFields = enrichedPatch
      ? completedActorProfileEnrichmentFields(enrichedPatch, candidate.missingFields)
      : [];
    completedFieldCount += completedFields.length;
    const completed = new Set(completedFields);
    const remainingFields = candidate.missingFields.filter((field) => !completed.has(field));
    if (remainingFields.length === 0) {
      pendingByActorId.delete(candidate.actorId);
      continue;
    }

    const previous = pendingByActorId.get(candidate.actorId);
    const madeProgress = completedFields.length > 0;
    const consecutiveFailureCount = madeProgress ? 0 : (candidate.consecutiveFailureCount ?? 0) + 1;
    pendingByActorId.set(candidate.actorId, {
      actorId: candidate.actorId,
      sourceTurnId: previous?.sourceTurnId ?? candidate.sourceTurnId,
      missingFields: remainingFields,
      attemptCount: candidate.attemptCount + attemptsMade,
      lastAttemptTurn: upcomingTurn,
      nextRetryTurn:
        upcomingTurn +
        (madeProgress ? 2 : actorProfileEnrichmentBackoffTurns(consecutiveFailureCount)),
      consecutiveFailureCount,
      ...(madeProgress ? {} : { lastFailureKind: terminalFailureKind ?? 'protocol' }),
      lastRouteMode: routeUsed
    });
  }

  if (completedFieldCount > 0) {
    diagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_profile_enrichment_applied',
      message: `Completed ${completedFieldCount} missing ordinary actor profile field(s) without rebuilding identity or private dossiers.`
    });
  }
  const unresolvedCount = candidates.reduce((count, candidate) => {
    const patch = patchByActorId.get(candidate.responseActorId);
    const completed = patch
      ? completedActorProfileEnrichmentFields(patch, candidate.missingFields).length
      : 0;
    return count + (completed < candidate.missingFields.length ? 1 : 0);
  }, 0);
  if (unresolvedCount > 0) {
    diagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_profile_enrichment_queued',
      message: `Kept ${unresolvedCount} actor ordinary-profile completion task(s) queued with bounded retry backoff.`
    });
  }

  return {
    state: {
      ...state,
      pendingActorProfileEnrichments: [...pendingByActorId.values()].slice(-200)
    },
    response: mergeActorProfileEnrichmentPatches(response, patches),
    diagnostics
  };
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = nonEmptyString(value);
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function actorPatchHasIdentityMaterial(patch: ActorPatch): boolean {
  return Boolean(
    patch.name ||
      patch.englishName ||
      patch.aliases?.length ||
      patch.callName ||
      patch.profileSummary ||
      patch.publicIdentity ||
      patch.actualIdentitySummary ||
      patch.positionSummary ||
      patch.appearance ||
      patch.relationshipSummary ||
      patch.attitudeTowardPlayer ||
      patch.trustTendency ||
      patch.entanglementSummary ||
      patch.longTermMemorySummary ||
      patch.recentInteractionMemory ||
      patch.statusSummary
  );
}

function summarizeActorForIdentityRepair(actor: Actor, currentTime: GameTime) {
  return {
    actorId: actor.actorId,
    name: actor.name,
    englishName: actor.englishName,
    aliases: actor.aliases,
    callName: actor.callName,
    gender: actor.gender,
    birthDate: actor.birthDate,
    computedAge: deriveActorAgeAt(actor, currentTime),
    currentIdentity: actor.currentIdentity,
    publicIdentity: actor.publicIdentity,
    actualIdentitySummary: actor.actualIdentitySummary,
    positionSummary: actor.positionSummary,
    currentPlaceId: actor.currentPlaceId,
    currentSceneId: actor.currentSceneId,
    appearance: actor.appearance
  };
}

function summarizeActorPatchForIdentityRepair(patch: ActorPatch) {
  return {
    actorId: patch.actorId,
    name: patch.name,
    englishName: patch.englishName,
    aliases: patch.aliases,
    callName: patch.callName,
    gender: patch.gender,
    birthDate: patch.birthDate,
    computedAge: patch.computedAge,
    currentIdentity: patch.currentIdentity,
    publicIdentity: patch.publicIdentity,
    actualIdentitySummary: patch.actualIdentitySummary,
    positionSummary: patch.positionSummary,
    currentPlaceId: patch.currentPlaceId,
    currentSceneId: patch.currentSceneId,
    appearance: patch.appearance,
    clothing: patch.clothing,
    relationshipSummary: patch.relationshipSummary,
    entanglementSummary: patch.entanglementSummary,
    longTermMemorySummary: patch.longTermMemorySummary,
    recentInteractionMemory: patch.recentInteractionMemory,
    statusSummary: patch.statusSummary,
    importance: patch.importance
  };
}

function collectActorIdentityRepairSubjects(response: NarratorResponse): ActorPatch[] {
  return response.writeback.actorPatches.filter(actorPatchHasIdentityMaterial);
}

function collectActorIdentityRepairCandidates(state: RuntimeState): Actor[] {
  return Object.values(state.actors)
    .filter((actor) => actor.actorId !== state.player.actorId)
    .sort((a, b) => a.actorId.localeCompare(b.actorId));
}

function normalizeActorIdentityLookupValue(value: string | undefined): string {
  return (value ?? '').normalize('NFKC').trim().toLowerCase();
}

function actorIdentityLookupValues(actor: Actor): string[] {
  return uniqueStrings([
    actor.name,
    actor.englishName,
    actor.callName,
    ...actor.aliases
  ])
    .map(normalizeActorIdentityLookupValue)
    .filter((value) => value.length >= 2);
}

function patchIdentityLookupValues(patch: ActorPatch): string[] {
  return uniqueStrings([
    patch.name,
    patch.englishName,
    patch.callName,
    ...(patch.aliases ?? [])
  ])
    .map(normalizeActorIdentityLookupValue)
    .filter((value) => value.length >= 2);
}

function playerExplicitlyMentionsActor(actor: Actor, playerInput: string): boolean {
  const normalizedInput = normalizeActorIdentityLookupValue(playerInput);
  return actorIdentityLookupValues(actor).some((value) => normalizedInput.includes(value));
}

function protectCanonicalActorIdentity(target: Actor, patch: ActorPatch): ActorPatch {
  const protectedPatch: Partial<ActorPatch> = { ...patch };
  const identityFields: Array<keyof ActorPatch> = [
    'name',
    'englishName',
    'aliases',
    'callName',
    'gender',
    'policeNumber',
    'birthDate',
    'computedAge',
    'visualAgeAnchor',
    'currentIdentity',
    'publicIdentity',
    'actualIdentitySummary',
    'roleProfiles',
    'organizationIds',
    'organizationRelations',
    'positionSummary',
    'profileSummary',
    'appearance',
    'personality',
    'speechStyle',
    'motivation',
    'longTermGoal',
    'values',
    'attributes',
    'activeTraits',
    'longTermMemorySummary',
    'recentInteractionMemory',
    'keyMemories',
    'femaleProfile',
    'visibility',
    'importance',
    'worldpackActorData'
  ];
  identityFields.forEach((field) => {
    delete protectedPatch[field];
  });

  return {
    ...protectedPatch,
    actorId: patch.actorId,
    name: target.name,
    ...(target.englishName ? { englishName: target.englishName } : {}),
    aliases: [...target.aliases],
    ...(target.callName ? { callName: target.callName } : {}),
    roleProfiles: {},
    organizationRelations: [],
    keyMemories: [],
    worldpackActorData: {}
  } as ActorPatch;
}

function applyExplicitActorReferenceAliases(
  state: RuntimeState,
  response: NarratorResponse,
  playerInput: string
): {
  response: NarratorResponse;
  actorIdAliases: Record<string, string>;
} {
  const existingActors = Object.values(state.actors).filter(
    (actor) => actor.actorId !== state.player.actorId && actor.visibility !== 'hidden'
  );
  const actorIdAliases: Record<string, string> = {};
  const actorPatches = response.writeback.actorPatches.map((patch) => {
    if (state.actors[patch.actorId]) return patch;
    const patchValues = new Set(patchIdentityLookupValues(patch));
    if (patchValues.size === 0) return patch;
    const candidates = existingActors.filter(
      (actor) =>
        playerExplicitlyMentionsActor(actor, playerInput) &&
        actorIdentityLookupValues(actor).some((value) => patchValues.has(value))
    );
    if (candidates.length !== 1) return patch;
    const target = candidates[0];
    actorIdAliases[patch.actorId] = target.actorId;
    return protectCanonicalActorIdentity(target, patch);
  });

  if (Object.keys(actorIdAliases).length === 0) {
    return { response, actorIdAliases };
  }
  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        actorPatches
      }
    },
    actorIdAliases
  };
}

function actorPatchConflictsWithCanonicalIdentity(target: Actor, patch: ActorPatch): boolean {
  if (evaluateFixedActorIdentityPatch(target, patch)) return true;
  if (patch.gender && target.gender && patch.gender !== target.gender) return true;
  if (patch.policeNumber && target.policeNumber && patch.policeNumber !== target.policeNumber) return true;
  if (patch.birthDate && target.birthDate && patch.birthDate !== target.birthDate) return true;
  return false;
}

function collectPromptAnchoredActorIds(
  context: PromptContext,
  npcSimulationPackage?: NpcSimulationPackage
): Set<string> {
  const actorIds = new Set<string>();
  const add = (actorId: string | undefined) => {
    if (actorId) actorIds.add(actorId);
  };
  context.presentActors.forEach((actor) => add(actor.actorId));
  context.actorPackets.forEach((actor) => add(actor.actorId));
  context.explicitActorReferenceProjection.actors.forEach((actor) => add(actor.actorId));
  context.remoteNpcPresenceProjection.candidates.forEach((candidate) => add(candidate.actorId));
  context.npcMemoryProjection.entries.forEach((entry) => add(entry.actorId));
  context.relationshipProjection.threads.forEach((thread) => {
    add(thread.primaryActorId);
    thread.relatedActorIds.forEach(add);
  });
  context.backgroundEvolutionProjection.activeNpcActions.forEach((track) => {
    add(track.actorId);
    track.relatedActorIds.forEach(add);
  });
  context.backgroundEvolutionProjection.activeOrganizationActions.forEach((track) =>
    track.relatedActorIds.forEach(add)
  );
  context.backgroundEvolutionProjection.recentOutcomes.forEach((outcome) =>
    outcome.relatedActorIds.forEach(add)
  );
  context.backgroundEvolutionProjection.chronicle.forEach((entry) =>
    entry.relatedActorIds.forEach(add)
  );
  npcSimulationPackage?.presentReactions.forEach((advice) => add(advice.actorId));
  npcSimulationPackage?.remotePresence.forEach((advice) => add(advice.actorId));
  return actorIds;
}

function applyPromptAnchoredActorAliases(
  state: RuntimeState,
  response: NarratorResponse,
  promptAnchoredActorIds: ReadonlySet<string>
): {
  response: NarratorResponse;
  actorIdAliases: Record<string, string>;
  diagnostics: StoryDiagnosticIssue[];
} {
  const anchoredActors = [...promptAnchoredActorIds]
    .map((actorId) => state.actors[actorId])
    .filter(
      (actor): actor is Actor => Boolean(actor && actor.actorId !== state.player.actorId)
    );
  const actorIdAliases: Record<string, string> = {};
  const diagnostics: StoryDiagnosticIssue[] = [];
  const actorPatches = response.writeback.actorPatches.map((patch, index) => {
    if (state.actors[patch.actorId]) return patch;
    const patchValues = new Set(patchIdentityLookupValues(patch));
    if (patchValues.size === 0) return patch;
    const candidates = anchoredActors.filter(
      (actor) =>
        !actorPatchConflictsWithCanonicalIdentity(actor, patch) &&
        actorIdentityLookupValues(actor).some((value) => patchValues.has(value))
    );
    if (candidates.length !== 1) return patch;
    const target = candidates[0];
    actorIdAliases[patch.actorId] = target.actorId;
    diagnostics.push({
      path: ['writeback', 'actorPatches', index, 'actorId'],
      code: 'prompt_anchored_actor_identity_reused',
      message: `人物“${target.name}”已按本回合投喂的稳定身份锚点复用 ${target.actorId}；模型临时生成的 ${patch.actorId} 不会创建重复人物。`
    });
    return protectCanonicalActorIdentity(target, patch);
  });

  if (Object.keys(actorIdAliases).length === 0) {
    return { response, actorIdAliases, diagnostics };
  }
  return {
    response: {
      ...response,
      writeback: { ...response.writeback, actorPatches }
    },
    actorIdAliases,
    diagnostics
  };
}

function createActorIdentityMergePrompt({
  state,
  response,
  playerInput,
  actorPatches,
  existingActors,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  actorPatches: ActorPatch[];
  existingActors: Actor[];
  promptSettings?: PromptSettings;
}): string {
  return [
    resolvePromptText('repair.identityMerge', promptSettings),
    '你是 Actor Identity Review：只确认人物是否重复以及 canonical actorId，不负责生成或补全人物档案。',
    '返回 JSON：{"actorIdentityMerges":[{"sourceActorId":"...","decision":"merge","canonicalActorId":"...","confidence":"high","canonicalName":"...","canonicalEnglishName":"...","aliases":[],"evidence":[]}]}。',
    '只有确认同一人时才返回合并项；不合并、延后或拒绝时返回空数组。confidence 使用 high / medium / low。',
    '规则：',
    '1. sourceActorId 必须来自 candidateActorPatches；canonicalActorId 必须来自 existingActorCandidates。targetActorId 作为 canonicalActorId 的兼容别名也可接受。',
    '2. existingActorCandidates 只包含本回合上下文已锚定或玩家明确点名的人物；仍须根据本轮叙事、写回与人物资料判断是否同一人。',
    '3. 仅在高置信度确认同一人时返回合并项；不能确认就返回空数组。',
    '4. 禁止合并 player，sourceActorId 与 targetActorId 不得相同。',
    '5. 不得返回 actorPatch，不得新增性格、经历、关系、秘密、物品或其他人物补全内容。',
    '6. 空数组或审核接口失败均表示保留主叙事原始 actorPatch；身份审核不能阻塞满足最低创建条件的人物首次进入世界。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `candidateActorPatches=${JSON.stringify(actorPatches.map(summarizeActorPatchForIdentityRepair))}`,
    `existingActorCandidates=${JSON.stringify(existingActors.map((actor) => summarizeActorForIdentityRepair(actor, state.time)))}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      writeback: {
        actorPatches: actorPatches.map(summarizeActorPatchForIdentityRepair),
        actorMemories: response.writeback.actorMemories,
        casePatches: response.writeback.casePatches,
        currentMatterPatches: response.writeback.currentMatterPatches,
        grayNetworkPatches: response.writeback.grayNetworkPatches
      }
    })}`
  ].join('\n');
}

function parseActorIdentityMergeRepairResponse(
  value: unknown,
  sourceActorIds: Set<string>,
  targetActorIds: Set<string>
): { decisions: ActorIdentityMergeDecision[]; diagnostics: StoryDiagnosticIssue[] } {
  let rawMerges: unknown;
  if (isRecord(value) && Array.isArray(value.actorIdentityMerges)) {
    rawMerges = value.actorIdentityMerges;
  } else if (isRecord(value) && isRecord(value.writebackRepair) && Array.isArray(value.writebackRepair.actorIdentityMerges)) {
    rawMerges = value.writebackRepair.actorIdentityMerges;
  }

  if (!Array.isArray(rawMerges)) {
    return {
      decisions: [],
      diagnostics: [
        {
          path: ['writebackRepair', 'actorIdentityMerges'],
          code: 'writeback_repair_invalid',
          message: 'Writeback repair did not return an actorIdentityMerges array.'
        }
      ]
    };
  }

  const decisions: ActorIdentityMergeDecision[] = [];
  const diagnostics: StoryDiagnosticIssue[] = [];
  const usedSources = new Set<string>();
  rawMerges.forEach((item, index) => {
    if (!isRecord(item)) {
      diagnostics.push({
        path: ['writebackRepair', 'actorIdentityMerges', index],
        code: 'invalid_type',
        message: 'Actor identity merge item must be an object.'
      });
      return;
    }

    const decisionValue = nonEmptyString(item.decision)?.toLowerCase().replace(/[\s-]+/g, '_');
    if (
      decisionValue &&
      ['defer', 'reject', 'no_merge', 'keep_separate', 'not_same', 'different_actor'].includes(decisionValue)
    ) {
      return;
    }

    const sourceActorId =
      nonEmptyString(item.sourceActorId) ?? nonEmptyString(item.actorId) ?? nonEmptyString(item.candidateActorId);
    const targetActorId = nonEmptyString(item.targetActorId) ?? nonEmptyString(item.canonicalActorId);
    const evidenceValues = Array.isArray(item.evidence)
      ? item.evidence
      : Array.isArray(item.reasons)
        ? item.reasons
        : [item.evidence ?? item.reason ?? item.rationale];
    const evidence = evidenceValues.map(nonEmptyString).filter((text): text is string => Boolean(text));
    const confidence: ActorIdentityMergeConfidence | undefined = (() => {
      if (item.confidence === 'high' || item.confidence === 'medium' || item.confidence === 'low') {
        return item.confidence;
      }
      const numeric =
        typeof item.confidence === 'number'
          ? item.confidence
          : typeof item.confidence === 'string' && item.confidence.trim()
            ? Number(item.confidence)
            : Number.NaN;
      if (Number.isFinite(numeric)) {
        const normalized = numeric > 1 ? numeric / 100 : numeric;
        if (normalized >= 0.85) return 'high';
        if (normalized >= 0.6) return 'medium';
        return 'low';
      }
      if (decisionValue === 'merge' && evidence.length > 0) return 'high';
      return undefined;
    })();
    if (!sourceActorId || !targetActorId || !confidence) {
      diagnostics.push({
        path: ['writebackRepair', 'actorIdentityMerges', index],
        code: 'invalid_actor_identity_merge',
        message:
          'Actor identity merge must include a source actor, a canonical target actor, and a merge decision or confidence.'
      });
      return;
    }
    if (confidence !== 'high') return;
    if (!sourceActorIds.has(sourceActorId) || !targetActorIds.has(targetActorId) || sourceActorId === targetActorId) {
      diagnostics.push({
        path: ['writebackRepair', 'actorIdentityMerges', index],
        code: 'unrelated_actor_identity_merge',
        message: `Actor identity merge "${sourceActorId}" -> "${targetActorId}" is outside the requested candidates.`
      });
      return;
    }
    if (usedSources.has(sourceActorId)) return;
    if (evidence.length === 0) {
      diagnostics.push({
        path: ['writebackRepair', 'actorIdentityMerges', index, 'evidence'],
        code: 'invalid_actor_identity_merge',
        message: `Actor identity merge "${sourceActorId}" -> "${targetActorId}" needs evidence.`
      });
      return;
    }

    usedSources.add(sourceActorId);
    decisions.push({
      sourceActorId,
      targetActorId,
      confidence,
      canonicalName: nonEmptyString(item.canonicalName),
      canonicalEnglishName: nonEmptyString(item.canonicalEnglishName),
      aliases: Array.isArray(item.aliases)
        ? item.aliases.map(nonEmptyString).filter((alias): alias is string => Boolean(alias))
        : [],
      evidence
    });
  });

  return { decisions, diagnostics };
}

function mergeDistinctText(first: string | undefined, second: string | undefined): string {
  const firstText = nonEmptyString(first);
  const secondText = nonEmptyString(second);
  if (!firstText) return secondText ?? '';
  if (!secondText || firstText === secondText) return firstText;
  if (firstText.includes(secondText)) return firstText;
  if (secondText.includes(firstText)) return secondText;
  return `${firstText}；${secondText}`;
}

function mergeActorIdentityRecords(target: Actor, source: Actor, decision: ActorIdentityMergeDecision): Actor {
  const canonicalName = decision.canonicalName ?? source.name ?? target.name;
  const canonicalEnglishName = decision.canonicalEnglishName ?? source.englishName ?? target.englishName;
  const aliases = uniqueStrings([
    ...target.aliases,
    ...source.aliases,
    target.name,
    target.englishName,
    target.callName,
    source.name,
    source.englishName,
    source.callName,
    ...decision.aliases
  ]).filter((alias) => alias !== canonicalName && alias !== canonicalEnglishName);

  return {
    ...target,
    ...source,
    actorId: target.actorId,
    name: canonicalName,
    englishName: canonicalEnglishName,
    aliases,
    roleProfiles: {
      ...target.roleProfiles,
      ...source.roleProfiles
    },
    organizationIds: uniqueStrings([...target.organizationIds, ...source.organizationIds]),
    organizationRelations: [...target.organizationRelations, ...source.organizationRelations],
    keyMemories: [...target.keyMemories, ...source.keyMemories],
    importance: Math.max(target.importance, source.importance),
    interactionScore: Math.max(target.interactionScore, source.interactionScore),
    longTermMemorySummary: mergeDistinctText(target.longTermMemorySummary, source.longTermMemorySummary),
    recentInteractionMemory: source.recentInteractionMemory || target.recentInteractionMemory,
    statusSummary: source.statusSummary || target.statusSummary
  };
}

function remapActorIdReferencesDeep<T>(value: T, actorIdAliases: Map<string, string>): T {
  if (typeof value === 'string') {
    return (actorIdAliases.get(value) ?? value) as T;
  }
  if (Array.isArray(value)) {
    const mapped = value.map((item) => remapActorIdReferencesDeep(item, actorIdAliases));
    return (mapped.every((item): item is string => typeof item === 'string') ? Array.from(new Set(mapped)) : mapped) as T;
  }
  if (!isRecord(value)) return value;

  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    next[key] = remapActorIdReferencesDeep(child, actorIdAliases);
  }

  return next as T;
}

function applyExistingActorIdentityMerges(
  state: RuntimeState,
  decisions: ActorIdentityMergeDecision[]
): { state: RuntimeState; actorIdAliases: Record<string, string>; diagnostics: StoryDiagnosticIssue[] } {
  let nextState = state;
  const actorIdAliases: Record<string, string> = {};
  const diagnostics: StoryDiagnosticIssue[] = [];

  for (const decision of decisions) {
    const source = nextState.actors[decision.sourceActorId];
    const target = nextState.actors[decision.targetActorId];
    if (!source) continue;
    if (!target || source.actorId === nextState.player.actorId || target.actorId === nextState.player.actorId) {
      diagnostics.push({
        path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
        code: 'actor_identity_merge_rejected',
        message: `Actor identity merge "${decision.sourceActorId}" -> "${decision.targetActorId}" was rejected by local guardrails.`
      });
      continue;
    }
    if (fixedActorIdentityMergeConflicts(target, source)) {
      diagnostics.push({
        path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
        code: 'actor_identity_merge_rejected',
        message: `Actor identity merge "${decision.sourceActorId}" -> "${decision.targetActorId}" was rejected because the actors have conflicting fixed identities.`
      });
      continue;
    }

    const localAliases = new Map([[decision.sourceActorId, decision.targetActorId]]);
    const actors = { ...nextState.actors };
    actors[decision.targetActorId] = mergeActorIdentityRecords(target, source, decision);
    delete actors[decision.sourceActorId];
    nextState = remapActorIdReferencesDeep(
      {
        ...nextState,
        actors
      },
      localAliases
    );
    nextState.actors[decision.targetActorId] = {
      ...nextState.actors[decision.targetActorId],
      actorId: decision.targetActorId
    };
    actorIdAliases[decision.sourceActorId] = decision.targetActorId;
    diagnostics.push({
      path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
      code: 'actor_identity_merge_applied',
      message: `Existing actor "${decision.sourceActorId}" was merged into "${decision.targetActorId}" by writeback repair.`
    });
  }

  return { state: nextState, actorIdAliases, diagnostics };
}

function applyActorIdentityMergePatches(
  state: RuntimeState,
  response: NarratorResponse,
  decisions: ActorIdentityMergeDecision[]
): { response: NarratorResponse; actorIdAliases: Record<string, string>; diagnostics: StoryDiagnosticIssue[] } {
  if (decisions.length === 0) return { response, actorIdAliases: {}, diagnostics: [] };

  const decisionsBySource = new Map(decisions.map((decision) => [decision.sourceActorId, decision]));
  const actorIdAliases: Record<string, string> = {};
  const diagnostics: StoryDiagnosticIssue[] = [];
  const actorPatches = response.writeback.actorPatches.map((patch) => {
    const decision = decisionsBySource.get(patch.actorId);
    if (!decision) return patch;

    const target = state.actors[decision.targetActorId];
    if (!target || decision.targetActorId === state.player.actorId) {
      diagnostics.push({
        path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
        code: 'actor_identity_merge_rejected',
        message: `Actor identity merge "${decision.sourceActorId}" -> "${decision.targetActorId}" was rejected because target actor is unavailable.`
      });
      return patch;
    }
    if (evaluateFixedActorIdentityPatch(target, patch)) {
      diagnostics.push({
        path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
        code: 'actor_identity_merge_rejected',
        message: `Actor identity merge "${decision.sourceActorId}" -> "${decision.targetActorId}" was rejected because the patch conflicts with the target's fixed identity.`
      });
      return patch;
    }

    actorIdAliases[decision.sourceActorId] = decision.targetActorId;
    const canonicalName = decision.canonicalName ?? patch.name;
    const canonicalEnglishName = decision.canonicalEnglishName ?? patch.englishName;
    const aliases = uniqueStrings([
      ...target.aliases,
      target.name,
      target.englishName,
      target.callName,
      ...(patch.aliases ?? []),
      patch.name,
      patch.englishName,
      patch.callName,
      ...decision.aliases
    ]).filter((alias) => alias !== canonicalName && alias !== canonicalEnglishName);

    diagnostics.push({
      path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
      code: 'actor_identity_merge_applied',
      message: `Actor patch "${decision.sourceActorId}" will be applied to existing actor "${decision.targetActorId}" by identity repair.`
    });

    return {
      ...patch,
      name: canonicalName,
      englishName: canonicalEnglishName,
      aliases: aliases.length > 0 ? aliases : patch.aliases
    };
  });

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        actorPatches
      }
    },
    actorIdAliases,
    diagnostics
  };
}

async function repairActorIdentityMerges({
  state,
  response,
  playerInput,
  promptAnchoredActorIds,
  writebackRepair,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  promptAnchoredActorIds: ReadonlySet<string>;
  writebackRepair?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<{
  state: RuntimeState;
  response: NarratorResponse;
  actorIdAliases: Record<string, string>;
  diagnostics: StoryDiagnosticIssue[];
}> {
  const anchoredReferenceResult = applyPromptAnchoredActorAliases(
    state,
    response,
    promptAnchoredActorIds
  );
  const explicitReferenceResult = applyExplicitActorReferenceAliases(
    state,
    anchoredReferenceResult.response,
    playerInput
  );
  response = explicitReferenceResult.response;
  const deterministicActorIdAliases = {
    ...anchoredReferenceResult.actorIdAliases,
    ...explicitReferenceResult.actorIdAliases
  };
  const deterministicDiagnostics = anchoredReferenceResult.diagnostics;
  if (!writebackRepair) {
    return {
      state,
      response,
      actorIdAliases: deterministicActorIdAliases,
      diagnostics: deterministicDiagnostics
    };
  }

  const actorPatches = collectActorIdentityRepairSubjects(response).filter(
    (patch) => !deterministicActorIdAliases[patch.actorId]
  );
  if (actorPatches.length === 0) {
    return {
      state,
      response,
      actorIdAliases: deterministicActorIdAliases,
      diagnostics: deterministicDiagnostics
    };
  }

  const existingActors = collectActorIdentityRepairCandidates(state).filter(
    (actor) =>
      promptAnchoredActorIds.has(actor.actorId) ||
      playerExplicitlyMentionsActor(actor, playerInput)
  );
  if (existingActors.length === 0) {
    return {
      state,
      response,
      actorIdAliases: deterministicActorIdAliases,
      diagnostics: deterministicDiagnostics
    };
  }

  try {
    const repairPrompt = createActorIdentityMergePrompt({
      state,
      response,
      playerInput,
      actorPatches,
      existingActors,
      promptSettings
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseActorIdentityMergeRepairResponse(
      repairRaw,
      new Set(actorPatches.map((patch) => patch.actorId)),
      new Set(existingActors.map((actor) => actor.actorId))
    );
    const locallyRejectedDiagnostics: StoryDiagnosticIssue[] = [];
    const locallyEligibleDecisions = parsed.decisions.filter((decision) => {
      const target = state.actors[decision.targetActorId];
      const sourcePatch = actorPatches.find((patch) => patch.actorId === decision.sourceActorId);
      if (!target || !sourcePatch) return false;
      const targetValues = new Set(actorIdentityLookupValues(target));
      const hasExactIdentityOverlap = patchIdentityLookupValues(sourcePatch).some((value) => targetValues.has(value));
      if (hasExactIdentityOverlap || playerExplicitlyMentionsActor(target, playerInput)) return true;
      locallyRejectedDiagnostics.push({
        path: ['writeback', 'actorIdentityMerges', decision.sourceActorId],
        code: 'actor_identity_merge_rejected',
        message: `Actor identity merge "${decision.sourceActorId}" -> "${decision.targetActorId}" was rejected because the target was neither explicitly named by the player nor linked by an exact identity value.`
      });
      return false;
    });
    if (locallyEligibleDecisions.length === 0) {
      return {
        state,
        response,
        actorIdAliases: deterministicActorIdAliases,
        diagnostics: [
          ...deterministicDiagnostics,
          ...parsed.diagnostics,
          ...locallyRejectedDiagnostics
        ]
      };
    }

    const existingMergeResult = applyExistingActorIdentityMerges(state, locallyEligibleDecisions);
    const patchMergeResult = applyActorIdentityMergePatches(
      existingMergeResult.state,
      response,
      locallyEligibleDecisions
    );

    return {
      state: existingMergeResult.state,
      response: patchMergeResult.response,
      actorIdAliases: {
        ...deterministicActorIdAliases,
        ...existingMergeResult.actorIdAliases,
        ...patchMergeResult.actorIdAliases
      },
      diagnostics: [
        ...deterministicDiagnostics,
        ...parsed.diagnostics,
        ...locallyRejectedDiagnostics,
        ...existingMergeResult.diagnostics,
        ...patchMergeResult.diagnostics
      ]
    };
  } catch (error) {
    return {
      state,
      response,
      actorIdAliases: deterministicActorIdAliases,
      diagnostics: [
        ...deterministicDiagnostics,
        {
          path: ['writebackRepair', 'actorIdentityMerges'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Actor identity repair failed.'
        }
      ]
    };
  }
}

interface CaseIntakeReviewParseResult {
  caseDecisions: CaseIntakeDecision[];
  casePatches: CasePatch[];
  caseEvidencePatches: CaseEvidencePatch[];
  currentMatterPatches: CurrentMatterPatch[];
  memories: MemorySuggestion[];
  actorMemories: ActorMemorySuggestion[];
  diagnostics: StoryDiagnosticIssue[];
}

type CaseIntakeDecisionKind = 'keep' | 'downgrade_to_matter' | 'merge_into_existing';

interface CaseIntakeDecision {
  candidateCaseId: string;
  decision: CaseIntakeDecisionKind;
  resultId?: string;
  reason: string;
}

function collectNewCasePatches(state: RuntimeState, response: NarratorResponse): CasePatch[] {
  return response.writeback.casePatches.filter((patch) => !state.cases[patch.caseId]);
}

function attachApiUsageToLatestNarratorEntry(state: RuntimeState, apiUsage: TurnApiUsage[]): RuntimeState {
  if (apiUsage.length === 0) return state;

  const storyLog = [...state.storyLog];
  for (let index = storyLog.length - 1; index >= 0; index -= 1) {
    const entry = storyLog[index];
    if (entry.speaker !== 'narrator' || !entry.turnMetrics) continue;
    storyLog[index] = {
      ...entry,
      turnMetrics: {
        ...entry.turnMetrics,
        apiUsage
      }
    };
    return {
      ...state,
      storyLog
    };
  }

  return state;
}

function normalizeIndependentRepairMemory(memory: MemorySuggestion): MemorySuggestion {
  return memory.kind === 'turn' ? { ...memory, kind: 'world' } : memory;
}

function createCaseIntakeReviewPrompt({
  state,
  response,
  playerInput,
  turnEndTime,
  candidateCasePatches,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  candidateCasePatches: CasePatch[];
  promptSettings?: PromptSettings;
}): string {
  const candidateCaseIds = new Set(candidateCasePatches.map((patch) => patch.caseId));
  const candidateEvidencePatches = response.writeback.caseEvidencePatches.filter((patch) =>
    candidateCaseIds.has(patch.caseId)
  );
  const existingCases = Object.values(state.cases).map((caseFile) => ({
    caseId: caseFile.caseId,
    title: caseFile.title,
    status: caseFile.status,
    summary: caseFile.summary,
    currentFocus: caseFile.currentFocus,
    relatedActorIds: caseFile.relatedActorIds,
    relatedPlaceIds: caseFile.relatedPlaceIds
  }));
  const existingCurrentMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.status !== 'archived')
    .map((matter) => ({
      id: matter.id,
      title: matter.title,
      summary: matter.summary,
      status: matter.status,
      matterKind: matter.matterKind,
      source: matter.source,
      relatedActorIds: matter.relatedActorIds,
      relatedPlaceIds: matter.relatedPlaceIds,
      relatedCaseIds: matter.relatedCaseIds
    }));

  return [
    resolvePromptText('repair.caseIntake', promptSettings),
    '请返回 JSON：{"caseDecisions":[{"candidateCaseId":"候选 caseId","decision":"keep|downgrade_to_matter|merge_into_existing","resultId":"最终案件或事项 ID","reason":"依据"}],"casePatches":[...],"caseEvidencePatches":[...],"currentMatterPatches":[...],"memories":[...],"actorMemories":[...]}。',
    '规则：',
    '1. 只审查 candidateNewCasePatches；existingCases 中已有案件的后续更新不在本任务范围内。',
    '2. 保留为案件：已正式报案/立案、上级交办、出现案号/报告/口供/证据、严重伤害或重大财损、拘捕、社团有组织犯罪、ICAC/检控/媒体高风险，或明显需要多回合调查。',
    '3. 每个 candidateNewCasePatches 必须且只能返回一条 caseDecisions；不能通过省略案件来表达决定。信息不足时 decision=keep。',
    '4. keep：resultId 必须等于候选 caseId；可以返回同 ID casePatches 修正档案，未返回时沿用主叙事的合法候选。',
    '5. downgrade_to_matter：只用于普通出警、轻微滋扰、噪音投诉、现场调停或尚无正式材料的小纠纷；resultId 必须对应一条 currentMatterPatches，matterKind 通常用 police_work，relatedCaseIds 留空。',
    '6. merge_into_existing：候选只是已有案件的新进展时使用；resultId 必须是 existingCases 中 caseId，并返回该 ID 的 casePatches.activityLog。',
    '7. caseEvidencePatches 只能指向保留或合并后的案件；降级动态时不要保留孤立证据。',
    '8. memories 可保存“为什么没有入案/目前只是普通警务事项”的独立事实，便于后续回捞；kind 使用 world 或 case，禁止使用 turn。turn 只保留给主叙事 response.turnSummary。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `existingCases=${JSON.stringify(existingCases)}`,
    `existingCurrentMatters=${JSON.stringify(existingCurrentMatters)}`,
    `candidateNewCasePatches=${JSON.stringify(candidateCasePatches)}`,
    `candidateCaseEvidencePatches=${JSON.stringify(candidateEvidencePatches)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        currentMatterPatches: response.writeback.currentMatterPatches,
        memories: response.writeback.memories,
        actorMemories: response.writeback.actorMemories
      }
    })}`
  ].join('\n');
}

function parseCaseIntakeReviewResponse(value: unknown): CaseIntakeReviewParseResult {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const caseDecisions: CaseIntakeDecision[] = [];
  const casePatches: CasePatch[] = [];
  const caseEvidencePatches: CaseEvidencePatch[] = [];
  const currentMatterPatches: CurrentMatterPatch[] = [];
  const memories: MemorySuggestion[] = [];
  const actorMemories: ActorMemorySuggestion[] = [];

  const rawCaseDecisions =
    isRecord(container) && Array.isArray(container.caseDecisions) ? container.caseDecisions : [];
  rawCaseDecisions.forEach((item, index) => {
    if (!isRecord(item)) {
      diagnostics.push({
        path: ['writebackRepair', 'caseIntake', 'caseDecisions', index],
        code: 'invalid_type',
        message: 'Case intake decision must be an object.'
      });
      return;
    }
    const candidateCaseId = nonEmptyString(item.candidateCaseId);
    const decision = nonEmptyString(item.decision)?.toLowerCase().replace(/[\s-]+/g, '_');
    const reason = nonEmptyString(item.reason);
    if (
      !candidateCaseId ||
      !reason ||
      (decision !== 'keep' &&
        decision !== 'downgrade_to_matter' &&
        decision !== 'merge_into_existing')
    ) {
      diagnostics.push({
        path: ['writebackRepair', 'caseIntake', 'caseDecisions', index],
        code: 'case_intake_decision_invalid',
        message: 'Case intake decision lacks candidateCaseId, a supported decision, or a non-empty reason.'
      });
      return;
    }
    caseDecisions.push({
      candidateCaseId,
      decision,
      resultId: nonEmptyString(item.resultId),
      reason
    });
  });

  const rawCasePatches = isRecord(container) && Array.isArray(container.casePatches) ? container.casePatches : [];
  rawCasePatches.forEach((item, index) => {
    const parsed = casePatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'caseIntake', 'casePatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    casePatches.push(parsed.data);
  });

  const rawCaseEvidencePatches =
    isRecord(container) && Array.isArray(container.caseEvidencePatches) ? container.caseEvidencePatches : [];
  rawCaseEvidencePatches.forEach((item, index) => {
    const parsed = caseEvidencePatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'caseIntake', 'caseEvidencePatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    caseEvidencePatches.push(parsed.data);
  });

  const rawCurrentMatterPatches =
    isRecord(container) && Array.isArray(container.currentMatterPatches) ? container.currentMatterPatches : [];
  rawCurrentMatterPatches.forEach((item, index) => {
    const parsed = currentMatterPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'caseIntake', 'currentMatterPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    currentMatterPatches.push(parsed.data);
  });

  const rawMemories = isRecord(container) && Array.isArray(container.memories) ? container.memories : [];
  rawMemories.forEach((item, index) => {
    const parsed = memorySuggestionSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'caseIntake', 'memories', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    memories.push(normalizeIndependentRepairMemory(parsed.data));
  });

  const rawActorMemories = isRecord(container) && Array.isArray(container.actorMemories) ? container.actorMemories : [];
  rawActorMemories.forEach((item, index) => {
    const parsed = actorMemorySuggestionSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'caseIntake', 'actorMemories', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    actorMemories.push(parsed.data);
  });

  if (
    casePatches.length === 0 &&
    caseEvidencePatches.length === 0 &&
    currentMatterPatches.length === 0 &&
    memories.length === 0 &&
    actorMemories.length === 0
  ) {
    diagnostics.push({
      path: ['writebackRepair', 'caseIntake'],
      code: 'writeback_repair_invalid',
      message: 'Case intake review did not return any usable casePatches, currentMatterPatches, memories, or actorMemories.'
    });
  }

  return {
    caseDecisions,
    casePatches,
    caseEvidencePatches,
    currentMatterPatches,
    memories,
    actorMemories,
    diagnostics
  };
}

function preserveForwardTurnRelationshipHistory(
  previousState: RuntimeState,
  candidateState: RuntimeState
): RuntimeState {
  const result = preserveRelationshipContinuity(previousState, candidateState);
  return appendDiagnosticsToLatestStoryEntry(result.state, result.diagnostics);
}

function mergeCaseIntakeReview(
  state: RuntimeState,
  response: NarratorResponse,
  candidateCasePatches: CasePatch[],
  repair: CaseIntakeReviewParseResult
): {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
  appliedDecisionCount: number;
} {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const reviewedCaseIds = new Set(candidateCasePatches.map((patch) => patch.caseId));
  const ambiguousDecisionIds = new Set<string>();
  const decisionsByCaseId = new Map<string, CaseIntakeDecision>();
  for (const decision of repair.caseDecisions) {
    if (!reviewedCaseIds.has(decision.candidateCaseId)) {
      diagnostics.push({
        path: ['writebackRepair', 'caseIntake', 'caseDecisions'],
        code: 'case_intake_decision_unknown_candidate',
        message: `Case intake decision referenced unknown candidate ${decision.candidateCaseId}; it was ignored.`
      });
      continue;
    }
    if (decisionsByCaseId.has(decision.candidateCaseId)) {
      decisionsByCaseId.delete(decision.candidateCaseId);
      ambiguousDecisionIds.add(decision.candidateCaseId);
      diagnostics.push({
        path: ['writebackRepair', 'caseIntake', 'caseDecisions'],
        code: 'case_intake_decision_duplicate',
        message: `Case intake returned more than one decision for ${decision.candidateCaseId}; the original case was preserved.`
      });
      continue;
    }
    if (!ambiguousDecisionIds.has(decision.candidateCaseId)) {
      decisionsByCaseId.set(decision.candidateCaseId, decision);
    }
  }

  const repairedCasesById = new Map(repair.casePatches.map((patch) => [patch.caseId, patch]));
  const repairedMattersById = new Map(repair.currentMatterPatches.map((patch) => [patch.id, patch]));
  const finalCasesById = new Map(
    response.writeback.casePatches
      .filter((patch) => !reviewedCaseIds.has(patch.caseId))
      .map((patch) => [patch.caseId, patch])
  );
  const keptReviewedCaseIds = new Set<string>();
  const approvedRepairCaseIds = new Set<string>();
  const approvedMatterIds = new Set<string>();
  let appliedDecisionCount = 0;

  const preserveOriginal = (patch: CasePatch, reason: string) => {
    finalCasesById.set(patch.caseId, patch);
    keptReviewedCaseIds.add(patch.caseId);
    diagnostics.push({
      path: ['writebackRepair', 'caseIntake', 'caseDecisions', patch.caseId],
      code: 'case_intake_original_preserved',
      message: `${reason} Original case candidate ${patch.caseId} was preserved.`
    });
  };

  for (const candidate of candidateCasePatches) {
    const decision = decisionsByCaseId.get(candidate.caseId);
    if (!decision) {
      preserveOriginal(candidate, 'No single valid per-candidate decision was returned.');
      continue;
    }

    if (decision.decision === 'keep') {
      if (decision.resultId !== candidate.caseId) {
        preserveOriginal(candidate, 'The keep decision did not point back to the candidate caseId.');
        continue;
      }
      finalCasesById.set(candidate.caseId, repairedCasesById.get(candidate.caseId) ?? candidate);
      keptReviewedCaseIds.add(candidate.caseId);
      approvedRepairCaseIds.add(candidate.caseId);
      appliedDecisionCount += 1;
      continue;
    }

    if (decision.decision === 'downgrade_to_matter') {
      const matter = decision.resultId ? repairedMattersById.get(decision.resultId) : undefined;
      if (!matter) {
        preserveOriginal(candidate, 'The downgrade decision had no matching valid current matter.');
        continue;
      }
      approvedMatterIds.add(matter.id);
      appliedDecisionCount += 1;
      continue;
    }

    const targetCaseId = decision.resultId;
    const mergedCase = targetCaseId ? repairedCasesById.get(targetCaseId) : undefined;
    if (!targetCaseId || !state.cases[targetCaseId] || !mergedCase) {
      preserveOriginal(candidate, 'The merge decision had no matching existing case and valid case patch.');
      continue;
    }
    finalCasesById.set(targetCaseId, mergedCase);
    approvedRepairCaseIds.add(targetCaseId);
    appliedDecisionCount += 1;
  }

  const caseEvidencePatchesById = new Map<string, CaseEvidencePatch>();
  for (const patch of response.writeback.caseEvidencePatches) {
    if (!reviewedCaseIds.has(patch.caseId) || keptReviewedCaseIds.has(patch.caseId)) {
      caseEvidencePatchesById.set(patch.evidenceId, patch);
    }
  }
  for (const patch of repair.caseEvidencePatches) {
    if (approvedRepairCaseIds.has(patch.caseId)) {
      caseEvidencePatchesById.set(patch.evidenceId, patch);
    }
  }

  const currentMatterPatches = new Map(response.writeback.currentMatterPatches.map((patch) => [patch.id, patch]));
  for (const patch of repair.currentMatterPatches) {
    if (approvedMatterIds.has(patch.id)) currentMatterPatches.set(patch.id, patch);
  }

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        casePatches: [...finalCasesById.values()],
        caseEvidencePatches: [...caseEvidencePatchesById.values()],
        currentMatterPatches: [...currentMatterPatches.values()],
        memories: appliedDecisionCount > 0
          ? [...response.writeback.memories, ...repair.memories]
          : response.writeback.memories,
        actorMemories: appliedDecisionCount > 0
          ? [...response.writeback.actorMemories, ...repair.actorMemories]
          : response.writeback.actorMemories
      }
    },
    diagnostics,
    appliedDecisionCount
  };
}

async function repairCaseIntake({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair) return { response, diagnostics: [] };

  const candidateCasePatches = collectNewCasePatches(state, response);
  if (candidateCasePatches.length === 0) return { response, diagnostics: [] };

  try {
    const repairPrompt = createCaseIntakeReviewPrompt({
      state,
      response,
      playerInput,
      turnEndTime,
      candidateCasePatches,
      promptSettings
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseCaseIntakeReviewResponse(repairRaw);
    if (
      parsed.caseDecisions.length === 0 &&
      parsed.casePatches.length === 0 &&
      parsed.caseEvidencePatches.length === 0 &&
      parsed.currentMatterPatches.length === 0 &&
      parsed.memories.length === 0 &&
      parsed.actorMemories.length === 0
    ) {
      return { response, diagnostics: parsed.diagnostics };
    }

    const merged = mergeCaseIntakeReview(state, response, candidateCasePatches, parsed);
    return {
      response: merged.response,
      diagnostics: [
        ...parsed.diagnostics,
        ...merged.diagnostics,
        {
          path: ['writeback', 'caseIntake'],
          code: 'writeback_repair_applied',
          message: `Writeback repair reviewed ${candidateCasePatches.length} new case candidate(s); applied ${merged.appliedDecisionCount} explicit decision(s).`
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'caseIntake'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Case intake review failed.'
        }
      ]
    };
  }
}

interface IncidentOriginRepairParseResult {
  status?: IncidentOriginRepairStatus;
  currentMatterPatches: CurrentMatterPatch[];
  memories: MemorySuggestion[];
  actorMemories: ActorMemorySuggestion[];
  diagnostics: StoryDiagnosticIssue[];
}

type IncidentOriginRepairStatus = 'applied' | 'already_persisted' | 'not_applicable';

function normalizeIncidentOriginText(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasIncidentOriginCue(text: string): boolean {
  const normalized = normalizeIncidentOriginText(text);
  if (!normalized) return false;

  const originCue =
    /(报案|报警|接报|派警|派员|投诉|求助|通报)/.test(normalized) ||
    /(?:来电|打电话|电话)(?:报案|报警|投诉|求助|通报)/.test(normalized) ||
    /电台(?:通知|传来|呼叫|派遣)/.test(normalized) ||
    /\b(called police|police call|dispatch|dispatcher|complaint|reported to police)\b/i.test(text);
  if (!originCue) return false;

  return (
    /(警|警署|警方|警员|现场|处理|案件|滋事|冲突|打斗|砸|调戏|伤人|火警|火灾|刀|枪|毒|偷|抢|勒索|纠纷|看场|经理|店主|住户|包厢)/.test(
      normalized
    ) || /\b(police|officer|incident|disturbance|assault|fight|scene|case)\b/i.test(text)
  );
}

function hasNewIncidentOriginCue(text: string): boolean {
  const normalized = normalizeIncidentOriginText(text);
  if (!normalized) return false;

  return (
    /(?:本回合|刚刚|刚|新近|随后)?(?:接到|接获|收到|获悉|获报)(?:了)?[^。；，,]{0,30}(?:报案|报警|派警|投诉|求助)/.test(
      normalized
    ) ||
    /(?:警方|警署|警员|玩家|你)(?:刚刚|刚)?(?:接报|获派|被派|奉命|受命)[^。；，,]{0,30}(?:到场|前往|处理|调查|查看)?/.test(
      normalized
    ) ||
    /(?:报案人|市民|住户|店主|经理|场方|线人|电台)[^。；，,]{0,24}(?:来电|致电|前来|来到|通知|通报)[^。；，,]{0,24}(?:报案|报警|投诉|求助|请求警方|要求警方)/.test(
      normalized
    ) ||
    /(?:来电|致电|打电话|电话)(?:报案|报警|投诉|求助)/.test(normalized) ||
    /\b(received (?:a )?(?:report|complaint|police call)|was dispatched|called police|reported .{0,30} to police)\b/i.test(
      text
    )
  );
}

function incidentOriginDurableWritebackText(response: NarratorResponse): string {
  return JSON.stringify({
    currentMatterPatches: response.writeback.currentMatterPatches,
    casePatches: response.writeback.casePatches,
    deferredEventPatches: response.writeback.deferredEventPatches,
    memories: response.writeback.memories,
    actorMemories: response.writeback.actorMemories
  });
}

function shouldRepairIncidentOrigin(response: NarratorResponse): boolean {
  if (!hasNewIncidentOriginCue(response.turnSummary)) return false;

  return !hasIncidentOriginCue(incidentOriginDurableWritebackText(response));
}

function existingDurableMemoriesForIncidentOrigin(state: RuntimeState) {
  return Object.values(state.memories)
    .filter((memory) => memory.visibility !== 'hidden' && memory.compressedIntoMemoryId === undefined)
    .sort((left, right) => right.importance - left.importance)
    .slice(0, 24)
    .map((memory) => ({
      memoryId: memory.memoryId,
      text: memory.text,
      kind: memory.kind,
      certainty: memory.certainty,
      relatedActorIds: memory.relatedActorIds,
      relatedCaseIds: memory.relatedCaseIds,
      relatedPlaceIds: memory.relatedPlaceIds,
      gameTime: memory.gameTime
    }));
}

function createIncidentOriginRepairPrompt({
  state,
  response,
  playerInput,
  turnEndTime
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
}): string {
  const existingCurrentMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.status !== 'archived')
    .map((matter) => ({
      id: matter.id,
      title: matter.title,
      summary: matter.summary,
      status: matter.status,
      source: matter.source,
      relatedActorIds: matter.relatedActorIds,
      relatedPlaceIds: matter.relatedPlaceIds,
      relatedCaseIds: matter.relatedCaseIds
    }));
  const existingCases = Object.values(state.cases).map((caseFile) => ({
    caseId: caseFile.caseId,
    title: caseFile.title,
    status: caseFile.status,
    summary: caseFile.summary,
    currentFocus: caseFile.currentFocus,
    relatedActorIds: caseFile.relatedActorIds,
    relatedPlaceIds: caseFile.relatedPlaceIds
  }));
  const knownPlaces = Object.values(state.places)
    .slice(0, 80)
    .map((place) => ({
      placeId: place.placeId,
      name: place.name,
      nameZh: place.nameZh,
      nameEn: place.nameEn,
      aliases: place.aliases
    }));
  const knownActors = Object.values(state.actors)
    .filter((actor) => actor.presence === 'present' || actor.presence === 'nearby' || actor.importance >= 70)
    .slice(0, 60)
    .map((actor) => ({
      actorId: actor.actorId,
      name: actor.name,
      aliases: actor.aliases,
      publicIdentity: actor.publicIdentity,
      currentPlaceId: actor.currentPlaceId,
      presence: actor.presence
    }));
  const existingDurableMemories = existingDurableMemoriesForIncidentOrigin(state);

  return [
    'WRITEBACK_REPAIR_TASK',
    'INCIDENT_ORIGIN_REPAIR_TASK',
    '你是结构化写回修复器，只补“报案/派警/通报/求助/投诉来源”这类事故来源事实，不改正文，不创造新剧情。',
    '先对照 existingCurrentMatters、existingCases 和 existingDurableMemories，判断本回合是否真的产生了新的来源事实。',
    '严格返回 JSON：{"status":"applied","currentMatterPatches":[...],"memories":[...],"actorMemories":[...]}；status 只能改成 already_persisted 或 not_applicable。',
    'memories 的每一项必须是对象，最小合法形状为 {"text":"...","kind":"world","importance":75,"visibility":"player_known","certainty":"fact"}，禁止返回字符串数组。',
    '规则：',
    '1. 只有本回合新增且尚未持久化的来源事实使用 status=applied，并返回至少一项合法写回。',
    '2. 同一来源已经存在于事项、案件或记忆时使用 status=already_persisted，三个数组全部留空；只是回顾、继续处理、假设、否定或普通对话时使用 status=not_applicable，三个数组全部留空。',
    '3. status=applied 时，只提取本回合事实摘要与正文已经明确出现的来源、报案人/通报方、目标地点、求助原因、谁应该知道此事；不要新增嫌疑人、动机或新剧情。',
    '4. 仍在进行的警务/现场事件必须写 currentMatterPatches；title 和 summary 必须包含报案/派警来源，currentHook 必须说明后续相关知情人不能完全忘记这次报案，只能对报警目的、范围或后果改口。',
    '5. 相关事项由玩家处理时，relatedActorIds 必须包含 player；能复用已知 placeId/actorId/caseId 时复用，不能确定时宁可留空数组，不要发明 ID。',
    '6. status=applied 时同时写一条高重要度 memories，保存“谁报案/谁通报/为什么派警/谁应当知情”的独立事实；kind 使用 world，禁止使用 turn。',
    '7. 只有报案人/经理/线人等 Actor 已存在或本回合 actorPatches 已创建时，才写 actorMemories；不要为了写记忆创建新 Actor。',
    '8. 不要返回 actorPatches、placePatches、casePatches 或正文；普通报案、派警、店主求助和现场投诉先进入 currentMatterPatches，不等于正式案件。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `existingCurrentMatters=${JSON.stringify(existingCurrentMatters)}`,
    `existingCases=${JSON.stringify(existingCases)}`,
    `existingDurableMemories=${JSON.stringify(existingDurableMemories)}`,
    `knownPlaces=${JSON.stringify(knownPlaces)}`,
    `knownActors=${JSON.stringify(knownActors)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      turnSummary: response.turnSummary,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        actorPatches: response.writeback.actorPatches,
        placePatches: response.writeback.placePatches,
        scenePatches: response.writeback.scenePatches,
        casePatches: response.writeback.casePatches,
        currentMatterPatches: response.writeback.currentMatterPatches,
        memories: response.writeback.memories,
        actorMemories: response.writeback.actorMemories
      }
    })}`
  ].join('\n');
}

function repairContainer(value: unknown): unknown {
  return isRecord(value) && isRecord(value.writeback) ? value.writeback : value;
}

function relationshipActorIdsFromPatch(patch: { primaryActorId?: string; relatedActorIds?: string[] }): string[] {
  return uniqueStrings([patch.primaryActorId, ...(patch.relatedActorIds ?? [])]);
}

function relationshipEvidenceStoresForResponse(state: RuntimeState, response: NarratorResponse) {
  return {
    memories: state.memories,
    cases: state.cases,
    deferredEvents: state.deferredEvents,
    additionalCaseIds: response.writeback.casePatches.map((patch) => patch.caseId),
    additionalDeferredEventIds: response.writeback.deferredEventPatches.map((patch) => patch.eventId)
  };
}

function normalizeRelationshipEvidenceForResponse(
  state: RuntimeState,
  response: NarratorResponse
): { response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] } {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const relationshipThreadPatches = response.writeback.relationshipThreadPatches.map((patch, index) => {
    const identityResolution = resolveRelationshipThreadIdentity(
      state.relationshipThreads,
      patch,
      state.player.actorId,
      ['writeback', 'relationshipThreadPatches', index]
    );
    diagnostics.push(...identityResolution.diagnostics);
    patch = identityResolution.patch as RelationshipThreadPatch;
    const evaluation = evaluateRelationshipCreationEvidence(
      patch,
      relationshipEvidenceStoresForResponse(state, response),
      ['writeback', 'relationshipThreadPatches', index]
    );
    diagnostics.push(...evaluation.diagnostics.filter(
      (issue) => issue.code !== 'relationship_evidence_insufficient' || !state.relationshipThreads[patch.threadId]
    ));
    if (!patch.evidenceRefs) return patch;
    if (state.relationshipThreads[patch.threadId] && evaluation.validRefs.length === 0) {
      const { evidenceRefs: _invalidEvidenceRefs, ...patchWithoutEvidence } = patch;
      return patchWithoutEvidence;
    }
    return {
      ...patch,
      evidenceRefs: evaluation.validRefs
    };
  });

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        relationshipThreadPatches
      }
    },
    diagnostics
  };
}

function collectRelationshipRepairCandidates(
  state: RuntimeState,
  response: NarratorResponse
): {
  actorIds: string[];
  threadIds: string[];
  actorIdsByThreadId: Record<string, string[]>;
  omissionCandidates: RelationshipOmissionCandidate[];
} {
  const allowedActorIds = new Set([...Object.keys(state.actors), ...response.writeback.actorPatches.map((patch) => patch.actorId)]);
  const candidateIds = new Set<string>();
  const candidateThreadIds = new Set<string>();
  const actorIdsByThreadId = new Map<string, Set<string>>();
  for (const patch of response.writeback.relationshipThreadPatches) {
    if (state.relationshipThreads[patch.threadId]) continue;
    const evaluation = evaluateRelationshipCreationEvidence(
      patch,
      relationshipEvidenceStoresForResponse(state, response)
    );
    if (evaluation.sufficient) continue;
    candidateThreadIds.add(patch.threadId);
    for (const actorId of relationshipActorIdsFromPatch(patch)) {
      if (actorId === state.player.actorId || actorId === 'player') continue;
      candidateIds.add(actorId);
      const anchors = actorIdsByThreadId.get(patch.threadId) ?? new Set<string>();
      anchors.add(actorId);
      actorIdsByThreadId.set(patch.threadId, anchors);
    }
  }

  const actorsWithExistingThreads = new Set(
    Object.values(state.relationshipThreads).flatMap((thread) => relationshipActorIdsFromPatch(thread))
  );
  const actorPatchById = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
  const actorMemoryIds = new Set(response.writeback.actorMemories.map((memory) => memory.actorId));
  const matterActorIds = new Set(response.writeback.currentMatterPatches.flatMap((matter) => matter.relatedActorIds ?? []));
  const caseActorIds = new Set(response.writeback.casePatches.flatMap((caseFile) => caseFile.relatedActorIds ?? []));
  const deferredActorIds = new Set(
    response.writeback.deferredEventPatches
      .map((event) => event.relatedIds?.actorId)
      .filter((actorId): actorId is string => Boolean(actorId))
  );
  const hasRelationshipFields = (actorId: string): boolean => {
    const patch = actorPatchById.get(actorId);
    const actor = state.actors[actorId];
    return Boolean(
      [
        patch?.relationshipSummary,
        patch?.attitudeTowardPlayer,
        patch?.trustTendency,
        patch?.entanglementSummary,
        actor?.relationshipSummary,
        actor?.attitudeTowardPlayer,
        actor?.trustTendency,
        actor?.entanglementSummary
      ].some((value) => typeof value === 'string' && value.trim())
    );
  };
  const omissionCandidates: RelationshipOmissionCandidate[] = [];
  for (const actorId of [...actorMemoryIds].sort()) {
    if (
      actorId === state.player.actorId ||
      actorId === 'player' ||
      !allowedActorIds.has(actorId) ||
      actorsWithExistingThreads.has(actorId)
    ) {
      continue;
    }
    const structuredSignals = [
      hasRelationshipFields(actorId) ? 'actor_relationship_state' : '',
      matterActorIds.has(actorId) ? 'current_matter' : '',
      caseActorIds.has(actorId) ? 'case_patch' : '',
      deferredActorIds.has(actorId) ? 'deferred_event_patch' : ''
    ].filter(Boolean);
    if (structuredSignals.length === 0) continue;

    const historicalMemories = Object.values(state.memories)
      .filter(
        (memory) =>
          memory.relatedActorIds.includes(actorId) &&
          (memory.certainty === 'fact' || memory.certainty === 'claim' || memory.certainty === 'disputed')
      )
      .sort((left, right) => right.importance - left.importance || left.memoryId.localeCompare(right.memoryId));
    const historicalCases = Object.values(state.cases)
      .filter((caseFile) => caseFile.relatedActorIds.includes(actorId))
      .map((caseFile) => caseFile.caseId);
    const historicalDeferredEvents = Object.values(state.deferredEvents)
      .filter((event) => event.relatedIds.actorId === actorId)
      .map((event) => event.eventId);
    const historicalEvidenceIds = [
      ...historicalMemories.map((memory) => `memory:${memory.memoryId}`),
      ...historicalCases.map((caseId) => `case:${caseId}`),
      ...historicalDeferredEvents.map((eventId) => `deferred_event:${eventId}`)
    ].slice(0, 8);
    if (historicalEvidenceIds.length === 0) continue;

    let threadId = `rel_network_${actorId}`;
    let suffix = 2;
    while (state.relationshipThreads[threadId] || candidateThreadIds.has(threadId)) {
      threadId = `rel_network_${actorId}_${suffix}`;
      suffix += 1;
    }
    const basisHint = historicalCases.length > 0 || historicalDeferredEvents.length > 0
      ? 'ongoing_joint_matter'
      : 'repeated_contact';
    omissionCandidates.push({
      threadId,
      actorId,
      basisHint,
      historicalEvidenceIds,
      structuredSignals: ['actor_memory', ...structuredSignals]
    });
    candidateIds.add(actorId);
    candidateThreadIds.add(threadId);
    actorIdsByThreadId.set(threadId, new Set([actorId]));
    if (omissionCandidates.length >= 2) break;
  }

  return {
    actorIds: [...candidateIds]
      .filter((actorId) => allowedActorIds.has(actorId))
      .sort(),
    threadIds: [...candidateThreadIds].sort(),
    actorIdsByThreadId: Object.fromEntries(
      [...actorIdsByThreadId.entries()].map(([threadId, actorIds]) => [threadId, [...actorIds].sort()])
    ),
    omissionCandidates
  };
}

function summarizeActorForRelationshipThreadRepair(actor: Actor) {
  return {
    actorId: actor.actorId,
    name: actor.name,
    aliases: actor.aliases,
    gender: actor.gender,
    currentIdentity: actor.currentIdentity,
    publicIdentity: actor.publicIdentity,
    actualIdentitySummary: actor.actualIdentitySummary,
    currentPlaceId: actor.currentPlaceId,
    presence: actor.presence,
    positionSummary: actor.positionSummary,
    profileSummary: actor.profileSummary,
    relationshipSummary: actor.relationshipSummary,
    attitudeTowardPlayer: actor.attitudeTowardPlayer,
    interactionScore: actor.interactionScore,
    trustTendency: actor.trustTendency,
    entanglementSummary: actor.entanglementSummary,
    longTermMemorySummary: actor.longTermMemorySummary,
    recentInteractionMemory: actor.recentInteractionMemory,
    visibility: actor.visibility,
    importance: actor.importance
  };
}

function summarizeActorPatchForRelationshipThreadRepair(patch: ActorPatch) {
  return {
    actorId: patch.actorId,
    name: patch.name,
    aliases: patch.aliases,
    gender: patch.gender,
    currentIdentity: patch.currentIdentity,
    publicIdentity: patch.publicIdentity,
    actualIdentitySummary: patch.actualIdentitySummary,
    currentPlaceId: patch.currentPlaceId,
    presence: patch.presence,
    positionSummary: patch.positionSummary,
    profileSummary: patch.profileSummary,
    relationshipSummary: patch.relationshipSummary,
    attitudeTowardPlayer: patch.attitudeTowardPlayer,
    interactionScore: patch.interactionScore,
    trustTendency: patch.trustTendency,
    entanglementSummary: patch.entanglementSummary,
    longTermMemorySummary: patch.longTermMemorySummary,
    recentInteractionMemory: patch.recentInteractionMemory,
    visibility: patch.visibility,
    importance: patch.importance
  };
}

const RELATIONSHIP_CREATION_BASIS_VALUES = [
  'family',
  'formal_partner',
  'formal_informant',
  'debt_or_promise',
  'protection',
  'ongoing_joint_matter',
  'repeated_contact',
  'sustained_conflict'
] as const;

const RELATIONSHIP_CREATION_BASIS_CONTRACT = RELATIONSHIP_CREATION_BASIS_VALUES.join(' / ');

function boundedRelationshipEvidenceSummary(value: string): string {
  return value.trim().slice(0, 240);
}

function normalizeRelationshipRepairEvidenceRefs(
  value: unknown,
  path: Array<string | number>
): ReturnType<typeof normalizeRelationshipEvidenceRefs> {
  const aliasDiagnostics: StoryDiagnosticIssue[] = [];
  const normalizedInput = Array.isArray(value)
    ? value.map((candidate, index) => {
        if (!isRecord(candidate)) return candidate;
        const summary = typeof candidate.summary === 'string' ? candidate.summary.trim() : '';
        const text = typeof candidate.text === 'string' ? candidate.text.trim() : '';
        if (summary || !text) return candidate;
        const { text: _text, ...rest } = candidate;
        aliasDiagnostics.push({
          path: [...path, index, 'summary'],
          code: 'relationship_evidence_summary_normalized',
          message: 'Relationship repair evidence used text instead of summary; the bounded text was normalized into summary.'
        });
        return { ...rest, summary: boundedRelationshipEvidenceSummary(text) };
      })
    : value;
  const normalized = normalizeRelationshipEvidenceRefs(normalizedInput, path);
  return {
    evidenceRefs: normalized.evidenceRefs,
    diagnostics: [...aliasDiagnostics, ...normalized.diagnostics]
  };
}

function createRelationshipThreadRepairPrompt({
  state,
  response,
  playerInput,
  candidateActorIds
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  candidateActorIds: string[];
}): string {
  const actorPatchById = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
  const candidateActors = candidateActorIds.map((actorId) => {
    const actor = state.actors[actorId];
    const patch = actorPatchById.get(actorId);
    return {
      before: actor ? summarizeActorForRelationshipThreadRepair(actor) : undefined,
      thisTurnPatch: patch ? summarizeActorPatchForRelationshipThreadRepair(patch) : undefined
    };
  });
  const existingThreads = Object.values(state.relationshipThreads ?? {})
    .filter((thread) => thread.visibility !== 'hidden')
    .sort((left, right) => right.threadId.localeCompare(left.threadId))
    .slice(0, 24)
    .map((thread) => ({
      threadId: thread.threadId,
      kind: thread.kind,
      title: thread.title,
      summary: thread.summary,
      relatedActorIds: thread.relatedActorIds,
      primaryActorId: thread.primaryActorId,
      relationshipRole: thread.relationshipRole,
      status: thread.status,
      currentPull: thread.currentPull,
      nextNaturalBeatHint: thread.nextNaturalBeatHint,
      visibility: thread.visibility
    }));

  return [
    'WRITEBACK_REPAIR_TASK',
    'RELATIONSHIP_THREAD_REPAIR_TASK',
    '你是人脉与缘份写回修复器，只修复 relationshipThreadPatches，不改正文，不创造新剧情。',
    '主叙事模型已经明确尝试创建关系线，但可能漏写创建依据字段；你只能修复这条显式 relationshipThreadPatch。',
    '请返回 JSON：{"relationshipThreadPatches":[...]}。没有需要修复时返回 {"relationshipThreadPatches":[]}。',
    '规则：',
    '1. 只有家庭、正式伴侣、正式线人、债务/承诺、保护、长期共同事务、反复接触或持续冲突可以建线；普通同事、高 importance 和单条人物记忆都不是依据。',
    '2. 不要根据 actorPatches、actorMemories、currentMatterPatches 或正文自行新增主叙事没有显式提出的关系线。',
    '3. 普通社会/工作/线索关系用 kind="network"；暧昧、恋爱、亲密或强情感牵引用 kind="fate"。',
    '3a. network 与 fate 是同一人物关系线的层级。若 existingRelationshipThreads 已有该人物的 network，而本回合明确形成持续亲密或正式伴侣事实，必须复用原 threadId 升级为 fate；不得另建第二条 fate，也不得把 fate 降回 network。',
    '4. 不要发明新人物；relatedActorIds 和 primaryActorId 必须来自 candidateActorIds 或 existingActors。',
    '5. 新建关系线必须有 threadId、kind、title、summary、relatedActorIds、relationshipRole、creationBasis、evidenceRefs；当前回合的结构化关系事实可引用 {kind:"current_turn",refId:"current_turn",summary:"..."}。repeated_contact / sustained_conflict 至少需要两项不同有效引用。',
    `5a. creationBasis 只能逐字使用：${RELATIONSHIP_CREATION_BASIS_CONTRACT}。不得翻译、缩写或创造新值。`,
    '5b. evidenceRefs 每项只能包含 kind、refId、summary；从证据候选引用时保留候选的 kind/refId，并把候选摘要写入 summary，禁止返回 text、id 或 memoryId 代替规范字段。',
    '6. currentPull / nextNaturalBeatHint 应写成远场 NPC 可自然回响的钩子，不要写成固定任务。',
    '7. 不确定就返回空数组，宁缺毋滥。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `candidateActorIds=${JSON.stringify(candidateActorIds)}`,
    `candidateActors=${JSON.stringify(candidateActors)}`,
    `existingRelationshipThreads=${JSON.stringify(existingThreads)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      writeback: {
        actorPatches: response.writeback.actorPatches.map(summarizeActorPatchForRelationshipThreadRepair),
        actorMemories: response.writeback.actorMemories,
        memories: response.writeback.memories,
        currentMatterPatches: response.writeback.currentMatterPatches,
        relationshipThreadPatches: response.writeback.relationshipThreadPatches
      }
    })}`
  ].join('\n');
}

function parseRelationshipThreadRepairResponse(
  value: unknown,
  state: RuntimeState,
  response: NarratorResponse,
  allowedActorIds: Set<string>,
  candidateActorIds: Set<string>,
  candidateThreadIds: Set<string>,
  candidateActorIdsByThreadId: Record<string, string[]> = {}
): { patches: RelationshipThreadPatch[]; diagnostics: StoryDiagnosticIssue[] } {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawPatches = isRecord(container) && Array.isArray(container.relationshipThreadPatches)
    ? container.relationshipThreadPatches
    : undefined;

  if (!Array.isArray(rawPatches)) {
    return {
      patches: [],
      diagnostics: [
        {
          path: ['writebackRepair', 'relationshipThreadPatches'],
          code: 'writeback_repair_invalid',
          message: 'Relationship thread repair did not return a relationshipThreadPatches array.'
        }
      ]
    };
  }

  const patches: RelationshipThreadPatch[] = [];
  rawPatches.forEach((item, index) => {
    const normalizedEvidence = isRecord(item)
      ? normalizeRelationshipRepairEvidenceRefs(
          item.evidenceRefs,
          ['writebackRepair', 'relationshipThreadPatches', index, 'evidenceRefs']
        )
      : undefined;
    if (normalizedEvidence) diagnostics.push(...normalizedEvidence.diagnostics);
    if (
      isRecord(item) &&
      item.creationBasis !== undefined &&
      !RELATIONSHIP_CREATION_BASIS_VALUES.includes(
        item.creationBasis as (typeof RELATIONSHIP_CREATION_BASIS_VALUES)[number]
      )
    ) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index, 'creationBasis'],
        code: 'relationship_creation_basis_invalid',
        message: `Relationship repair creationBasis ${String(JSON.stringify(item.creationBasis) ?? item.creationBasis).slice(0, 120)} is outside the allowed contract.`
      });
    }
    const parsed = relationshipThreadPatchSchema.safeParse(
      isRecord(item) && item.evidenceRefs !== undefined
        ? { ...item, evidenceRefs: normalizedEvidence?.evidenceRefs ?? [] }
        : item
    );
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'relationshipThreadPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }

    const relatedActorIds = relationshipActorIdsFromPatch(parsed.data);
    const unknownActorIds = relatedActorIds.filter((actorId) => actorId !== 'player' && !allowedActorIds.has(actorId));
    if (unknownActorIds.length > 0) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index, 'relatedActorIds'],
        code: 'writeback_repair_unrelated_actor',
        message: `Relationship thread repair referenced unknown actor(s): ${unknownActorIds.join(', ')}.`
      });
      return;
    }

    if (!relatedActorIds.some((actorId) => candidateActorIds.has(actorId))) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index, 'relatedActorIds'],
        code: 'writeback_repair_unrelated_relationship',
        message: `Relationship thread repair returned a patch not anchored to this turn's relationship candidates.`
      });
      return;
    }

    if (!candidateThreadIds.has(parsed.data.threadId)) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index, 'threadId'],
        code: 'writeback_repair_unrelated_relationship',
        message: `Relationship thread repair returned unrelated thread "${parsed.data.threadId}".`
      });
      return;
    }

    const requiredActorIds = candidateActorIdsByThreadId[parsed.data.threadId] ?? [];
    if (requiredActorIds.length > 0 && !requiredActorIds.some((actorId) => relatedActorIds.includes(actorId))) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index, 'relatedActorIds'],
        code: 'writeback_repair_relationship_anchor_mismatch',
        message: `Relationship thread repair for "${parsed.data.threadId}" did not retain its required stable actor anchor.`
      });
      return;
    }

    const evidenceEvaluation = evaluateRelationshipCreationEvidence(
      parsed.data,
      relationshipEvidenceStoresForResponse(state, response),
      ['writebackRepair', 'relationshipThreadPatches', index]
    );
    diagnostics.push(...evidenceEvaluation.diagnostics);
    if (!evidenceEvaluation.sufficient) {
      diagnostics.push({
        path: ['writebackRepair', 'relationshipThreadPatches', index],
        code: 'relationship_structure_repair_failed',
        message: `Relationship structure repair for "${parsed.data.threadId}" did not provide sufficient verifiable evidence.`
      });
      return;
    }

    patches.push({
      ...parsed.data,
      evidenceRefs: evidenceEvaluation.validRefs
    });
  });

  return { patches, diagnostics };
}

function mergeRelationshipThreadRepair(response: NarratorResponse, patches: RelationshipThreadPatch[]): NarratorResponse {
  if (patches.length === 0) return response;

  const merged = new Map(response.writeback.relationshipThreadPatches.map((patch) => [patch.threadId, patch]));
  for (const patch of patches) {
    const existing = merged.get(patch.threadId);
    merged.set(patch.threadId, {
      ...existing,
      ...patch,
      milestoneUpdates: [...(existing?.milestoneUpdates ?? []), ...(patch.milestoneUpdates ?? [])]
    });
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      relationshipThreadPatches: [...merged.values()]
    }
  };
}

async function repairRelationshipThreads({
  state,
  response,
  playerInput,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair) return { response, diagnostics: [] };

  const relationshipCandidates = collectRelationshipRepairCandidates(state, response);
  const candidateActorIds = relationshipCandidates.actorIds;
  if (candidateActorIds.length === 0) return { response, diagnostics: [] };

  try {
    const repairPrompt = createRelationshipThreadRepairPrompt({
      state,
      response,
      playerInput,
      candidateActorIds
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseRelationshipThreadRepairResponse(
      repairRaw,
      state,
      response,
      new Set([...Object.keys(state.actors), ...response.writeback.actorPatches.map((patch) => patch.actorId)]),
      new Set(candidateActorIds),
      new Set(relationshipCandidates.threadIds),
      relationshipCandidates.actorIdsByThreadId
    );
    if (parsed.patches.length === 0) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergeRelationshipThreadRepair(response, parsed.patches),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'relationshipThreadPatches'],
          code: 'relationship_structure_repair_applied',
          message: `Writeback repair supplied ${parsed.patches.length} relationship thread patch(es).`
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'relationshipThreadPatches'],
          code: 'relationship_structure_repair_failed',
          message: error instanceof Error ? error.message : 'Relationship thread repair failed.'
        }
      ]
    };
  }
}

interface PlayerClothingRepairParseResult {
  playerPatch?: PlayerPatch;
  diagnostics: StoryDiagnosticIssue[];
}

function normalizePlayerClothingRepairText(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasPlayerClothingChangeCue(text: string): boolean {
  const normalized = normalizePlayerClothingRepairText(text);
  if (!normalized) return false;
  if (/换装/.test(normalized)) return true;

  const clothingWord =
    /(衣|衫|裤|鞋|制服|军装|便装|便服|便衣|私服|西装|礼服|睡衣|雨衣|外套|夹克|衬衫|长裤|短裤|裙|帽|肩章|帽徽|伪装)/;
  return (
    /(换上|换成|换了|换回|换下|换掉|换衣|更衣|改穿|脱下|脱掉|脱了|穿上|穿回|套上)/.test(normalized) &&
    clothingWord.test(normalized)
  );
}

function shouldRepairPlayerClothing(response: NarratorResponse): boolean {
  if (response.writeback.playerPatch?.clothing !== undefined) return false;
  return hasPlayerClothingChangeCue(response.turnSummary);
}

const playerVitalsRepairActorPatchSchema = actorPatchSchema.superRefine((patch, context) => {
  const parsedVitals = vitalsPatchSchema.safeParse(patch.vitalsPatch);
  if (!parsedVitals.success) {
    context.addIssue({
      code: 'custom',
      path: ['vitalsPatch'],
      message: 'Player vitals repair returned the player actor without a valid vitalsPatch.'
    });
    return;
  }
  if (
    parsedVitals.data.healthDelta === 0 &&
    parsedVitals.data.staminaDelta === 0 &&
    !parsedVitals.data.conditionSummary?.trim()
  ) {
    context.addIssue({
      code: 'custom',
      path: ['vitalsPatch'],
      message: 'Player vitals repair returned an empty vitalsPatch.'
    });
  }
});

function hasMeaningfulPlayerVitalsPatch(response: NarratorResponse, playerActorId: string): boolean {
  return response.writeback.actorPatches.some((patch) => {
    if (patch.actorId !== playerActorId || !patch.vitalsPatch) return false;
    return (
      patch.vitalsPatch.healthDelta !== 0 ||
      patch.vitalsPatch.staminaDelta !== 0 ||
      Boolean(patch.vitalsPatch.conditionSummary?.trim())
    );
  });
}

function requiresPlayerVitalsReview(writebackVersion: string): boolean {
  const match = /^(\d+)\.(\d+)/.exec(writebackVersion.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 6);
}

function requiresPregnancyLifecycleReview(writebackVersion: string): boolean {
  const match = /^(\d+)\.(\d+)/.exec(writebackVersion.trim());
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 1 || (major === 1 && minor >= 7);
}

interface PregnancyLifecycleRepairDecision {
  shouldRepair: boolean;
  patchRequired: boolean;
  reason: 'none' | 'declared_change' | 'invalid_patch' | 'missing_protocol_review';
  missingEvents: PregnancyLifecycleReviewEvent[];
}

function normalizedPregnancyReviewEvent(
  event: PregnancyLifecycleReviewEvent,
  actorIdAliases: Record<string, string>
): PregnancyLifecycleReviewEvent {
  return {
    ...event,
    actorId: actorIdAliases[event.actorId] ?? event.actorId
  };
}

function hasPregnancyPatchForReviewEvent(
  response: NarratorResponse,
  event: PregnancyLifecycleReviewEvent,
  actorIdAliases: Record<string, string>
): boolean {
  const actorId = actorIdAliases[event.actorId] ?? event.actorId;
  if (event.event === 'pregnancy_risk') {
    return response.writeback.pregnancyRiskPatches.some(
      (patch) => (actorIdAliases[patch.actorId] ?? patch.actorId) === actorId
    );
  }
  return response.writeback.pregnancyResolutionPatches.some(
    (patch) =>
      (actorIdAliases[patch.actorId] ?? patch.actorId) === actorId &&
      patch.outcome === event.event
  );
}

function hasPregnancyLifecycleValidationWarning(response: NarratorResponse): boolean {
  return Boolean(
    response.validationWarnings?.some(
      (warning) =>
        issuePathStartsWith(warning.path, ['pregnancyLifecycleReview']) ||
        issuePathStartsWith(warning.path, ['writeback', 'pregnancyRiskPatches']) ||
        issuePathStartsWith(warning.path, ['writeback', 'pregnancyResolutionPatches'])
    )
  );
}

function resolvePregnancyLifecycleRepairDecision(
  response: NarratorResponse,
  actorIdAliases: Record<string, string>
): PregnancyLifecycleRepairDecision {
  const missingEvents = (response.pregnancyLifecycleReview?.events ?? [])
    .map((event) => normalizedPregnancyReviewEvent(event, actorIdAliases))
    .filter((event) => !hasPregnancyPatchForReviewEvent(response, event, actorIdAliases));
  if (missingEvents.length > 0) {
    return {
      shouldRepair: true,
      patchRequired: true,
      reason: 'declared_change',
      missingEvents
    };
  }
  if (hasPregnancyLifecycleValidationWarning(response)) {
    return {
      shouldRepair: true,
      patchRequired: true,
      reason: 'invalid_patch',
      missingEvents: []
    };
  }
  if (
    response.pregnancyLifecycleReview === undefined &&
    requiresPregnancyLifecycleReview(response.writebackVersion)
  ) {
    return {
      shouldRepair: true,
      patchRequired: false,
      reason: 'missing_protocol_review',
      missingEvents: []
    };
  }
  return { shouldRepair: false, patchRequired: false, reason: 'none', missingEvents: [] };
}

const FORMAL_POLICE_ASSIGNMENT_CUE =
  /(正式(?:调任|调往|调入|报到|任命|晋升|升任|组建|成立)|获(?:任命|晋升|调任)|被(?:任命|晋升|调任)|升任|晋升为|调任为|出任|接掌|担任.{0,16}(?:主管|指挥官|组长))/;

function hasFormalPlayerPoliceAssignmentCue(
  state: RuntimeState,
  response: NarratorResponse
): boolean {
  const playerActor = state.actors[state.player.actorId];
  const playerLabels = [state.player.name, playerActor?.name, playerActor?.callName]
    .filter((value): value is string => Boolean(value?.trim()));
  if (playerLabels.length === 0) return false;
  const evidenceSegments = [response.turnSummary, ...response.narrativeText.split(/[。！？!?\n]/)]
    .map((value) => value.replace(/\s+/g, ''))
    .filter(Boolean);
  return evidenceSegments.some((segment) =>
    FORMAL_POLICE_ASSIGNMENT_CUE.test(segment) &&
    playerLabels.some((label) => segment.includes(label.replace(/\s+/g, '')))
  );
}

function shouldRepairPlayerPoliceAssignment(
  state: RuntimeState,
  response: NarratorResponse
): boolean {
  if (state.player.currentIdentity !== 'police') return false;
  if (response.writeback.policeRoleProfilePatch) return false;
  if (response.validationWarnings?.some((warning) =>
    issuePathStartsWith(warning.path, ['writeback', 'policeRoleProfilePatch'])
  )) return true;

  const policePanelPatch = response.writeback.playerPatch?.policePanel;
  const unitSummary = policePanelPatch?.unitSummary?.trim();
  if (unitSummary && unitSummary !== state.policePanel.unitSummary.trim()) return true;
  return hasFormalPlayerPoliceAssignmentCue(state, response);
}

interface PlayerVitalsRepairDecision {
  shouldRepair: boolean;
  patchRequired: boolean;
  reason: 'none' | 'declared_change' | 'missing_protocol_review' | 'lifecycle_review';
  lifecycleReview?: PlayerVitalsLifecycleReview;
}

function resolvePlayerVitalsRepairDecision(
  state: RuntimeState,
  response: NarratorResponse,
  turnEndTime: GameTime
): PlayerVitalsRepairDecision {
  if (hasMeaningfulPlayerVitalsPatch(response, state.player.actorId)) {
    return { shouldRepair: false, patchRequired: false, reason: 'none' };
  }
  if (response.playerVitalsReview?.changed === true) {
    return { shouldRepair: true, patchRequired: true, reason: 'declared_change' };
  }
  const lifecycleReview = resolvePlayerVitalsLifecycleReview({
    vitals: state.player.vitals,
    currentTime: state.time,
    turnEndTime
  });
  if (lifecycleReview.required) {
    return {
      shouldRepair: true,
      patchRequired: true,
      reason: 'lifecycle_review',
      lifecycleReview
    };
  }
  if (response.playerVitalsReview === undefined && requiresPlayerVitalsReview(response.writebackVersion)) {
    return { shouldRepair: true, patchRequired: false, reason: 'missing_protocol_review' };
  }
  return { shouldRepair: false, patchRequired: false, reason: 'none' };
}

function createPlayerVitalsRepairPrompt({
  state,
  response,
  playerInput,
  turnEndTime
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
}): string {
  const decision = resolvePlayerVitalsRepairDecision(state, response, turnEndTime);
  return [
    'WRITEBACK_REPAIR_TASK',
    'PLAYER_VITALS_REPAIR_TASK',
    '你是结构化写回修复器，只复核玩家生命、体力和身体状态；不改正文，不创造新剧情。',
    decision.reason === 'declared_change'
      ? `主叙事已经明确返回 playerVitalsReview.changed=true，理由为 ${JSON.stringify(response.playerVitalsReview?.reason)}，但遗漏了 actorPatches[player].vitalsPatch。你必须返回一条合法玩家 vitalsPatch，不能返回空数组。`
      : decision.reason === 'lifecycle_review'
        ? `当前存档的玩家身体状态需要生命周期复核：${JSON.stringify(decision.lifecycleReview?.detail ?? decision.lifecycleReview?.reason)}。即使数值不变，也必须返回一条玩家 vitalsPatch，使用原有事实或本回合已发生事实写出复核后的 conditionSummary 与 conditionPersistence；不能返回空数组。`
      : '主叙事使用要求结构化身体复核的新协议，却遗漏了 playerVitalsReview。请根据本回合已发生事实完成一次 AI 复核；有明确变化时返回一条玩家 vitalsPatch，没有变化时返回空数组。',
    '只返回 JSON：{"actorPatches":[{"actorId":"player","vitalsPatch":{"healthDelta":0,"staminaDelta":0,"conditionSummary":"...","conditionPersistence":"stable|transient|persistent|unknown"}}]}；仅在主叙事遗漏复核且确认没有变化时，才返回 {"actorPatches":[]}。',
    '规则：',
    '1. 只允许返回 actorId 为 player 的 actorPatches；不要返回 NPC 体力，不要返回 playerPatch，不要返回正文。',
    '2. 根据本回合事实判断增减：追逐、奔跑、近身制服、搏斗、受伤、长时间执勤、熬夜、负重通常会减少体力；睡觉、补眠、休息和治疗可以恢复体力或生命。',
    '3. 生命/体力是稀疏游戏状态，不是代谢模拟。环境闷热、微汗、保持坐姿、普通文书、交谈、等待、情绪紧张、日常站立或短距离走动都不得单独触发变化。',
    '4. 不要每回合机械扣体力；只有本回合已经明确形成、会影响后续行动的身体消耗、伤势、恢复或身体状况变化时才写。',
    '5. healthDelta/staminaDelta 写整数，幅度克制但要有感：轻微但有游戏意义的消耗约 -3 到 -8，明显追逐/搏斗约 -10 到 -25，重伤或极端透支才更高；恢复也按实际休息时长克制处理。',
    '6. conditionSummary 写玩家当前身体状态的中文短句，不写系统解释；同时必须写 conditionPersistence：正常稳定状态用 stable，短期疲劳/宿醉用 transient，持续伤病用 persistent，确实无法判断才用 unknown。',
    '7. 不得因为时间过去就自动宣告伤病痊愈。persistent 状态只能依据本回合明确治疗、恢复或新事实改变；生命周期复核只是防止短期疲劳永久滞留。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `currentPlayerVitals=${JSON.stringify(state.player.vitals)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      turnSummary: response.turnSummary,
      playerVitalsReview: response.playerVitalsReview,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        actorPatches: response.writeback.actorPatches,
        judgementCheckPatches: response.writeback.judgementCheckPatches,
        combatEventPatches: response.writeback.combatEventPatches
      }
    })}`
  ].join('\n');
}

function parsePlayerVitalsRepairResponse(
  value: unknown,
  playerActorId: string,
  patchRequired: boolean
): { patch?: ActorPatch; diagnostics: StoryDiagnosticIssue[] } {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawActorPatches = isRecord(container) && Array.isArray(container.actorPatches) ? container.actorPatches : [];

  for (const [index, item] of rawActorPatches.entries()) {
    const parsed = playerVitalsRepairActorPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const missingVitalsPatch = issue.code === 'custom' && issue.path[0] === 'vitalsPatch';
        const emptyVitalsPatch = missingVitalsPatch && issue.message.includes('empty');
        diagnostics.push({
          path: ['writebackRepair', 'playerVitals', 'actorPatches', index, ...issue.path.map((segment) => String(segment))],
          code: emptyVitalsPatch
            ? 'writeback_repair_empty_vitals_patch'
            : missingVitalsPatch
              ? 'writeback_repair_missing_vitals_patch'
              : issue.code,
          message: emptyVitalsPatch
            ? 'Player vitals repair returned an empty vitalsPatch.'
            : missingVitalsPatch
              ? 'Player vitals repair returned the player actor without a vitalsPatch.'
              : issue.message
        });
      }
      continue;
    }
    if (parsed.data.actorId !== playerActorId) {
      diagnostics.push({
        path: ['writebackRepair', 'playerVitals', 'actorPatches', index, 'actorId'],
        code: 'writeback_repair_unrelated_actor',
        message: `Player vitals repair returned unrelated actor "${parsed.data.actorId}".`
      });
      continue;
    }
    if (!parsed.data.vitalsPatch) continue;
    return { patch: parsed.data, diagnostics };
  }

  if (patchRequired && rawActorPatches.length === 0) {
    diagnostics.push({
      path: ['writebackRepair', 'playerVitals', 'actorPatches'],
      code: 'writeback_repair_missing_vitals_patch',
      message: 'Player vitals review declared a change, but repair returned no player vitalsPatch.'
    });
  }

  return { diagnostics };
}

function mergePlayerVitalsRepair(response: NarratorResponse, patch: ActorPatch): NarratorResponse {
  if (!patch.vitalsPatch) return response;

  const actorPatches = [...response.writeback.actorPatches];
  const existingIndex = actorPatches.findIndex((item) => item.actorId === patch.actorId);
  if (existingIndex >= 0) {
    actorPatches[existingIndex] = {
      ...actorPatches[existingIndex],
      vitalsPatch: patch.vitalsPatch
    };
  } else {
    actorPatches.push({
      actorId: patch.actorId,
      vitalsPatch: patch.vitalsPatch
    } as ActorPatch);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorPatches
    }
  };
}

async function repairPlayerVitals({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  const decision = resolvePlayerVitalsRepairDecision(state, response, turnEndTime);
  if (!writebackRepair || !decision.shouldRepair) {
    return { response, diagnostics: [] };
  }

  try {
    const repairPrompt = createPlayerVitalsRepairPrompt({
      state,
      response,
      playerInput,
      turnEndTime
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parsePlayerVitalsRepairResponse(
      repairRaw,
      state.player.actorId,
      decision.patchRequired
    );
    if (!parsed.patch?.vitalsPatch) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergePlayerVitalsRepair(response, parsed.patch),
      diagnostics: [
        ...parsed.diagnostics,
        ...(decision.reason === 'lifecycle_review'
          ? [
              {
                path: ['writebackRepair', 'playerVitals', 'conditionLifecycle'],
                code: 'player_vitals_lifecycle_review_applied',
                message: `玩家身体状态生命周期复核已采用：${state.player.vitals.conditionSummary} -> ${parsed.patch.vitalsPatch.conditionSummary ?? state.player.vitals.conditionSummary}；持续性=${parsed.patch.vitalsPatch.conditionPersistence ?? 'unknown'}。`
              }
            ]
          : []),
        {
          path: ['writeback', 'actorPatches', 'player', 'vitalsPatch'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair supplied player vitals omitted by the main narrator.'
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'playerVitals'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Player vitals repair failed.'
        }
      ]
    };
  }
}

function createPlayerClothingRepairPrompt({
  state,
  response,
  playerInput,
  turnEndTime
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
}): string {
  return [
    'WRITEBACK_REPAIR_TASK',
    'PLAYER_CLOTHING_REPAIR_TASK',
    '你是结构化写回修复器，只判断玩家当前实际衣着是否被正文或玩家行动明确改变；不改正文，不创造新剧情。',
    '主叙事模型已经输出正文，但可能把玩家换装只写在 narrativeText 里，漏写 writeback.playerPatch.clothing，导致后续又按旧衣着续写。',
    '有明确换装时返回 JSON：{"playerPatch":{"clothing":{"currentSummary":"当前衣着中文摘要","mode":"合法枚举值","lastChangedReason":"明确换装依据"}}}；如果没有明确换装，返回 {"playerPatch":{}}。',
    '规则：',
    '1. 只有玩家输入或正文明确写出脱下、换上、换成、改穿、穿上、伪装、更衣等动作时，才补 playerPatch.clothing。',
    '2. 不得因为下班、休息、时间流逝、当前身份是警察或不在警署，就自动把军装改成便服；必须有明确换装事实。',
    '3. 当前身份是警察不等于当前穿军装；如果本回合明确换成便服，mode 用 off_duty_plain；明确穿制服用 duty_uniform；伪装用 disguise；睡衣用 sleepwear；特殊衣物用 special；其他用 other。',
    '4. clothing 必须是对象，currentSummary 与 mode 都必填；不得返回纯字符串。lastChangedReason 写本回合换装依据。',
    '5. 不要返回 equipment、assetPatch、actorPatches、正文或其他无关字段。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `currentPlayer=${JSON.stringify({
      name: state.player.name,
      currentIdentity: state.player.currentIdentity,
      clothing: state.player.clothing,
      clothingState: state.player.clothingState
    })}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        playerPatch: response.writeback.playerPatch
      }
    })}`
  ].join('\n');
}

function parsePlayerClothingRepairResponse(value: unknown): PlayerClothingRepairParseResult {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawPlayerPatch = isRecord(container) && isRecord(container.playerPatch) ? container.playerPatch : undefined;
  if (!rawPlayerPatch || Object.keys(rawPlayerPatch).length === 0) return { diagnostics };

  const parsed = playerPatchSchema.safeParse(rawPlayerPatch);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: ['writebackRepair', 'playerClothing', 'playerPatch', ...issue.path.map((segment) => String(segment))],
        code: issue.code,
        message: issue.message
      });
    }
    return { diagnostics };
  }

  if (parsed.data.clothing === undefined) return { diagnostics };
  return { playerPatch: parsed.data, diagnostics };
}

function mergePlayerClothingRepair(response: NarratorResponse, playerPatch: PlayerPatch): NarratorResponse {
  if (playerPatch.clothing === undefined) return response;

  return {
    ...response,
    writeback: {
      ...response.writeback,
      playerPatch: {
        ...(response.writeback.playerPatch ?? {}),
        reputationPatches: response.writeback.playerPatch?.reputationPatches ?? playerPatch.reputationPatches ?? [],
        clothing: playerPatch.clothing
      }
    }
  };
}

async function repairPlayerClothing({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair || !shouldRepairPlayerClothing(response)) {
    return { response, diagnostics: [] };
  }

  try {
    const repairPrompt = createPlayerClothingRepairPrompt({
      state,
      response,
      playerInput,
      turnEndTime
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parsePlayerClothingRepairResponse(repairRaw);
    if (!parsed.playerPatch?.clothing) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergePlayerClothingRepair(response, parsed.playerPatch),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'playerPatch', 'clothing'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair supplied player clothing state omitted by the main narrator.'
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'playerPatch', 'clothing'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Player clothing repair failed.'
        }
      ]
    };
  }
}

function normalizeAssetLifecycleText(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasAssetLifecycleCue(text: string): boolean {
  const normalized = normalizeAssetLifecycleText(text);
  if (!normalized) return false;

  return (
    /(获得|取得|拿到|收到|收下|买下|买了|捡到|拾到|写完|写好|补完|续写|改完|完成|更新|装进|放进|收进|交给|给了|送给|赠给|借给|还给|归还|提交|移交|交出|上交|并入|归档|证物|证据|寄出|寄给|投稿|卖掉|卖出|丢掉|丢失|遗失|损毁|烧掉|销毁|消耗|用掉)/.test(
      normalized
    ) || /\b(acquire|receive|buy|write|finish|update|submit|handover|give|send|mail|sell|lose|destroy|consume)\b/i.test(text)
  );
}

function visibleAssetItems(state: RuntimeState): AssetItem[] {
  return Object.values(state.assets?.items ?? {}).filter((item) => item.visibility !== 'hidden');
}

function assetLifecycleSearchKeys(item: AssetItem): string[] {
  const bookTitleMatches = [...item.name.matchAll(/《([^》]+)》/g)].map((match) => `《${match[1]}》`);
  const chapterStrippedName = item.name.replace(/(前|第)?[一二三四五六七八九十百\d]+章.*/g, '').trim();
  return uniqueStrings([item.itemId, item.name, ...bookTitleMatches, chapterStrippedName, item.summary, item.detail]).filter(
    (text) => text.trim().length >= 2
  );
}

function assetMentionedInText(item: AssetItem, text: string): boolean {
  const normalizedText = normalizeAssetLifecycleText(text).toLowerCase();
  return assetLifecycleSearchKeys(item).some((key) => {
    const normalizedKey = normalizeAssetLifecycleText(key).toLowerCase();
    return normalizedKey.length >= 2 && normalizedText.includes(normalizedKey);
  });
}

function assetPatchTouchedItemIds(response: NarratorResponse): Set<string> {
  return new Set([
    ...(response.writeback.assetPatch?.upsertItems ?? []).map((item) => item.itemId),
    ...(response.writeback.assetPatch?.removeItems ?? []).map((item) => item.itemId)
  ]);
}

function hasAssetPatchValidationWarning(response: NarratorResponse): boolean {
  return Boolean(
    response.validationWarnings?.some((warning) => issuePathStartsWith(warning.path, ['writeback', 'assetPatch']))
  );
}

function hasUnremovedSubmittedAssetEvidence(state: RuntimeState, response: NarratorResponse): boolean {
  const existingAssetIds = new Set(Object.keys(state.assets?.items ?? {}));
  const removedItemIds = new Set((response.writeback.assetPatch?.removeItems ?? []).map((item) => item.itemId));

  return response.writeback.caseEvidencePatches.some(
    (patch) => patch.relatedAssetItemId && existingAssetIds.has(patch.relatedAssetItemId) && !removedItemIds.has(patch.relatedAssetItemId)
  );
}

function shouldRepairAssetLifecycle(state: RuntimeState, response: NarratorResponse): boolean {
  const assets = visibleAssetItems(state);
  if (hasAssetPatchValidationWarning(response)) return true;
  if (hasUnremovedSubmittedAssetEvidence(state, response)) return true;
  if (
    (response.writeback.assetPatch?.upsertItems.length ?? 0) > 0 ||
    (response.writeback.assetPatch?.removeItems.length ?? 0) > 0 ||
    response.writeback.assetPatch?.equippedItemIds !== undefined ||
    response.writeback.playerPatch?.equipment !== undefined
  ) {
    return true;
  }
  if (assets.length === 0) return false;

  const text = response.turnSummary;
  if (!hasAssetLifecycleCue(text)) return false;

  const touchedItemIds = assetPatchTouchedItemIds(response);
  const mentionedExistingItems = assets.filter((item) => assetMentionedInText(item, text));
  if (mentionedExistingItems.some((item) => !touchedItemIds.has(item.itemId))) return true;

  const normalized = normalizeAssetLifecycleText(text);
  const definiteAcquisitionCue =
    /(领取|领到|获配|配发|获得|取得|拿到|收到|收下|买下|买了|捡到|拾到)/.test(normalized) ||
    /\b(acquired|received|bought|was issued|picked up)\b/i.test(text);
  const definiteDispositionCue =
    /(交给|交出|送给|赠给|借给|还给|归还|提交|移交|上交|寄出|寄给|卖掉|卖出|丢掉|丢失|遗失|损毁|烧掉|销毁|消耗|用掉)/.test(
      normalized
    ) || /\b(submitted|handed over|gave|returned|sent|sold|lost|destroyed|consumed)\b/i.test(text);
  const concreteNewAssetCue =
    /(物品|资产|装备|配枪|手枪|左轮|枪械|钥匙|车辆|汽车|电单车|录音带|原件|手稿|稿件|支票|汇票|存单|债券|收据)/.test(
      normalized
    );
  return (definiteAcquisitionCue || definiteDispositionCue) && concreteNewAssetCue && touchedItemIds.size === 0;
}

function summarizeAssetForLifecycleRepair(item: AssetItem) {
  const common = {
    itemId: item.itemId,
    category: item.category,
    name: item.name,
    summary: item.summary,
    detail: item.detail,
    relatedActorIds: item.relatedActorIds,
    relatedCaseIds: item.relatedCaseIds,
    relatedPlaceIds: item.relatedPlaceIds,
    evidence: item.evidence,
    wearable: item.wearable,
    visibility: item.visibility,
    importance: item.importance,
    worldpackAssetData: item.worldpackAssetData
  };
  if (item.category === 'fixedAsset') {
    return {
      ...common,
      fixedAssetType: item.fixedAssetType,
      holdingRelation: item.holdingRelation,
      primaryUse: item.primaryUse,
      locationSummary: item.locationSummary,
      placeId: item.placeId,
      ownershipSummary: item.ownershipSummary,
      accessSummary: item.accessSummary,
      valueAmount: item.valueAmount,
      incomeSettlementItemIds: item.incomeSettlementItemIds,
      expenseSettlementItemIds: item.expenseSettlementItemIds
    };
  }
  if (item.category === 'vehicle') {
    return {
      ...common,
      vehicleType: item.vehicleType,
      holdingRelation: item.holdingRelation,
      condition: item.condition,
      locationSummary: item.locationSummary,
      accessSummary: item.accessSummary,
      valueAmount: item.valueAmount,
      mobilityProfile: item.mobilityProfile,
      incomeSettlementItemIds: item.incomeSettlementItemIds,
      expenseSettlementItemIds: item.expenseSettlementItemIds
    };
  }
  return common;
}

function createAssetLifecycleRepairPrompt({
  state,
  response,
  playerInput,
  turnEndTime
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
}): string {
  const existingAssets = visibleAssetItems(state)
    .sort((left, right) => right.importance - left.importance || left.itemId.localeCompare(right.itemId))
    .slice(0, 120)
    .map(summarizeAssetForLifecycleRepair);

  return [
    'WRITEBACK_REPAIR_TASK',
    'ASSET_LIFECYCLE_REPAIR_TASK',
    '你是物品与资产身份审核器，只审核本回合已经提出的结构化物品变化，不改正文，不创造新剧情。',
    '你的输出会整体替换主叙事模型的 assetPatch；必须返回本回合最终、完整、可直接应用的资产提案，而不是只追加差异。',
    '请返回 JSON：{"assetPatch":{"upsertItems":[...],"removeItems":[...],"equippedItemIds":[...]}}。本回合不应改变资产时返回三个空数组。',
    '规则：',
    '1. existingAssets 是玩家当前持有、控制或长期可用的物品与资产；removeItems 只能使用 existingAssets 里的 itemId。',
    'removeItems 每项必须是 {"itemId":"稳定物品ID","reason":"离开玩家持有或控制的原因","movedToCaseId":"可选案件ID"} 对象；禁止直接返回字符串 ID。',
    '2. 物品离开玩家持有或控制时必须 removeItems：交给别人、送给别人、归还、提交到案件/证物袋、寄出、卖出、丢失、销毁、消耗、用掉。',
    '3. 物品仍由玩家持有但内容变化时，用同一个 itemId 在 upsertItems 更新完整物品对象；例如小说手稿从前三章推进到前四章，不要新建或删除。',
    '4. 新物品只有在正文已经明确进入玩家持有或可支配时才 upsert；只是看到、听说、准备去取，不要写入。',
    '5. 案件证据如果已经通过 caseEvidencePatches 提交，且 relatedAssetItemId 指向 existingAssets，通常要 removeItems 并填写 movedToCaseId；除非正文明确玩家保留的是副本。',
    '6. 可直接花用的现金、港币、钞票、零钱不得成为物品；金额变化只能留在 financePatch。支票、本票、汇票、存单、债券、欠条、收据、礼券等有独立凭据的金融工具可以作为物品；兑现或存入后应移除凭据并由 financePatch 结算。',
    '7. 不得创造“钱包、钥匙串”这类把多个实体拼成一件的组合物品；钱包和钥匙串必须保持各自稳定 itemId。原件和复印件若确实是两个物理实体，可以分开。',
    '8. equippedItemIds 最多三项，只能引用本回合应用后仍存在的真实物品 ID；不要把自由文本装备名称写进装备槽。',
    '9. 主模型的 proposedAssetPatch 只是待审核提案。保留其中合法变化，删除现金、组合物品、重复新 ID 和其他错误提案；不要为了补漂亮字段改写无关物品。',
    '10. category 只能是 equipment/general/document/valuable/fixedAsset/vehicle。fixedAssetType 只能是 residence/rentalProperty/businessPremise/storage/parkingSpace/investment/other；fixedAsset holdingRelation 只能是 owned/rented/assigned/familyOwned/managed/mortgaged/unknown；primaryUse 只能是 home/rentalIncome/business/storage/parking/investment/other。',
    '11. fixedAsset 的 locationSummary、ownershipSummary、accessSummary 必须是非空字符串。可选字段没有值时直接省略，禁止返回 null；不要把中文说明文字填进枚举字段。',
    VEHICLE_ASSET_WRITEBACK_CONTRACT,
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `existingAssets=${JSON.stringify(existingAssets)}`,
    `rawProposedAssetPatch=${JSON.stringify(response.rawAssetPatch ?? null)}`,
    `validatedProposedAssetPatch=${JSON.stringify(response.writeback.assetPatch ?? null)}`,
    `assetValidationWarnings=${JSON.stringify(
      response.validationWarnings?.filter((warning) =>
        issuePathStartsWith(warning.path, ['writeback', 'assetPatch'])
      ) ?? []
    )}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        playerPatch: response.writeback.playerPatch,
        financePatch: response.writeback.financePatch,
        assetPatch: response.writeback.assetPatch,
        casePatches: response.writeback.casePatches,
        caseEvidencePatches: response.writeback.caseEvidencePatches,
        memories: response.writeback.memories
      },
      validationWarnings: response.validationWarnings?.filter((warning) =>
        issuePathStartsWith(warning.path, ['writeback', 'assetPatch'])
      )
    })}`
  ].join('\n');
}

function reconcileReviewedAssetItemWithProposal(
  rawItem: unknown,
  proposedItemsById: Map<string, AssetItem>
): { value: unknown; reconciled: boolean } {
  if (!isRecord(rawItem) || typeof rawItem.itemId !== 'string') {
    return { value: rawItem, reconciled: false };
  }
  const proposed = proposedItemsById.get(rawItem.itemId);
  if (!proposed) return { value: rawItem, reconciled: false };

  const nonNullReviewFields = Object.fromEntries(
    Object.entries(rawItem).filter(([, fieldValue]) => fieldValue !== null && fieldValue !== undefined)
  );
  const merged = { ...proposed, ...nonNullReviewFields };
  if (assetItemSchema.safeParse(merged).success) {
    return { value: merged, reconciled: false };
  }

  let reconciled: Record<string, unknown> = { ...proposed };
  for (const [key, fieldValue] of Object.entries(nonNullReviewFields)) {
    const candidate = { ...reconciled, [key]: fieldValue };
    if (assetItemSchema.safeParse(candidate).success) reconciled = candidate;
  }
  return { value: reconciled, reconciled: true };
}

function parseAssetLifecycleRepairResponse(
  state: RuntimeState,
  value: unknown,
  proposedAssetPatch?: AssetPatch,
  rawMainAssetUpsertItems: unknown[] = [],
  advisoryReview = false
): { assetPatch?: AssetPatch; diagnostics: StoryDiagnosticIssue[] } {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawAssetPatch = isRecord(container) && isRecord(container.assetPatch) ? container.assetPatch : undefined;
  if (!rawAssetPatch) {
    return {
      diagnostics: [
        {
          path: ['writebackRepair', 'assetPatch'],
          code: advisoryReview ? 'writeback_repair_advisory_ignored' : 'writeback_repair_invalid',
          message: advisoryReview
            ? '资产审核器没有返回可用的 assetPatch；已保留主叙事中通过校验的资产提案。'
            : 'Asset lifecycle repair did not return an assetPatch object.'
        }
      ]
    };
  }

  const proposedItemsById = new Map(
    (proposedAssetPatch?.upsertItems ?? []).map((item) => [item.itemId, item])
  );
  const rawMainItemsById = indexRawAssetItemsById(rawMainAssetUpsertItems);
  const knownProposedVehicleIds = new Set<string>();
  for (const [itemId, item] of rawMainItemsById) {
    if (isVehicleAssetIntent(item, state.assets.items[itemId] ?? proposedItemsById.get(itemId))) {
      knownProposedVehicleIds.add(itemId);
    }
  }
  for (const item of proposedAssetPatch?.upsertItems ?? []) {
    if (item.category === 'vehicle') knownProposedVehicleIds.add(item.itemId);
  }

  const rawType = (fieldValue: unknown): string => {
    if (fieldValue === null) return 'null';
    if (Array.isArray(fieldValue)) return 'array';
    return typeof fieldValue;
  };
  const rawValueAtPath = (
    fieldValue: unknown,
    path: ReadonlyArray<PropertyKey>
  ): unknown =>
    path.reduce<unknown>((current, segment) => {
      if ((!isRecord(current) && !Array.isArray(current)) || current === null) {
        return undefined;
      }
      return (current as Record<PropertyKey, unknown>)[segment];
    }, fieldValue);

  let reconciledItemCount = 0;
  let preservedMainCount = 0;
  const upsertItems: AssetPatch['upsertItems'] = [];
  if (rawAssetPatch.upsertItems !== undefined && !Array.isArray(rawAssetPatch.upsertItems)) {
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'upsertItems'],
      code: proposedAssetPatch
        ? 'asset_repair_failed_preserved_main'
        : 'invalid_type',
      message: proposedAssetPatch
        ? `资产修复器的 upsertItems 不是数组（rawType=${rawType(rawAssetPatch.upsertItems)}）；已保留主叙事中通过校验的资产提案。`
        : `资产修复器的 upsertItems 不是数组（rawType=${rawType(rawAssetPatch.upsertItems)}）。`
    });
    if (proposedAssetPatch) {
      return { assetPatch: proposedAssetPatch, diagnostics };
    }
    return { diagnostics };
  }

  for (const [index, rawItem] of (rawAssetPatch.upsertItems ?? []).entries()) {
    const itemId = isRecord(rawItem) && typeof rawItem.itemId === 'string'
      ? rawItem.itemId.trim()
      : '';
    const existing = itemId ? state.assets.items[itemId] : undefined;
    const proposed = itemId ? proposedItemsById.get(itemId) : undefined;
    const rawMain = itemId ? rawMainItemsById.get(itemId) : undefined;
    const vehicleIntent = isVehicleAssetIntent(
      rawItem,
      existing ?? proposed
    ) || isVehicleAssetIntent(rawMain, existing ?? proposed);

    if (
      vehicleIntent &&
      itemId &&
      knownProposedVehicleIds.size > 0 &&
      !knownProposedVehicleIds.has(itemId) &&
      !existing
    ) {
      diagnostics.push({
        path: ['writebackRepair', 'assetPatch', 'upsertItems', index, 'itemId'],
        code: 'writeback_repair_unrelated_asset',
        message: `资产修复器返回了主叙事和存档都未提出的车辆 "${itemId}"，该条目已拒绝。`
      });
      continue;
    }

    if (vehicleIntent) {
      const reconciled = reconcileVehicleAssetIntent({
        existing,
        rawMain,
        validatedMain: proposed,
        repair: rawItem,
        path: ['writebackRepair', 'assetPatch', 'upsertItems', index]
      });
      diagnostics.push(...reconciled.diagnostics);
      if (reconciled.item) {
        upsertItems.push(reconciled.item);
        reconciledItemCount += 1;
        diagnostics.push({
          path: ['writebackRepair', 'assetPatch', 'upsertItems', index],
          code: 'asset_repair_reconciled_from_raw',
          message: `车辆 "${reconciled.item.itemId}" 已按稳定 ID 合并已有事实、原始提案和修复字段，并通过最终严格 Schema。`
        });
        continue;
      }
      diagnostics.push(...reconciled.issues);
      if (proposed) {
        upsertItems.push(proposed);
        preservedMainCount += 1;
      }
      continue;
    }

    const reconciled = reconcileReviewedAssetItemWithProposal(
      rawItem,
      proposedItemsById
    );
    if (reconciled.reconciled) reconciledItemCount += 1;
    const parsedItem = assetItemSchema.safeParse(reconciled.value);
    if (parsedItem.success) {
      upsertItems.push(parsedItem.data);
      continue;
    }
    for (const issue of parsedItem.error.issues) {
      diagnostics.push({
        path: [
          'writebackRepair',
          'assetPatch',
          'upsertItems',
          index,
          ...issue.path.map((segment) => String(segment))
        ],
        code: proposed
          ? 'asset_repair_failed_preserved_main'
          : advisoryReview
            ? 'writeback_repair_advisory_ignored'
            : issue.code,
        message: proposed
          ? `资产修复字段无效，已保留同 ID 的主提案：${issue.message}; rawType=${rawType(
              rawValueAtPath(rawItem, issue.path)
            )}`
          : advisoryReview
            ? `资产审核器返回了不可用的可选复核项：${issue.message}; rawType=${rawType(
                rawValueAtPath(rawItem, issue.path)
              )}`
            : `${issue.message}; rawType=${rawType(rawValueAtPath(rawItem, issue.path))}`
      });
    }
    if (proposed) {
      upsertItems.push(proposed);
      preservedMainCount += 1;
    }
  }

  const removeItems: AssetPatch['removeItems'] = [];
  if (rawAssetPatch.removeItems !== undefined && !Array.isArray(rawAssetPatch.removeItems)) {
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'removeItems'],
      code: proposedAssetPatch
        ? 'asset_repair_failed_preserved_main'
        : 'invalid_type',
      message: `资产修复器的 removeItems 不是数组（rawType=${rawType(rawAssetPatch.removeItems)}）；已保留能确认的主资产事实。`
    });
    removeItems.push(...(proposedAssetPatch?.removeItems ?? []));
  } else {
    for (const [index, rawItem] of (rawAssetPatch.removeItems ?? []).entries()) {
      if (typeof rawItem === 'string') {
        const itemId = rawItem.trim();
        const proposedRemoval = proposedAssetPatch?.removeItems.find(
          (item) => item.itemId === itemId
        );
        if (itemId && (state.assets.items[itemId] || proposedRemoval)) {
          removeItems.push(
            proposedRemoval ?? {
              itemId,
              reason: '资产生命周期审核确认该物品已离开玩家持有或控制。'
            }
          );
          diagnostics.push({
            path: ['writebackRepair', 'assetPatch', 'removeItems', index],
            code: 'asset_repair_remove_item_string_normalized',
            message: proposedRemoval
              ? `资产修复器把删除项 "${itemId}" 返回为字符串；已按稳定 ID 复用主提案中的完整删除记录。`
              : `资产修复器把删除项 "${itemId}" 返回为字符串；该 ID 对应当前真实资产，已本地规范化为结构化删除记录。`
          });
          continue;
        }
        diagnostics.push({
          path: ['writebackRepair', 'assetPatch', 'removeItems', index],
          code: 'writeback_repair_unrelated_asset',
          message: itemId
            ? `资产修复器把未知物品 "${itemId}" 作为字符串删除项返回；本地未找到可核验的稳定资产 ID，已拒绝。`
            : '资产修复器返回了空字符串删除项；已拒绝。'
        });
        continue;
      }
      const parsedItem = assetRemoveItemSchema.safeParse(rawItem);
      if (parsedItem.success) {
        removeItems.push(parsedItem.data);
        continue;
      }
      for (const issue of parsedItem.error.issues) {
        diagnostics.push({
          path: [
            'writebackRepair',
            'assetPatch',
            'removeItems',
            index,
            ...issue.path.map((segment) => String(segment))
          ],
          code: issue.code,
          message: `${issue.message}; rawType=${rawType(rawValueAtPath(rawItem, issue.path))}`
        });
      }
      const itemId = isRecord(rawItem) && typeof rawItem.itemId === 'string'
        ? rawItem.itemId
        : undefined;
      const proposedRemoval = proposedAssetPatch?.removeItems.find(
        (item) => item.itemId === itemId
      );
      if (proposedRemoval) removeItems.push(proposedRemoval);
    }
  }

  let equippedItemIds: string[] | undefined;
  if (rawAssetPatch.equippedItemIds !== undefined) {
    if (!Array.isArray(rawAssetPatch.equippedItemIds)) {
      diagnostics.push({
        path: ['writebackRepair', 'assetPatch', 'equippedItemIds'],
        code: proposedAssetPatch
          ? 'asset_repair_failed_preserved_main'
          : 'invalid_type',
        message: `资产修复器的 equippedItemIds 不是数组（rawType=${rawType(rawAssetPatch.equippedItemIds)}）；已保留主提案的装备引用。`
      });
      equippedItemIds = proposedAssetPatch?.equippedItemIds;
    } else {
      equippedItemIds = [
        ...new Set(
          rawAssetPatch.equippedItemIds.flatMap((item) =>
            typeof item === 'string' && item.trim() ? [item.trim()] : []
          )
        )
      ].slice(0, 3);
    }
  }

  if (reconciledItemCount > 0) {
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'upsertItems'],
      code: 'writeback_repair_reconciled',
      message: `资产审核器有 ${reconciledItemCount} 个同 ID 条目经过字段级合并后再应用。`
    });
  }
  if (preservedMainCount > 0) {
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'upsertItems'],
      code: 'asset_repair_failed_preserved_main',
      message: `资产修复器有 ${preservedMainCount} 个同 ID 条目仍不合法；已保留主叙事中通过校验的资产事实。`
    });
  }

  const existingAssetIds = new Set(Object.keys(state.assets?.items ?? {}));
  const validRemoveItems = removeItems.filter((item) => {
    if (existingAssetIds.has(item.itemId)) return true;
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'removeItems', item.itemId],
      code: advisoryReview ? 'writeback_repair_advisory_ignored' : 'writeback_repair_unrelated_asset',
      message: `Asset lifecycle repair tried to remove unknown item "${item.itemId}".`
    });
    return false;
  });
  const validUpsertItems = upsertItems.filter((item) => {
    if (!isSpendableCashAsset(item)) return true;
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'upsertItems', item.itemId],
      code: advisoryReview ? 'writeback_repair_advisory_ignored' : 'cash_asset_rejected',
      message: `Asset review rejected spendable cash item "${item.name}".`
    });
    return false;
  });
  const availableAssetIds = new Set(existingAssetIds);
  for (const item of validUpsertItems) availableAssetIds.add(item.itemId);
  for (const item of validRemoveItems) availableAssetIds.delete(item.itemId);
  const validEquippedItemIds = equippedItemIds?.filter((itemId) => {
    if (availableAssetIds.has(itemId)) return true;
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'equippedItemIds', itemId],
      code: advisoryReview
        ? 'writeback_repair_advisory_ignored'
        : 'writeback_repair_unknown_equipped_asset',
      message: `Asset review tried to equip unknown or removed item "${itemId}".`
    });
    return false;
  });
  const assetPatch: AssetPatch = {
    upsertItems: validUpsertItems,
    removeItems: validRemoveItems,
    ...(validEquippedItemIds !== undefined
      ? { equippedItemIds: validEquippedItemIds }
      : {})
  };

  return { assetPatch, diagnostics };
}

function mergeAssetLifecycleRepair(response: NarratorResponse, assetPatch: AssetPatch): NarratorResponse {
  return {
    ...response,
    writeback: {
      ...response.writeback,
      assetPatch
    }
  };
}

async function repairAssetLifecycle({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair || !shouldRepairAssetLifecycle(state, response)) {
    return { response, diagnostics: [] };
  }

  try {
    const repairPrompt = createAssetLifecycleRepairPrompt({
      state,
      response,
      playerInput,
      turnEndTime
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseAssetLifecycleRepairResponse(
      state,
      repairRaw,
      response.writeback.assetPatch,
      response.rawAssetUpsertItems ?? [],
      Boolean(response.writeback.assetPatch) && !hasAssetPatchValidationWarning(response)
    );
    if (!parsed.assetPatch) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergeAssetLifecycleRepair(response, parsed.assetPatch),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'assetPatch'],
          code: 'writeback_repair_applied',
          message: `Asset review replaced the main proposal: upsert=${parsed.assetPatch.upsertItems.length}, remove=${parsed.assetPatch.removeItems.length}, equipped=${parsed.assetPatch.equippedItemIds?.length ?? 'unchanged'}.`
        },
        {
          path: ['writeback', 'assetPatch'],
          code: 'asset_writeback_applied',
          message: `资产修复结果已通过逐项校验：upsert=${parsed.assetPatch.upsertItems.length}，remove=${parsed.assetPatch.removeItems.length}。`
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'assetPatch'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Asset lifecycle repair failed.'
        }
      ]
    };
  }
}

function parseIncidentOriginRepairResponse(value: unknown): IncidentOriginRepairParseResult {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const currentMatterPatches: CurrentMatterPatch[] = [];
  const memories: MemorySuggestion[] = [];
  const actorMemories: ActorMemorySuggestion[] = [];
  const rawStatus = isRecord(container) ? container.status : undefined;
  const declaredStatus: IncidentOriginRepairStatus | undefined =
    rawStatus === 'applied' || rawStatus === 'already_persisted' || rawStatus === 'not_applicable'
      ? rawStatus
      : undefined;

  const rawCurrentMatterPatches =
    isRecord(container) && Array.isArray(container.currentMatterPatches) ? container.currentMatterPatches : [];
  const rawMemories = isRecord(container) && Array.isArray(container.memories) ? container.memories : [];
  const rawActorMemories =
    isRecord(container) && Array.isArray(container.actorMemories) ? container.actorMemories : [];
  if (declaredStatus === 'already_persisted' || declaredStatus === 'not_applicable') {
    const hasIgnoredPayload =
      rawCurrentMatterPatches.length > 0 || rawMemories.length > 0 || rawActorMemories.length > 0;
    return {
      status: declaredStatus,
      currentMatterPatches,
      memories,
      actorMemories,
      diagnostics: hasIgnoredPayload
        ? [
            {
              path: ['writebackRepair', 'incidentOrigin'],
              code: 'writeback_repair_noop_payload_ignored',
              message: `Incident origin repair declared ${declaredStatus}; its contradictory patch payload was ignored.`
            }
          ]
        : diagnostics
    };
  }

  rawCurrentMatterPatches.forEach((item, index) => {
    const parsed = currentMatterPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'incidentOrigin', 'currentMatterPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    currentMatterPatches.push(parsed.data);
  });

  rawMemories.forEach((item, index) => {
    const normalizedItem = typeof item === 'string' && item.trim() ? { text: item.trim() } : item;
    const parsed = memorySuggestionSchema.safeParse(normalizedItem);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'incidentOrigin', 'memories', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    memories.push(normalizeIndependentRepairMemory(parsed.data));
  });

  rawActorMemories.forEach((item, index) => {
    const parsed = actorMemorySuggestionSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'incidentOrigin', 'actorMemories', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
        });
      }
      return;
    }
    actorMemories.push(parsed.data);
  });

  const hasUsableWriteback =
    currentMatterPatches.length > 0 || memories.length > 0 || actorMemories.length > 0;
  const status: IncidentOriginRepairStatus | undefined = hasUsableWriteback ? 'applied' : declaredStatus;
  if (!hasUsableWriteback) {
    diagnostics.push({
      path: ['writebackRepair', 'incidentOrigin'],
      code: 'writeback_repair_invalid',
      message:
        'Incident origin repair did not return a valid no-op status or any usable currentMatterPatches, memories, or actorMemories.'
    });
  }

  return { status, currentMatterPatches, memories, actorMemories, diagnostics };
}

function mergeIncidentOriginRepair(response: NarratorResponse, repair: IncidentOriginRepairParseResult): NarratorResponse {
  if (
    repair.currentMatterPatches.length === 0 &&
    repair.memories.length === 0 &&
    repair.actorMemories.length === 0
  ) {
    return response;
  }

  const currentMatterPatches = new Map(response.writeback.currentMatterPatches.map((patch) => [patch.id, patch]));
  for (const patch of repair.currentMatterPatches) {
    currentMatterPatches.set(patch.id, patch);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      currentMatterPatches: [...currentMatterPatches.values()],
      memories: [...response.writeback.memories, ...repair.memories],
      actorMemories: [...response.writeback.actorMemories, ...repair.actorMemories]
    }
  };
}

async function repairIncidentOrigins({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair || !shouldRepairIncidentOrigin(response)) {
    return { response, diagnostics: [] };
  }

  try {
    const repairPrompt = createIncidentOriginRepairPrompt({
      state,
      response,
      playerInput,
      turnEndTime
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseIncidentOriginRepairResponse(repairRaw);
    if (
      parsed.currentMatterPatches.length === 0 &&
      parsed.memories.length === 0 &&
      parsed.actorMemories.length === 0
    ) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergeIncidentOriginRepair(response, parsed),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'incidentOrigin'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied incident origin facts: matters=${parsed.currentMatterPatches.length}, memories=${parsed.memories.length}, actorMemories=${parsed.actorMemories.length}.`
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair', 'incidentOrigin'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Incident origin repair failed.'
        }
      ]
    };
  }
}

function selectCompatibleRepairDomain(value: unknown, domain: CompatibleRepairDomain): unknown {
  const container = repairContainer(value);
  if (!isRecord(container) || !Object.prototype.hasOwnProperty.call(container, domain)) return container;
  return container[domain];
}

function escapeLocationReference(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function placeLocationReferenceTexts(place: Place): string[] {
  const baseReferences = [
    place.name,
    place.nameZh,
    place.nameEn,
    ...(place.aliases ?? []),
    place.streetAddressText,
    ...(place.roadAnchors ?? [])
  ];
  const derivedRoadNames = baseReferences.flatMap((value) => {
    if (!value) return [];
    return [...value.matchAll(/([\u3400-\u9fff]+)([道街路巷里])/g)].flatMap((match) => {
      const stem = match[1];
      return [2, 3, 4]
        .filter((length) => stem.length >= length)
        .map((length) => `${stem.slice(-length)}${match[2]}`);
    });
  });
  return [...baseReferences, ...derivedRoadNames]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function maskQuotedDialogue(narrativeText: string): string {
  return narrativeText.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"/gs, (quoted) => ' '.repeat(quoted.length));
}

function narrativeHasLocationCandidateReference(narrativeText: string, reference: string): boolean {
  const normalizedReference = reference.trim();
  if (normalizedReference.length < 2) return false;

  const beforeCue = /(?:在|回到|返回|抵达|来到|走进|进入|推开|停在|坐在|站在|赶回|赶到|到了|置身|身处|位于|arrive|enter|return|reach|at)[^。；，,]{0,10}$/i;
  const afterCue = /(?:里|内|外|门口|大门|大厅|报案室|办公室|更衣室|走廊|柜台|天台|码头|街头|外围|附近|楼下|楼上|底层|后巷|侧巷|\s+(?:lobby|office|entrance|inside|outside|nearby))/i;
  const regex = new RegExp(escapeLocationReference(normalizedReference), 'gi');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(narrativeText))) {
    const before = narrativeText.slice(Math.max(0, match.index - 16), match.index);
    const after = narrativeText.slice(match.index + normalizedReference.length, match.index + normalizedReference.length + 48);
    if (beforeCue.test(before) || afterCue.test(after)) return true;
  }

  return false;
}

function collectLocationRepairCandidatePlaceIds(state: RuntimeState, response: NarratorResponse): string[] {
  const existingLocationPatch = response.writeback.locationPatch;
  if (existingLocationPatch) {
    const patchedScene = existingLocationPatch.currentSceneId
      ? state.scenes[existingLocationPatch.currentSceneId]
      : undefined;
    const targetPlaceId = existingLocationPatch.currentPlaceId ?? patchedScene?.placeId;
    const sameTurnPlaceExists = response.writeback.placePatches.some(
      (patch) => patch.placeId === targetPlaceId
    );
    if (targetPlaceId && (state.places[targetPlaceId] || sameTurnPlaceExists)) return [];
  }

  const turnSummary = maskQuotedDialogue(response.turnSummary);
  return Object.values(state.places)
    .filter((place) => {
      const referencedPlace = placeLocationReferenceTexts(place).some((reference) =>
        narrativeHasLocationCandidateReference(turnSummary, reference)
      );
      const referencedDifferentScene = Object.values(state.scenes)
        .filter((scene) => scene.placeId === place.placeId && scene.sceneId !== state.location.currentSceneId)
        .some((scene) => narrativeHasLocationCandidateReference(turnSummary, scene.name));

      if (place.placeId === state.location.currentPlaceId) return referencedDifferentScene;
      return referencedPlace || referencedDifferentScene;
    })
    .sort((left, right) => {
      const leftRank = (left.canonical ? 2 : 0) + (left.source === 'worldpack_canonical' ? 1 : 0);
      const rightRank = (right.canonical ? 2 : 0) + (right.source === 'worldpack_canonical' ? 1 : 0);
      return rightRank - leftRank || left.placeId.localeCompare(right.placeId);
    })
    .slice(0, 12)
    .map((place) => place.placeId);
}

function normalizePlaceIdentityText(value: string): string {
  return value.toLowerCase().replace(/[\s,，.。/\\·•（）()\-—_]/g, '');
}

function placePatchMatchesKnownPlace(
  patch: NarratorResponse['writeback']['placePatches'][number],
  place: Place
): boolean {
  const patchNames = [patch.name, patch.nameZh, patch.nameEn, ...(patch.aliases ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizePlaceIdentityText);
  const knownNames = placeLocationReferenceTexts(place).map(normalizePlaceIdentityText);
  if (patchNames.some((name) => knownNames.includes(name))) return true;

  const patchAddress = patch.streetAddressText?.trim();
  const knownAddress = place.streetAddressText?.trim();
  return Boolean(
    patchAddress &&
      knownAddress &&
      normalizePlaceIdentityText(patchAddress) === normalizePlaceIdentityText(knownAddress)
  );
}

function reconcileMisplacedLocationWriteback(
  state: RuntimeState,
  response: NarratorResponse
): NarratorResponse {
  const locationPatch = response.writeback.locationPatch;
  const unknownPlaceId = locationPatch?.currentPlaceId;
  if (!unknownPlaceId || state.places[unknownPlaceId]) return response;

  const duplicatePlacePatch = response.writeback.placePatches.find(
    (patch) => patch.placeId === unknownPlaceId
  );
  if (!duplicatePlacePatch) return response;
  const responseWithoutLocationPatch: NarratorResponse = {
    ...response,
    writeback: {
      ...response.writeback,
      locationPatch: undefined
    }
  };
  const matchingPlaceIds = collectLocationRepairCandidatePlaceIds(
    state,
    responseWithoutLocationPatch
  ).filter((placeId) => placePatchMatchesKnownPlace(duplicatePlacePatch, state.places[placeId]));
  if (matchingPlaceIds.length !== 1) return response;

  const canonicalPlaceId = matchingPlaceIds[0];
  const compatibleSceneId =
    locationPatch.currentSceneId &&
    state.scenes[locationPatch.currentSceneId]?.placeId === canonicalPlaceId
      ? locationPatch.currentSceneId
      : undefined;
  return {
    ...response,
    writeback: {
      ...response.writeback,
      locationPatch: {
        currentPlaceId: canonicalPlaceId,
        ...(compatibleSceneId ? { currentSceneId: compatibleSceneId } : {}),
        ...(locationPatch.reason ? { reason: locationPatch.reason } : {})
      },
      placePatches: response.writeback.placePatches.filter(
        (patch) => patch.placeId !== unknownPlaceId
      )
    },
    validationWarnings: [
      ...(response.validationWarnings ?? []),
      {
        path: ['writeback', 'locationPatch', 'currentPlaceId'],
        code: 'writeback_location_reconciled',
        message: `主剧情为已存在地点另造了 ${unknownPlaceId}；已按结构化回合摘要复用稳定地点 ID ${canonicalPlaceId}。`
      }
    ]
  };
}

interface LocationRepairParseResult {
  locationPatch?: LocationPatch;
  diagnostics: StoryDiagnosticIssue[];
}

function parseLocationRepairResponse(
  state: RuntimeState,
  value: unknown,
  candidatePlaceIds: Set<string>
): LocationRepairParseResult {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawLocationPatch = isRecord(container) ? container.locationPatch : undefined;
  if (rawLocationPatch === undefined || rawLocationPatch === null) return { diagnostics };

  const parsed = locationPatchSchema.safeParse(rawLocationPatch);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: ['writebackRepair', 'location', 'locationPatch', ...issue.path.map((segment) => String(segment))],
        code: issue.code,
        message: issue.message
      });
    }
    return { diagnostics };
  }

  const scene = parsed.data.currentSceneId ? state.scenes[parsed.data.currentSceneId] : undefined;
  const targetPlaceId = parsed.data.currentPlaceId ?? scene?.placeId;
  if (!targetPlaceId || !candidatePlaceIds.has(targetPlaceId)) {
    diagnostics.push({
      path: ['writebackRepair', 'location', 'locationPatch', 'currentPlaceId'],
      code: 'writeback_repair_unknown_location',
      message: 'Location repair targeted a place outside the known narrative candidates.'
    });
    return { diagnostics };
  }

  if (parsed.data.currentSceneId && (!scene || scene.placeId !== targetPlaceId)) {
    diagnostics.push({
      path: ['writebackRepair', 'location', 'locationPatch', 'currentSceneId'],
      code: 'writeback_repair_unknown_scene',
      message: 'Location repair targeted an unknown scene or a scene outside the repaired place.'
    });
    return { diagnostics };
  }

  return { locationPatch: parsed.data, diagnostics };
}

function mergeLocationRepair(response: NarratorResponse, locationPatch: LocationPatch): NarratorResponse {
  return {
    ...response,
    writeback: {
      ...response.writeback,
      locationPatch
    }
  };
}

function collectCompatibleWritebackRepairPlan({
  state,
  response,
  turnEndTime,
  allowRelationshipRepair,
  actorIdAliases
}: {
  state: RuntimeState;
  response: NarratorResponse;
  turnEndTime: GameTime;
  allowRelationshipRepair: boolean;
  actorIdAliases: Record<string, string>;
}): CompatibleWritebackRepairPlan {
  const domains: CompatibleRepairDomain[] = [];
  if (shouldRepairAssetLifecycle(state, response)) domains.push('assetLifecycle');
  if (shouldRepairCivilianLivelihoodWriteback(state, response)) domains.push('civilianLivelihood');
  if (shouldRepairIncidentOrigin(response)) domains.push('incidentOrigin');
  const locationCandidatePlaceIds = collectLocationRepairCandidatePlaceIds(state, response);
  if (locationCandidatePlaceIds.length > 0) domains.push('location');
  if (shouldRepairPlayerClothing(response)) domains.push('playerClothing');
  if (shouldRepairPlayerPoliceAssignment(state, response)) domains.push('policeAssignment');
  const pregnancyLifecycleDecision = resolvePregnancyLifecycleRepairDecision(response, actorIdAliases);
  if (pregnancyLifecycleDecision.shouldRepair) domains.push('pregnancyLifecycle');
  const playerVitalsDecision = resolvePlayerVitalsRepairDecision(state, response, turnEndTime);
  if (playerVitalsDecision.shouldRepair) domains.push('playerVitals');

  const relationshipCandidates = allowRelationshipRepair
    ? collectRelationshipRepairCandidates(state, response)
    : { actorIds: [], threadIds: [], actorIdsByThreadId: {}, omissionCandidates: [] };
  const relationshipCandidateActorIds = relationshipCandidates.actorIds;
  const relationshipEvidenceActorIds = uniqueStrings([
    ...relationshipCandidateActorIds,
    ...relationshipCandidateActorIds.map((actorId) => actorIdAliases[actorId])
  ]);
  if (relationshipCandidateActorIds.length > 0) domains.push('relationshipThreads');

  return {
    domains,
    pregnancyLifecycleDecision,
    playerVitalsDecision,
    locationCandidatePlaceIds,
    relationshipCandidateActorIds,
    relationshipEvidenceActorIds,
    relationshipCandidateThreadIds: relationshipCandidates.threadIds,
    relationshipCandidateActorIdsByThreadId: relationshipCandidates.actorIdsByThreadId,
    relationshipOmissionCandidates: relationshipCandidates.omissionCandidates
  };
}

function createCompatibleWritebackRepairPrompt({
  state,
  response,
  playerInput,
  turnEndTime,
  plan,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  plan: CompatibleWritebackRepairPlan;
  promptSettings?: PromptSettings;
}): string {
  const requested = new Set(plan.domains);
  const outputShape: Record<string, unknown> = {};
  const domainInstructions: string[] = [];
  const repairContext: Record<string, unknown> = {
    currentTime: state.time,
    turnEndTime,
    playerInput
  };

  if (requested.has('assetLifecycle')) {
    outputShape.assetLifecycle = { assetPatch: { upsertItems: [], removeItems: [], equippedItemIds: [] } };
    domainInstructions.push(
      '- assetPatch 是对主模型资产提案的完整审核结果，会整体替换 proposedAssetPatch；必须保留合法变化并剔除错误变化，不能只返回追加差异。',
      '- removeItems 只能使用 existingAssets 的 itemId；物品仍由玩家持有但内容变化时，复用同一 itemId 完整 upsert。',
      '- removeItems 每项必须是 {"itemId":"稳定物品ID","reason":"离开玩家持有或控制的原因","movedToCaseId":"可选案件ID"} 对象，禁止直接返回字符串 ID。',
      '- 可直接花用的现金绝不进入物品；支票、本票、汇票、存单、债券、欠条、收据、礼券等独立凭据可以保留，兑现后移除并由 financePatch 结算。',
      '- 不得把钱包、钥匙串等多个实体合成一件；文稿、文件或其他持续变化的同一实体必须复用稳定 itemId。原件与实际存在的复印件可以分开。',
      '- equippedItemIds 最多三项，只能引用应用后仍存在的真实物品 ID；不要采用 playerPatch.equipment 的自由文本作为新物品。',
      '- category 只能是 equipment/general/document/valuable/fixedAsset/vehicle。fixedAssetType 只能是 residence/rentalProperty/businessPremise/storage/parkingSpace/investment/other；fixedAsset holdingRelation 只能是 owned/rented/assigned/familyOwned/managed/mortgaged/unknown；primaryUse 只能是 home/rentalIncome/business/storage/parking/investment/other。',
      '- fixedAsset 的 locationSummary、ownershipSummary、accessSummary 必须是非空字符串；可选字段没有值时省略，禁止返回 null，也禁止把中文说明填进枚举字段。',
      VEHICLE_ASSET_WRITEBACK_CONTRACT,
      resolvePromptText('repair.assetLifecycle', promptSettings)
    );
    repairContext.existingAssets = visibleAssetItems(state)
      .sort((left, right) => right.importance - left.importance || left.itemId.localeCompare(right.itemId))
      .slice(0, 120)
      .map(summarizeAssetForLifecycleRepair);
    repairContext.currentEquippedItemIds = state.assets.equippedItemIds;
    repairContext.rawProposedAssetPatch = response.rawAssetPatch ?? null;
    repairContext.validatedProposedAssetPatch = response.writeback.assetPatch ?? null;
    repairContext.assetValidationWarnings =
      response.validationWarnings?.filter((warning) =>
        issuePathStartsWith(warning.path, ['writeback', 'assetPatch'])
      ) ?? [];
    repairContext.legacyPlayerEquipmentProposal = response.writeback.playerPatch?.equipment ?? null;
    repairContext.financePatch = response.writeback.financePatch ?? null;
  }

  if (requested.has('civilianLivelihood')) {
    outputShape.civilianLivelihood = {
      civilianRoleProfilePatch: null,
      financePatch: null
    };
    domainInstructions.push(
      '- 只修复同一回合已经成立的市民职业与固定收入一致性，不创造新工作、不改正文。',
      '- 正式受雇与 active civilian salary 是原子写回：开始固定受雇时必须同时给出 employerOrganizationId、非 unemployed 的 employmentStatusId 与固定工资；无法确认时两个对象都返回 null。',
      '- 正式离职或失业时，civilianRoleProfilePatch 应清除 employerOrganizationId，并把已有市民 salary 标为 ended/paused 或移除；升职加薪时复用原 itemId 更新金额，禁止新增第二份重复主工资。',
      '- employerOrganizationId、workplacePlaceId、livelihoodActorIds 只能引用 currentStateKnownIds 或 mainNarratorResponse 本回合已创建的稳定 ID。',
      '- 自营、自由职业或零散收入不应伪装成 salary；没有固定月薪时 financePatch 可以返回 null。'
    );
    const playerActor = state.actors[state.player.actorId];
    repairContext.currentCivilianRoleProfile = playerActor?.roleProfiles.civilian;
    repairContext.currentCivilianCashflows = Object.values(state.finance.cashflows).filter(
      (item) => item.identityBinding === 'civilian'
    );
    repairContext.currentStateKnownIds = {
      organizationIds: Object.keys(state.organizations),
      placeIds: Object.keys(state.places),
      actorIds: Object.keys(state.actors)
    };
  }

  if (requested.has('incidentOrigin')) {
    outputShape.incidentOrigin = {
      status: 'applied',
      currentMatterPatches: [],
      memories: [],
      actorMemories: []
    };
    domainInstructions.push(
      resolvePromptText('repair.incidentOrigin', promptSettings),
      '- status 只能是 applied、already_persisted、not_applicable。只有本回合新增且尚未持久化的来源事实使用 applied；已有事实使用 already_persisted；回顾、继续处理、假设、否定或普通对话使用 not_applicable。',
      '- status=already_persisted 或 not_applicable 时，currentMatterPatches、memories、actorMemories 必须全部为空。',
      '- 仍在进行的现场事项写 currentMatterPatches；同时用 world memory 保存谁报案、为何派警和谁应知情。',
      '- memories 每一项必须是对象，最小合法形状为 {"text":"...","kind":"world","importance":75,"visibility":"player_known","certainty":"fact"}；禁止返回字符串数组。',
      '- actorMemories 只可写给 existingKnownActors 或本回合 actorPatches 已创建的人物。'
    );
    repairContext.existingCurrentMatters = Object.values(state.dynamicEvents.currentMatters)
      .filter((matter) => matter.status !== 'archived')
      .map((matter) => ({
        id: matter.id,
        title: matter.title,
        summary: matter.summary,
        status: matter.status,
        source: matter.source,
        relatedActorIds: matter.relatedActorIds,
        relatedPlaceIds: matter.relatedPlaceIds,
        relatedCaseIds: matter.relatedCaseIds
      }));
    repairContext.existingDurableMemories = existingDurableMemoriesForIncidentOrigin(state);
    repairContext.existingCases = Object.values(state.cases).map((caseFile) => ({
      caseId: caseFile.caseId,
      title: caseFile.title,
      status: caseFile.status,
      summary: caseFile.summary,
      currentFocus: caseFile.currentFocus,
      relatedActorIds: caseFile.relatedActorIds,
      relatedPlaceIds: caseFile.relatedPlaceIds
    }));
    repairContext.knownPlaces = Object.values(state.places)
      .slice(0, 80)
      .map((place) => ({
        placeId: place.placeId,
        name: place.name,
        nameZh: place.nameZh,
        nameEn: place.nameEn,
        aliases: place.aliases
      }));
    repairContext.existingKnownActors = Object.values(state.actors)
      .filter((actor) => actor.presence === 'present' || actor.presence === 'nearby' || actor.importance >= 70)
      .slice(0, 60)
      .map((actor) => ({
        actorId: actor.actorId,
        name: actor.name,
        aliases: actor.aliases,
        publicIdentity: actor.publicIdentity,
        currentPlaceId: actor.currentPlaceId,
        presence: actor.presence
      }));
  }

  if (requested.has('location')) {
    outputShape.location = { locationPatch: null };
    domainInstructions.push(
      resolvePromptText('repair.location', promptSettings),
      '- currentPlaceId 只能使用 candidateKnownPlaces 的 placeId；currentSceneId 只能使用同一地点下列出的已知 sceneId。',
      '- 有把握时返回包含非空字符串 ID 的 locationPatch；无法确认时让整个 locationPatch 为 null。禁止在 locationPatch 对象内部把 currentPlaceId 或 currentSceneId 写成 null。'
    );
    repairContext.currentLocation = state.location;
    repairContext.candidateKnownPlaces = plan.locationCandidatePlaceIds.map((placeId) => {
      const place = state.places[placeId];
      return {
        placeId,
        name: place?.name,
        nameZh: place?.nameZh,
        nameEn: place?.nameEn,
        aliases: place?.aliases,
        knownScenes: Object.values(state.scenes)
          .filter((scene) => scene.placeId === placeId)
          .map((scene) => ({ sceneId: scene.sceneId, name: scene.name }))
      };
    });
  }

  if (requested.has('playerClothing')) {
    outputShape.playerClothing = { playerPatch: {} };
    domainInstructions.push(
      resolvePromptText('repair.playerClothing', promptSettings),
      '- clothing 必须是对象，currentSummary 与 mode 都必填；mode 只能是 duty_uniform/off_duty_plain/formal/disguise/special/sleepwear/other。不得返回纯字符串或自造枚举。lastChangedReason 写本回合明确依据；不要返回 equipment。'
    );
    repairContext.currentPlayerClothing = {
      name: state.player.name,
      currentIdentity: state.player.currentIdentity,
      clothing: state.player.clothing,
      clothingState: state.player.clothingState
    };
  }

  if (requested.has('policeAssignment')) {
    outputShape.policeAssignment = {
      policeRoleProfilePatch: null,
      currentRank: null
    };
    domainInstructions.push(
      '- 只核对玩家本人已经在本回合正文中正式生效的警衔、单位或岗位变化。讨论、申请、计划、暂代、借调协作、未来报到不得当成已生效调动。',
      '- 无正式变化时，policeRoleProfilePatch 与 currentRank 都返回 null。不得为了填满结构改动现有身份。',
      '- 正式单位/岗位变化时，policeRoleProfilePatch 必须完整返回 reason、stationOrPost、department、assignmentSummary；可选 actorId 只能来自 knownPoliceActors。',
      '- 正式晋升或降级时，currentRank 返回正文已经确认的新警衔；没有正式警衔变化时返回 null。不得返回目标警衔或申请中的警衔。',
      '- 这是最小身份修复：不得返回正文、人物补丁、机构补丁或其他写回。'
    );
    const playerActor = state.actors[state.player.actorId];
    repairContext.currentPoliceIdentity = {
      playerActorId: state.player.actorId,
      playerName: state.player.name,
      currentRank: state.lawIdentity.rank,
      lawIdentity: state.lawIdentity,
      policePanel: state.policePanel,
      roleProfile: playerActor?.roleProfiles.police ?? null
    };
    repairContext.knownPoliceActors = Object.values(state.actors)
      .filter((actor) => actor.roleProfiles.police && actor.actorId !== state.player.actorId)
      .slice(0, 60)
      .map((actor) => ({
        actorId: actor.actorId,
        name: actor.name,
        publicIdentity: actor.publicIdentity,
        rank: actor.roleProfiles.police?.rank,
        department: actor.roleProfiles.police?.department,
        stationOrPost: actor.roleProfiles.police?.stationOrPost
      }));
  }

  if (requested.has('pregnancyLifecycle')) {
    outputShape.pregnancyLifecycle = {
      pregnancyLifecycleReview: {
        changed: false,
        events: [],
        reason: '本回合没有妊娠生命周期事件。'
      },
      pregnancyRiskPatches: [],
      pregnancyResolutionPatches: []
    };
    domainInstructions.push(
      '- pregnancyLifecycle 只复核本回合正文已经明确发生的事实，不改正文，不补造医疗结论、亲密行为、流产、分娩或父系信息。',
      '- 必须返回 pregnancyLifecycleReview。无事件时 changed=false、events=[]；有事件时 changed=true，并逐人使用 pregnancy_risk / pregnancy_confirmed / pregnancy_ended / live_birth。events 每项必须严格为 { "actorId": "knownAdultFemaleActors 中的稳定 ID", "event": "四个固定英文值之一", "reason": "说明本回合直接依据的单个字符串" }；reason 禁止返回数组、对象或 null。',
      '- 每个 review event 必须有对应写回：pregnancy_risk 对应 pregnancyRiskPatches；其余三种对应同 outcome 的 pregnancyResolutionPatches。不得只写 review 而漏掉补丁。',
      '- 医院或医学检查明确确认已有 suspected 妊娠时使用 pregnancy_confirmed；普通按期阳性验孕不由模型宣布。明确终止已有阳性妊娠时使用 pregnancy_ended；只有进入待产窗口且正文分娩时使用 live_birth。',
      '- 已处于 suspected / confirmed / delivery_due / postpartum 的人物若本回合仍发生受孕风险行为，pregnancyRiskPatches 仍必须返回；本地只追加接触记录，不会创建第二个妊娠。',
      '- pregnancyRiskPatches 的 riskType 只能是 unprotected / tryingToConceive / reducedRisk；同一人物最多一条。父系候选只写本回合事实允许玩家知道的稳定 actorId/name，禁止猜测。',
      '- 只能引用 knownAdultFemaleActors 中的 actorId；无法从正文确认事件时返回无变化，不要为了满足修复请求制造变化。'
    );
    const explicitlyRelevantActorIds = new Set([
      ...(response.pregnancyLifecycleReview?.events ?? []).map((event) => event.actorId),
      ...response.writeback.pregnancyRiskPatches.map((patch) => patch.actorId),
      ...response.writeback.pregnancyResolutionPatches.map((patch) => patch.actorId)
    ]);
    repairContext.pregnancyLifecycleReview = response.pregnancyLifecycleReview ?? null;
    repairContext.pregnancyLifecycleMissingEvents = plan.pregnancyLifecycleDecision.missingEvents;
    repairContext.knownAdultFemaleActors = Object.values(state.actors)
      .filter((actor) => {
        const age = deriveActorAgeAt(actor, state.time);
        return (
          actor.gender === 'female' &&
          age !== undefined &&
          age >= 18 &&
          (['present', 'nearby', 'mentioned'].includes(actor.presence) || explicitlyRelevantActorIds.has(actor.actorId))
        );
      })
      .slice(0, 30)
      .map((actor) => {
        const womb = actor.femaleProfile?.adultPrivateProfile?.womb;
        return {
          actorId: actor.actorId,
          name: actor.name,
          presence: actor.presence,
          wombStatus: womb?.status ?? '未建立跟踪',
          pregnancy: womb?.pregnancy
            ? {
                pregnancyId: womb.pregnancy.pregnancyId,
                status: womb.pregnancy.status,
                registeredAt: womb.pregnancy.registeredAt,
                checkDueAt: womb.pregnancy.checkDueAt,
                confirmationDueAt: womb.pregnancy.confirmationDueAt,
                deliveryWindowAt: womb.pregnancy.deliveryWindowAt
              }
            : null
        };
      });
  }

  if (requested.has('playerVitals')) {
    outputShape.playerVitals = { actorPatches: [] };
    domainInstructions.push(
      resolvePromptText('repair.playerVitals', promptSettings),
      plan.playerVitalsDecision.reason === 'declared_change'
        ? `- 主叙事已明确声明玩家身体状态发生变化，必须返回 {"playerVitals":{"actorPatches":[{"actorId":${JSON.stringify(state.player.actorId)},"vitalsPatch":{"healthDelta":0,"staminaDelta":-8,"conditionSummary":"本回合后的当前身体状态。","conditionPersistence":"transient"}}]}}；不能返回空数组。数值和持续性按实际事实调整。`
        : plan.playerVitalsDecision.reason === 'lifecycle_review'
          ? `- 当前状态需要生命周期复核：${JSON.stringify(plan.playerVitalsDecision.lifecycleReview?.detail ?? plan.playerVitalsDecision.lifecycleReview?.reason)}。必须返回一条 actorId=${JSON.stringify(state.player.actorId)} 的 vitalsPatch；即使数值不变，也要返回复核后的 conditionSummary 与 conditionPersistence，不能返回空数组。不得自动清除持续伤病。`
          : `- 主叙事遗漏了新协议要求的 playerVitalsReview，请由 AI 根据本回合已发生事实复核；没有变化时严格返回 {"playerVitals":{"actorPatches":[]}}，有变化时返回一条 actorId=${JSON.stringify(state.player.actorId)} 的合法 vitalsPatch。`,
      '- 禁止返回只有 actorId、没有 vitalsPatch 的玩家空壳。',
      '- 生命/体力是稀疏游戏状态，不是代谢模拟；环境闷热、微汗、保持坐姿、普通文书、交谈、等待、情绪紧张、日常站立或短距离走动不得单独触发变化。',
      '- 轻微消耗约 -3 到 -8，明显追逐/搏斗约 -10 到 -25；conditionSummary 写中文当前状态，并同时写 conditionPersistence=stable|transient|persistent|unknown。'
    );
    repairContext.currentPlayerVitals = state.player.vitals;
    repairContext.playerVitalsReview = response.playerVitalsReview ?? null;
    repairContext.playerVitalsLifecycleReview = plan.playerVitalsDecision.lifecycleReview ?? null;
  }

  if (requested.has('relationshipThreads')) {
    outputShape.relationshipThreads = { relationshipThreadPatches: [] };
    domainInstructions.push(
      resolvePromptText('repair.relationshipThread', promptSettings),
      '- 普通社会/工作/线索关系用 network；暧昧、恋爱、亲密或强情感牵引用 fate。',
      '- network 与 fate 是同一人物关系线的层级；已有 network 升为 fate 时必须复用原 threadId，不得并行创建第二条，已有 fate 也不得降级。',
      '- 不要发明人物；relatedActorIds 必须锚定 relationshipCandidateActorIds。currentPull 和 nextNaturalBeatHint 是自然回响，不是固定任务。',
      '- 必须补齐 creationBasis 与 evidenceRefs；当前回合明确形成的承诺或正式关系可引用 {kind:"current_turn",refId:"current_turn",summary:"..."}。',
      `- creationBasis 只能逐字使用：${RELATIONSHIP_CREATION_BASIS_CONTRACT}。不得翻译、缩写或创造新值。`,
      '- repeated_contact / sustained_conflict 至少需要两项不同有效引用，且至少一项必须是可核验的历史 memory/case/deferred_event；不得把同一 current_turn 拆成两条。',
      '- evidenceRefs 只能从 relationshipEvidenceOptions 中引用；没有足够真实证据就返回空数组，不能补造第二条证据。',
      '- evidenceRefs 每项严格使用 {kind,refId,summary}；候选已经提供可直接引用的 summary，禁止把 text、id 或 memoryId 当成输出字段。',
      '- 只能修复 relationshipCandidateThreadIds。通常它来自主叙事明确提交的关系线；relationshipOmissionCandidates 是本地同时确认“本回合人物记忆 + 结构化持续关系信号 + 可核验历史证据”后开放的有限漏写候选。不得超出这些候选自行建线。',
      '- 每条返回必须使用 relationshipCandidateActorIdsByThreadId 为该 threadId 指定的人物锚点；不得交换人物，也不得用候选 ID 指向另一人物。',
      '- relationshipThreadPatches 必须是数组。每项只返回 threadId、kind、title、summary、relatedActorIds、primaryActorId、relationshipRole、creationBasis、evidenceRefs、status、visibility、importance；数组字段不得写成对象，数值不得写成字符串，不确定的可选字段直接省略，禁止 null。'
    );
    const actorPatchById = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
    const candidateActorIdSet = new Set(plan.relationshipEvidenceActorIds);
    repairContext.relationshipCandidateActorIds = plan.relationshipCandidateActorIds;
    repairContext.relationshipEvidenceActorIds = plan.relationshipEvidenceActorIds;
    repairContext.relationshipCandidateThreadIds = plan.relationshipCandidateThreadIds;
    repairContext.relationshipCandidateActorIdsByThreadId = plan.relationshipCandidateActorIdsByThreadId;
    repairContext.relationshipOmissionCandidates = plan.relationshipOmissionCandidates;
    repairContext.relationshipCandidateActors = plan.relationshipCandidateActorIds.map((actorId) => ({
      before: state.actors[actorId]
        ? summarizeActorForRelationshipThreadRepair(state.actors[actorId])
        : undefined,
      thisTurnPatch: actorPatchById.get(actorId)
        ? summarizeActorPatchForRelationshipThreadRepair(actorPatchById.get(actorId)!)
        : undefined
    }));
    repairContext.existingRelationshipThreads = Object.values(state.relationshipThreads ?? {})
      .filter((thread) => thread.visibility !== 'hidden')
      .sort((left, right) => right.importance - left.importance || right.threadId.localeCompare(left.threadId))
      .slice(0, 24)
      .map((thread) => ({
        threadId: thread.threadId,
        kind: thread.kind,
        title: thread.title,
        summary: thread.summary,
        relatedActorIds: thread.relatedActorIds,
        primaryActorId: thread.primaryActorId,
        relationshipRole: thread.relationshipRole,
        status: thread.status,
        currentPull: thread.currentPull,
        nextNaturalBeatHint: thread.nextNaturalBeatHint,
        visibility: thread.visibility,
        importance: thread.importance
      }));
    repairContext.existingRelationshipThreadIdentityRegistry = Object.values(state.relationshipThreads ?? {})
      .filter((thread) => thread.visibility !== 'hidden')
      .sort((left, right) => left.threadId.localeCompare(right.threadId))
      .slice(0, 80)
      .map((thread) => ({
        threadId: thread.threadId,
        kind: thread.kind,
        primaryActorId: thread.primaryActorId,
        relatedActorIds: thread.relatedActorIds,
        status: thread.status
      }));
    repairContext.relationshipEvidenceOptions = {
      currentTurn: {
        kind: 'current_turn',
        refId: 'current_turn',
        summaryRule: 'Only facts explicitly established in the current structured relationship patch count.'
      },
      memories: Object.values(state.memories)
        .filter((memory) => memory.relatedActorIds.some((actorId) => candidateActorIdSet.has(actorId)))
        .sort((left, right) => right.importance - left.importance || right.memoryId.localeCompare(left.memoryId))
        .slice(0, 40)
        .map((memory) => ({
          kind: 'memory',
          refId: memory.memoryId,
          summary: boundedRelationshipEvidenceSummary(memory.text),
          gameTime: memory.gameTime,
          relatedActorIds: memory.relatedActorIds,
          certainty: memory.certainty
        })),
      cases: Object.values(state.cases)
        .filter((caseFile) => caseFile.relatedActorIds.some((actorId) => candidateActorIdSet.has(actorId)))
        .slice(0, 24)
        .map((caseFile) => ({
          kind: 'case',
          refId: caseFile.caseId,
          title: caseFile.title,
          summary: boundedRelationshipEvidenceSummary(caseFile.summary),
          relatedActorIds: caseFile.relatedActorIds
        })),
      deferredEvents: Object.values(state.deferredEvents)
        .filter((event) => event.relatedIds.actorId && candidateActorIdSet.has(event.relatedIds.actorId))
        .slice(0, 24)
        .map((event) => ({
          kind: 'deferred_event',
          refId: event.eventId,
          title: event.title,
          summary: boundedRelationshipEvidenceSummary(event.summary),
          relatedActorId: event.relatedIds.actorId
        })),
      sameTurnCaseIds: response.writeback.casePatches.map((patch) => patch.caseId),
      sameTurnDeferredEventIds: response.writeback.deferredEventPatches.map((patch) => patch.eventId)
    };
    repairContext.rawRelationshipIntentCandidates = (response.rawRelationshipThreadPatches ?? []).filter((candidate) => {
      if (!isRecord(candidate) || typeof candidate.threadId !== 'string') return false;
      return plan.relationshipCandidateThreadIds.includes(candidate.threadId);
    });
  }

  return [
    'WRITEBACK_REPAIR_TASK',
    'COMBINED_WRITEBACK_REPAIR_TASK',
    `requestedDomains=${JSON.stringify(plan.domains)}`,
    '你是同一回合结构化写回修复器。所有请求域共享同一份已发生事实，但每个域必须独立判断、独立返回；不改正文，不创造新剧情。',
    '严格返回一个 JSON 对象，键名和 requestedDomains 一致。某域无需修复时返回该域的空结构；不要省略请求域，不要返回未请求域。',
    `outputShape=${JSON.stringify(outputShape)}`,
    '',
    ...domainInstructions,
    '',
    `repairContext=${JSON.stringify(repairContext)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      turnSummary: response.turnSummary,
      suggestedActions: response.suggestedActions,
      pregnancyLifecycleReview: response.pregnancyLifecycleReview,
      timePatch: response.timePatch,
      writeback: {
        playerPatch: response.writeback.playerPatch,
        policeRoleProfilePatch: response.writeback.policeRoleProfilePatch,
        civilianRoleProfilePatch: response.writeback.civilianRoleProfilePatch,
        financePatch: response.writeback.financePatch,
        actorPatches: response.writeback.actorPatches,
        actorMemories: response.writeback.actorMemories,
        memories: response.writeback.memories,
        locationPatch: response.writeback.locationPatch,
        currentMatterPatches: response.writeback.currentMatterPatches,
        relationshipThreadPatches: response.writeback.relationshipThreadPatches,
        pregnancyRiskPatches: response.writeback.pregnancyRiskPatches,
        pregnancyResolutionPatches: response.writeback.pregnancyResolutionPatches,
        assetPatch: response.writeback.assetPatch,
        casePatches: response.writeback.casePatches,
        caseEvidencePatches: response.writeback.caseEvidencePatches,
        judgementCheckPatches: response.writeback.judgementCheckPatches,
        combatEventPatches: response.writeback.combatEventPatches,
        organizationPatches: response.writeback.organizationPatches,
        placePatches: response.writeback.placePatches
      },
      validationWarnings: response.validationWarnings
    })}`
  ].join('\n');
}

interface ParsedPregnancyLifecycleRepair {
  review?: PregnancyLifecycleReview;
  riskPatches: PregnancyRiskPatch[];
  resolutionPatches: PregnancyResolutionPatch[];
  diagnostics: StoryDiagnosticIssue[];
  fullyReconciled: boolean;
}

function derivePregnancyLifecycleReviewFromValidatedPatches(
  riskPatches: PregnancyRiskPatch[],
  resolutionPatches: PregnancyResolutionPatch[]
): PregnancyLifecycleReview | undefined {
  const events = new Map<string, PregnancyLifecycleReviewEvent>();
  for (const patch of riskPatches) {
    const event: PregnancyLifecycleReviewEvent = {
      actorId: patch.actorId,
      event: 'pregnancy_risk',
      reason: patch.summary
    };
    events.set(`${event.actorId}:${event.event}`, event);
  }
  for (const patch of resolutionPatches) {
    const event: PregnancyLifecycleReviewEvent = {
      actorId: patch.actorId,
      event: patch.outcome,
      reason: patch.summary
    };
    events.set(`${event.actorId}:${event.event}`, event);
  }
  const recoveredEvents = [...events.values()].slice(0, 4);
  if (recoveredEvents.length === 0) return undefined;
  return {
    changed: true,
    events: recoveredEvents,
    reason: `已根据 ${recoveredEvents.length} 条通过严格校验的妊娠状态补丁恢复生命周期复核。`
  };
}

function parsePregnancyLifecycleRepairResponse(
  value: unknown,
  knownActorIds: Set<string>
): ParsedPregnancyLifecycleRepair {
  const diagnostics: StoryDiagnosticIssue[] = [];
  if (!isRecord(value)) {
    return {
      riskPatches: [],
      resolutionPatches: [],
      fullyReconciled: false,
      diagnostics: [
        {
          path: ['writebackRepair', 'pregnancyLifecycle'],
          code: 'invalid_type',
          message: '妊娠生命周期修复必须返回对象。'
        }
      ]
    };
  }

  const parsePatchArray = <T>(
    raw: unknown,
    schema: { safeParse: (candidate: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ path: PropertyKey[]; code: string; message: string }> } } },
    key: 'pregnancyRiskPatches' | 'pregnancyResolutionPatches'
  ): T[] => {
    if (!Array.isArray(raw)) {
      diagnostics.push({
        path: ['writebackRepair', 'pregnancyLifecycle', key],
        code: 'invalid_type',
        message: `${key} 必须是数组。`
      });
      return [];
    }
    return raw.flatMap((candidate, index) => {
      const parsed = schema.safeParse(candidate);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          diagnostics.push({
            path: ['writebackRepair', 'pregnancyLifecycle', key, index, ...issue.path.map(String)],
            code: issue.code,
            message: issue.message
          });
        }
        return [];
      }
      const actorId = (parsed.data as { actorId?: unknown }).actorId;
      if (typeof actorId !== 'string' || !knownActorIds.has(actorId)) {
        diagnostics.push({
          path: ['writebackRepair', 'pregnancyLifecycle', key, index, 'actorId'],
          code: 'pregnancy_repair_unknown_actor',
          message: `妊娠生命周期修复引用了未知人物 ${String(actorId)}。`
        });
        return [];
      }
      return [parsed.data];
    });
  };

  const riskPatches = parsePatchArray(
    value.pregnancyRiskPatches,
    pregnancyRiskPatchSchema,
    'pregnancyRiskPatches'
  );
  const resolutionPatches = parsePatchArray(
    value.pregnancyResolutionPatches,
    pregnancyResolutionPatchSchema,
    'pregnancyResolutionPatches'
  );
  const patchValidationFailed = diagnostics.length > 0;
  const patchDerivedReview = derivePregnancyLifecycleReviewFromValidatedPatches(
    riskPatches,
    resolutionPatches
  );
  const parsedReview = pregnancyLifecycleReviewSchema.safeParse(value.pregnancyLifecycleReview);
  let review: PregnancyLifecycleReview | undefined;
  let reviewActorValidationFailed = false;
  let reviewPatchValidationFailed = false;
  if (!parsedReview.success) {
    for (const issue of parsedReview.error.issues) {
      diagnostics.push({
        path: ['writebackRepair', 'pregnancyLifecycle', 'pregnancyLifecycleReview', ...issue.path.map(String)],
        code: issue.code,
        message: issue.message
      });
    }
    if (patchDerivedReview) {
      review = patchDerivedReview;
      diagnostics.push({
        path: ['writebackRepair', 'pregnancyLifecycle', 'pregnancyLifecycleReview'],
        code: 'pregnancy_lifecycle_review_recovered_from_valid_patches',
        message: `生命周期复核格式无效，但已依据 ${patchDerivedReview.events.length} 条通过严格校验的状态补丁恢复规范复核。`
      });
    }
  } else {
    const knownEvents = parsedReview.data.events.filter((event) => {
      if (knownActorIds.has(event.actorId)) return true;
      reviewActorValidationFailed = true;
      diagnostics.push({
        path: ['writebackRepair', 'pregnancyLifecycle', 'pregnancyLifecycleReview', 'events', event.actorId],
        code: 'pregnancy_repair_unknown_actor',
        message: `妊娠生命周期复核引用了未知人物 ${event.actorId}。`
      });
      return false;
    });
    review = {
      ...parsedReview.data,
      changed: knownEvents.length > 0,
      events: knownEvents
    };
  }

  if (review?.changed) {
    for (const event of review.events) {
      const hasPatch =
        event.event === 'pregnancy_risk'
          ? riskPatches.some((patch) => patch.actorId === event.actorId)
          : resolutionPatches.some(
              (patch) => patch.actorId === event.actorId && patch.outcome === event.event
            );
      if (!hasPatch) {
        reviewPatchValidationFailed = true;
        diagnostics.push({
          path: ['writebackRepair', 'pregnancyLifecycle', 'pregnancyLifecycleReview', event.actorId],
          code: 'pregnancy_lifecycle_repair_missing_patch',
          message: `修复复核声明了 ${event.event}，但没有返回人物 ${event.actorId} 的对应补丁。`
        });
      }
    }
  }

  return {
    review,
    riskPatches,
    resolutionPatches,
    diagnostics,
    fullyReconciled:
      !patchValidationFailed &&
      !reviewActorValidationFailed &&
      !reviewPatchValidationFailed &&
      (parsedReview.success || Boolean(patchDerivedReview))
  };
}

function mergePregnancyLifecycleRepair(
  response: NarratorResponse,
  parsed: ParsedPregnancyLifecycleRepair
): NarratorResponse {
  return {
    ...response,
    ...(parsed.review ? { pregnancyLifecycleReview: parsed.review } : {}),
    writeback: {
      ...response.writeback,
      pregnancyRiskPatches: uniquePregnancyRiskPatches([
        ...response.writeback.pregnancyRiskPatches,
        ...parsed.riskPatches
      ]),
      pregnancyResolutionPatches: uniquePregnancyResolutionPatches([
        ...response.writeback.pregnancyResolutionPatches,
        ...parsed.resolutionPatches
      ])
    }
  };
}

async function repairCompatibleWritebacks({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair,
  allowRelationshipRepair,
  actorIdAliases,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
  allowRelationshipRepair: boolean;
  actorIdAliases: Record<string, string>;
  promptSettings?: PromptSettings;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  const assetIntentRecovery = recoverVehicleAssetIntents(state, response);
  response = assetIntentRecovery.response;
  const relationshipNormalization = normalizeRelationshipEvidenceForResponse(state, response);
  response = relationshipNormalization.response;
  const playerVitalsDecision = resolvePlayerVitalsRepairDecision(state, response, turnEndTime);
  const pregnancyLifecycleDecision = resolvePregnancyLifecycleRepairDecision(response, actorIdAliases);
  if (!writebackRepair) {
    return {
      response,
      diagnostics: [
        ...assetIntentRecovery.diagnostics,
        ...relationshipNormalization.diagnostics,
        ...(pregnancyLifecycleDecision.patchRequired
          ? [
              {
                path: ['writeback', 'pregnancyLifecycle'],
                code: 'pregnancy_lifecycle_repair_unavailable',
                message: `妊娠生命周期写回需要修复（${pregnancyLifecycleDecision.reason}），但当前没有可用的轻量修复线路；原状态保持不变。`
              }
            ]
          : []),
        ...(
        playerVitalsDecision.patchRequired &&
        !hasMeaningfulPlayerVitalsPatch(response, state.player.actorId)
          ? [
              {
                path: ['writeback', 'actorPatches', state.player.actorId, 'vitalsPatch'],
                code:
                  playerVitalsDecision.reason === 'lifecycle_review'
                    ? 'player_vitals_lifecycle_review_unavailable'
                    : 'writeback_repair_missing_vitals_patch',
                message:
                  playerVitalsDecision.reason === 'lifecycle_review'
                    ? `玩家身体状态需要生命周期复核（${playerVitalsDecision.lifecycleReview?.reason ?? 'unknown'}），但当前没有可用的轻量写回修复线路；原状态保持不变。`
                    : 'Player vitals review declared a change, but no player vitalsPatch or writeback repair route was available.'
              }
            ]
          : []
        )
      ]
    };
  }

  const plan = collectCompatibleWritebackRepairPlan({
    state,
    response,
    turnEndTime,
    allowRelationshipRepair,
    actorIdAliases
  });
  if (plan.domains.length === 0) {
    return {
      response,
      diagnostics: [
        ...assetIntentRecovery.diagnostics,
        ...relationshipNormalization.diagnostics
      ]
    };
  }

  const diagnostics: StoryDiagnosticIssue[] = [
    ...assetIntentRecovery.diagnostics,
    ...relationshipNormalization.diagnostics,
    {
      path: ['writebackRepair', 'combined'],
      code: 'writeback_repair_requested',
      message: `Combined writeback repair requested domains: ${plan.domains.join(', ')}.`
    },
    ...(plan.playerVitalsDecision.reason === 'lifecycle_review'
      ? [
          {
            path: ['writebackRepair', 'playerVitals', 'conditionLifecycle'],
            code: 'player_vitals_lifecycle_review_requested',
            message: `玩家身体状态已进入轻量生命周期复核：${plan.playerVitalsDecision.lifecycleReview?.reason ?? 'unknown'}；复核前状态=${state.player.vitals.conditionSummary}；当前时间=${JSON.stringify(state.time)}；回合结束时间=${JSON.stringify(turnEndTime)}。`
          }
        ]
      : []),
    ...(plan.pregnancyLifecycleDecision.shouldRepair
      ? [
          {
            path: ['writebackRepair', 'pregnancyLifecycle'],
            code: 'pregnancy_lifecycle_repair_requested',
            message: `妊娠生命周期已进入轻量复核：${plan.pregnancyLifecycleDecision.reason}；缺失事件=${plan.pregnancyLifecycleDecision.missingEvents.map((event) => `${event.actorId}:${event.event}`).join(', ') || 'none'}。`
          }
        ]
      : [])
  ];

  try {
    const repairPrompt = createCompatibleWritebackRepairPrompt({
      state,
      response,
      playerInput,
      turnEndTime,
      plan,
      promptSettings
    });
    const repairRaw = await writebackRepair.complete(repairPrompt);
    let repairedResponse = response;

    if (plan.domains.includes('civilianLivelihood')) {
      const container = selectCompatibleRepairDomain(repairRaw, 'civilianLivelihood');
      const rawRolePatch = isRecord(container) ? container.civilianRoleProfilePatch : undefined;
      const rawFinancePatch = isRecord(container) ? container.financePatch : undefined;
      let rolePatch: CivilianRoleProfilePatch | undefined;
      let financePatch: FinancePatch | undefined;

      if (rawRolePatch !== undefined && rawRolePatch !== null) {
        const parsed = playerCivilianRoleProfilePatchSchema.safeParse(rawRolePatch);
        if (parsed.success) rolePatch = parsed.data;
        else {
          for (const issue of parsed.error.issues) {
            diagnostics.push({
              path: ['writebackRepair', 'civilianLivelihood', 'civilianRoleProfilePatch', ...issue.path.map(String)],
              code: issue.code,
              message: issue.message
            });
          }
        }
      }
      if (rawFinancePatch !== undefined && rawFinancePatch !== null) {
        const parsed = financePatchSchema.safeParse(rawFinancePatch);
        if (parsed.success) financePatch = parsed.data;
        else {
          for (const issue of parsed.error.issues) {
            diagnostics.push({
              path: ['writebackRepair', 'civilianLivelihood', 'financePatch', ...issue.path.map(String)],
              code: issue.code,
              message: issue.message
            });
          }
        }
      }

      if (rolePatch || financePatch) {
        const originalFinance = repairedResponse.writeback.financePatch;
        const mergedCashflows = new Map(
          (originalFinance?.upsertCashflows ?? []).map((item) => [item.itemId, item])
        );
        for (const item of financePatch?.upsertCashflows ?? []) mergedCashflows.set(item.itemId, item);
        repairedResponse = {
          ...repairedResponse,
          writeback: {
            ...repairedResponse.writeback,
            civilianRoleProfilePatch: rolePatch ?? repairedResponse.writeback.civilianRoleProfilePatch,
            financePatch: financePatch
              ? {
                  ...originalFinance,
                  ...financePatch,
                  upsertCashflows: [...mergedCashflows.values()],
                  removeCashflowItemIds: [
                    ...new Set([
                      ...(originalFinance?.removeCashflowItemIds ?? []),
                      ...financePatch.removeCashflowItemIds
                    ])
                  ],
                  ledgerEntries: [
                    ...(originalFinance?.ledgerEntries ?? []),
                    ...financePatch.ledgerEntries
                  ]
                }
              : originalFinance
          }
        };
        diagnostics.push({
          path: ['writeback', 'civilianRoleProfilePatch'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair reconciled civilian employment and recurring income.'
        });
      }
    }

    if (plan.domains.includes('assetLifecycle')) {
      const parsed = parseAssetLifecycleRepairResponse(
        state,
        selectCompatibleRepairDomain(repairRaw, 'assetLifecycle'),
        response.writeback.assetPatch,
        response.rawAssetUpsertItems ?? [],
        Boolean(response.writeback.assetPatch) && !hasAssetPatchValidationWarning(response)
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.assetPatch) {
        repairedResponse = mergeAssetLifecycleRepair(repairedResponse, parsed.assetPatch);
        diagnostics.push({
          path: ['writeback', 'assetPatch'],
          code: 'writeback_repair_applied',
          message: `Asset review replaced the main proposal: upsert=${parsed.assetPatch.upsertItems.length}, remove=${parsed.assetPatch.removeItems.length}, equipped=${parsed.assetPatch.equippedItemIds?.length ?? 'unchanged'}.`
        });
        diagnostics.push({
          path: ['writeback', 'assetPatch'],
          code: 'asset_writeback_applied',
          message: `资产修复结果已通过逐项校验：upsert=${parsed.assetPatch.upsertItems.length}，remove=${parsed.assetPatch.removeItems.length}。`
        });
      }
    }

    if (plan.domains.includes('incidentOrigin')) {
      const parsed = parseIncidentOriginRepairResponse(selectCompatibleRepairDomain(repairRaw, 'incidentOrigin'));
      diagnostics.push(...parsed.diagnostics);
      if (
        parsed.currentMatterPatches.length > 0 ||
        parsed.memories.length > 0 ||
        parsed.actorMemories.length > 0
      ) {
        repairedResponse = mergeIncidentOriginRepair(repairedResponse, parsed);
        diagnostics.push({
          path: ['writeback', 'incidentOrigin'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied incident origin facts: matters=${parsed.currentMatterPatches.length}, memories=${parsed.memories.length}, actorMemories=${parsed.actorMemories.length}.`
        });
      }
    }

    if (plan.domains.includes('location')) {
      const parsed = parseLocationRepairResponse(
        state,
        selectCompatibleRepairDomain(repairRaw, 'location'),
        new Set(plan.locationCandidatePlaceIds)
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.locationPatch) {
        repairedResponse = mergeLocationRepair(repairedResponse, parsed.locationPatch);
        diagnostics.push({
          path: ['writeback', 'locationPatch'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied location patch for ${parsed.locationPatch.currentPlaceId ?? parsed.locationPatch.currentSceneId}.`
        });
      }
    }

    if (plan.domains.includes('playerClothing')) {
      const parsed = parsePlayerClothingRepairResponse(selectCompatibleRepairDomain(repairRaw, 'playerClothing'));
      diagnostics.push(...parsed.diagnostics);
      if (parsed.playerPatch?.clothing) {
        repairedResponse = mergePlayerClothingRepair(repairedResponse, parsed.playerPatch);
        diagnostics.push({
          path: ['writeback', 'playerPatch', 'clothing'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair supplied player clothing state omitted by the main narrator.'
        });
      }
    }

    if (plan.domains.includes('policeAssignment')) {
      const container = selectCompatibleRepairDomain(repairRaw, 'policeAssignment');
      const rawPoliceRoleProfilePatch = isRecord(container)
        ? container.policeRoleProfilePatch
        : undefined;
      const rawCurrentRank = isRecord(container) ? container.currentRank : undefined;
      let policeRoleProfilePatch: PlayerPoliceRoleProfilePatch | undefined;
      let currentRank: string | undefined;

      if (rawPoliceRoleProfilePatch !== undefined && rawPoliceRoleProfilePatch !== null) {
        const parsed = playerPoliceRoleProfilePatchSchema.safeParse(rawPoliceRoleProfilePatch);
        if (parsed.success) {
          const actorIds = [
            ...(parsed.data.supervisorActorIds ?? []),
            ...(parsed.data.peerActorIds ?? [])
          ];
          const invalidActorId = actorIds.find((actorId) =>
            actorId === state.player.actorId || !state.actors[actorId]
          );
          if (invalidActorId) {
            diagnostics.push({
              path: ['writebackRepair', 'policeAssignment', 'policeRoleProfilePatch'],
              code: 'writeback_repair_unknown_actor',
              message: `警务身份修复引用了未知或非法人物 ${invalidActorId}，未采用该单位补丁。`
            });
          } else {
            policeRoleProfilePatch = parsed.data;
          }
        } else {
          for (const issue of parsed.error.issues) {
            diagnostics.push({
              path: [
                'writebackRepair',
                'policeAssignment',
                'policeRoleProfilePatch',
                ...issue.path.map(String)
              ],
              code: issue.code,
              message: issue.message
            });
          }
        }
      }
      if (rawCurrentRank !== undefined && rawCurrentRank !== null) {
        if (typeof rawCurrentRank === 'string' && rawCurrentRank.trim()) {
          currentRank = rawCurrentRank.trim();
        } else {
          diagnostics.push({
            path: ['writebackRepair', 'policeAssignment', 'currentRank'],
            code: 'invalid_type',
            message: '警务身份修复的 currentRank 必须是非空字符串或 null。'
          });
        }
      }

      if (policeRoleProfilePatch || currentRank) {
        const originalPlayerPatch = repairedResponse.writeback.playerPatch;
        repairedResponse = {
          ...repairedResponse,
          writeback: {
            ...repairedResponse.writeback,
            ...(policeRoleProfilePatch ? { policeRoleProfilePatch } : {}),
            ...(currentRank
              ? {
                  playerPatch: playerPatchSchema.parse({
                    ...originalPlayerPatch,
                    policePanel: {
                      ...originalPlayerPatch?.policePanel,
                      careerPath: {
                        ...originalPlayerPatch?.policePanel?.careerPath,
                        currentRank
                      }
                    }
                  })
                }
              : {})
          }
        };
        diagnostics.push({
          path: ['writeback', 'policeRoleProfilePatch'],
          code: 'police_assignment_repair_applied',
          message: `警务身份一致性修复已采用：单位=${policeRoleProfilePatch ? 'updated' : 'unchanged'}，警衔=${currentRank ?? 'unchanged'}。`
        });
      }
    }

    if (plan.domains.includes('pregnancyLifecycle')) {
      const parsed = parsePregnancyLifecycleRepairResponse(
        selectCompatibleRepairDomain(repairRaw, 'pregnancyLifecycle'),
        new Set([
          ...Object.keys(state.actors),
          ...repairedResponse.writeback.actorPatches.map((patch) => patch.actorId)
        ])
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.review || parsed.riskPatches.length > 0 || parsed.resolutionPatches.length > 0) {
        repairedResponse = mergePregnancyLifecycleRepair(repairedResponse, parsed);
      }
      if (parsed.fullyReconciled) {
        diagnostics.push({
          path: ['writeback', 'pregnancyLifecycle'],
          code: 'pregnancy_lifecycle_repair_applied',
          message: `妊娠生命周期复核已采用：risk=${parsed.riskPatches.length}，resolution=${parsed.resolutionPatches.length}，changed=${parsed.review?.changed ?? false}。`
        });
      }
    }

    if (plan.domains.includes('playerVitals')) {
      const parsed = parsePlayerVitalsRepairResponse(
        selectCompatibleRepairDomain(repairRaw, 'playerVitals'),
        state.player.actorId,
        plan.playerVitalsDecision.patchRequired
      );
      if (parsed.patch?.vitalsPatch) {
        diagnostics.push(...parsed.diagnostics);
        repairedResponse = mergePlayerVitalsRepair(repairedResponse, parsed.patch);
        diagnostics.push({
          path: ['writeback', 'actorPatches', 'player', 'vitalsPatch'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair supplied player vitals omitted by the main narrator.'
        });
        if (plan.playerVitalsDecision.reason === 'lifecycle_review') {
          diagnostics.push({
            path: ['writeback', 'actorPatches', 'player', 'vitalsPatch', 'conditionLifecycle'],
            code: 'player_vitals_lifecycle_review_applied',
            message: `玩家身体状态生命周期复核已采用：${state.player.vitals.conditionSummary} -> ${parsed.patch.vitalsPatch.conditionSummary ?? state.player.vitals.conditionSummary}；持续性=${parsed.patch.vitalsPatch.conditionPersistence ?? 'unknown'}。`
          });
        }
      } else if (parsed.diagnostics.length > 0) {
        const focusedFallback = await repairPlayerVitals({
          state,
          response: repairedResponse,
          playerInput,
          turnEndTime,
          writebackRepair
        });
        repairedResponse = focusedFallback.response;
        diagnostics.push(
          {
            path: ['writebackRepair', 'playerVitals'],
            code: 'writeback_repair_fallback_requested',
            message: 'Combined repair returned an invalid player vitals shape; a focused vitals review was used.'
          },
          ...focusedFallback.diagnostics
        );
      }
    }

    if (plan.domains.includes('relationshipThreads')) {
      const parsed = parseRelationshipThreadRepairResponse(
        selectCompatibleRepairDomain(repairRaw, 'relationshipThreads'),
        state,
        repairedResponse,
        new Set([...Object.keys(state.actors), ...repairedResponse.writeback.actorPatches.map((patch) => patch.actorId)]),
        new Set(plan.relationshipCandidateActorIds),
        new Set(plan.relationshipCandidateThreadIds),
        plan.relationshipCandidateActorIdsByThreadId
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.patches.length > 0) {
        repairedResponse = mergeRelationshipThreadRepair(repairedResponse, parsed.patches);
        diagnostics.push({
          path: ['writeback', 'relationshipThreadPatches'],
          code: 'relationship_structure_repair_applied',
          message: `Writeback repair supplied ${parsed.patches.length} relationship thread patch(es).`
        });
        const omissionIds = new Set(plan.relationshipOmissionCandidates.map((candidate) => candidate.threadId));
        const omissionRepairCount = parsed.patches.filter((patch) => omissionIds.has(patch.threadId)).length;
        if (omissionRepairCount > 0) {
          diagnostics.push({
            path: ['writeback', 'relationshipThreadPatches'],
            code: 'relationship_omission_repair_applied',
            message: `Writeback repair recovered ${omissionRepairCount} durable relationship omission(s) from bounded structured evidence.`
          });
        }
      } else if (!parsed.diagnostics.some((issue) => issue.code === 'relationship_structure_repair_failed')) {
        diagnostics.push({
          path: ['writebackRepair', 'relationshipThreadPatches'],
          code: 'relationship_structure_repair_failed',
          message: `Relationship structure repair returned no acceptable patch for: ${plan.relationshipCandidateThreadIds.join(', ')}.`
        });
      }
    }

    return { response: repairedResponse, diagnostics };
  } catch (error) {
    return {
      response,
      diagnostics: [
        ...diagnostics,
        {
          path: ['writebackRepair', 'combined'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Combined writeback repair failed.'
        }
      ]
    };
  }
}

async function repairDueDeferredEvents({
  response,
  dueEvents,
  turnEndTime,
  playerInput,
  writebackRepair,
  initialDiagnostics,
  promptSettings
}: {
  response: NarratorResponse;
  dueEvents: DeferredEvent[];
  turnEndTime: GameTime;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
  initialDiagnostics: StoryDiagnosticIssue[];
  promptSettings?: PromptSettings;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair || initialDiagnostics.every((issue) => issue.code !== 'unhandled_due_deferred_event')) {
    return { response, diagnostics: [] };
  }

  try {
    const repairPrompt = createDeferredEventRepairPrompt(dueEvents, response, turnEndTime, playerInput, promptSettings);
    const repairRaw = await writebackRepair.complete(repairPrompt);
    const parsed = parseDeferredEventRepairResponse(repairRaw, dueEvents);
    if (parsed.patches.length === 0) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergeDeferredEventPatches(response, parsed.patches),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'deferredEventPatches'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied ${parsed.patches.length} deferred event patch(es).`
        }
      ]
    };
  } catch (error) {
    return {
      response,
      diagnostics: [
        {
          path: ['writebackRepair'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Writeback repair failed.'
        }
      ]
    };
  }
}

function collectPresentActorsForVectorRecall(state: RuntimeState): Actor[] {
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  const presentActors = currentScene
    ? currentScene.presentActorIds.map((actorId) => state.actors[actorId]).filter((actor): actor is Actor => Boolean(actor))
    : Object.values(state.actors).filter(
        (actor) => actor.presence === 'present' && actor.currentPlaceId === state.location.currentPlaceId
      );

  return presentActors
    .filter((actor) => actor.actorId !== state.player.actorId && actor.visibility !== 'hidden')
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12);
}

function readTurnSummary(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.turnSummary !== 'string') return undefined;
  const summary = value.turnSummary.trim();
  return summary || undefined;
}

function createTurnSummaryRepairPrompt(
  rawResponse: unknown,
  playerInput: string,
  promptSettings?: PromptSettings
): string {
  const narrativeText = isRecord(rawResponse) && typeof rawResponse.narrativeText === 'string' ? rawResponse.narrativeText : '';
  return [
    resolvePromptText('repair.turnSummary', promptSettings),
    '只返回 JSON：{"turnSummary":"..."}。不要改写正文，不要返回其他字段。',
    '',
    `玩家输入：${playerInput.trim()}`,
    '',
    `主叙事正文：${narrativeText.trim()}`
  ].join('\n');
}

async function repairMissingTurnSummary({
  rawResponse,
  playerInput,
  narrator,
  writebackRepair,
  promptSettings
}: {
  rawResponse: unknown;
  playerInput: string;
  narrator: NarratorClient;
  writebackRepair?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<unknown> {
  if (readTurnSummary(rawResponse)) return rawResponse;
  if (!isRecord(rawResponse)) {
    throw new Error('主叙事返回无法补写回合事实摘要。');
  }

  const repairClient = writebackRepair ?? narrator;
  const repairRaw = await repairClient.complete(createTurnSummaryRepairPrompt(rawResponse, playerInput, promptSettings));
  const turnSummary = readTurnSummary(repairRaw);
  if (!turnSummary) {
    throw new Error('主叙事缺少回合事实摘要，修复接口也未返回有效摘要。');
  }

  return {
    ...rawResponse,
    turnSummary
  };
}

function createVectorRecallQuery(state: RuntimeState, playerInput: string): string {
  const currentPlace = state.places[state.location.currentPlaceId];
  const currentScene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  const placeText = currentPlace
    ? uniqueStrings([
        currentPlace.name,
        currentPlace.nameZh,
        currentPlace.nameEn,
        ...(currentPlace.aliases ?? []),
        currentPlace.streetAddressText,
        ...(currentPlace.roadAnchors ?? []),
        currentPlace.summary
      ]).join(' / ')
    : '';
  const sceneText = currentScene
    ? uniqueStrings([currentScene.name, currentScene.summary, currentScene.temporaryState]).join(' / ')
    : '';
  const actorText = collectPresentActorsForVectorRecall(state)
    .map((actor) =>
      uniqueStrings([
        actor.name,
        actor.englishName,
        actor.callName,
        ...actor.aliases,
        actor.publicIdentity,
        actor.positionSummary,
        actor.actualIdentitySummary
      ]).join(' / ')
    )
    .filter(Boolean)
    .join('\n');

  return uniqueStrings([
    `player_input: ${playerInput.trim()}`,
    placeText ? `current_place: ${placeText}` : undefined,
    sceneText ? `current_scene: ${sceneText}` : undefined,
    actorText ? `present_actors:\n${actorText}` : undefined
  ]).join('\n');
}

async function createQueryEmbedding(
  memoryEmbedding: MemoryEmbeddingClient | undefined,
  state: RuntimeState,
  playerInput: string,
  signal?: AbortSignal
): Promise<{ queryEmbedding?: number[]; diagnostics: StoryDiagnosticIssue[]; canEmbedMemories: boolean }> {
  if (!memoryEmbedding || !playerInput.trim()) {
    return { diagnostics: [], canEmbedMemories: Boolean(memoryEmbedding) };
  }

  try {
    const queryText = createVectorRecallQuery(state, playerInput);
    return {
      queryEmbedding: await memoryEmbedding.embed(queryText, { signal }),
      diagnostics: [],
      canEmbedMemories: true
    };
  } catch (error) {
    throwIfTurnAborted(signal);
    return {
      diagnostics: [
        {
          path: ['memoryVector', 'queryEmbedding'],
          code: 'memory_embedding_failed',
          message: error instanceof Error ? error.message : 'Memory embedding failed.'
        }
      ],
      canEmbedMemories: false
    };
  }
}

export async function runPlayerTurn({
  state,
  playerInput,
  requestId,
  narrator,
  memoryEmbedding,
  memorySummary,
  writebackRepair,
  writebackRepairMode,
  npcSimulation,
  backgroundEvolution,
  auxiliaryGeneration,
  auxiliaryGenerationMode,
  memoryCompression,
  gameSettings,
  promptSettings,
  tavernSettings,
  onNarrativeDelta,
  onNarrativeReset,
  onRawText,
  onReasoningDelta,
  onReasoningText,
  onNarratorAttemptStart,
  onNarratorAttempt,
  signal,
  onStageChange,
  onJudgementRecoveryTrace,
  onOfficialDlcDramaAudit,
  judgementRoll,
  enableJudgementPreflight = false,
  caseActionIntent
}: RunPlayerTurnInput): Promise<RuntimeState> {
  throwIfTurnAborted(signal);
  const officialDlcAuditRequestId =
    requestId ?? `turn_request_${state.turnCounter + 1}_${Date.now()}`;
  const presetJudgementRoll = judgementRoll ?? createBalancedLocalD100Roll(state);
  const localJudgementTurnId = `turn_${String(state.turnCounter + 1).padStart(4, '0')}`;
  const judgementTraceStartedAt = new Date().toISOString();
  let judgementRecoveryTrace: JudgementRecoveryTrace = {
    requestId: `judgement_${localJudgementTurnId}_${Date.now()}`,
    turnId: localJudgementTurnId,
    startedAt: judgementTraceStartedAt,
    terminalStatus: 'running',
    presetRoll: presetJudgementRoll,
    persisted: false,
    rawJudgementPatches: [],
    stages: []
  };
  const publishJudgementTrace = () => {
    onJudgementRecoveryTrace?.({
      ...judgementRecoveryTrace,
      ...(judgementRecoveryTrace.rawPreflightAttempts
        ? {
            rawPreflightAttempts: [
              ...judgementRecoveryTrace.rawPreflightAttempts
            ]
          }
        : {}),
      rawJudgementPatches: [...judgementRecoveryTrace.rawJudgementPatches],
      stages: judgementRecoveryTrace.stages.map((stage) => ({ ...stage }))
    });
  };
  const recordJudgementStage = (
    stage: JudgementRecoveryStageRecord['stage'],
    status: JudgementRecoveryStageRecord['status'],
    detail: string,
    paths?: string[]
  ) => {
    judgementRecoveryTrace = appendJudgementRecoveryStage(
      judgementRecoveryTrace,
      {
        stage,
        status,
        occurredAt: new Date().toISOString(),
        detail,
        ...(paths?.length ? { paths } : {})
      }
    );
    publishJudgementTrace();
  };
  const usageMeter = new TurnUsageMeter();
  const bindRequestDiagnostics = (client: NarratorClient) =>
    bindTurnRequestDiagnostics(
      client,
      signal,
      onNarratorAttemptStart,
      onNarratorAttempt
    );
  const measuredNarrator = usageMeter.wrapNarrator(
    'mainNarrator',
    bindRequestDiagnostics(narrator)
  );
  const measuredMemoryEmbedding = memoryEmbedding ? usageMeter.wrapMemoryEmbedding(memoryEmbedding) : undefined;
  const measuredMemorySummary = memorySummary
    ? usageMeter.wrapNarrator('memorySummary', bindRequestDiagnostics(memorySummary))
    : memorySummary;
  const measuredWritebackRepair = writebackRepair
    ? usageMeter.wrapNarrator('writebackRepair', bindRequestDiagnostics(writebackRepair))
    : writebackRepair;
  const measuredMainWritebackFallback = usageMeter.wrapNarrator(
    'writebackRepair',
    bindRequestDiagnostics(narrator)
  );
  const measuredTurnSummaryRepairFallback = measuredWritebackRepair ?? measuredMainWritebackFallback;
  const measuredNpcSimulation = npcSimulation
    ? usageMeter.wrapNarrator('npcSimulation', bindRequestDiagnostics(npcSimulation))
    : npcSimulation;
  const measuredBackgroundEvolution = backgroundEvolution
    ? usageMeter.wrapNarrator(
        'backgroundEvolution',
        bindRequestDiagnostics(backgroundEvolution)
      )
    : backgroundEvolution;
  const measuredAuxiliaryGeneration = auxiliaryGeneration
    ? usageMeter.wrapNarrator(
        'auxiliaryGeneration',
        bindRequestDiagnostics(auxiliaryGeneration)
      )
    : auxiliaryGeneration;

  onStageChange?.('recalling_memory');
  const embeddingResult = await createQueryEmbedding(measuredMemoryEmbedding, state, playerInput, signal);
  throwIfTurnAborted(signal);
  const context = selectContext(state, playerInput, {
    queryEmbedding: embeddingResult.queryEmbedding,
    memorySettings: memoryCompression
  });
  const dramaticContentSettings = normalizeDramaticContentSettings(
    state.dramaticContent?.settings ?? gameSettings?.dramaticContent
  );
  const hasCustomContentUserPriority =
    context.customContentProjection.userPrioritySources.length > 0;
  const officialDlcPlanningResolution = resolveOfficialDlcPlanning(
    state,
    context,
    state.turnCounter + 1
  );
  const exposedNarrativeArcSources = buildNarrativeArcPlanningSources(
    state,
    listProjectedDramaSources(context)
  );
  const shouldUseOfficialDlcPlanning =
    dramaticContentSettings.pacing === 'original' &&
    officialDlcPlanningResolution.eligible;
  const dramaPlanningContext = shouldUseOfficialDlcPlanning
    ? assembleOfficialDlcPlanningContext(
        state,
        context,
        dramaticContentSettings,
        playerInput,
        officialDlcPlanningResolution.sources
      )
    : dramaticContentSettings.pacing === 'original'
      ? hasCustomContentUserPriority || exposedNarrativeArcSources.length > 0
        ? assembleDramaPlanningContext(
            state,
            context,
            dramaticContentSettings,
            playerInput,
            'custom_intent_only'
          )
        : undefined
      : assembleDramaPlanningContext(
          state,
          context,
          dramaticContentSettings,
          playerInput,
          'full'
        );
  let dramaPlan: DramaPlan | undefined;
  let dramaPlanOrigin: DramaPlanOrigin | undefined;
  let foregroundContract: ForegroundContract | undefined;
  let dramaDiagnostics: DramaPlanningDiagnostic[] = [];
  let narrativeArcProgressAudits: NarrativeArcProgressValidationDiagnostic[] = [];
  let dramaPlanningDurationMs = 0;
  let dramaPlannerApiInvoked = false;
  // Keep the audit tied to the runtime binding snapshot even if a legacy or
  // test PromptContext was assembled without the optional DLC projection.
  const officialDlcAuditContext = context.officialDlcBindings?.length
    ? context
    : {
        ...context,
        officialDlcBindings: (state.world.officialDlcBindings ?? []).map((binding) => ({
          ...binding
        }))
      };
  const officialDlcAuditInventory = listOfficialDlcSourcesForAudit(officialDlcAuditContext);
  const officialDlcAuditGenerated = listGeneratedOfficialDlcSources(officialDlcAuditContext);
  const officialDlcAuditProjected = listProjectedDramaSources(officialDlcAuditContext);
  const publishOfficialDlcDramaAudit = (
    plan?: DramaPlan,
    trace?: DramaExecutionTrace
  ) => {
    const records = buildOfficialDlcDramaAudit({
      requestId: officialDlcAuditRequestId,
      turn: state.turnCounter + 1,
      context: officialDlcAuditContext,
      officialDlcBindings: officialDlcAuditContext.officialDlcBindings,
      inventorySources: officialDlcAuditInventory,
      generatedSources: officialDlcAuditGenerated,
      projectedSources: officialDlcAuditProjected,
      planningContext: dramaPlanningContext,
      plan,
      trace
    });
    onOfficialDlcDramaAudit?.(records);
  };
  publishOfficialDlcDramaAudit();
  const shouldUseAuxiliaryPlanner =
    dramaPlanningContext &&
    measuredAuxiliaryGeneration &&
    (dramaticContentSettings.planningRoute === 'use-auxiliary' ||
      (dramaticContentSettings.planningRoute === 'auto' && auxiliaryGenerationMode === 'custom'));
  if (dramaPlanningContext) {
    onStageChange?.('planning_drama');
    const dramaPlanningStartedAt = Date.now();
    const planningClient = shouldUseAuxiliaryPlanner
      ? measuredAuxiliaryGeneration
      : measuredNarrator;
    dramaPlannerApiInvoked = true;
    const planningResult = await planDramaticTurn({
      context: dramaPlanningContext,
      client: planningClient,
      signal
    });
    dramaPlanningDurationMs = Date.now() - dramaPlanningStartedAt;
    dramaPlan = planningResult.plan;
    dramaDiagnostics = planningResult.diagnostics;
    dramaPlanOrigin = shouldUseAuxiliaryPlanner ? 'auxiliary' : 'main_two_pass';
    if (!dramaPlan) {
      dramaPlan = createFallbackDramaPlan(dramaPlanningContext);
      dramaPlanOrigin = 'local_fallback';
    }
    publishOfficialDlcDramaAudit(dramaPlan);
    const shouldCreateForegroundContract =
      !(
        (dramaPlanningContext.planningMode === 'custom_intent_only' ||
          dramaPlanningContext.planningMode === 'official_dlc_only') &&
        dramaPlan.mode === 'quiet' &&
        dramaPlanningContext.requiredContextSources.length === 0
      );
    if (shouldCreateForegroundContract) {
      foregroundContract = createForegroundContract({
        context: dramaPlanningContext,
        promptContext: context,
        plan: dramaPlan,
        origin: dramaPlanOrigin
      });
    }
    throwIfTurnAborted(signal);
  }
  const foregroundContext = focusPromptContext(context, foregroundContract);
  const narratorDramaPlanningContext = foregroundContract
    ? dramaPlanningContext
    : undefined;
  if (measuredNpcSimulation) onStageChange?.('simulating_npcs');
  const npcSimulationResult = await runNpcSimulation({
    context: foregroundContext,
    playerInput,
    client: measuredNpcSimulation,
    promptSettings,
    foregroundContract
  });
  throwIfTurnAborted(signal);
  let judgementPreflightReason: string | undefined;
  let judgementResolution: JudgementResolutionEnvelope | undefined;
  let judgementPreflightInputTokens = 0;
  let judgementPreflightOutputTokens = 0;
  if (enableJudgementPreflight) {
    const preflightRequest = createJudgementPreflightRequest({
      state,
      context: foregroundContext,
      playerInput
    });
    judgementPreflightInputTokens += estimateNarrativeTokens(
      preflightRequest.messages.map((message) => message.content).join('\n')
    );
    const preflightClient =
      measuredAuxiliaryGeneration && auxiliaryGenerationMode === 'custom'
        ? measuredAuxiliaryGeneration
        : measuredNarrator;
    onStageChange?.('preflighting_judgement');
    let preflightRawText = '';
    let preflightValue: unknown;
    let firstPreflightError: unknown;
    try {
      preflightValue = await preflightClient.complete(preflightRequest, {
        requestPurpose: 'main_turn_judgement_preflight',
        stageMaxTokens: JUDGEMENT_PREFLIGHT_STAGE_MAX_TOKENS,
        onRawText: (rawText) => {
          preflightRawText = rawText;
          onRawText?.(rawText);
        },
        onReasoningText,
        signal
      });
      judgementPreflightOutputTokens += estimateNarrativeTokens(
        preflightRawText || JSON.stringify(preflightValue)
      );
      throwIfTurnAborted(signal);
    } catch (error) {
      throwIfTurnAborted(signal);
      firstPreflightError = error;
      preflightValue = undefined;
    }

    let preflightNormalization = normalizeJudgementPreflight({
      value: preflightValue,
      turnId: localJudgementTurnId,
      gameTime: state.time
    });
    const rawPreflightAttempts: unknown[] = [
      preflightNormalization.rawSnapshot
    ];
    let preflightWasRepaired = false;
    if (firstPreflightError || preflightNormalization.missingFields.length > 0) {
      onStageChange?.('repairing_judgement_preflight');
      const repairRequest = createJudgementPreflightRepairRequest({
        baseRequest: preflightRequest,
        rawValue:
          preflightValue ??
          {
            error: structuredResponseFailureIssues(firstPreflightError).join('；')
          },
        missingFields:
          preflightNormalization.missingFields.length > 0
            ? preflightNormalization.missingFields
            : ['transport_or_parse']
      });
      judgementPreflightInputTokens += estimateNarrativeTokens(
        repairRequest.messages.map((message) => message.content).join('\n')
      );
      let repairRawText = '';
      try {
        const repairedValue = await measuredNarrator.complete(repairRequest, {
          requestPurpose: 'main_turn_judgement_preflight_repair',
          stageMaxTokens: JUDGEMENT_PREFLIGHT_STAGE_MAX_TOKENS,
          onRawText: (rawText) => {
            repairRawText = rawText;
            onRawText?.(rawText);
          },
          onReasoningText,
          signal
        });
        judgementPreflightOutputTokens += estimateNarrativeTokens(
          repairRawText || JSON.stringify(repairedValue)
        );
        throwIfTurnAborted(signal);
        preflightValue = repairedValue;
        preflightNormalization = normalizeJudgementPreflight({
          value: repairedValue,
          turnId: localJudgementTurnId,
          gameTime: state.time
        });
        rawPreflightAttempts.push(preflightNormalization.rawSnapshot);
        preflightWasRepaired = true;
      } catch (error) {
        const detail = structuredResponseFailureIssues(error).join('；');
        recordJudgementStage('preflight_parse', 'failed', detail);
        throw new Error(`judgement_intent_failed：${detail}`, { cause: error });
      }
    }
    judgementRecoveryTrace = {
      ...judgementRecoveryTrace,
      rawPreflight: preflightNormalization.rawSnapshot,
      rawPreflightAttempts
    };
    if (
      preflightNormalization.missingFields.length > 0 ||
      !preflightNormalization.preflight
    ) {
      const paths = preflightNormalization.missingFields.map(
        (field) => `judgementPreflight.${field}`
      );
      recordJudgementStage(
        'preflight_parse',
        'failed',
        `判定预检仍缺少：${paths.join('、')}`,
        paths
      );
      throw new Error(
        `judgement_intent_failed：判定预检仍缺少 ${paths.join('、')}`
      );
    }
    judgementPreflightReason =
      preflightNormalization.preflight.reasonSummary;
    recordJudgementStage(
      'preflight_parse',
      'succeeded',
      preflightNormalization.preflight.hasJudgement
        ? `判定预检${preflightWasRepaired ? '经一次小型结构修复后' : ''}已确认本回合需要一次核心判定。`
        : `判定预检${preflightWasRepaired ? '经一次小型结构修复后' : ''}已确认本回合不需要核心判定。`
    );
    if (preflightWasRepaired) {
      preflightNormalization.diagnostics.unshift({
        path: [],
        code: 'judgement_intent_repaired',
        message:
          '首份判定预检未满足小型合同，已切换到主剧情路由只修复判定意图；没有生成正文或写入运行态。'
      });
    }
    try {
      judgementResolution = resolveJudgementPreflight({
        state,
        preflight: preflightNormalization.preflight,
        turnId: localJudgementTurnId,
        gameTime: state.time,
        presetRoll: presetJudgementRoll,
        normalizationDiagnostics: preflightNormalization.diagnostics
      });
    } catch (error) {
      const detail = structuredResponseFailureIssues(error).join('；');
      recordJudgementStage('evidence_validation', 'failed', detail);
      recordJudgementStage('local_settlement', 'failed', detail);
      throw error;
    }
    if (judgementResolution) {
      const rejectedEvidenceCount = judgementResolution.diagnostics.filter(
        (diagnostic) => diagnostic.code === 'judgement_evidence_rejected'
      ).length;
      recordJudgementStage(
        'evidence_validation',
        'succeeded',
        rejectedEvidenceCount > 0
          ? `本地已核验证据，并移除 ${rejectedEvidenceCount} 项未证实或重复因素。`
          : '本地已核验全部判定因素证据。'
      );
      recordJudgementStage(
        'local_settlement',
        'succeeded',
        `正文生成前已使用唯一 d100=${presetJudgementRoll} 完成本地结算：${judgementResolution.outcome}。`
      );
    } else {
      recordJudgementStage(
        'evidence_validation',
        'skipped',
        '本回合无需判定，没有因素需要核验。'
      );
      recordJudgementStage(
        'local_settlement',
        'skipped',
        '本回合无需判定，预置骰未进入任何结算记录。'
      );
    }
  }
  const resolvedCaseActionIntents = resolveCaseActionIntents({
    state,
    playerInput,
    intent: caseActionIntent
  });
  const prompt = composePrompt(foregroundContext, playerInput, {
    narrativeLengthLevel: gameSettings?.narrativeLengthLevel,
    narrativePerspective: gameSettings?.narrativePerspective,
    playerPortrayalMode: gameSettings?.playerPortrayalMode,
    locale: gameSettings?.language,
    pregnancyMode: gameSettings?.pregnancyMode,
    npcSimulationPackage: npcSimulationResult.package,
    caseActionIntents: resolvedCaseActionIntents,
    promptSettings,
    dramaPlanningContext: narratorDramaPlanningContext,
    dramaPlan,
    foregroundContract,
    localJudgement: {
      presetRoll: presetJudgementRoll,
      attributes: state.player.attributes,
      gameDifficulty: normalizeGameDifficulty(state.world.gameDifficulty),
      sources: collectLocalJudgementSources(state),
      ...(enableJudgementPreflight
        ? {
            preflightReason: judgementPreflightReason,
            resolution: judgementResolution
          }
        : {})
    }
  });
  const compileMainTurnPrompt = (runtimePrompt: string) => compileCreativeNarratorRequest({
    runtimePrompt,
    promptSettings,
    tavernSettings,
    scope: 'turn',
    playerName: state.player.name
  });
  const narratorCompilation = compileMainTurnPrompt(prompt);
  const narratorRequest = narratorCompilation.request;
  let narratorInputTokens =
    judgementPreflightInputTokens +
    estimateNarrativeTokens(
      narratorCompilation.messages.map((message) => message.content).join('\n')
    );
  let narratorOutputTokens = judgementPreflightOutputTokens;
  let firstLengthMeasurement: NarrativeLengthMeasurement | undefined;
  let acceptedLengthMeasurement: NarrativeLengthMeasurement | undefined;
  let narrativeWasRegenerated = false;
  const requestStartedAt = Date.now();
  onStageChange?.('generating_narrative');
  let candidateRawText = '';
  let rawResponse = await measuredNarrator.complete(narratorRequest, {
    requestPurpose: 'main_turn',
    onTextDelta: onNarrativeDelta,
    onRawText: (rawText) => {
      candidateRawText = rawText;
      onRawText?.(rawText);
    },
    onReasoningDelta,
    onReasoningText,
    signal
  });
  narratorOutputTokens += estimateNarrativeTokens(candidateRawText || JSON.stringify(rawResponse));
  throwIfTurnAborted(signal);

  const firstNarrativeText = extractNarrativeText(rawResponse);
  if (gameSettings?.narrativeLengthLevel && firstNarrativeText) {
    firstLengthMeasurement = measureNarrativeLength(
      firstNarrativeText,
      gameSettings.narrativeLengthLevel,
      'turn'
    );
    acceptedLengthMeasurement = firstLengthMeasurement;
    if (firstLengthMeasurement.severelyShort) {
      narrativeWasRegenerated = true;
      onStageChange?.('regenerating_narrative');
      onNarrativeReset?.();
      const retryPrompt = createNarrativeLengthRetryPrompt(prompt, firstLengthMeasurement);
      const retryCompilation = compileMainTurnPrompt(retryPrompt);
      const retryRequest = retryCompilation.request;
      narratorInputTokens += estimateNarrativeTokens(
        retryCompilation.messages.map((message) => message.content).join('\n')
      );
      candidateRawText = '';
      rawResponse = await measuredNarrator.complete(retryRequest, {
        requestPurpose: 'main_turn',
        onTextDelta: onNarrativeDelta,
        onRawText: (rawText) => {
          candidateRawText = rawText;
          onRawText?.(rawText);
        },
        onReasoningDelta,
        onReasoningText,
        signal
      });
      narratorOutputTokens += estimateNarrativeTokens(candidateRawText || JSON.stringify(rawResponse));
      throwIfTurnAborted(signal);
      const regeneratedNarrativeText = extractNarrativeText(rawResponse);
      acceptedLengthMeasurement = regeneratedNarrativeText
        ? measureNarrativeLength(regeneratedNarrativeText, gameSettings.narrativeLengthLevel, 'turn')
        : undefined;
    }
  }
  let rawNarratorResponse = candidateRawText;
  onStageChange?.('validating_writeback');
  let responseWithTurnSummary = await repairMissingTurnSummary({
    rawResponse,
    playerInput,
    narrator: measuredTurnSummaryRepairFallback,
    writebackRepair: measuredWritebackRepair,
    promptSettings
  });
  throwIfTurnAborted(signal);
  let response = validateNarratorResponse(responseWithTurnSummary);
  response = reconcileMisplacedLocationWriteback(state, response);
  const judgementTurnEndTime = getTurnEndTime(state.time, response);
  if (
    enableJudgementPreflight &&
    judgementResolution &&
    judgementResolution.combatIntent !== 'none' &&
    response.writeback.combatEventPatches.length === 0 &&
    response.rawCombatEventPatches?.length
  ) {
    const rawCombatWarnings = (response.validationWarnings ?? []).filter(
      (warning) => warning.path.includes('combatEventPatches')
    );
    const placeNames = Object.fromEntries([
      ...Object.values(state.places).map((place) => [place.placeId, place.name] as const),
      ...response.writeback.placePatches.flatMap((place) =>
        place.name ? [[place.placeId, place.name] as const] : []
      )
    ]);
    const normalizedCombat = normalizeCombatEventIntent({
      value: response.rawCombatEventPatches[0],
      state,
      turnId: localJudgementTurnId,
      gameTime: judgementTurnEndTime,
      combatIntent: judgementResolution.combatIntent,
      canonicalCheckId: judgementResolution.checkId,
      fallbackResultSummary: judgementResolution.canonicalCheck.shortSummary,
      fallbackConsequenceSummary:
        judgementResolution.canonicalCheck.consequenceSummary,
      placeNames
    });
    if (normalizedCombat.patch) {
      response = {
        ...response,
        writeback: {
          ...response.writeback,
          combatEventPatches: [normalizedCombat.patch]
        },
        validationWarnings: [
          ...(response.validationWarnings ?? []).filter(
            (warning) => !warning.path.includes('combatEventPatches')
          ),
          ...normalizedCombat.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            path: ['writeback', 'combatEventPatches', 0, ...diagnostic.path],
            code: diagnostic.code ?? 'combat_event_local_normalized'
          })),
          ...(rawCombatWarnings.length > 0
            ? [
                {
                  path: ['writeback', 'combatEventPatches', 0],
                  code: 'combat_event_structure_recovered',
                  message:
                    '主叙事的对抗记录缺少可由本地确定的包络字段；已保留原始过程与结果并完成本地规范化。'
                }
              ]
            : [])
        ]
      };
    } else {
      response = {
        ...response,
        validationWarnings: [
          ...(response.validationWarnings ?? []),
          ...normalizedCombat.issues.map((issue) => ({
            path: ['writeback', 'combatEventPatches', 0],
            code: 'combat_event_structure_recovery_failed',
            message: issue
          }))
        ]
      };
    }
  }
  let judgementNarrativeWasRepaired = false;
  const rawJudgementSchemaWarnings = (response.validationWarnings ?? []).filter((warning) =>
    warning.path.includes('judgementCheckPatches')
  );
  response = {
    ...response,
    validationWarnings: (response.validationWarnings ?? []).filter(
      (warning) => !warning.path.includes('judgementCheckPatches')
    )
  };
  const rawJudgementPatches =
    response.rawJudgementCheckPatches && response.rawJudgementCheckPatches.length > 0
      ? response.rawJudgementCheckPatches
      : rawJudgementSchemaWarnings.length > 0 ||
          (!enableJudgementPreflight &&
            response.writeback.combatEventPatches.length > 0)
        ? [{}]
        : [];
  judgementRecoveryTrace = {
    ...judgementRecoveryTrace,
    rawJudgementPatches: rawJudgementPatches.map((patch) => patch)
  };
  recordJudgementStage(
    'raw_parse',
    rawJudgementPatches.length > 0 ? 'succeeded' : 'skipped',
    enableJudgementPreflight
      ? rawJudgementPatches.length > 0
        ? `已保留主叙事回显的 ${rawJudgementPatches.length} 条判定记录；最终真值仍使用正文前 canonical resolution。`
        : '主叙事没有回显判定记录；本地将直接插入正文前 canonical resolution。'
      : rawJudgementPatches.length > 0
        ? `已在容错校验丢弃前保留 ${rawJudgementPatches.length} 条原始判定意图。`
        : '模型本回合没有提交判定意图。'
  );
  const normalizationDiagnostics: StoryDiagnosticIssue[] = rawJudgementSchemaWarnings.map(
    (warning) => ({
      path: warning.path,
      code: enableJudgementPreflight
        ? 'local_judgement_model_echo_ignored'
        : 'local_judgement_raw_schema_recovered',
      message: enableJudgementPreflight
        ? `主叙事回显字段未通过最终记录 Schema（${warning.message}）；该回显不具权威，本地将使用正文前结算结果。`
        : `原始判定字段未通过最终记录 Schema（${warning.message}）；已保留原值并转入本地意图恢复。`
    })
  );
  if (enableJudgementPreflight && judgementResolution) {
    normalizationDiagnostics.push(...judgementResolution.diagnostics);
  }
  let intentNormalizations = enableJudgementPreflight
    ? []
    : rawJudgementPatches.map((patch, index) =>
        normalizeJudgementCheckIntent({
          value: patch,
          turnId: localJudgementTurnId,
          gameTime: judgementTurnEndTime,
          fallbackCheckId: `check_${localJudgementTurnId}_${index + 1}`,
          combatEventPatches: response.writeback.combatEventPatches
        })
      );
  if (!enableJudgementPreflight) {
    normalizationDiagnostics.push(
      ...intentNormalizations.flatMap((normalization, index) =>
        normalization.diagnostics.map((diagnostic) => ({
          ...diagnostic,
          path: [
            'writeback',
            'judgementCheckPatches',
            index,
            ...diagnostic.path
          ]
        }))
      )
    );
  }
  let unresolvedNormalization = intentNormalizations.find(
    (normalization) => normalization.missingFields.length > 0
  );
  recordJudgementStage(
    'local_normalization',
    unresolvedNormalization ? 'failed' : 'succeeded',
    enableJudgementPreflight
      ? judgementResolution
        ? '主叙事判定回显不参与结算；已沿用正文前规范判定。'
        : '判定预检确认无判定；主叙事不得自行建立判定记录。'
      : unresolvedNormalization
        ? `原始判定意图仍缺少：${unresolvedNormalization.missingFields.join('、')}。`
        : intentNormalizations.length > 0
          ? `已取得 ${intentNormalizations.length} 条可由本地结算的判定意图。`
          : '本回合没有需要结算的判定意图。'
  );
  if (
    !enableJudgementPreflight &&
    unresolvedNormalization &&
    rawJudgementPatches.length === 1
  ) {
    onStageChange?.('repairing_judgement_structure');
    const structureRepairRequest = createJudgementStructureRepairRequest({
      playerInput,
      response,
      rawIntent: unresolvedNormalization.rawSnapshot,
      missingFields: unresolvedNormalization.missingFields
    });
    narratorInputTokens += estimateNarrativeTokens(
      structureRepairRequest.messages.map((message) => message.content).join('\n')
    );
    let structureRepairRawText = '';
    try {
      const structureRepairCandidate = await (
        measuredWritebackRepair ?? measuredMainWritebackFallback
      ).complete(structureRepairRequest, {
        requestPurpose: 'main_turn_judgement_structure_repair',
        onRawText: (rawText) => {
          structureRepairRawText = rawText;
          onRawText?.(rawText);
        },
        onReasoningText,
        signal
      });
      throwIfTurnAborted(signal);
      narratorOutputTokens += estimateNarrativeTokens(
        structureRepairRawText || JSON.stringify(structureRepairCandidate)
      );
      const structureRepair = parseJudgementStructureRepair({
        value: structureRepairCandidate,
        hasCombat: response.writeback.combatEventPatches.length > 0
      });
      if (!structureRepair.hasJudgement) {
        intentNormalizations = [];
        unresolvedNormalization = undefined;
        normalizationDiagnostics.push({
          path: ['writeback', 'judgementCheckPatches', 0],
          code: 'local_judgement_intent_removed',
          message: '小型结构修复确认本回合没有实际判定；未建立判定记录。'
        });
      } else {
        const mergedIntent = mergeJudgementStructureRepair(
          rawJudgementPatches[0],
          structureRepair
        );
        const repairedNormalization = normalizeJudgementCheckIntent({
          value: mergedIntent,
          turnId: localJudgementTurnId,
          gameTime: judgementTurnEndTime,
          fallbackCheckId: `check_${localJudgementTurnId}_1`,
          combatEventPatches: response.writeback.combatEventPatches
        });
        normalizationDiagnostics.push(
          ...repairedNormalization.diagnostics.map((diagnostic) => ({
            ...diagnostic,
            path: ['writeback', 'judgementCheckPatches', 0, ...diagnostic.path]
          }))
        );
        intentNormalizations = [repairedNormalization];
        unresolvedNormalization =
          repairedNormalization.missingFields.length > 0
            ? repairedNormalization
            : undefined;
      }
      if (unresolvedNormalization) {
        const missingPaths = unresolvedNormalization.missingFields.map(
          (field) => `writeback.judgementCheckPatches.0.${field}`
        );
        recordJudgementStage(
          'structure_repair',
          'failed',
          `小型结构修复后仍缺少：${missingPaths.join('、')}`,
          missingPaths
        );
        throw new Error(`判定结构修复失败：仍缺少 ${missingPaths.join('、')}`);
      }
      recordJudgementStage(
        'structure_repair',
        'succeeded',
        structureRepair.hasJudgement
          ? `已只恢复判定语义字段，并继续复用 d100=${presetJudgementRoll}。`
          : '已确认本回合没有实际判定。'
      );
      recordJudgementStage(
        'local_normalization',
        'succeeded',
        structureRepair.hasJudgement
          ? '结构修复后的判定意图已通过本地语义归一化。'
          : '结构修复确认无判定，本地不建立记录。'
      );
    } catch (error) {
      const structureFailure = structuredResponseFailureIssues(error).join('；');
      if (
        !judgementRecoveryTrace.stages.some(
          (stage) => stage.stage === 'structure_repair' && stage.status === 'failed'
        )
      ) {
        recordJudgementStage(
          'structure_repair',
          'failed',
          structureFailure,
          (unresolvedNormalization?.missingFields ?? []).map(
            (field) => `writeback.judgementCheckPatches.0.${field}`
          )
        );
      }
      throw new Error(
        structureFailure.startsWith('判定结构修复失败：')
          ? structureFailure
          : `判定结构修复失败：${structureFailure}`,
        { cause: error }
      );
    }
  } else {
    recordJudgementStage(
      'structure_repair',
      'skipped',
      enableJudgementPreflight
        ? '判定语义已在正文前预检完成，不再从主叙事回显恢复结构。'
        : unresolvedNormalization
          ? '存在多条判定意图，不能通过单条结构修复绕过每回合一次判定限制。'
          : '本地归一化已取得完整判定语义，无需调用结构修复。'
    );
  }
  const reportedJudgementPatch =
    response.writeback.judgementCheckPatches.length === 1
      ? response.writeback.judgementCheckPatches[0]
      : undefined;
  const reportedJudgementOutcome =
    reportedJudgementPatch?.outcome ??
    reportedJudgementOutcomeFromRawPatches(rawJudgementPatches);
  let localJudgementIntents = enableJudgementPreflight
    ? judgementResolution
      ? [
          {
            ...judgementResolution.intent,
            gameTime: judgementTurnEndTime,
            ...(reportedJudgementPatch?.shortSummary
              ? { shortSummary: reportedJudgementPatch.shortSummary }
              : {}),
            ...(reportedJudgementPatch?.consequenceSummary
              ? {
                  consequenceSummary:
                    reportedJudgementPatch.consequenceSummary
                }
              : {}),
            ...(reportedJudgementOutcome
              ? { outcome: reportedJudgementOutcome }
              : {}),
            ...(response.writeback.combatEventPatches.length === 1
              ? {
                  relatedCombatEventId:
                    response.writeback.combatEventPatches[0].combatId
                }
              : {})
          }
        ]
      : []
    : intentNormalizations.flatMap((normalization) =>
        normalization.intent ? [normalization.intent] : []
      );
  localJudgementIntents = localJudgementIntents.map((intent, index) => {
    if (!state.judgementChecks[intent.checkId]) return intent;
    const replacementId = `check_${localJudgementTurnId}_${index + 1}`;
    normalizationDiagnostics.push({
      path: ['writeback', 'judgementCheckPatches', index, 'checkId'],
      code: 'local_judgement_check_id_normalized',
      message: `模型复用了既有判定 ID ${intent.checkId}，本地已改为本回合稳定 ID ${replacementId}。`
    });
    return {
      ...intent,
      checkId: replacementId
    };
  });
  const judgementFinalization = finalizeLocalJudgementResponse({
    state,
    response,
    expectedRoll: presetJudgementRoll,
    intents: localJudgementIntents,
    ...(enableJudgementPreflight
      ? {
          combatIntent: judgementResolution?.combatIntent ?? 'none',
          reportedJudgementPatchCount: rawJudgementPatches.length
        }
      : {})
  });
  judgementFinalization.diagnostics.unshift(...normalizationDiagnostics);
  if (judgementFinalization.diagnostics.length > 0) {
    onStageChange?.('normalizing_judgement');
  }
  if (judgementFinalization.issues.length > 0) {
    recordJudgementStage(
      'local_settlement',
      'failed',
      judgementFinalization.issues.join('；'),
      judgementFinalization.issues
        .map((issue) => issue.match(/^([^：]+)：/)?.[1])
        .filter((path): path is string => Boolean(path))
    );
    const failureCode = enableJudgementPreflight
      ? judgementFinalization.issues.some((issue) =>
          issue.includes('combatEventPatches')
        )
        ? 'judgement_narrative_conflict'
        : 'judgement_resolution_failed'
      : 'local_judgement_invalid';
    throw new Error(
      `${failureCode}：本地判定缺少可安全结算的结构，已阻止本回合写回：${judgementFinalization.issues.join('；')}`
    );
  }
  if (!enableJudgementPreflight) {
    recordJudgementStage(
      'local_settlement',
      'succeeded',
      localJudgementIntents.length > 0
        ? `已使用唯一 d100=${presetJudgementRoll} 生成规范判定记录。`
        : '本回合没有判定，未消耗预置骰。'
    );
  }
  response = judgementFinalization.response;
  if (judgementFinalization.outcomeMismatchCheckIds.length > 0) {
    judgementNarrativeWasRepaired = true;
    onStageChange?.(
      enableJudgementPreflight
        ? 'repairing_judgement_narrative'
        : 'regenerating_judgement'
    );
    const repairRequest = createJudgementNarrativeRepairRequest({
      playerInput,
      response,
      checkIds: judgementFinalization.outcomeMismatchCheckIds
    });
    narratorInputTokens += estimateNarrativeTokens(
      repairRequest.messages.map((message) => message.content).join('\n')
    );
    let judgementRepairRawText = '';
    try {
      const repairCandidate = await measuredNarrator.complete(repairRequest, {
        requestPurpose: 'main_turn_judgement_narrative_repair',
        onRawText: (rawText) => {
          judgementRepairRawText = rawText;
          onRawText?.(rawText);
        },
        onReasoningText,
        signal
      });
      throwIfTurnAborted(signal);
      narratorOutputTokens += estimateNarrativeTokens(
        judgementRepairRawText || JSON.stringify(repairCandidate)
      );
      const outcomeMismatchIds = new Set(
        judgementFinalization.outcomeMismatchCheckIds
      );
      const expectedCombatIds = response.writeback.combatEventPatches
        .filter((combat) =>
          combat.judgementCheckIds.some((checkId) => outcomeMismatchIds.has(checkId))
        )
        .map((combat) => combat.combatId);
      const repair = parseJudgementNarrativeRepair({
        value: repairCandidate,
        expectedCheckIds: judgementFinalization.outcomeMismatchCheckIds,
        expectedCombatIds
      });
      response = mergeJudgementNarrativeRepair(response, repair);
      recordJudgementStage(
        'narrative_correction',
        'succeeded',
        '判定结果与模型叙事明确冲突；已只校正正文、判定摘要和相关对抗摘要。'
      );
    } catch (error) {
      recordJudgementStage(
        'narrative_correction',
        'failed',
        structuredResponseFailureIssues(error).join('；')
      );
      throw new Error(
        `${enableJudgementPreflight ? 'judgement_narrative_repair_failed：' : ''}本地判定叙事校正返回格式无效：${structuredResponseFailureIssues(error).join('；')}`,
        { cause: error }
      );
    }
    acceptedLengthMeasurement =
      gameSettings?.narrativeLengthLevel
        ? measureNarrativeLength(
            response.narrativeText,
            gameSettings.narrativeLengthLevel,
            'turn'
          )
        : acceptedLengthMeasurement;
  } else {
    recordJudgementStage(
      'narrative_correction',
      'skipped',
      '模型回显结果未与本地结算形成明确冲突，无需校正正文。'
    );
  }
  recordJudgementStage(
    'final_validation',
    'succeeded',
    '本地结算后的判定记录及必要的可见叙事校正已通过最终校验。'
  );
  response.validationWarnings = [
    ...(response.validationWarnings ?? []),
    ...judgementFinalization.diagnostics.map((diagnostic) => ({
      ...diagnostic,
      code: diagnostic.code ?? 'local_judgement_normalized'
    }))
  ];
  const responseMs = Date.now() - requestStartedAt;
  if (narrativeWasRegenerated && firstLengthMeasurement) {
    response.validationWarnings = [
      ...(response.validationWarnings ?? []),
      {
        path: ['narrativeText'],
        code: 'narrative_length_regenerated',
        message: `首份正文 ${firstLengthMeasurement.actual} 字，低于重生成阈值 ${firstLengthMeasurement.retryBelow} 字，已完整重生成一次。`
      }
    ];
  }
  if (judgementNarrativeWasRepaired) {
    response.validationWarnings = [
      ...(response.validationWarnings ?? []),
      {
        path: ['writeback', 'judgementCheckPatches'],
        code: 'local_judgement_narrative_repaired',
        message: `模型提交的判定结果与本地结算不一致；已保留首份结构化写回，只校正相关正文与结果摘要，并继续复用 d100=${presetJudgementRoll}。`
      }
    ];
  }
  if (acceptedLengthMeasurement && acceptedLengthMeasurement.actual < acceptedLengthMeasurement.minimum) {
    response.validationWarnings = [
      ...(response.validationWarnings ?? []),
      {
        path: ['narrativeText'],
        code: 'narrative_length_below_minimum',
        message: `最终正文 ${acceptedLengthMeasurement.actual} 字，低于当前档位最低 ${acceptedLengthMeasurement.minimum} 字。`
      }
    ];
  }
  const actorRepairResult = await repairActorPatches({
    state,
    rawResponse,
    response,
    playerInput,
    writebackRepair: measuredWritebackRepair ?? measuredTurnSummaryRepairFallback,
    writebackRepairFallback: writebackRepairMode === 'custom' ? measuredMainWritebackFallback : undefined,
    primaryRouteMode: measuredWritebackRepair
      ? writebackRepairMode === 'custom'
        ? 'custom'
        : 'follow-main'
      : 'main-default',
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = actorRepairResult.response;
  const stateAfterActorRepair = actorRepairResult.state;
  const caseIntentRecoveryResult = recoverCaseWritebackIntents(
    stateAfterActorRepair,
    response
  );
  response = caseIntentRecoveryResult.response;
  let turnEndTime = getTurnEndTime(stateAfterActorRepair.time, response);
  const caseIntakeRepairResult = await repairCaseIntake({
    state: stateAfterActorRepair,
    response,
    playerInput,
    turnEndTime,
    writebackRepair: measuredWritebackRepair,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = caseIntakeRepairResult.response;
  const actorIdentityRepairResult = await repairActorIdentityMerges({
    state: stateAfterActorRepair,
    response,
    playerInput,
    promptAnchoredActorIds: collectPromptAnchoredActorIds(context, npcSimulationResult.package),
    writebackRepair: measuredWritebackRepair,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = actorIdentityRepairResult.response;
  const actorProfileEnrichmentResult = await enrichActorProfiles({
    state: actorIdentityRepairResult.state,
    response,
    playerInput,
    actorIdAliases: actorIdentityRepairResult.actorIdAliases,
    writebackRepair: measuredWritebackRepair ?? measuredMainWritebackFallback,
    writebackRepairFallback: writebackRepairMode === 'custom' ? measuredMainWritebackFallback : undefined,
    primaryRouteMode: measuredWritebackRepair
      ? writebackRepairMode === 'custom'
        ? 'custom'
        : 'follow-main'
      : 'main-default',
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = actorProfileEnrichmentResult.response;
  const stateForWriteback = actorProfileEnrichmentResult.state;
  const caseLeadRepairResult = await repairExternalCaseLeadWritebacks({
    state: stateForWriteback,
    response,
    writebackRepair: measuredWritebackRepair ?? measuredMainWritebackFallback,
    actorIdAliases: actorIdentityRepairResult.actorIdAliases
  });
  throwIfTurnAborted(signal);
  response = caseLeadRepairResult.response;
  turnEndTime = getTurnEndTime(stateForWriteback.time, response);
  const compatibleRepairResult = await repairCompatibleWritebacks({
    state: stateForWriteback,
    response,
    playerInput,
    turnEndTime,
    writebackRepair: measuredWritebackRepair,
    allowRelationshipRepair: true,
    actorIdAliases: actorIdentityRepairResult.actorIdAliases,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = compatibleRepairResult.response;
  turnEndTime = getTurnEndTime(stateForWriteback.time, response);
  const initialDeferredContractDiagnostics = collectDueDeferredEventDiagnostics(
    context.deferredProjection.dueEvents,
    response.writeback.deferredEventPatches,
    turnEndTime
  );
  const repairResult = await repairDueDeferredEvents({
    response,
    dueEvents: context.deferredProjection.dueEvents,
    turnEndTime,
    playerInput,
    writebackRepair: measuredWritebackRepair,
    initialDiagnostics: initialDeferredContractDiagnostics,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = repairResult.response;
  const caseActionRepairResult = await repairCaseActionIntents({
    state: stateForWriteback,
    response,
    intents: resolvedCaseActionIntents,
    playerInput,
    writebackRepair: measuredWritebackRepair ?? measuredMainWritebackFallback
  });
  throwIfTurnAborted(signal);
  response = caseActionRepairResult.response;
  turnEndTime = getTurnEndTime(stateForWriteback.time, response);
  const livelihoodAtomicityResult = enforceCivilianLivelihoodWritebackAtomicity(
    stateForWriteback,
    response,
    `${turnEndTime.year}-${String(turnEndTime.month).padStart(2, '0')}`
  );
  response = livelihoodAtomicityResult.response;
  const invalidDramaTraceWarnings = (response.validationWarnings ?? []).filter(
    (warning) =>
      warning.code === 'drama_execution_trace_schema_invalid' ||
      warning.code === 'narrative_arc_progress_schema_invalid'
  );
  dramaDiagnostics = [
    ...dramaDiagnostics,
    ...invalidDramaTraceWarnings.map(
      (warning): DramaPlanningDiagnostic => ({
        code:
          warning.code === 'narrative_arc_progress_schema_invalid'
            ? 'execution_trace_narrative_arc_progress_invalid'
            : 'execution_trace_schema_invalid',
        message: warning.message,
        turnCounter: state.turnCounter,
        ...(warning.code === 'narrative_arc_progress_schema_invalid'
          ? {
              narrativeArcProgressAudit: {
                requestId,
                turnId: `turn_${String(state.turnCounter + 1).padStart(4, '0')}`,
                requestedNodeIds: [],
                candidatePresent: true,
                schemaValid: false,
                sourceValid: false,
                stageContractValid: false,
                writebackEvidenceValid: false,
                accepted: false,
                classification: 'advance_rejected' as const,
                rejectionReasons: ['progress_schema_invalid' as const],
                writebackReferenceAudit: {
                  rawResponseRefs: [],
                  schemaValidatedRefs: [],
                  acceptedWritebackRefs: [],
                  appliedWritebackRefs: [],
                  appliedCheckAvailable: false
                },
                supportingWritebackRefs: []
              }
            }
          : {})
      })
    )
  ];
  let dramaExecutionTrace;
  if (dramaPlanningContext && foregroundContract) {
    const traceValidation = validateDramaExecutionTrace({
      response,
      context: dramaPlanningContext,
      plan: dramaPlan,
      existingNarrativeArcs: state.narrativeArcs,
      includeNarrativeArcProgressAudit: true,
      requestId,
      turnId: `turn_${String(state.turnCounter + 1).padStart(4, '0')}`,
      rawResponse: rawNarratorResponse
    });
    dramaExecutionTrace = traceValidation.trace;
    dramaDiagnostics = [...dramaDiagnostics, ...traceValidation.diagnostics];
    narrativeArcProgressAudits = traceValidation.narrativeArcProgressAudits ?? [];
  }
  const caseContinuityResult = enforceDramaCaseContinuity({
    state: stateForWriteback,
    response,
    contract: foregroundContract,
    ...(dramaExecutionTrace ? { executionTrace: dramaExecutionTrace } : {})
  });
  response = caseContinuityResult.response;
  dramaExecutionTrace = caseContinuityResult.executionTrace ?? dramaExecutionTrace;
  const dramaStoryDiagnostics: StoryDiagnosticIssue[] = dramaDiagnostics.map((diagnostic) => ({
    path: ['dramaticContent'],
    code: diagnostic.code,
    message: diagnostic.message
  }));
  const deferredContractDiagnostics = collectDueDeferredEventDiagnostics(
    context.deferredProjection.dueEvents,
    response.writeback.deferredEventPatches,
    turnEndTime
  );
  onStageChange?.('applying_turn_results');
  const stateAfterWriteback = applyNarratorResponse(stateForWriteback, response, {
    playerInput,
    rawNarratorResponse,
    actorIdAliases: actorIdentityRepairResult.actorIdAliases,
    pregnancyMode: gameSettings?.pregnancyMode,
    turnMetrics: {
      inputTokens: narratorInputTokens,
      outputTokens: narratorOutputTokens,
      responseMs
    },
    writebackDiagnostics: [
      ...(response.validationWarnings ?? []),
      ...npcSimulationResult.diagnostics,
      ...actorRepairResult.diagnostics,
      ...caseIntentRecoveryResult.diagnostics,
      ...caseContinuityResult.diagnostics,
      ...actorIdentityRepairResult.diagnostics,
      ...actorProfileEnrichmentResult.diagnostics,
      ...caseIntakeRepairResult.diagnostics,
      ...caseLeadRepairResult.diagnostics,
      ...caseActionRepairResult.diagnostics,
      ...compatibleRepairResult.diagnostics,
      ...repairResult.diagnostics,
      ...livelihoodAtomicityResult.diagnostics,
      ...deferredContractDiagnostics,
      ...embeddingResult.diagnostics,
      ...dramaStoryDiagnostics
    ]
  });
  judgementRecoveryTrace = {
    ...judgementRecoveryTrace,
    persisted: true,
    terminalStatus: 'persisted',
    finishedAt: new Date().toISOString()
  };
  publishJudgementTrace();
  const appliedDramaTraceValidation =
    reconcileDramaExecutionTraceAfterWriteback({
      stateBeforeWriteback: stateForWriteback,
      stateAfterWriteback,
      trace: dramaExecutionTrace,
      context: dramaPlanningContext,
      plan: dramaPlan,
      existingNarrativeArcs: state.narrativeArcs,
      includeNarrativeArcProgressAudit: true,
      requestId,
      turnId: `turn_${String(state.turnCounter + 1).padStart(4, '0')}`
    });
  dramaExecutionTrace = appliedDramaTraceValidation.trace;
  dramaDiagnostics = [
    ...dramaDiagnostics,
    ...appliedDramaTraceValidation.diagnostics
  ];
  if (appliedDramaTraceValidation.narrativeArcProgressAudits?.length) {
    const postWritebackAudits = appliedDramaTraceValidation.narrativeArcProgressAudits;
    const auditKey = (audit: NarrativeArcProgressValidationDiagnostic) =>
      `${audit.arcInstanceId ?? ''}:${audit.decision ?? ''}:${audit.requestedNextStageId ?? ''}`;
    const canonicalAuditRefId = (kind: string, refId: string) =>
      kind === 'case'
        ? caseContinuityResult.caseIdAliases?.[refId] ?? refId
        : refId;
    const postByKey = new Map(postWritebackAudits.map((audit) => [auditKey(audit), audit]));
    narrativeArcProgressAudits = narrativeArcProgressAudits.map(
      (audit) => {
        const postAudit = postByKey.get(auditKey(audit));
        if (!postAudit) return audit;
        const postRefs = new Map(
          postAudit.supportingWritebackRefs.map((ref) => [
            `${ref.kind}:${canonicalAuditRefId(
              ref.kind,
              ref.normalizedRefId ?? ref.originalRefId
            )}`,
            ref
          ])
        );
        return {
          ...audit,
          ...postAudit,
          writebackReferenceAudit: {
            ...postAudit.writebackReferenceAudit,
            rawResponseRefs: audit.writebackReferenceAudit.rawResponseRefs,
            schemaValidatedRefs: audit.writebackReferenceAudit.schemaValidatedRefs,
            acceptedWritebackRefs: audit.writebackReferenceAudit.acceptedWritebackRefs
          },
          rejectionReasons: Array.from(
            new Set([...audit.rejectionReasons, ...postAudit.rejectionReasons])
          ),
          advisoryReasons: Array.from(
            new Set([...(audit.advisoryReasons ?? []), ...(postAudit.advisoryReasons ?? [])])
          ),
          supportingWritebackRefs: audit.supportingWritebackRefs.map((ref) => {
            const canonicalRefId = canonicalAuditRefId(ref.kind, ref.originalRefId);
            const postRef = postRefs.get(`${ref.kind}:${canonicalRefId}`);
            return postRef
              ? {
                  ...ref,
                  ...(canonicalRefId !== ref.originalRefId || postRef.normalizedRefId
                    ? { normalizedRefId: postRef.normalizedRefId ?? canonicalRefId }
                    : {}),
                  appliedToRuntime: postRef.appliedToRuntime,
                  appliedCheckAvailable: postRef.appliedCheckAvailable
                }
              : ref;
          })
        };
      }
    );
    const existingAuditKeys = new Set(narrativeArcProgressAudits.map(auditKey));
    narrativeArcProgressAudits = [
      ...narrativeArcProgressAudits,
      ...postWritebackAudits.filter((audit) => {
        const key = auditKey(audit);
        if (existingAuditKeys.has(key)) return false;
        existingAuditKeys.add(key);
        return true;
      })
    ];
  }
  const narrativeArcBridge = dramaPlanningContext
    ? bridgeNarrativeArcCreation({
        state: stateAfterWriteback,
        context: dramaPlanningContext,
        trace: dramaExecutionTrace,
        resolveExecutionPayload: (ref, options) =>
          getProjectedDramaPayload(context, ref, options)
      })
    : { trace: dramaExecutionTrace, diagnostics: [] as DramaPlanningDiagnostic[] };
  dramaExecutionTrace = narrativeArcBridge.trace;
  dramaDiagnostics = [
    ...dramaDiagnostics,
    ...narrativeArcBridge.diagnostics
  ];
  publishOfficialDlcDramaAudit(dramaPlan, dramaExecutionTrace);
  const serializedDramaPlanningInput = dramaPlanningContext
    ? JSON.stringify({
        playerRole: dramaPlanningContext.playerRoleContext,
        planningMode: dramaPlanningContext.planningMode,
        planningRoute: dramaPlanningContext.planningRoute,
        settings: dramaPlanningContext.settings,
        requiredContextSources: dramaPlanningContext.requiredContextSources,
        userPrioritySources: dramaPlanningContext.userPrioritySources,
        optionalDynamicSources: dramaPlanningContext.optionalDynamicSources,
        staticSeedSources: dramaPlanningContext.staticSeedSources,
        officialDlcSources: dramaPlanningContext.officialDlcSources ?? [],
        narrativeArcSummaries: dramaPlanningContext.narrativeArcSummaries ?? []
      })
    : '';
  const previousPrimaryExecution = dramaPlan?.primarySource
    ? [...(state.dramaticContent?.recentExecutions ?? [])]
        .reverse()
        .find((execution) =>
          execution.primarySourceRef?.providerId === dramaPlan.primarySource?.providerId &&
          execution.primarySourceRef?.sourceType === dramaPlan.primarySource?.sourceType &&
          execution.primarySourceRef?.sourceId === dramaPlan.primarySource?.sourceId
        )
    : undefined;
  const dramaExecutionReceipt: DramaExecutionReceipt = {
    turnCounter: dramaPlanningContext?.turnCounter ?? state.turnCounter,
    pacing: dramaticContentSettings.pacing,
    planningRoute: dramaticContentSettings.planningRoute,
    materialLevel: dramaticContentSettings.materialLevel,
    storypackInfluence: state.world.storypackInfluence,
    screenCharacterSeedsEnabled: state.world.screenCharacterSeedsEnabled !== false,
    planningContextBuilt: Boolean(dramaPlanningContext),
    planningMode: dramaPlanningContext?.planningMode,
    resolvedPlanningRoute: dramaPlanningContext?.planningRoute ?? 'auto',
    officialDlcSourceCount: dramaPlanningContext?.officialDlcSources?.length ?? 0,
    officialDlcSelected: Boolean(
      dramaPlan &&
        [dramaPlan.primarySource, ...dramaPlan.supportSources].some(
          (ref) => ref?.providerId === 'official-dlc'
        )
    ),
    officialDlcExecuted: Boolean(
      dramaExecutionTrace?.usedSourceRefs.some((ref) => ref.providerId === 'official-dlc')
    ),
    plannerApiInvoked: dramaPlannerApiInvoked,
    planOrigin: dramaPlanOrigin,
    planningCalled: dramaPlannerApiInvoked,
    planningSucceeded: Boolean(
      dramaPlanningContext &&
      dramaPlan &&
      dramaPlanOrigin !== 'local_fallback'
    ),
    planningDurationMs: dramaPlanningDurationMs,
    inputCandidateCount: dramaPlanningContext
      ? allDramaPlanningSources(dramaPlanningContext).length
      : 0,
    inputCharacterCount: serializedDramaPlanningInput.length,
    estimatedInputTokens: estimateNarrativeTokens(serializedDramaPlanningInput),
    planMode: dramaPlan?.mode,
    primarySourceRef: dramaPlan?.primarySource ?? undefined,
    supportSourceRefs: dramaPlan?.supportSources ?? [],
    usedSourceRefs: dramaExecutionTrace?.usedSourceRefs ?? [],
    traceStatus: dramaExecutionTrace?.status,
    persistentWriteCount: dramaExecutionTrace?.resultingWritebackRefs.length ?? 0,
    foregroundArcCount: foregroundContract?.maxForegroundArcs,
    sourceRepeatDistance:
      previousPrimaryExecution
        ? Math.max(0, state.turnCounter - previousPrimaryExecution.turnCounter)
        : undefined,
    newActorCount: Math.max(
      0,
      Object.keys(stateAfterWriteback.actors).length - Object.keys(state.actors).length
    ),
    degradeReason:
      dramaDiagnostics.length > 0
        ? dramaDiagnostics.map((diagnostic) => diagnostic.code).join(',')
        : undefined,
    filterRuleIds: dramaPlanningContext?.filterRuleIds ?? [],
    ...(narrativeArcProgressAudits.length > 0
      ? { narrativeArcProgressAudits }
      : {})
  };
  const stateAfterCustomContentDrama = applyCustomContentDramaExecution({
    stateBeforeWriteback: stateForWriteback,
    stateAfterWriteback,
    plan: dramaPlan,
    trace: dramaExecutionTrace
  });
  const stateAfterNarrativeArcProgress = applyNarrativeArcProgress(
    stateAfterCustomContentDrama,
    dramaExecutionTrace
  );
  const stateAfterDrama = recordDramaTurn(
    stateAfterNarrativeArcProgress,
    dramaExecutionTrace,
    dramaDiagnostics,
    dramaExecutionReceipt,
    foregroundContract
  );
  const foregroundTurnId = stateAfterDrama.storyLog.at(-1)?.turnId ?? `turn_${stateAfterDrama.turnCounter}`;
  const foregroundTouches = collectForegroundWritebackTouches(
    response,
    actorIdentityRepairResult.actorIdAliases
  );
  const stateAfterForegroundReconciliation = reconcileForegroundNpcTracks({
    state: stateAfterDrama,
    foregroundTurnId,
    directlyTouchedActorIds: foregroundTouches.directActorIds
  });
  const foregroundDelta = buildForegroundEvolutionDelta({
    state: stateAfterForegroundReconciliation,
    foregroundTurnId,
    startedAt: stateForWriteback.time,
    turnSummary: response.turnSummary,
    touches: foregroundTouches
  });
  const stateWithEraAwareCitySeeds = {
    ...stateAfterForegroundReconciliation,
    citySituationTracks: refreshPristineCitySituationTrackSeeds(
      stateAfterForegroundReconciliation.citySituationTracks,
      stateAfterForegroundReconciliation.time
    )
  };
  const backgroundSelection = selectBackgroundEvolutionCandidates({
    state: stateWithEraAwareCitySeeds,
    previousTime: stateForWriteback.time,
    foregroundTurnId,
    foregroundTouchedActorIds: foregroundTouches.actorIds,
    foregroundTouchedCaseIds: foregroundTouches.caseIds,
    foregroundTouchedRelationshipThreadIds: foregroundTouches.relationshipThreadIds,
    foregroundTouchedCityTrackIds: foregroundTouches.cityTrackIds,
    foregroundTouchedOrganizationIds: foregroundTouches.organizationIds,
    foregroundDelta
  });
  if (backgroundSelection.selectedReviewKeys.length > 0 && measuredBackgroundEvolution) {
    onStageChange?.('evolving_background');
  }
  const backgroundResult = await runBackgroundEvolution({
    state: stateWithEraAwareCitySeeds,
    selection: backgroundSelection,
    client: measuredBackgroundEvolution,
    foregroundTurnId,
    signal
  });
  const stateAfterBackground = appendDiagnosticsToLatestStoryEntry(
    backgroundResult.state,
    backgroundResult.diagnostics
  );
  if (backgroundResult.aborted) {
    onStageChange?.('finalizing_turn');
    return attachApiUsageToLatestNarratorEntry(
      preserveForwardTurnRelationshipHistory(state, stateAfterBackground),
      usageMeter.snapshot()
    );
  }
  onStageChange?.('updating_city_news');
  const stateAfterNewsGeneration = await maybeGenerateAuxiliaryNews({
    state: stateAfterBackground,
    playerInput,
    auxiliaryGeneration: measuredAuxiliaryGeneration,
    promptSettings,
    locale: gameSettings?.language
  });
  throwIfTurnAborted(signal);
  const nextState = reconcileNewsIssueLifecycle(stateAfterNewsGeneration);

  if (memoryCompression?.autoCompressionEnabled && measuredMemorySummary) {
    onStageChange?.('compressing_memory');
  }
  const compressedMemories =
    memoryCompression === undefined
      ? { state: nextState, diagnostics: [] }
      : await compressRuntimeMemories(nextState, measuredMemorySummary, memoryCompression, promptSettings);
  throwIfTurnAborted(signal);

  if (!measuredMemoryEmbedding || !embeddingResult.canEmbedMemories) {
    const stateWithDiagnostics = appendDiagnosticsToLatestStoryEntry(
      compressedMemories.state,
      compressedMemories.diagnostics
    );
    onStageChange?.('finalizing_turn');
    return attachApiUsageToLatestNarratorEntry(
      preserveForwardTurnRelationshipHistory(state, stateWithDiagnostics),
      usageMeter.snapshot()
    );
  }

  onStageChange?.('embedding_memory');
  const embeddedMemories = await embedRuntimeMemories(compressedMemories.state, measuredMemoryEmbedding, { signal });
  throwIfTurnAborted(signal);
  const stateWithDiagnostics = appendDiagnosticsToLatestStoryEntry(embeddedMemories.state, [
    ...compressedMemories.diagnostics,
    ...embeddedMemories.diagnostics
  ]);
  onStageChange?.('finalizing_turn');
  return attachApiUsageToLatestNarratorEntry(
    preserveForwardTurnRelationshipHistory(state, stateWithDiagnostics),
    usageMeter.snapshot()
  );
}

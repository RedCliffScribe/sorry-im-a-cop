import { composePrompt } from '../context/composePrompt';
import { selectContext } from '../context/selectContext';
import { buildForegroundEvolutionDelta } from '../backgroundEvolution/foregroundDelta';
import { reconcileForegroundNpcTracks } from '../backgroundEvolution/foregroundReconciliation';
import { runBackgroundEvolution } from '../backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../backgroundEvolution/selection';
import { isGameTimeDue } from '../deferred/deferredEventProjector';
import { compressRuntimeMemories } from '../memory/compressRuntimeMemories';
import { embedRuntimeMemories } from '../memory/embedRuntimeMemories';
import type { MemoryEmbeddingClient } from '../memory/MemoryEmbeddingClient';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import type { NarratorClient } from '../narrator/NarratorClient';
import { maybeGenerateAuxiliaryNews } from '../news/auxiliaryNewsGeneration';
import { reconcileNewsIssueLifecycle } from '../news/newsIssueLifecycle';
import { runNpcSimulation } from '../npc/npcSimulation';
import type {
  Actor,
  AssetItem,
  DeferredEvent,
  GameTime,
  PendingActorWritebackRecovery,
  Place,
  RuntimeState,
  StoryDiagnosticIssue,
  TurnApiUsage
} from '../runtime/types';
import type { GameSettings, MemoryCompressionSettings, PromptSettings } from '../settings/types';
import { resolvePromptText } from '../prompts/promptRegistry';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import {
  actorMemorySuggestionSchema,
  actorPatchSchema,
  assetPatchSchema,
  caseEvidencePatchSchema,
  casePatchSchema,
  currentMatterPatchSchema,
  deferredEventPatchSchema,
  locationPatchSchema,
  memorySuggestionSchema,
  playerPatchSchema,
  relationshipThreadPatchSchema,
  type NarratorResponse
} from '../writeback/schema';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import { TurnUsageMeter } from './TurnUsageMeter';

type ActorIdentityMergeConfidence = 'high' | 'medium' | 'low';

export type TurnExecutionStage =
  | 'recalling_memory'
  | 'simulating_npcs'
  | 'generating_narrative'
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
  narrator: NarratorClient;
  memoryEmbedding?: MemoryEmbeddingClient;
  memorySummary?: NarratorClient | null;
  writebackRepair?: NarratorClient | null;
  npcSimulation?: NarratorClient | null;
  backgroundEvolution?: NarratorClient | null;
  auxiliaryGeneration?: NarratorClient | null;
  memoryCompression?: MemoryCompressionSettings;
  gameSettings?: GameSettings;
  promptSettings?: PromptSettings;
  onNarrativeDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
  signal?: AbortSignal;
  onStageChange?: (stage: TurnExecutionStage) => void;
}

function throwIfTurnAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException('Aborted', 'AbortError');
}

function bindTurnAbortSignal(client: NarratorClient, signal: AbortSignal | undefined): NarratorClient {
  if (!signal) return client;
  return {
    complete: (prompt, options) => client.complete(prompt, { ...options, signal })
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
type RelationshipThreadPatch = NarratorResponse['writeback']['relationshipThreadPatches'][number];
type CompatibleRepairDomain =
  | 'assetLifecycle'
  | 'incidentOrigin'
  | 'location'
  | 'playerClothing'
  | 'playerVitals'
  | 'relationshipThreads';

interface CompatibleWritebackRepairPlan {
  domains: CompatibleRepairDomain[];
  locationCandidatePlaceIds: string[];
  relationshipCandidateActorIds: string[];
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
  identityReviewActorIds,
  playerInput,
  promptSettings
}: {
  actorPatches: unknown[];
  warnings: StoryDiagnosticIssue[];
  identityReviewActorIds: string[];
  playerInput: string;
  promptSettings?: PromptSettings;
}): string {
  return [
    resolvePromptText('repair.actorPatch', promptSettings),
    '主叙事模型已经输出正文。你需要审核所有新 NPC 的身份，并修复未通过结构校验的既有 NPC actorPatch。',
    '请返回 JSON：{"actorIdentityReviews":[{"actorId":"...","decision":"accept|repair|defer","actorPatch":{...}}],"actorPatches":[...]}。',
    '规则：',
    'identityReviewActorIds 中的每个 actorId 都必须在 actorIdentityReviews 中逐一给出明确决定。',
    'accept：原身份足以稳定建档；仍须返回完整且符合协议的 actorPatch。',
    'repair：修正为可稳定建档的完整身份；场景中的称呼、外号应保留在 callName 或 aliases。',
    'defer：现有信息不足以确认稳定身份；不要编造姓名，此项不返回 actorPatch。',
    '新 NPC 只能通过 actorIdentityReviews 审核，不能放进普通 actorPatches 绕过审核。',
    '普通 actorPatches 仅用于修复既有 NPC 的字段类型、枚举、范围或缺失字段。',
    'equipment 如果过长，保留最能代表当前随身装备的项目，其余可省略。',
    '不要把两个仅仅同名或同外号的人合并；只有明确身份线索能证明是同一人时才复用既有 actorId。',
    '返回的每个 actorPatch 必须能通过当前结构化写回协议。',
    '',
    `playerInput=${JSON.stringify(playerInput)}`,
    `identityReviewActorIds=${JSON.stringify(identityReviewActorIds)}`,
    `validationWarnings=${JSON.stringify(warnings)}`,
    `actorPatches=${JSON.stringify(actorPatches)}`
  ].join('\n');
}

interface ActorPatchRepairResult {
  patches: ActorPatch[];
  approvedNewActorIds: Set<string>;
  reviewedNewActorIds: Set<string>;
  diagnostics: StoryDiagnosticIssue[];
}

function parseActorPatchRepairResponse(
  value: unknown,
  requestedActorIds: Set<string>,
  identityReviewActorIds: Set<string>
): ActorPatchRepairResult {
  const root = isRecord(value) && isRecord(value.writeback) ? value.writeback : value;
  const rawReviews = isRecord(root) ? root.actorIdentityReviews : undefined;
  const rawPatches = isRecord(root) ? root.actorPatches : undefined;
  const patches: ActorPatch[] = [];
  const approvedNewActorIds = new Set<string>();
  const reviewedNewActorIds = new Set<string>();
  const diagnostics: StoryDiagnosticIssue[] = [];

  if (identityReviewActorIds.size > 0 && !Array.isArray(rawReviews)) {
    diagnostics.push({
      path: ['writebackRepair', 'actorIdentityReviews'],
      code: 'actor_identity_review_missing',
      message: 'Writeback repair did not return the required actorIdentityReviews array.'
    });
  }

  if (Array.isArray(rawReviews)) {
    rawReviews.forEach((item, index) => {
      if (!isRecord(item)) {
        diagnostics.push({
          path: ['writebackRepair', 'actorIdentityReviews', index],
          code: 'actor_identity_review_invalid',
          message: 'Actor identity review must be an object.'
        });
        return;
      }

      const actorId = typeof item.actorId === 'string' ? item.actorId.trim() : '';
      const decision = item.decision;
      if (!actorId || !identityReviewActorIds.has(actorId) || !requestedActorIds.has(actorId)) {
        diagnostics.push({
          path: ['writebackRepair', 'actorIdentityReviews', index, 'actorId'],
          code: 'actor_identity_review_unrelated',
          message: `Actor identity review returned an unknown actorId "${actorId}".`
        });
        return;
      }
      if (decision !== 'accept' && decision !== 'repair' && decision !== 'defer') {
        diagnostics.push({
          path: ['writebackRepair', 'actorIdentityReviews', index, 'decision'],
          code: 'actor_identity_review_invalid_decision',
          message: `Actor identity review for "${actorId}" must decide accept, repair, or defer.`
        });
        return;
      }

      reviewedNewActorIds.add(actorId);
      if (decision === 'defer') return;

      const parsed = actorPatchSchema.safeParse(item.actorPatch);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          diagnostics.push({
            path: [
              'writebackRepair',
              'actorIdentityReviews',
              index,
              'actorPatch',
              ...issue.path.map((segment) => String(segment))
            ],
            code: issue.code,
            message: issue.message
          });
        }
        return;
      }
      if (parsed.data.actorId !== actorId) {
        diagnostics.push({
          path: ['writebackRepair', 'actorIdentityReviews', index, 'actorPatch', 'actorId'],
          code: 'actor_identity_review_id_mismatch',
          message: `Actor identity review for "${actorId}" returned patch "${parsed.data.actorId}".`
        });
        return;
      }
      if (!parsed.data.name?.trim()) {
        diagnostics.push({
          path: ['writebackRepair', 'actorIdentityReviews', index, 'actorPatch', 'name'],
          code: 'actor_identity_review_missing_name',
          message: `Actor identity review for "${actorId}" returned an empty name.`
        });
        return;
      }

      patches.push(parsed.data);
      approvedNewActorIds.add(actorId);
    });
  }

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

    if (identityReviewActorIds.has(parsed.data.actorId)) {
      diagnostics.push({
        path: ['writebackRepair', 'actorPatches', index, 'actorId'],
        code: 'actor_identity_review_bypassed',
        message: `New actor "${parsed.data.actorId}" must be returned through actorIdentityReviews.`
      });
      return;
    }

    patches.push(parsed.data);
  });

  for (const actorId of identityReviewActorIds) {
    if (reviewedNewActorIds.has(actorId)) continue;
    diagnostics.push({
      path: ['writebackRepair', 'actorIdentityReviews'],
      code: 'actor_identity_review_omitted',
      message: `Writeback repair omitted identity decision for new actor "${actorId}".`
    });
  }

  if (!Array.isArray(rawPatches) && [...requestedActorIds].some((actorId) => !identityReviewActorIds.has(actorId))) {
    diagnostics.push({
      path: ['writebackRepair', 'actorPatches'],
      code: 'writeback_repair_invalid',
      message: 'Writeback repair did not return an actorPatches array for existing actor repairs.'
    });
  }

  return { patches, approvedNewActorIds, reviewedNewActorIds, diagnostics };
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
}

interface ActorWritebackRecoveryCandidate extends ActorWritebackRecoveryPayload {
  recoveryId: string;
  sourceTurnId: string;
  sourceGameTime: GameTime;
  actorId: string;
  attemptCount: number;
}

function rawWritebackArray(value: unknown, key: string): unknown[] {
  const parsed = parseRawObject(value);
  if (!isRecord(parsed) || !isRecord(parsed.writeback)) return [];

  const array = parsed.writeback[key];
  return Array.isArray(array) ? array : [];
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

function parseActorMemoriesForRecovery(value: unknown, actorId: string): ActorMemorySuggestion[] {
  return rawWritebackArray(value, 'actorMemories').flatMap((item) => {
    const parsed = actorMemorySuggestionSchema.safeParse(item);
    return parsed.success && parsed.data.actorId === actorId ? [parsed.data] : [];
  });
}

function relationshipPatchReferencesActor(patch: RelationshipThreadPatch, actorId: string): boolean {
  return patch.primaryActorId === actorId || patch.relatedActorIds?.includes(actorId) === true;
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

function createActorRecoveryCandidate({
  state,
  sourceTurnId,
  sourceGameTime,
  rawResponse,
  actorPatch,
  attemptCount = 0,
  recoveryId
}: {
  state: RuntimeState;
  sourceTurnId: string;
  sourceGameTime: GameTime;
  rawResponse: unknown;
  actorPatch: unknown;
  attemptCount?: number;
  recoveryId?: string;
}): ActorWritebackRecoveryCandidate | undefined {
  const actorId = actorPatchId(actorPatch);
  if (!actorId || state.actors[actorId]) return undefined;

  return {
    recoveryId: recoveryId ?? `${sourceTurnId}:${actorId}`,
    sourceTurnId,
    sourceGameTime: { ...sourceGameTime },
    actorId,
    actorPatch,
    actorMemories: parseActorMemoriesForRecovery(rawResponse, actorId),
    relationshipThreadPatches: parseRelationshipPatchesForRecovery(rawResponse, actorId),
    attemptCount
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
          : []
      }
    },
    actorPatch: payload.actorPatch,
    attemptCount: pending.attemptCount,
    recoveryId: pending.recoveryId
  });
}

function mergeActorRecoveryCandidate(
  previous: ActorWritebackRecoveryCandidate | undefined,
  next: ActorWritebackRecoveryCandidate
): ActorWritebackRecoveryCandidate {
  if (!previous) return next;

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
    attemptCount: Math.max(previous.attemptCount, next.attemptCount)
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

  for (const pending of state.pendingActorWritebackRecoveries ?? []) {
    addCandidate(parsePendingActorRecovery(state, pending));
  }

  for (const entry of state.storyLog.slice(-30)) {
    if (entry.speaker !== 'narrator' || !entry.rawNarratorResponse) continue;
    for (const actorPatch of rawActorPatchesFromResponse(entry.rawNarratorResponse)) {
      addCandidate(
        createActorRecoveryCandidate({
          state,
          sourceTurnId: entry.turnId,
          sourceGameTime: entry.gameTime,
          rawResponse: entry.rawNarratorResponse,
          actorPatch
        })
      );
    }
  }

  const sourceTurnId = `turn_${String(state.turnCounter + 1).padStart(4, '0')}`;
  for (const actorPatch of rawActorPatchesFromResponse(rawResponse)) {
    addCandidate(
      createActorRecoveryCandidate({
        state,
        sourceTurnId,
        sourceGameTime: state.time,
        rawResponse,
        actorPatch
      })
    );
  }

  return [...candidates.values()];
}

function mergeRecoveredActorDependencies(
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
  if (restoredMemories.length === 0 && restoredThreads.length === 0) return response;

  return {
    ...response,
    writeback: {
      ...response.writeback,
      actorMemories: uniqueActorMemories([...response.writeback.actorMemories, ...restoredMemories]),
      relationshipThreadPatches: uniqueRelationshipThreadPatches([
        ...response.writeback.relationshipThreadPatches,
        ...restoredThreads
      ])
    }
  };
}

function serializePendingActorRecovery(
  candidate: ActorWritebackRecoveryCandidate,
  attemptCount: number
): PendingActorWritebackRecovery {
  return {
    recoveryId: candidate.recoveryId,
    sourceTurnId: candidate.sourceTurnId,
    sourceGameTime: { ...candidate.sourceGameTime },
    actorId: candidate.actorId,
    writebackJson: JSON.stringify({
      actorPatch: candidate.actorPatch,
      actorMemories: candidate.actorMemories,
      relationshipThreadPatches: candidate.relationshipThreadPatches
    } satisfies ActorWritebackRecoveryPayload),
    attemptCount
  };
}

async function repairActorPatches({
  state,
  rawResponse,
  response,
  playerInput,
  writebackRepair,
  promptSettings
}: {
  state: RuntimeState;
  rawResponse: unknown;
  response: NarratorResponse;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<{ state: RuntimeState; response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  const rawActorPatches = rawActorPatchesFromResponse(rawResponse);
  const repairIndices = collectRepairableActorPatchIndices(response.validationWarnings, rawActorPatches);
  const recoveryCandidates = collectActorRecoveryCandidates({ state, rawResponse });
  const identityReviewActorIds = new Set(recoveryCandidates.map((candidate) => candidate.actorId));
  const responseForWriteback = withholdNewActorWritebacks(response, identityReviewActorIds);

  const requestedPatchMap = new Map<string, unknown>();
  for (const index of repairIndices) {
    const patch = rawActorPatches[index];
    requestedPatchMap.set(actorPatchId(patch) ?? `raw-index-${index}`, patch);
  }
  for (const candidate of recoveryCandidates) {
    requestedPatchMap.set(candidate.actorId, candidate.actorPatch);
  }

  const basePendingRecoveries = (state.pendingActorWritebackRecoveries ?? []).filter(
    (pending) => !state.actors[pending.actorId] && !recoveryCandidates.some((candidate) => candidate.actorId === pending.actorId)
  );

  if (requestedPatchMap.size === 0) {
    return {
      state: {
        ...state,
        pendingActorWritebackRecoveries: basePendingRecoveries
      },
      response: responseForWriteback,
      diagnostics: []
    };
  }

  const actorPatchWarnings = (response.validationWarnings ?? []).filter((warning) =>
    issuePathStartsWith(warning.path, ['writeback', 'actorPatches'])
  );
  const repairedPatches = new Map<string, ActorPatch>();
  const approvedNewActorIds = new Set<string>();
  const repairDiagnostics: StoryDiagnosticIssue[] = [];
  let remainingPatches = [...requestedPatchMap.values()];
  let attemptsMade = 0;

  if (writebackRepair) {
    for (let attempt = 0; attempt < 2 && remainingPatches.length > 0; attempt += 1) {
      attemptsMade += 1;
      const requestedActorIds = new Set(
        remainingPatches.map(actorPatchId).filter((actorId): actorId is string => Boolean(actorId))
      );
      const requestedIdentityReviewActorIds = new Set(
        [...identityReviewActorIds].filter((actorId) => requestedActorIds.has(actorId))
      );
      try {
        const repairPrompt = createActorPatchRepairPrompt({
          actorPatches: remainingPatches,
          warnings: [...actorPatchWarnings, ...repairDiagnostics],
          identityReviewActorIds: [...requestedIdentityReviewActorIds],
          playerInput,
          promptSettings
        });
        const repairRaw = await writebackRepair.complete(repairPrompt);
        const parsed = parseActorPatchRepairResponse(
          repairRaw,
          requestedActorIds,
          requestedIdentityReviewActorIds
        );
        repairDiagnostics.push(...parsed.diagnostics);
        for (const patch of parsed.patches) {
          repairedPatches.set(patch.actorId, patch);
        }
        for (const actorId of parsed.approvedNewActorIds) {
          approvedNewActorIds.add(actorId);
        }
        remainingPatches = remainingPatches.filter((patch) => {
          const actorId = actorPatchId(patch);
          return !actorId || !repairedPatches.has(actorId);
        });
      } catch (error) {
        repairDiagnostics.push({
          path: ['writebackRepair', 'actorPatches'],
          code: 'writeback_repair_failed',
          message: error instanceof Error ? error.message : 'Writeback repair failed.'
        });
      }
    }
  }

  let repairedResponse = mergeActorPatches(responseForWriteback, [...repairedPatches.values()]);
  repairedResponse = mergeRecoveredActorDependencies(repairedResponse, recoveryCandidates, approvedNewActorIds);

  const unresolvedRecoveries = recoveryCandidates.filter((candidate) => !approvedNewActorIds.has(candidate.actorId));
  const pendingActorWritebackRecoveries = [
    ...basePendingRecoveries,
    ...unresolvedRecoveries.map((candidate) =>
      serializePendingActorRecovery(candidate, candidate.attemptCount + attemptsMade)
    )
  ];
  const recoveryDiagnostics: StoryDiagnosticIssue[] = [];
  if (repairedPatches.size > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'writeback_repair_applied',
      message: `Writeback repair supplied ${repairedPatches.size} actor patch(es).`
    });
  }
  if (recoveryCandidates.some((candidate) => approvedNewActorIds.has(candidate.actorId))) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_applied',
      message: 'Recovered a previously deferred actor writeback together with its dependent memories and relationships.'
    });
  }
  if (unresolvedRecoveries.length > 0) {
    recoveryDiagnostics.push({
      path: ['writeback', 'actorPatches'],
      code: 'actor_writeback_recovery_queued',
      message: `Deferred ${unresolvedRecoveries.length} new actor writeback package(s) pending API identity review.`
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

function summarizeActorForIdentityRepair(actor: Actor) {
  return {
    actorId: actor.actorId,
    name: actor.name,
    englishName: actor.englishName,
    aliases: actor.aliases,
    callName: actor.callName,
    gender: actor.gender,
    computedAge: actor.computedAge,
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
    '返回 JSON：{"actorIdentityMerges":[...]}。',
    '每个合并项字段：sourceActorId、targetActorId、confidence、canonicalName、canonicalEnglishName、aliases、evidence。',
    '规则：',
    '1. sourceActorId 必须来自 candidateActorPatches；targetActorId 必须来自 existingActorCandidates。',
    '2. existingActorCandidates 是完整现有人物目录，必须由你根据本轮叙事、写回与人物资料判断是否同一人；本地没有做姓名、称呼、地点或身份筛选。',
    '3. 仅在高置信度确认同一人时返回合并项；不能确认就返回空数组。',
    '4. 禁止合并 player，sourceActorId 与 targetActorId 不得相同。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `candidateActorPatches=${JSON.stringify(actorPatches.map(summarizeActorPatchForIdentityRepair))}`,
    `existingActorCandidates=${JSON.stringify(existingActors.map(summarizeActorForIdentityRepair))}`,
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

    const sourceActorId = nonEmptyString(item.sourceActorId);
    const targetActorId = nonEmptyString(item.targetActorId);
    const confidence = item.confidence;
    const evidence = Array.isArray(item.evidence) ? item.evidence.map(nonEmptyString).filter((text): text is string => Boolean(text)) : [];
    if (!sourceActorId || !targetActorId || (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low')) {
      diagnostics.push({
        path: ['writebackRepair', 'actorIdentityMerges', index],
        code: 'invalid_actor_identity_merge',
        message: 'Actor identity merge must include sourceActorId, targetActorId and confidence.'
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
  writebackRepair,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
  promptSettings?: PromptSettings;
}): Promise<{
  state: RuntimeState;
  response: NarratorResponse;
  actorIdAliases: Record<string, string>;
  diagnostics: StoryDiagnosticIssue[];
}> {
  if (!writebackRepair) return { state, response, actorIdAliases: {}, diagnostics: [] };

  const actorPatches = collectActorIdentityRepairSubjects(response);
  if (actorPatches.length === 0) return { state, response, actorIdAliases: {}, diagnostics: [] };

  const existingActors = collectActorIdentityRepairCandidates(state);
  if (existingActors.length === 0) return { state, response, actorIdAliases: {}, diagnostics: [] };

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
    if (parsed.decisions.length === 0) {
      return { state, response, actorIdAliases: {}, diagnostics: parsed.diagnostics };
    }

    const existingMergeResult = applyExistingActorIdentityMerges(state, parsed.decisions);
    const patchMergeResult = applyActorIdentityMergePatches(
      existingMergeResult.state,
      response,
      parsed.decisions
    );

    return {
      state: existingMergeResult.state,
      response: patchMergeResult.response,
      actorIdAliases: {
        ...existingMergeResult.actorIdAliases,
        ...patchMergeResult.actorIdAliases
      },
      diagnostics: [...parsed.diagnostics, ...existingMergeResult.diagnostics, ...patchMergeResult.diagnostics]
    };
  } catch (error) {
    return {
      state,
      response,
      actorIdAliases: {},
      diagnostics: [
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
  casePatches: CasePatch[];
  caseEvidencePatches: CaseEvidencePatch[];
  currentMatterPatches: CurrentMatterPatch[];
  memories: MemorySuggestion[];
  actorMemories: ActorMemorySuggestion[];
  diagnostics: StoryDiagnosticIssue[];
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
    '请返回 JSON：{"casePatches":[...],"caseEvidencePatches":[...],"currentMatterPatches":[...],"memories":[...],"actorMemories":[...]}。',
    '规则：',
    '1. 只审查 candidateNewCasePatches；existingCases 中已有案件的后续更新不在本任务范围内。',
    '2. 保留为案件：已正式报案/立案、上级交办、出现案号/报告/口供/证据、严重伤害或重大财损、拘捕、社团有组织犯罪、ICAC/检控/媒体高风险，或明显需要多回合调查。',
    '3. 降级为动态：普通出警、轻微滋扰、噪音投诉、店主或住户求助、现场调停、尚无正式材料的小纠纷。降级时不要返回原 caseId 的 casePatches；改写 currentMatterPatches，matterKind 通常用 police_work，relatedCaseIds 留空。',
    '4. 合并既有案件：如果候选只是已有案件的新进展，返回使用 existingCases 中 caseId 的 casePatches.activityLog；不要保留候选新 caseId。',
    '5. caseEvidencePatches 只能指向保留或合并后的案件；降级动态时不要保留孤立证据。',
    '6. memories 可保存“为什么没有入案/目前只是普通警务事项”的独立事实，便于后续回捞；kind 使用 world 或 case，禁止使用 turn。turn 只保留给主叙事 response.turnSummary。',
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
  const casePatches: CasePatch[] = [];
  const caseEvidencePatches: CaseEvidencePatch[] = [];
  const currentMatterPatches: CurrentMatterPatch[] = [];
  const memories: MemorySuggestion[] = [];
  const actorMemories: ActorMemorySuggestion[] = [];

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

  return { casePatches, caseEvidencePatches, currentMatterPatches, memories, actorMemories, diagnostics };
}

function mergeCaseIntakeReview(
  response: NarratorResponse,
  reviewedCaseIds: Set<string>,
  repair: CaseIntakeReviewParseResult
): NarratorResponse {
  const keptReviewedCaseIds = new Set(repair.casePatches.map((patch) => patch.caseId).filter((caseId) => reviewedCaseIds.has(caseId)));
  const casePatches = [
    ...response.writeback.casePatches.filter((patch) => !reviewedCaseIds.has(patch.caseId)),
    ...repair.casePatches
  ];
  const caseEvidencePatchesById = new Map<string, CaseEvidencePatch>();
  for (const patch of response.writeback.caseEvidencePatches) {
    if (!reviewedCaseIds.has(patch.caseId) || keptReviewedCaseIds.has(patch.caseId)) {
      caseEvidencePatchesById.set(patch.evidenceId, patch);
    }
  }
  for (const patch of repair.caseEvidencePatches) {
    caseEvidencePatchesById.set(patch.evidenceId, patch);
  }

  const currentMatterPatches = new Map(response.writeback.currentMatterPatches.map((patch) => [patch.id, patch]));
  for (const patch of repair.currentMatterPatches) {
    currentMatterPatches.set(patch.id, patch);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      casePatches,
      caseEvidencePatches: [...caseEvidencePatchesById.values()],
      currentMatterPatches: [...currentMatterPatches.values()],
      memories: [...response.writeback.memories, ...repair.memories],
      actorMemories: [...response.writeback.actorMemories, ...repair.actorMemories]
    }
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
      parsed.casePatches.length === 0 &&
      parsed.caseEvidencePatches.length === 0 &&
      parsed.currentMatterPatches.length === 0 &&
      parsed.memories.length === 0 &&
      parsed.actorMemories.length === 0
    ) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergeCaseIntakeReview(
        response,
        new Set(candidateCasePatches.map((patch) => patch.caseId)),
        parsed
      ),
      diagnostics: [
        ...parsed.diagnostics,
        {
          path: ['writeback', 'caseIntake'],
          code: 'writeback_repair_applied',
          message: `Writeback repair reviewed ${candidateCasePatches.length} new case candidate(s): kept=${parsed.casePatches.length}, matters=${parsed.currentMatterPatches.length}.`
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
  currentMatterPatches: CurrentMatterPatch[];
  memories: MemorySuggestion[];
  actorMemories: ActorMemorySuggestion[];
  diagnostics: StoryDiagnosticIssue[];
}

function normalizeIncidentOriginText(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasIncidentOriginCue(text: string): boolean {
  const normalized = normalizeIncidentOriginText(text);
  if (!normalized) return false;

  const originCue =
    /(报案|报警|接报|派警|派员|派你|指派|值日警长|来电说|打电话说|电话说|电话报|投诉|求助|通报)/.test(normalized) ||
    /电台(通知|传来|呼叫|派)/.test(normalized) ||
    /\b(called police|police call|dispatch|dispatcher|complaint|reported to police)\b/i.test(text);
  if (!originCue) return false;

  return (
    /(警|警署|警方|警员|现场|处理|案件|滋事|冲突|打斗|砸|调戏|伤人|火警|火灾|刀|枪|毒|偷|抢|勒索|纠纷|看场|经理|店主|住户|包厢)/.test(
      normalized
    ) || /\b(police|officer|incident|disturbance|assault|fight|scene|case)\b/i.test(text)
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

function shouldRepairIncidentOrigin(response: NarratorResponse, playerInput: string): boolean {
  const narrativeContext = `${playerInput}\n${response.narrativeText}`;
  if (!hasIncidentOriginCue(narrativeContext)) return false;

  return !hasIncidentOriginCue(incidentOriginDurableWritebackText(response));
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

  return [
    'WRITEBACK_REPAIR_TASK',
    'INCIDENT_ORIGIN_REPAIR_TASK',
    '你是结构化写回修复器，只补“报案/派警/通报/求助/投诉来源”这类事故来源事实，不改正文，不创造新剧情。',
    '主叙事模型已经在 narrativeText 或玩家输入中写出了来源，但 durable writeback 没有保存，后续容易让报案人、场方或知情人忘记自己/本方报过警。',
    '请返回 JSON：{"currentMatterPatches":[...],"memories":[...],"actorMemories":[...]}。',
    '规则：',
    '1. 只提取本回合正文已经明确出现的来源、报案人/通报方、目标地点、求助原因、谁应该知道此事；不要新增嫌疑人、动机或新剧情。',
    '2. 仍在进行的警务/现场事件必须写 currentMatterPatches；title 和 summary 必须包含报案/派警来源，currentHook 必须说明后续相关知情人不能完全忘记这次报案，只能对报警目的、范围或后果改口。',
    '3. 相关事项由玩家处理时，relatedActorIds 必须包含 player；能复用已知 placeId/actorId/caseId 时复用，不能确定时宁可留空数组，不要发明 ID。',
    '4. 同时写一条高重要度 memories，保存“谁报案/谁通报/为什么派警/谁应当知情”的独立事实，便于向量检索回捞；kind 使用 world，禁止使用 turn。turn 只保留给主叙事 response.turnSummary。',
    '5. 只有报案人/经理/线人等 Actor 已存在或本回合 actorPatches 已创建时，才写 actorMemories；不要为了写记忆创建新 Actor。',
    '6. 不要返回 actorPatches、placePatches、casePatches 或正文；普通报案、派警、店主求助和现场投诉先进入 currentMatterPatches，不等于正式案件。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `existingCurrentMatters=${JSON.stringify(existingCurrentMatters)}`,
    `existingCases=${JSON.stringify(existingCases)}`,
    `knownPlaces=${JSON.stringify(knownPlaces)}`,
    `knownActors=${JSON.stringify(knownActors)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
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

function relationshipActorIdsFromPatch(patch: RelationshipThreadPatch): string[] {
  return uniqueStrings([patch.primaryActorId, ...(patch.relatedActorIds ?? [])]);
}

function collectRelationshipRepairCandidateActorIds(state: RuntimeState, response: NarratorResponse): string[] {
  const allowedActorIds = new Set([...Object.keys(state.actors), ...response.writeback.actorPatches.map((patch) => patch.actorId)]);
  const candidateIds = new Set<string>();
  for (const patch of response.writeback.relationshipThreadPatches) {
    if (state.relationshipThreads[patch.threadId]) continue;
    if (patch.creationBasis && patch.evidenceRefs?.length) continue;
    for (const actorId of relationshipActorIdsFromPatch(patch)) {
      if (actorId !== state.player.actorId) candidateIds.add(actorId);
    }
  }

  return [...candidateIds]
    .filter((actorId) => allowedActorIds.has(actorId))
    .sort();
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
    '4. 不要发明新人物；relatedActorIds 和 primaryActorId 必须来自 candidateActorIds 或 existingActors。',
    '5. 新建关系线必须有 threadId、kind、title、summary、relatedActorIds、relationshipRole、creationBasis、evidenceRefs；当前回合的结构化关系事实可引用 {kind:"current_turn",refId:"current_turn",summary:"..."}。repeated_contact / sustained_conflict 至少需要两项不同有效引用。',
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
  allowedActorIds: Set<string>,
  candidateActorIds: Set<string>
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
    const parsed = relationshipThreadPatchSchema.safeParse(item);
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

    patches.push(parsed.data);
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

  const candidateActorIds = collectRelationshipRepairCandidateActorIds(state, response);
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
      new Set([...Object.keys(state.actors), ...response.writeback.actorPatches.map((patch) => patch.actorId)]),
      new Set(candidateActorIds)
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
          code: 'writeback_repair_applied',
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
          code: 'writeback_repair_failed',
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

  const clothingWord =
    /(衣|衫|裤|鞋|制服|军装|便装|便服|便衣|私服|西装|礼服|睡衣|雨衣|外套|夹克|衬衫|长裤|短裤|裙|帽|肩章|帽徽|伪装)/;
  return (
    /(换上|换成|换了|换回|换下|换掉|换衣|更衣|改穿|脱下|脱掉|脱了|穿上|穿回|套上)/.test(normalized) &&
    clothingWord.test(normalized)
  );
}

function shouldRepairPlayerClothing(response: NarratorResponse, playerInput: string): boolean {
  if (response.writeback.playerPatch?.clothing !== undefined) return false;
  return hasPlayerClothingChangeCue(`${playerInput}\n${response.narrativeText}`);
}

function normalizePlayerVitalsRepairText(text: string): string {
  return text.replace(/\s+/g, '');
}

function hasPlayerVitalsChangeCue(text: string): boolean {
  const normalized = normalizePlayerVitalsRepairText(text);
  if (!normalized) return false;

  return (
    /(追|追捕|追逐|奔跑|快跑|冲刺|扑上|按住|压住|制服|搏斗|格斗|扭打|打斗|拘捕|反抗|摔|撞|受伤|擦伤|流血|疼|痛|喘|气促|胸口发紧|体力|疲|累|熬夜|通宵|长时间|巡逻|负重|搬|扛|爬|湿滑|休息|睡觉|补眠|恢复)/.test(
      normalized
    ) ||
    /\b(chase|sprint|run|fight|grapple|arrest|subdue|injur|hurt|tired|fatigue|exhaust|sleep|rest|recover)\b/i.test(text)
  );
}

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

function shouldRepairPlayerVitals(state: RuntimeState, response: NarratorResponse, playerInput: string): boolean {
  if (hasMeaningfulPlayerVitalsPatch(response, state.player.actorId)) return false;
  return hasPlayerVitalsChangeCue(`${playerInput}\n${response.narrativeText}`);
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
  return [
    'WRITEBACK_REPAIR_TASK',
    'PLAYER_VITALS_REPAIR_TASK',
    '你是结构化写回修复器，只判断玩家生命、体力和身体状态是否被本回合正文或玩家行动明确改变；不改正文，不创造新剧情。',
    '主叙事模型已经输出正文，但可能把追逐、奔跑、搏斗、拘捕、摔伤、负重、长时间巡逻、熬夜、睡眠或休息恢复只写在 narrativeText 里，漏写 actorPatches[player].vitalsPatch。',
    '请返回 JSON：{"actorPatches":[{"actorId":"player","vitalsPatch":{"healthDelta":0,"staminaDelta":0,"conditionSummary":"..."}}]}；如果没有明确生命/体力/状态变化，返回 {"actorPatches":[]}。',
    '规则：',
    '1. 只允许返回 actorId 为 player 的 actorPatches；不要返回 NPC 体力，不要返回 playerPatch，不要返回正文。',
    '2. 根据本回合事实判断增减：追逐、奔跑、近身制服、搏斗、受伤、长时间执勤、熬夜、负重通常会减少体力；睡觉、补眠、休息和治疗可以恢复体力或生命。',
    '3. 不要每回合机械扣体力；只有正文或玩家行动已经明确发生身体消耗、受伤、疲惫或恢复时才写。',
    '4. healthDelta/staminaDelta 写整数，幅度克制但要有感：轻微消耗约 -3 到 -8，明显追逐/搏斗约 -10 到 -25，重伤或极端透支才更高；恢复也按实际休息时长克制处理。',
    '5. conditionSummary 写玩家当前身体状态的中文短句，不写系统解释。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `currentPlayerVitals=${JSON.stringify(state.player.vitals)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
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
  playerActorId: string
): { patch?: ActorPatch; diagnostics: StoryDiagnosticIssue[] } {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawActorPatches = isRecord(container) && Array.isArray(container.actorPatches) ? container.actorPatches : [];

  for (const [index, item] of rawActorPatches.entries()) {
    const parsed = actorPatchSchema.safeParse(item);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        diagnostics.push({
          path: ['writebackRepair', 'playerVitals', 'actorPatches', index, ...issue.path.map((segment) => String(segment))],
          code: issue.code,
          message: issue.message
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
    if (!parsed.data.vitalsPatch) {
      diagnostics.push({
        path: ['writebackRepair', 'playerVitals', 'actorPatches', index, 'vitalsPatch'],
        code: 'writeback_repair_missing_vitals_patch',
        message: 'Player vitals repair returned the player actor without a vitalsPatch.'
      });
      continue;
    }
    return { patch: parsed.data, diagnostics };
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
  if (!writebackRepair || !shouldRepairPlayerVitals(state, response, playerInput)) {
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
    const parsed = parsePlayerVitalsRepairResponse(repairRaw, state.player.actorId);
    if (!parsed.patch?.vitalsPatch) {
      return { response, diagnostics: parsed.diagnostics };
    }

    return {
      response: mergePlayerVitalsRepair(response, parsed.patch),
      diagnostics: [
        ...parsed.diagnostics,
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
  if (!writebackRepair || !shouldRepairPlayerClothing(response, playerInput)) {
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

function shouldRepairAssetLifecycle(state: RuntimeState, response: NarratorResponse, playerInput: string): boolean {
  const assets = visibleAssetItems(state);
  if (assets.length === 0) return false;
  if (hasAssetPatchValidationWarning(response)) return true;
  if (hasUnremovedSubmittedAssetEvidence(state, response)) return true;

  const text = `${playerInput}\n${response.narrativeText}`;
  if (!hasAssetLifecycleCue(text)) return false;

  const touchedItemIds = assetPatchTouchedItemIds(response);
  const mentionedExistingItems = assets.filter((item) => assetMentionedInText(item, text));
  if (mentionedExistingItems.some((item) => !touchedItemIds.has(item.itemId))) return true;

  const assetDomainCue = /(物品|资产|装备|文件|资料|手稿|稿件|小说|录音|照片|证据|证物|衣|衫|裤|丝袜|钱|现金|车|钥匙)/.test(
    normalizeAssetLifecycleText(text)
  );
  return assetDomainCue && touchedItemIds.size === 0;
}

function summarizeAssetForLifecycleRepair(item: AssetItem) {
  return {
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
    importance: item.importance
  };
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
    '你是物品与资产写回修复器，只修复 assetPatch，不改正文，不创造新剧情。',
    '主叙事模型可能把物品获得、更新、赠送、提交证据、寄出、卖出、丢失或销毁只写在正文里，导致玩家物品与资产面板不同步。',
    '请返回 JSON：{"assetPatch":{"upsertItems":[...],"removeItems":[...]}}。没有需要修复时返回 {"assetPatch":{"upsertItems":[],"removeItems":[]}}。',
    '规则：',
    '1. existingAssets 是玩家当前持有、控制或长期可用的物品与资产；removeItems 只能使用 existingAssets 里的 itemId。',
    '2. 物品离开玩家持有或控制时必须 removeItems：交给别人、送给别人、归还、提交到案件/证物袋、寄出、卖出、丢失、销毁、消耗、用掉。',
    '3. 物品仍由玩家持有但内容变化时，用同一个 itemId 在 upsertItems 更新完整物品对象；例如小说手稿从前三章推进到前四章，不要新建或删除。',
    '4. 新物品只有在正文已经明确进入玩家持有或可支配时才 upsert；只是看到、听说、准备去取，不要写入。',
    '5. 案件证据如果已经通过 caseEvidencePatches 提交，且 relatedAssetItemId 指向 existingAssets，通常要 removeItems 并填写 movedToCaseId；除非正文明确玩家保留的是副本。',
    '6. 不要为了补漂亮字段改写无关物品；不确定就少写。普通物品不需要 locationSummary。',
    '',
    `currentTime=${JSON.stringify(state.time)}`,
    `turnEndTime=${JSON.stringify(turnEndTime)}`,
    `playerInput=${JSON.stringify(playerInput)}`,
    `existingAssets=${JSON.stringify(existingAssets)}`,
    `mainNarratorResponse=${JSON.stringify({
      narrativeText: response.narrativeText,
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
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

function parseAssetLifecycleRepairResponse(
  state: RuntimeState,
  value: unknown
): { assetPatch?: AssetPatch; diagnostics: StoryDiagnosticIssue[] } {
  const container = repairContainer(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawAssetPatch = isRecord(container) && isRecord(container.assetPatch) ? container.assetPatch : undefined;
  if (!rawAssetPatch) {
    return {
      diagnostics: [
        {
          path: ['writebackRepair', 'assetPatch'],
          code: 'writeback_repair_invalid',
          message: 'Asset lifecycle repair did not return an assetPatch object.'
        }
      ]
    };
  }

  const parsed = assetPatchSchema.safeParse(rawAssetPatch);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        path: ['writebackRepair', 'assetPatch', ...issue.path.map((segment) => String(segment))],
        code: issue.code,
        message: issue.message
      });
    }
    return { diagnostics };
  }

  const existingAssetIds = new Set(Object.keys(state.assets?.items ?? {}));
  const removeItems = parsed.data.removeItems.filter((item) => {
    if (existingAssetIds.has(item.itemId)) return true;
    diagnostics.push({
      path: ['writebackRepair', 'assetPatch', 'removeItems', item.itemId],
      code: 'writeback_repair_unrelated_asset',
      message: `Asset lifecycle repair tried to remove unknown item "${item.itemId}".`
    });
    return false;
  });
  const assetPatch = {
    upsertItems: parsed.data.upsertItems,
    removeItems
  };
  if (assetPatch.upsertItems.length === 0 && assetPatch.removeItems.length === 0) return { diagnostics };

  return { assetPatch, diagnostics };
}

function mergeAssetLifecycleRepair(response: NarratorResponse, assetPatch: AssetPatch): NarratorResponse {
  const upsertItems = new Map((response.writeback.assetPatch?.upsertItems ?? []).map((item) => [item.itemId, item]));
  for (const item of assetPatch.upsertItems) {
    upsertItems.set(item.itemId, item);
  }

  const removeItems = new Map((response.writeback.assetPatch?.removeItems ?? []).map((item) => [item.itemId, item]));
  for (const item of assetPatch.removeItems) {
    removeItems.set(item.itemId, item);
  }

  return {
    ...response,
    writeback: {
      ...response.writeback,
      assetPatch: {
        upsertItems: [...upsertItems.values()],
        removeItems: [...removeItems.values()]
      }
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
  if (!writebackRepair || !shouldRepairAssetLifecycle(state, response, playerInput)) {
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
    const parsed = parseAssetLifecycleRepairResponse(state, repairRaw);
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
          message: `Writeback repair supplied asset lifecycle patch: upsert=${parsed.assetPatch.upsertItems.length}, remove=${parsed.assetPatch.removeItems.length}.`
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

  const rawCurrentMatterPatches =
    isRecord(container) && Array.isArray(container.currentMatterPatches) ? container.currentMatterPatches : [];
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

  const rawMemories = isRecord(container) && Array.isArray(container.memories) ? container.memories : [];
  rawMemories.forEach((item, index) => {
    const parsed = memorySuggestionSchema.safeParse(item);
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

  const rawActorMemories = isRecord(container) && Array.isArray(container.actorMemories) ? container.actorMemories : [];
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

  if (currentMatterPatches.length === 0 && memories.length === 0 && actorMemories.length === 0) {
    diagnostics.push({
      path: ['writebackRepair', 'incidentOrigin'],
      code: 'writeback_repair_invalid',
      message: 'Incident origin repair did not return any usable currentMatterPatches, memories, or actorMemories.'
    });
  }

  return { currentMatterPatches, memories, actorMemories, diagnostics };
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
  if (!writebackRepair || !shouldRepairIncidentOrigin(response, playerInput)) {
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
  return [place.name, place.nameZh, place.nameEn, ...(place.aliases ?? [])]
    .filter((value): value is string => Boolean(value?.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
}

function maskQuotedDialogue(narrativeText: string): string {
  return narrativeText.replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"/gs, (quoted) => ' '.repeat(quoted.length));
}

function narrativeHasLocationCandidateReference(narrativeText: string, reference: string): boolean {
  const normalizedReference = reference.trim();
  if (normalizedReference.length < 2) return false;

  const beforeCue = /(?:在|回到|返回|抵达|来到|走进|进入|推开|停在|坐在|站在|赶回|赶到|到了|置身|身处|位于|arrive|enter|return|reach|at)\s*$/i;
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
  if (response.writeback.locationPatch) return [];

  const narrativeText = maskQuotedDialogue(response.narrativeText);

  return Object.values(state.places)
    .filter((place) => {
      const referencedPlace = placeLocationReferenceTexts(place).some((reference) =>
        narrativeHasLocationCandidateReference(narrativeText, reference)
      );
      const referencedDifferentScene = Object.values(state.scenes)
        .filter((scene) => scene.placeId === place.placeId && scene.sceneId !== state.location.currentSceneId)
        .some((scene) => narrativeHasLocationCandidateReference(narrativeText, scene.name));

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
  playerInput,
  allowRelationshipRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  allowRelationshipRepair: boolean;
}): CompatibleWritebackRepairPlan {
  const domains: CompatibleRepairDomain[] = [];
  if (shouldRepairAssetLifecycle(state, response, playerInput)) domains.push('assetLifecycle');
  if (shouldRepairIncidentOrigin(response, playerInput)) domains.push('incidentOrigin');
  const locationCandidatePlaceIds = collectLocationRepairCandidatePlaceIds(state, response);
  if (locationCandidatePlaceIds.length > 0) domains.push('location');
  if (shouldRepairPlayerClothing(response, playerInput)) domains.push('playerClothing');
  if (shouldRepairPlayerVitals(state, response, playerInput)) domains.push('playerVitals');

  const relationshipCandidateActorIds = allowRelationshipRepair
    ? collectRelationshipRepairCandidateActorIds(state, response)
    : [];
  if (relationshipCandidateActorIds.length > 0) domains.push('relationshipThreads');

  return { domains, locationCandidatePlaceIds, relationshipCandidateActorIds };
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
    outputShape.assetLifecycle = { assetPatch: { upsertItems: [], removeItems: [] } };
    domainInstructions.push(
      '- removeItems 只能使用 existingAssets 的 itemId；物品仍由玩家持有但内容变化时，复用同一 itemId 完整 upsert。',
      resolvePromptText('repair.assetLifecycle', promptSettings)
    );
    repairContext.existingAssets = visibleAssetItems(state)
      .sort((left, right) => right.importance - left.importance || left.itemId.localeCompare(right.itemId))
      .slice(0, 120)
      .map(summarizeAssetForLifecycleRepair);
  }

  if (requested.has('incidentOrigin')) {
    outputShape.incidentOrigin = { currentMatterPatches: [], memories: [], actorMemories: [] };
    domainInstructions.push(
      resolvePromptText('repair.incidentOrigin', promptSettings),
      '- 仍在进行的现场事项写 currentMatterPatches；同时用 world memory 保存谁报案、为何派警和谁应知情。',
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
      '- currentPlaceId 只能使用 candidateKnownPlaces 的 placeId；currentSceneId 只能使用同一地点下列出的已知 sceneId。不确定时返回 null。'
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
      '- clothing 必须是对象，currentSummary 与 mode 都必填；不得返回纯字符串。lastChangedReason 写本回合明确依据；不要返回 equipment。'
    );
    repairContext.currentPlayerClothing = {
      name: state.player.name,
      currentIdentity: state.player.currentIdentity,
      clothing: state.player.clothing,
      clothingState: state.player.clothingState
    };
  }

  if (requested.has('playerVitals')) {
    outputShape.playerVitals = { actorPatches: [] };
    domainInstructions.push(
      resolvePromptText('repair.playerVitals', promptSettings),
      '- 轻微消耗约 -3 到 -8，明显追逐/搏斗约 -10 到 -25；conditionSummary 写中文当前状态。'
    );
    repairContext.currentPlayerVitals = state.player.vitals;
  }

  if (requested.has('relationshipThreads')) {
    outputShape.relationshipThreads = { relationshipThreadPatches: [] };
    domainInstructions.push(
      resolvePromptText('repair.relationshipThread', promptSettings),
      '- 普通社会/工作/线索关系用 network；暧昧、恋爱、亲密或强情感牵引用 fate。',
      '- 不要发明人物；relatedActorIds 必须锚定 relationshipCandidateActorIds。currentPull 和 nextNaturalBeatHint 是自然回响，不是固定任务。',
      '- 必须补齐 creationBasis 与 evidenceRefs；当前回合明确形成的承诺或正式关系可引用 {kind:"current_turn",refId:"current_turn",summary:"..."}。',
      '- repeated_contact / sustained_conflict 至少需要两项不同有效引用；不确定就返回空数组。'
    );
    const actorPatchById = new Map(response.writeback.actorPatches.map((patch) => [patch.actorId, patch]));
    repairContext.relationshipCandidateActorIds = plan.relationshipCandidateActorIds;
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
      suggestedActions: response.suggestedActions,
      timePatch: response.timePatch,
      writeback: {
        playerPatch: response.writeback.playerPatch,
        actorPatches: response.writeback.actorPatches,
        actorMemories: response.writeback.actorMemories,
        memories: response.writeback.memories,
        locationPatch: response.writeback.locationPatch,
        currentMatterPatches: response.writeback.currentMatterPatches,
        relationshipThreadPatches: response.writeback.relationshipThreadPatches,
        assetPatch: response.writeback.assetPatch,
        casePatches: response.writeback.casePatches,
        caseEvidencePatches: response.writeback.caseEvidencePatches,
        judgementCheckPatches: response.writeback.judgementCheckPatches,
        combatEventPatches: response.writeback.combatEventPatches
      },
      validationWarnings: response.validationWarnings
    })}`
  ].join('\n');
}

async function repairCompatibleWritebacks({
  state,
  response,
  playerInput,
  turnEndTime,
  writebackRepair,
  allowRelationshipRepair,
  promptSettings
}: {
  state: RuntimeState;
  response: NarratorResponse;
  playerInput: string;
  turnEndTime: GameTime;
  writebackRepair?: NarratorClient | null;
  allowRelationshipRepair: boolean;
  promptSettings?: PromptSettings;
}): Promise<{ response: NarratorResponse; diagnostics: StoryDiagnosticIssue[] }> {
  if (!writebackRepair) return { response, diagnostics: [] };

  const plan = collectCompatibleWritebackRepairPlan({ state, response, playerInput, allowRelationshipRepair });
  if (plan.domains.length === 0) return { response, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [
    {
      path: ['writebackRepair', 'combined'],
      code: 'writeback_repair_requested',
      message: `Combined writeback repair requested domains: ${plan.domains.join(', ')}.`
    }
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

    if (plan.domains.includes('assetLifecycle')) {
      const parsed = parseAssetLifecycleRepairResponse(
        state,
        selectCompatibleRepairDomain(repairRaw, 'assetLifecycle')
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.assetPatch) {
        repairedResponse = mergeAssetLifecycleRepair(repairedResponse, parsed.assetPatch);
        diagnostics.push({
          path: ['writeback', 'assetPatch'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied asset lifecycle patch: upsert=${parsed.assetPatch.upsertItems.length}, remove=${parsed.assetPatch.removeItems.length}.`
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

    if (plan.domains.includes('playerVitals')) {
      const parsed = parsePlayerVitalsRepairResponse(
        selectCompatibleRepairDomain(repairRaw, 'playerVitals'),
        state.player.actorId
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.patch?.vitalsPatch) {
        repairedResponse = mergePlayerVitalsRepair(repairedResponse, parsed.patch);
        diagnostics.push({
          path: ['writeback', 'actorPatches', 'player', 'vitalsPatch'],
          code: 'writeback_repair_applied',
          message: 'Writeback repair supplied player vitals omitted by the main narrator.'
        });
      }
    }

    if (plan.domains.includes('relationshipThreads')) {
      const parsed = parseRelationshipThreadRepairResponse(
        selectCompatibleRepairDomain(repairRaw, 'relationshipThreads'),
        new Set([...Object.keys(state.actors), ...repairedResponse.writeback.actorPatches.map((patch) => patch.actorId)]),
        new Set(plan.relationshipCandidateActorIds)
      );
      diagnostics.push(...parsed.diagnostics);
      if (parsed.patches.length > 0) {
        repairedResponse = mergeRelationshipThreadRepair(repairedResponse, parsed.patches);
        diagnostics.push({
          path: ['writeback', 'relationshipThreadPatches'],
          code: 'writeback_repair_applied',
          message: `Writeback repair supplied ${parsed.patches.length} relationship thread patch(es).`
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
  narrator,
  memoryEmbedding,
  memorySummary,
  writebackRepair,
  npcSimulation,
  backgroundEvolution,
  auxiliaryGeneration,
  memoryCompression,
  gameSettings,
  promptSettings,
  onNarrativeDelta,
  onRawText,
  signal,
  onStageChange
}: RunPlayerTurnInput): Promise<RuntimeState> {
  throwIfTurnAborted(signal);
  const usageMeter = new TurnUsageMeter();
  const measuredNarrator = usageMeter.wrapNarrator('mainNarrator', bindTurnAbortSignal(narrator, signal));
  const measuredMemoryEmbedding = memoryEmbedding ? usageMeter.wrapMemoryEmbedding(memoryEmbedding) : undefined;
  const measuredMemorySummary = memorySummary
    ? usageMeter.wrapNarrator('memorySummary', bindTurnAbortSignal(memorySummary, signal))
    : memorySummary;
  const measuredWritebackRepair = writebackRepair
    ? usageMeter.wrapNarrator('writebackRepair', bindTurnAbortSignal(writebackRepair, signal))
    : writebackRepair;
  const measuredTurnSummaryRepairFallback =
    measuredWritebackRepair ?? usageMeter.wrapNarrator('writebackRepair', bindTurnAbortSignal(narrator, signal));
  const measuredNpcSimulation = npcSimulation
    ? usageMeter.wrapNarrator('npcSimulation', bindTurnAbortSignal(npcSimulation, signal))
    : npcSimulation;
  const measuredBackgroundEvolution = backgroundEvolution
    ? usageMeter.wrapNarrator('backgroundEvolution', bindTurnAbortSignal(backgroundEvolution, signal))
    : backgroundEvolution;
  const measuredAuxiliaryGeneration = auxiliaryGeneration
    ? usageMeter.wrapNarrator('auxiliaryGeneration', bindTurnAbortSignal(auxiliaryGeneration, signal))
    : auxiliaryGeneration;

  onStageChange?.('recalling_memory');
  const embeddingResult = await createQueryEmbedding(measuredMemoryEmbedding, state, playerInput, signal);
  throwIfTurnAborted(signal);
  const context = selectContext(state, playerInput, {
    queryEmbedding: embeddingResult.queryEmbedding,
    memorySettings: memoryCompression
  });
  if (measuredNpcSimulation) onStageChange?.('simulating_npcs');
  const npcSimulationResult = await runNpcSimulation({
    context,
    playerInput,
    client: measuredNpcSimulation,
    promptSettings
  });
  throwIfTurnAborted(signal);
  const prompt = composePrompt(context, playerInput, {
    narrativeLengthLevel: gameSettings?.narrativeLengthLevel,
    narrativePerspective: gameSettings?.narrativePerspective,
    pregnancyMode: gameSettings?.pregnancyMode,
    npcSimulationPackage: npcSimulationResult.package,
    promptSettings
  });
  let rawNarratorResponse = '';
  const requestStartedAt = Date.now();
  onStageChange?.('generating_narrative');
  const rawResponse = await measuredNarrator.complete(prompt, {
    onTextDelta: onNarrativeDelta,
    onRawText: (rawText) => {
      rawNarratorResponse = rawText;
      onRawText?.(rawText);
    },
    signal
  });
  throwIfTurnAborted(signal);
  const responseMs = Date.now() - requestStartedAt;
  onStageChange?.('validating_writeback');
  const responseWithTurnSummary = await repairMissingTurnSummary({
    rawResponse,
    playerInput,
    narrator: measuredTurnSummaryRepairFallback,
    writebackRepair: measuredWritebackRepair,
    promptSettings
  });
  throwIfTurnAborted(signal);
  let response = validateNarratorResponse(responseWithTurnSummary);
  const actorRepairResult = await repairActorPatches({
    state,
    rawResponse,
    response,
    playerInput,
    writebackRepair: measuredWritebackRepair ?? measuredTurnSummaryRepairFallback,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = actorRepairResult.response;
  const stateAfterActorRepair = actorRepairResult.state;
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
    writebackRepair: measuredWritebackRepair,
    promptSettings
  });
  throwIfTurnAborted(signal);
  response = actorIdentityRepairResult.response;
  const stateForWriteback = actorIdentityRepairResult.state;
  turnEndTime = getTurnEndTime(stateForWriteback.time, response);
  const compatibleRepairResult = await repairCompatibleWritebacks({
    state: stateForWriteback,
    response,
    playerInput,
    turnEndTime,
    writebackRepair: measuredWritebackRepair,
    allowRelationshipRepair: Object.keys(actorIdentityRepairResult.actorIdAliases).length === 0,
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
  turnEndTime = getTurnEndTime(stateForWriteback.time, response);
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
      inputTokens: estimateNarrativeTokens(prompt),
      outputTokens: estimateNarrativeTokens(rawNarratorResponse || JSON.stringify(rawResponse)),
      responseMs
    },
    writebackDiagnostics: [
      ...(response.validationWarnings ?? []),
      ...npcSimulationResult.diagnostics,
      ...actorRepairResult.diagnostics,
      ...actorIdentityRepairResult.diagnostics,
      ...caseIntakeRepairResult.diagnostics,
      ...compatibleRepairResult.diagnostics,
      ...repairResult.diagnostics,
      ...deferredContractDiagnostics,
      ...embeddingResult.diagnostics
    ]
  });
  const foregroundTurnId = stateAfterWriteback.storyLog.at(-1)?.turnId ?? `turn_${stateAfterWriteback.turnCounter}`;
  const foregroundTouches = collectForegroundWritebackTouches(
    response,
    actorIdentityRepairResult.actorIdAliases
  );
  const stateAfterForegroundReconciliation = reconcileForegroundNpcTracks({
    state: stateAfterWriteback,
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
  const backgroundSelection = selectBackgroundEvolutionCandidates({
    state: stateAfterForegroundReconciliation,
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
    state: stateAfterForegroundReconciliation,
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
    return attachApiUsageToLatestNarratorEntry(stateAfterBackground, usageMeter.snapshot());
  }
  onStageChange?.('updating_city_news');
  const stateAfterNewsGeneration = await maybeGenerateAuxiliaryNews({
    state: stateAfterBackground,
    playerInput,
    auxiliaryGeneration: measuredAuxiliaryGeneration,
    promptSettings
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
    return attachApiUsageToLatestNarratorEntry(stateWithDiagnostics, usageMeter.snapshot());
  }

  onStageChange?.('embedding_memory');
  const embeddedMemories = await embedRuntimeMemories(compressedMemories.state, measuredMemoryEmbedding, { signal });
  throwIfTurnAborted(signal);
  const stateWithDiagnostics = appendDiagnosticsToLatestStoryEntry(embeddedMemories.state, [
    ...compressedMemories.diagnostics,
    ...embeddedMemories.diagnostics
  ]);
  onStageChange?.('finalizing_turn');
  return attachApiUsageToLatestNarratorEntry(stateWithDiagnostics, usageMeter.snapshot());
}

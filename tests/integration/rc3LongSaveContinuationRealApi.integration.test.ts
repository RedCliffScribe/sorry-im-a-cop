import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBackgroundEvolutionClientFromSettings } from '../../src/domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { addGameHours } from '../../src/domain/backgroundEvolution/time';
import {
  projectPlayerIdentityContext,
  projectPublicActorRoleProfiles
} from '../../src/domain/identity/identityContextProjector';
import { createMemoryEmbeddingClientFromSettings } from '../../src/domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../../src/domain/memory/createMemorySummaryClientFromSettings';
import {
  indexActiveNpcMemories,
  NPC_MEMORY_ACTIVE_LIMITS
} from '../../src/domain/memory/npcMemoryLayers';
import { createNarratorClientFromSettings } from '../../src/domain/narrator/createNarratorClientFromSettings';
import { createAuxiliaryGenerationClientFromSettings } from '../../src/domain/news/createAuxiliaryGenerationClientFromSettings';
import { createNpcSimulationClientFromSettings } from '../../src/domain/npc/createNpcSimulationClientFromSettings';
import { IndexedDbSaveRepository } from '../../src/domain/persistence/IndexedDbSaveRepository';
import { stripRuntimeEmbeddingCache } from '../../src/domain/persistence/portableSaveArchive';
import {
  createPortableSaveZip,
  parsePortableSaveZip
} from '../../src/domain/persistence/portableSaveZipArchive';
import type { RuntimeSaveRecord } from '../../src/domain/persistence/SaveRepository';
import { withRuntimeDefaults } from '../../src/domain/runtime/initialState';
import type { CurrentIdentity, GameTime, RuntimeState, TurnApiRoute } from '../../src/domain/runtime/types';
import { importApiSettings } from '../../src/domain/settings/apiSettingsTransfer';
import { createDefaultAiSettings } from '../../src/domain/settings/defaultSettings';
import type { AiSettings } from '../../src/domain/settings/types';
import { runPlayerTurn } from '../../src/domain/turn/TurnEngine';
import { createWritebackRepairClientFromSettings } from '../../src/domain/writeback/createWritebackRepairClientFromSettings';

const shouldRun = process.env.COPV2_RUN_RC3_LONG_SAVE_REAL_API === '1';
const settingsPath = process.env.COPV2_REAL_API_SETTINGS_PATH ?? 'sorry-im-a-cop-v2-api-settings.json';
const savePath = process.env.COPV2_LONG_SAVE_PATH ?? 'tmp/long-save-audit-copy-turn-273.zip';
const requestTimeoutMs = Math.max(30_000, Number(process.env.COPV2_RC3_REQUEST_TIMEOUT_MS ?? 180_000));
const turnDelayMs = Math.max(0, Number(process.env.COPV2_RC3_TURN_DELAY_MS ?? 1200));
const maxAttempts = Math.min(
  5,
  Math.max(2, Math.trunc(Number(process.env.COPV2_RC3_MAX_ATTEMPTS ?? 3)) || 3)
);
const forceFlashFallback = process.env.COPV2_RC3_FORCE_FLASH === '1';
const traceHttp = process.env.COPV2_RC3_TRACE_HTTP === '1';

const CASE_ID = 'case_1984_mongkok_bigcircle_shootout';
const CASE_ACTOR_ID = 'npc_power_power_cid_senior_lau_kai';
const SEEDED_TRACK_ID = 'track_rc3_lau_case_review';

const actions = [
  '离开跑马地公寓，独自返回旺角唐楼住处，洗漱后安静休息到翌日清晨。',
  '清晨独自在家整理个人物品和账目，吃过早餐后查看当天安排。',
  '上午独自步行回旺角警署报到，只处理例行文书和当值准备。'
] as const;

interface HttpAuditEntry {
  route: TurnApiRoute;
  status: number | null;
  responseMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  error?: string;
}

interface TurnAttemptAudit {
  turnIndex: number;
  attempt: number;
  completed: boolean;
  inputStateProtected: boolean;
  fallbackActivated: boolean;
  error?: string;
}

interface TurnSnapshot {
  turnIndex: number;
  turnCounter: number;
  gameTime: GameTime;
  stages: string[];
  identityAccepted: boolean;
  existingActorIdsPreserved: boolean;
  existingOrganizationIdsPreserved: boolean;
  existingRelationshipIdsPreserved: boolean;
  existingCaseIdsPreserved: boolean;
  memoryReferenceFailures: number;
  memoryLimitViolations: number;
  memoryExcessCount: number;
  activeNpcTrackCount: number;
  activeOrganizationTrackCount: number;
  caseReferenceFailures: number;
  pregnancyLifecycleUnchanged: boolean;
  lastBackgroundRun?: {
    status: string;
    selectedReviewKeys: string[];
    appliedPatchCount: number;
    droppedPatchCount: number;
  };
}

interface DateAuditEntry {
  path: string;
  value: GameTime;
  signature: string;
  valid: boolean;
}

function trace(message: string): void {
  if (traceHttp) process.stdout.write(`[rc3-long-save] ${message}\n`);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]')
    .slice(0, 500);
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function hashState(state: RuntimeState): string {
  return createHash('sha256').update(JSON.stringify(state)).digest('hex');
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortJsonValue(item)])
  );
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(JSON.parse(JSON.stringify(value))));
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sortedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).sort();
}

function includesAll(current: string[], required: string[]): boolean {
  const currentSet = new Set(current);
  return required.every((id) => currentSet.has(id));
}

function sleep(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function numberField(record: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function usageFromPayload(payload: unknown): Pick<HttpAuditEntry, 'promptTokens' | 'completionTokens' | 'totalTokens'> {
  if (!payload || typeof payload !== 'object') return {};
  const source = payload as Record<string, unknown>;
  const candidate = source.usage ?? source.usageMetadata ?? source.usage_metadata;
  const usage = candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>) : undefined;
  return {
    promptTokens: numberField(usage, 'prompt_tokens', 'promptTokenCount', 'input_tokens'),
    completionTokens: numberField(usage, 'completion_tokens', 'candidatesTokenCount', 'output_tokens'),
    totalTokens: numberField(usage, 'total_tokens', 'totalTokenCount')
  };
}

function createAuditedFetch(audits: HttpAuditEntry[], route: TurnApiRoute) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = performance.now();
    trace(`http:start route=${route}`);
    try {
      const signals = [init?.signal, AbortSignal.timeout(requestTimeoutMs)].filter(
        (signal): signal is AbortSignal => Boolean(signal)
      );
      const response = await fetch(input, { ...init, signal: AbortSignal.any(signals) });
      const audit: HttpAuditEntry = {
        route,
        status: response.status,
        responseMs: Math.round(performance.now() - startedAt)
      };
      audits.push(audit);
      trace(`http:headers route=${route} status=${response.status}`);

      const recordPayload = (payload: unknown) => {
        Object.assign(audit, usageFromPayload(payload));
        audit.responseMs = Math.round(performance.now() - startedAt);
      };
      const recordBodyError = (error: unknown) => {
        audit.error = safeError(error);
        audit.responseMs = Math.round(performance.now() - startedAt);
      };
      const originalJson = response.json.bind(response);
      response.json = async () => {
        try {
          const payload = await originalJson();
          recordPayload(payload);
          return payload;
        } catch (error) {
          recordBodyError(error);
          throw error;
        }
      };
      const originalText = response.text.bind(response);
      response.text = async () => {
        try {
          const body = await originalText();
          try {
            recordPayload(JSON.parse(body));
          } catch {
            audit.responseMs = Math.round(performance.now() - startedAt);
          }
          return body;
        } catch (error) {
          recordBodyError(error);
          throw error;
        }
      };
      return response;
    } catch (error) {
      audits.push({
        route,
        status: null,
        responseMs: Math.round(performance.now() - startedAt),
        error: safeError(error)
      });
      trace(`http:error route=${route} error=${safeError(error)}`);
      throw error;
    }
  };
}

function createFlashFallbackSettings(settings: AiSettings): AiSettings | null {
  const route = settings.featureRoutes.backgroundEvolution;
  if (route.mode !== 'custom') return null;
  return {
    ...settings,
    mainNarrator: {
      apiProfileId: route.apiProfileId,
      model: route.model,
      maxTokens: Math.max(4096, Math.min(settings.mainNarrator?.maxTokens ?? 8192, 8192)),
      temperature: 0.2
    }
  };
}

function routeMetadata(settings: AiSettings) {
  const route = settings.mainNarrator;
  const profile = settings.apiProfiles.find((item) => item.id === route?.apiProfileId);
  return {
    profileName: profile?.name ?? 'missing',
    interfaceType: profile?.interfaceType ?? 'missing',
    model: route?.model ?? 'missing',
    maxTokens: route?.maxTokens
  };
}

function collectApiProfileReferences(value: unknown, references: string[] = []): string[] {
  if (!value || typeof value !== 'object') return references;
  if (Array.isArray(value)) {
    value.forEach((item) => collectApiProfileReferences(item, references));
    return references;
  }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'apiProfileId' && typeof item === 'string') references.push(item);
    else collectApiProfileReferences(item, references);
  }
  return references;
}

function auditSettingsReferences(settings: AiSettings) {
  const profileIds = new Set(settings.apiProfiles.map((profile) => profile.id));
  const references = [...new Set(collectApiProfileReferences(settings))];
  return {
    referenceCount: references.length,
    missingReferenceCount: references.filter((reference) => !profileIds.has(reference)).length
  };
}

function isGameTimeLike(value: unknown): value is GameTime {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return ['year', 'month', 'day', 'hour', 'minute'].every(
    (key) => typeof item[key] === 'number' && Number.isFinite(item[key])
  );
}

function isValidGameTime(time: GameTime): boolean {
  if (!Number.isInteger(time.year) || time.year < 1) return false;
  if (!Number.isInteger(time.month) || time.month < 1 || time.month > 12) return false;
  if (!Number.isInteger(time.day) || time.day < 1) return false;
  if (!Number.isInteger(time.hour) || time.hour < 0 || time.hour > 23) return false;
  if (!Number.isInteger(time.minute) || time.minute < 0 || time.minute > 59) return false;
  const daysInMonth = new Date(Date.UTC(time.year, time.month, 0)).getUTCDate();
  return time.day <= daysInMonth;
}

function collectDateAudit(value: unknown, pathParts: string[] = [], result: DateAuditEntry[] = []): DateAuditEntry[] {
  if (isGameTimeLike(value)) {
    result.push({
      path: pathParts.join('.'),
      value: { ...value },
      signature: `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`,
      valid: isValidGameTime(value)
    });
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectDateAudit(item, [...pathParts, String(index)], result));
    return result;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) =>
      collectDateAudit(item, [...pathParts, key], result)
    );
  }
  return result;
}

function countBySignature(entries: DateAuditEntry[]): Map<string, number> {
  const result = new Map<string, number>();
  entries.forEach((entry) => result.set(entry.signature, (result.get(entry.signature) ?? 0) + 1));
  return result;
}

function newInvalidDates(before: DateAuditEntry[], after: DateAuditEntry[]): DateAuditEntry[] {
  const remaining = countBySignature(before.filter((entry) => !entry.valid));
  const newEntries: DateAuditEntry[] = [];
  for (const entry of after.filter((candidate) => !candidate.valid)) {
    const count = remaining.get(entry.signature) ?? 0;
    if (count > 0) remaining.set(entry.signature, count - 1);
    else newEntries.push(entry);
  }
  return newEntries;
}

function memoryAudit(state: RuntimeState) {
  const layers = indexActiveNpcMemories(state.memories, { includeHidden: true, includePrivate: true });
  let violations = 0;
  let excessMemoryCount = 0;
  let orphanLayerActorCount = 0;
  let maxShortTerm = 0;
  let maxMidTerm = 0;
  let maxLongTerm = 0;
  for (const [actorId, actorLayers] of layers) {
    if (!state.actors[actorId]) {
      orphanLayerActorCount += 1;
      continue;
    }
    maxShortTerm = Math.max(maxShortTerm, actorLayers.shortTerm.length);
    maxMidTerm = Math.max(maxMidTerm, actorLayers.midTerm.length);
    maxLongTerm = Math.max(maxLongTerm, actorLayers.longTerm.length);
    const shortExcess = Math.max(0, actorLayers.shortTerm.length - NPC_MEMORY_ACTIVE_LIMITS.short_term);
    const midExcess = Math.max(0, actorLayers.midTerm.length - NPC_MEMORY_ACTIVE_LIMITS.mid_term);
    const longExcess = Math.max(0, actorLayers.longTerm.length - NPC_MEMORY_ACTIVE_LIMITS.long_term);
    if (shortExcess > 0) violations += 1;
    if (midExcess > 0) violations += 1;
    if (longExcess > 0) violations += 1;
    excessMemoryCount += shortExcess + midExcess + longExcess;
  }
  const referenceFailures = Object.values(state.memories).reduce(
    (sum, memory) => sum + memory.relatedActorIds.filter((actorId) => !state.actors[actorId]).length,
    0
  );
  const missingActorIds = [...new Set(
    Object.values(state.memories).flatMap((memory) =>
      memory.relatedActorIds.filter((actorId) => !state.actors[actorId])
    )
  )].sort();
  return {
    memoryCount: Object.keys(state.memories).length,
    actorCount: layers.size,
    violations,
    excessMemoryCount,
    orphanLayerActorCount,
    maxShortTerm,
    maxMidTerm,
    maxLongTerm,
    referenceFailures,
    missingActorIds
  };
}

function caseReferenceFailureCount(state: RuntimeState): number {
  let failures = 0;
  for (const caseFile of Object.values(state.cases)) {
    if (caseFile.leadActorId && !state.actors[caseFile.leadActorId]) failures += 1;
    for (const actorId of caseFile.relatedActorIds ?? []) {
      if (!state.actors[actorId]) failures += 1;
    }
    for (const organizationId of caseFile.relatedOrganizationIds ?? []) {
      if (!state.organizations[organizationId]) failures += 1;
    }
  }
  return failures;
}

function pregnancyLifecycleSnapshot(state: RuntimeState) {
  return Object.values(state.actors)
    .flatMap((actor) => {
      const womb = actor.femaleProfile?.adultPrivateProfile?.womb;
      if (!womb) return [];
      return [{
        actorId: actor.actorId,
        pregnancy: womb.pregnancy ?? null,
        recordCount: womb.records.length
      }];
    })
    .sort((left, right) => left.actorId.localeCompare(right.actorId));
}

function identityAccepted(
  state: RuntimeState,
  identity: CurrentIdentity,
  originIdentity: CurrentIdentity,
  identityHistory: RuntimeState['player']['identityHistory']
): boolean {
  const actor = state.actors[state.player.actorId];
  if (!actor) return false;
  const roleKeys = Object.keys(projectPublicActorRoleProfiles(actor)).sort();
  const expectedRole = identity === 'gang_member' ? 'triad' : identity;
  const identityProjection = projectPlayerIdentityContext(state);
  const publicText = JSON.stringify(identityProjection.publicFacts);
  const privateSummaries = [
    ...identityProjection.directorOnlyFacts.map((fact) => fact.summary),
    ...identityProjection.protagonistPrivateKnowledge.facts.map((fact) => fact.summary)
  ].filter(Boolean);
  return (
    state.player.currentIdentity === identity &&
    state.player.originIdentity === originIdentity &&
    sameJson(state.player.identityHistory, identityHistory) &&
    actor.currentIdentity === identity &&
    sameJson(roleKeys, [expectedRole]) &&
    !privateSummaries.some((summary) => publicText.includes(summary))
  );
}

function prepareScheduledCaseState(baseState: RuntimeState): RuntimeState {
  const state = structuredClone(baseState);
  const actor = state.actors[CASE_ACTOR_ID];
  const caseFile = state.cases[CASE_ID];
  if (!actor || !caseFile) throw new Error('The long save is missing the expected 刘启 actor or case.');
  actor.presence = 'absent';
  actor.currentSceneId = undefined;
  actor.statusSummary = '正在旺角警署复核涉案车辆登记与夜班目击证词，等待这一调查节点的真实结论。';
  state.cases[CASE_ID] = {
    ...caseFile,
    status: 'investigating',
    leadActorId: CASE_ACTOR_ID,
    leadActorName: actor.name,
    currentFocus: '复核涉案车辆登记与油麻地夜班目击证词。',
    playerVisibleProgress: '案件由刘启总督察继续主办，当前调查节点尚未形成结论。',
    internalProgressSummary: '刘启正在复核登记和证词；允许出现进展、无果或受阻，不得保证侦破。',
    relatedActorIds: [...new Set([...(caseFile.relatedActorIds ?? []), CASE_ACTOR_ID])],
    activityLog: caseFile.activityLog ?? []
  };
  state.backgroundEvolution = {
    ...state.backgroundEvolution,
    npcTracks: {
      ...state.backgroundEvolution.npcTracks,
      [SEEDED_TRACK_ID]: {
        trackId: SEEDED_TRACK_ID,
        actorId: CASE_ACTOR_ID,
        status: 'active',
        actionKind: 'case',
        objective: '复核涉案车辆登记与油麻地夜班目击证词。',
        currentAction: '在旺角警署核对登记记录和证词时间线。',
        currentStatus: '调查节点已经到期，应如实结算为进展、无果或受阻。',
        currentPlaceId: actor.currentPlaceId ?? 'place_mong_kok_police_station',
        startedAt: addGameHours(state.time, -72),
        expectedEndAt: addGameHours(state.time, -1),
        nextReviewAt: addGameHours(state.time, -1),
        relatedActorIds: [CASE_ACTOR_ID],
        relatedOrganizationIds: actor.organizationIds ?? [],
        relatedPlaceIds: [actor.currentPlaceId ?? 'place_mong_kok_police_station'],
        relatedCaseIds: [CASE_ID],
        relatedRelationshipThreadIds: [],
        relatedCityTrackIds: [],
        relatedDeferredEventIds: [],
        lastEvolvedAt: addGameHours(state.time, -72),
        visibility: 'player_known'
      }
    }
  };
  return state;
}

function gameDateLabel(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

function statusCounts(audits: HttpAuditEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  audits.forEach((audit) => {
    const key = audit.status === null ? 'network_error' : String(audit.status);
    result[key] = (result[key] ?? 0) + 1;
  });
  return result;
}

describe.skipIf(!shouldRun)('RC-3 long-save continuation through real APIs', () => {
  it('continues three turns, runs due background evolution, and survives ZIP plus fresh IndexedDB round-trip', async () => {
    const importedSettings = importApiSettings(createDefaultAiSettings(), await readFile(settingsPath, 'utf8'));
    const settingsAudit = auditSettingsReferences(importedSettings);
    const fallbackSettings = createFlashFallbackSettings(importedSettings);
    let activeSettings = forceFlashFallback && fallbackSettings ? fallbackSettings : importedSettings;
    let fallbackActivated = forceFlashFallback && Boolean(fallbackSettings);

    const sourceBytes = await readFile(savePath);
    const sourceHashBefore = hashBytes(sourceBytes);
    const sourceStat = await stat(savePath);
    const sourceRecords = await parsePortableSaveZip(sourceBytes);
    const sourceRecord = [...sourceRecords].sort((left, right) => right.turnCounter - left.turnCounter)[0];
    if (!sourceRecord) throw new Error('The long-save archive contains no save records.');
    const sourceState = withRuntimeDefaults(sourceRecord.runtimeState);
    const stateBeforeDates = collectDateAudit(sourceState);
    let state = prepareScheduledCaseState(sourceState);

    const initialTurnCounter = state.turnCounter;
    const initialIdentity = state.player.currentIdentity;
    const initialOriginIdentity = state.player.originIdentity;
    const initialIdentityHistory = structuredClone(state.player.identityHistory);
    const initialActorIds = sortedKeys(state.actors);
    const initialOrganizationIds = sortedKeys(state.organizations);
    const initialRelationshipIds = sortedKeys(state.relationshipThreads);
    const initialCaseIds = sortedKeys(state.cases);
    const initialPregnancySnapshot = pregnancyLifecycleSnapshot(state);
    const initialMemoryAudit = memoryAudit(state);
    const initialCaseReferenceFailures = caseReferenceFailureCount(state);

    const audits: HttpAuditEntry[] = [];
    const attempts: TurnAttemptAudit[] = [];
    const snapshots: TurnSnapshot[] = [];
    let fatalError: string | undefined;

    const createClients = () => ({
      narrator: createNarratorClientFromSettings(activeSettings, createAuditedFetch(audits, 'mainNarrator')),
      memoryEmbedding:
        createMemoryEmbeddingClientFromSettings(activeSettings, createAuditedFetch(audits, 'memoryEmbedding')) ??
        undefined,
      memorySummary:
        createMemorySummaryClientFromSettings(activeSettings, createAuditedFetch(audits, 'memorySummary')) ?? undefined,
      writebackRepair:
        createWritebackRepairClientFromSettings(activeSettings, createAuditedFetch(audits, 'writebackRepair')) ??
        undefined,
      npcSimulation:
        createNpcSimulationClientFromSettings(activeSettings, createAuditedFetch(audits, 'npcSimulation')) ?? undefined,
      backgroundEvolution:
        createBackgroundEvolutionClientFromSettings(activeSettings, createAuditedFetch(audits, 'backgroundEvolution')) ??
        undefined,
      auxiliaryGeneration:
        createAuxiliaryGenerationClientFromSettings(activeSettings, createAuditedFetch(audits, 'auxiliaryGeneration')) ??
        undefined
    });

    for (let turnIndex = 0; turnIndex < actions.length; turnIndex += 1) {
      let completed = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const inputHash = hashState(state);
        const auditStart = audits.length;
        const stages: string[] = [];
        try {
          const clients = createClients();
          const nextState = await runPlayerTurn({
            state,
            playerInput: actions[turnIndex],
            ...clients,
            gameSettings: activeSettings.game,
            promptSettings: activeSettings.prompts,
            memoryCompression: activeSettings.memory,
            onStageChange: (stage) => {
              stages.push(stage);
              console.log(`[rc3-long-save] turn=${turnIndex + 1} stage=${stage}`);
            }
          });
          attempts.push({
            turnIndex: turnIndex + 1,
            attempt,
            completed: true,
            inputStateProtected: hashState(state) === inputHash,
            fallbackActivated
          });
          state = nextState;
          const nextMemoryAudit = memoryAudit(state);
          const lastRun = state.backgroundEvolution.lastRun;
          snapshots.push({
            turnIndex: turnIndex + 1,
            turnCounter: state.turnCounter,
            gameTime: { ...state.time },
            stages,
            identityAccepted: identityAccepted(
              state,
              initialIdentity,
              initialOriginIdentity,
              initialIdentityHistory
            ),
            existingActorIdsPreserved: includesAll(sortedKeys(state.actors), initialActorIds),
            existingOrganizationIdsPreserved: includesAll(sortedKeys(state.organizations), initialOrganizationIds),
            existingRelationshipIdsPreserved: includesAll(sortedKeys(state.relationshipThreads), initialRelationshipIds),
            existingCaseIdsPreserved: includesAll(sortedKeys(state.cases), initialCaseIds),
            memoryReferenceFailures: nextMemoryAudit.referenceFailures,
            memoryLimitViolations: nextMemoryAudit.violations,
            memoryExcessCount: nextMemoryAudit.excessMemoryCount,
            activeNpcTrackCount: Object.keys(state.backgroundEvolution.npcTracks).length,
            activeOrganizationTrackCount: Object.keys(state.backgroundEvolution.organizationTracks).length,
            caseReferenceFailures: caseReferenceFailureCount(state),
            pregnancyLifecycleUnchanged: sameJson(pregnancyLifecycleSnapshot(state), initialPregnancySnapshot),
            lastBackgroundRun: lastRun
              ? {
                  status: lastRun.status,
                  selectedReviewKeys: [...lastRun.selectedReviewKeys],
                  appliedPatchCount: lastRun.appliedPatchCount,
                  droppedPatchCount: lastRun.droppedPatchCount
                }
              : undefined
          });
          console.log(
            `[rc3-long-save] turn=${turnIndex + 1} completed runtimeTurn=${state.turnCounter} background=${lastRun?.status ?? 'none'}`
          );
          completed = true;
          await sleep(turnDelayMs);
          break;
        } catch (error) {
          const inputStateProtected = hashState(state) === inputHash;
          const failedAudits = audits.slice(auditStart);
          const mainFailure = [...failedAudits]
            .reverse()
            .find((entry) => entry.route === 'mainNarrator' && (entry.status === null || entry.status >= 500));
          if (!fallbackActivated && fallbackSettings && mainFailure) {
            activeSettings = fallbackSettings;
            fallbackActivated = true;
            console.log(`[rc3-long-save] turn=${turnIndex + 1} activating in-memory flash fallback`);
          }
          attempts.push({
            turnIndex: turnIndex + 1,
            attempt,
            completed: false,
            inputStateProtected,
            fallbackActivated,
            error: safeError(error)
          });
          console.log(`[rc3-long-save] turn=${turnIndex + 1} attempt=${attempt} error=${safeError(error)}`);
          if (!inputStateProtected) {
            fatalError = `Failed attempt mutated the input state on turn ${turnIndex + 1}.`;
            break;
          }
          if (attempt < maxAttempts) await sleep(Math.max(turnDelayMs, 1500));
        }
      }
      if (!completed) {
        fatalError ??= `Turn ${turnIndex + 1} did not complete after ${maxAttempts} attempts.`;
        break;
      }
    }

    const completedTurns = snapshots.length;
    const finalMemoryAudit = memoryAudit(state);
    const finalDateAudit = collectDateAudit(state);
    const newlyInvalidDates = newInvalidDates(stateBeforeDates, finalDateAudit);
    const backgroundRunAccepted = snapshots.some(
      (snapshot) =>
        snapshot.stages.includes('evolving_background') &&
        snapshot.lastBackgroundRun?.status === 'succeeded' &&
        snapshot.lastBackgroundRun.appliedPatchCount > 0 &&
        snapshot.lastBackgroundRun.selectedReviewKeys.some((reviewKey) => reviewKey.includes(SEEDED_TRACK_ID))
    );

    const exportedAt = new Date().toISOString();
    const continuedRecord: RuntimeSaveRecord = {
      ...sourceRecord,
      saveId: `${sourceRecord.saveId}-rc3-continuation`,
      saveName: 'RC-3 长期档隔离续玩',
      saveKind: 'manual',
      updatedAt: exportedAt,
      gameDateLabel: gameDateLabel(state.time),
      turnCounter: state.turnCounter,
      runtimeState: state
    };

    let exportedZipBytes: Uint8Array | undefined;
    let reimportedRecord: RuntimeSaveRecord | undefined;
    let indexedDbRecord: RuntimeSaveRecord | null = null;
    let roundTripError: string | undefined;
    const dbName = `copv2-rc3-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      exportedZipBytes = await createPortableSaveZip([continuedRecord], exportedAt);
      const imported = await parsePortableSaveZip(exportedZipBytes);
      reimportedRecord = imported[0];
      if (!reimportedRecord) throw new Error('The exported RC-3 ZIP contained no save record.');
      const repository = new IndexedDbSaveRepository(dbName);
      await repository.saveMany(imported);
      indexedDbRecord = await repository.load(reimportedRecord.saveId);
    } catch (error) {
      roundTripError = safeError(error);
    } finally {
      await deleteDatabase(dbName);
    }

    const expectedPortableState = stripRuntimeEmbeddingCache(state);
    const zipStateMatches = Boolean(
      reimportedRecord && sameJson(reimportedRecord.runtimeState, expectedPortableState)
    );
    const indexedDbStateMatches = Boolean(
      indexedDbRecord && reimportedRecord && sameJson(indexedDbRecord, reimportedRecord)
    );
    const roundTripIdSetsMatch = Boolean(
      reimportedRecord &&
        sameJson(sortedKeys(reimportedRecord.runtimeState.actors), sortedKeys(expectedPortableState.actors)) &&
        sameJson(sortedKeys(reimportedRecord.runtimeState.organizations), sortedKeys(expectedPortableState.organizations)) &&
        sameJson(
          sortedKeys(reimportedRecord.runtimeState.relationshipThreads),
          sortedKeys(expectedPortableState.relationshipThreads)
        ) &&
        sameJson(sortedKeys(reimportedRecord.runtimeState.cases), sortedKeys(expectedPortableState.cases))
    );
    const roundTripPregnancyMatches = Boolean(
      reimportedRecord &&
        sameJson(pregnancyLifecycleSnapshot(reimportedRecord.runtimeState), pregnancyLifecycleSnapshot(state))
    );
    const roundTripSettingsReferencesMatch = Boolean(
      reimportedRecord &&
        reimportedRecord.worldpackId === sourceRecord.worldpackId &&
        reimportedRecord.runtimeState.world.worldpackId === state.world.worldpackId
    );

    const sourceHashAfter = hashBytes(await readFile(savePath));
    const sourceArchiveUnchanged = sourceHashBefore === sourceHashAfter;
    const allTurnBoundariesAccepted = snapshots.every(
      (snapshot) =>
        snapshot.identityAccepted &&
        snapshot.existingActorIdsPreserved &&
        snapshot.existingOrganizationIdsPreserved &&
        snapshot.existingRelationshipIdsPreserved &&
        snapshot.existingCaseIdsPreserved &&
        snapshot.memoryReferenceFailures <= initialMemoryAudit.referenceFailures &&
        snapshot.memoryExcessCount <= initialMemoryAudit.excessMemoryCount &&
        snapshot.activeNpcTrackCount <= 8 &&
        snapshot.activeOrganizationTrackCount <= 12 &&
        snapshot.caseReferenceFailures <= initialCaseReferenceFailures &&
        snapshot.pregnancyLifecycleUnchanged
    ) && finalMemoryAudit.violations === 0;
    const allFailedAttemptsProtected = attempts
      .filter((attempt) => !attempt.completed)
      .every((attempt) => attempt.inputStateProtected);
    const backgroundHttpSucceeded = audits.some(
      (audit) => audit.route === 'backgroundEvolution' && audit.status !== null && audit.status >= 200 && audit.status < 300
    );

    const generatedAt = new Date().toISOString();
    const outputDirectory = path.resolve('output', 'rc3-long-save');
    await mkdir(outputDirectory, { recursive: true });
    const timestamp = generatedAt.replace(/[:.]/g, '-');
    let exportedZipPath: string | undefined;
    if (exportedZipBytes) {
      exportedZipPath = path.join(outputDirectory, `rc3-continuation-${timestamp}.zip`);
      await writeFile(exportedZipPath, exportedZipBytes);
    }
    const report = {
      test: 'rc3-long-save-continuation-real-api',
      generatedAt,
      source: {
        path: path.basename(savePath),
        bytes: sourceStat.size,
        turnCounter: sourceRecord.turnCounter,
        sha256Before: sourceHashBefore,
        sha256After: sourceHashAfter,
        unchanged: sourceArchiveUnchanged
      },
      settings: {
        references: settingsAudit,
        configuredMainRoute: routeMetadata(importedSettings),
        activeMainRoute: routeMetadata(activeSettings),
        fallbackActivated
      },
      setup: {
        seededTrackId: SEEDED_TRACK_ID,
        seededActorId: CASE_ACTOR_ID,
        seededCaseId: CASE_ID,
        note: 'A current-schema due NPC case track was added only to the isolated in-memory copy; legacy invalid city dates were not rewritten.'
      },
      summary: {
        fatalError,
        requiredTurns: actions.length,
        completedTurns,
        initialTurnCounter,
        finalTurnCounter: state.turnCounter,
        backgroundRunAccepted,
        backgroundHttpSucceeded,
        allTurnBoundariesAccepted,
        allFailedAttemptsProtected,
        newInvalidDateCount: newlyInvalidDates.length,
        sourceArchiveUnchanged,
        zipStateMatches,
        indexedDbStateMatches,
        roundTripIdSetsMatch,
        roundTripPregnancyMatches,
        roundTripSettingsReferencesMatch,
        roundTripError
      },
      dateAudit: {
        sourceInvalidCount: stateBeforeDates.filter((entry) => !entry.valid).length,
        finalInvalidCount: finalDateAudit.filter((entry) => !entry.valid).length,
        newlyInvalid: newlyInvalidDates.map((entry) => ({ path: entry.path, signature: entry.signature }))
      },
      memoryAudit: {
        before: initialMemoryAudit,
        after: finalMemoryAudit,
        newMissingActorIds: finalMemoryAudit.missingActorIds.filter(
          (actorId) => !initialMemoryAudit.missingActorIds.includes(actorId)
        )
      },
      turns: snapshots,
      attempts,
      roundTrip: {
        exportedZipFile: exportedZipPath ? path.basename(exportedZipPath) : undefined,
        exportedZipBytes: exportedZipBytes?.length,
        importedTurnCounter: reimportedRecord?.turnCounter,
        indexedDbTurnCounter: indexedDbRecord?.turnCounter
      },
      http: {
        requestCount: audits.length,
        statusCounts: statusCounts(audits),
        tokenTotals: {
          prompt: audits.reduce((sum, audit) => sum + (audit.promptTokens ?? 0), 0),
          completion: audits.reduce((sum, audit) => sum + (audit.completionTokens ?? 0), 0),
          total: audits.reduce((sum, audit) => sum + (audit.totalTokens ?? 0), 0)
        },
        requests: audits
      }
    };
    const reportPath = path.join(outputDirectory, `rc3-acceptance-${timestamp}.json`);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[rc3-long-save] report=${reportPath}`);

    expect(fatalError).toBeUndefined();
    expect(completedTurns).toBe(actions.length);
    expect(state.turnCounter).toBe(initialTurnCounter + actions.length);
    expect(backgroundRunAccepted).toBe(true);
    expect(backgroundHttpSucceeded).toBe(true);
    expect(allTurnBoundariesAccepted).toBe(true);
    expect(allFailedAttemptsProtected).toBe(true);
    expect(newlyInvalidDates).toEqual([]);
    expect(settingsAudit.missingReferenceCount).toBe(0);
    expect(sourceArchiveUnchanged).toBe(true);
    expect(zipStateMatches).toBe(true);
    expect(indexedDbStateMatches).toBe(true);
    expect(roundTripIdSetsMatch).toBe(true);
    expect(roundTripPregnancyMatches).toBe(true);
    expect(roundTripSettingsReferencesMatch).toBe(true);
    expect(roundTripError).toBeUndefined();
  }, 3_600_000);
});

import type { NarratorResponse } from '../writeback/schema';
import type { RuntimeState } from '../runtime/types';
import {
  dramaSourceKey,
  type DramaExecutionTrace,
  type DramaPlanningContext,
  type DramaPlanningDiagnostic,
  type DramaPlan,
  type DramaWritebackRef,
  type CustomEventProgressTrace,
  type NarrativeArcProgressTrace,
  type NarrativeArcInstance
} from './types';
import {
  normalizeNarrativeArcs
} from './narrativeArc';
import {
  buildNarrativeArcWritebackReferenceAudit,
  detectNarrativeArcProgressConflicts,
  evaluateNarrativeArcProgress,
  type NarrativeArcProgressValidationResult
} from './narrativeArcProgressValidation';
import type { NarrativeArcProgressValidationDiagnostic } from './types';

type WritebackArrayRule = {
  property: string;
  kind: string;
  idPaths: string[][];
};

const writebackArrayRules: WritebackArrayRule[] = [
  { property: 'actorPatches', kind: 'actor', idPaths: [['actorId']] },
  { property: 'actorMemories', kind: 'actor_memory', idPaths: [['actorId']] },
  { property: 'secretFactPatches', kind: 'secret_fact', idPaths: [['secretId'], ['fact', 'secretId']] },
  { property: 'placePatches', kind: 'place', idPaths: [['placeId']] },
  { property: 'scenePatches', kind: 'scene', idPaths: [['sceneId']] },
  { property: 'casePatches', kind: 'case', idPaths: [['caseId']] },
  { property: 'caseEvidencePatches', kind: 'case_evidence', idPaths: [['evidenceId']] },
  { property: 'deferredEventPatches', kind: 'deferred_event', idPaths: [['eventId']] },
  { property: 'currentMatterPatches', kind: 'current_matter', idPaths: [['id']] },
  { property: 'signalPatches', kind: 'signal', idPaths: [['id']] },
  { property: 'newsIssuePatches', kind: 'news_issue', idPaths: [['id']] },
  { property: 'organizationPatches', kind: 'organization', idPaths: [['organizationId']] },
  { property: 'citySituationTrackPatches', kind: 'city_situation_track', idPaths: [['trackId']] },
  { property: 'judgementCheckPatches', kind: 'judgement_check', idPaths: [['checkId']] },
  { property: 'combatEventPatches', kind: 'combat_event', idPaths: [['combatId']] },
  { property: 'relationshipThreadPatches', kind: 'relationship_thread', idPaths: [['threadId']] },
  { property: 'pregnancyRiskPatches', kind: 'pregnancy_risk', idPaths: [['actorId']] },
  { property: 'pregnancyResolutionPatches', kind: 'pregnancy_resolution', idPaths: [['actorId']] },
  { property: 'grayNetworkPatches', kind: 'gray_network', idPaths: [['areaId']] }
];

const scalarWritebackKindAliases: Record<string, string> = {
  playerPatch: 'player',
  identityContextPatch: 'identity_context',
  policeRoleProfilePatch: 'police_role_profile',
  civilianRoleProfilePatch: 'civilian_role_profile',
  locationPatch: 'location',
  weatherPatch: 'weather',
  assetPatch: 'asset',
  financePatch: 'finance',
  grayLedgerPatch: 'gray_ledger'
};

const writebackKindAliases = new Map<string, string>([
  ...writebackArrayRules.map((rule) => [rule.property, rule.kind] as const),
  ...Object.entries(scalarWritebackKindAliases)
]);

const actorIdWritebackKinds = new Set([
  'actor',
  'actor_memory',
  'pregnancy_risk',
  'pregnancy_resolution'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringPath(value: unknown, path: string[]): string | undefined {
  let current = value;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return typeof current === 'string' && current.trim().length > 0 ? current : undefined;
}

function writebackRefKey(ref: DramaWritebackRef): string {
  return `${ref.kind}:${ref.id}`;
}

function normalizeDramaWritebackRef(ref: DramaWritebackRef): DramaWritebackRef {
  return {
    kind: writebackKindAliases.get(ref.kind) ?? ref.kind,
    id: ref.id
  };
}

function uniqueWritebackRefs(refs: DramaWritebackRef[]): DramaWritebackRef[] {
  return Array.from(new Map(refs.map((ref) => [writebackRefKey(ref), ref])).values());
}

function resolveActorIdAlias(
  actorId: string,
  actorIdAliases: Readonly<Record<string, string>>
): string {
  const visited = new Set<string>();
  let current = actorId;
  while (actorIdAliases[current] && !visited.has(current)) {
    visited.add(current);
    current = actorIdAliases[current];
  }
  return current;
}

function canonicalizeDramaWritebackRef(
  ref: DramaWritebackRef,
  actorIdAliases: Readonly<Record<string, string>>
): DramaWritebackRef {
  const normalized = normalizeDramaWritebackRef(ref);
  if (!actorIdWritebackKinds.has(normalized.kind)) return normalized;
  return {
    ...normalized,
    id: resolveActorIdAlias(normalized.id, actorIdAliases)
  };
}

function collectRawNarratorWritebackRefs(
  rawResponse: unknown,
  fallback: DramaWritebackRef[]
): DramaWritebackRef[] {
  if (typeof rawResponse !== 'string' || !rawResponse.trim()) return fallback;
  try {
    const parsed = JSON.parse(rawResponse) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.writeback)) return fallback;
    return collectDramaWritebackRefs(parsed.writeback as NarratorResponse['writeback']);
  } catch {
    // Raw text is intentionally not retained. If it cannot be parsed here,
    // use the already schema-validated set rather than guessing.
    return fallback;
  }
}

function normalizeCustomEventProgress(
  progress: CustomEventProgressTrace,
  actorIdAliases: Readonly<Record<string, string>> = {}
): CustomEventProgressTrace {
  return {
    ...progress,
    usedNodeIds: Array.from(new Set(progress.usedNodeIds)),
    supportingWritebackRefs: uniqueWritebackRefs(
      progress.supportingWritebackRefs.map((ref) =>
        canonicalizeDramaWritebackRef(ref, actorIdAliases)
      )
    ),
    factStateChanges: progress.factStateChanges.map((change) => ({
      ...change,
      supportingWritebackRefs: uniqueWritebackRefs(
        change.supportingWritebackRefs.map((ref) =>
          canonicalizeDramaWritebackRef(ref, actorIdAliases)
        )
      )
    }))
  };
}

function progressRefsAreSubset(
  progress: CustomEventProgressTrace,
  allowedWritebackKeys: Set<string>
): boolean {
  return (
    writebackRefsAreSubset(progress.supportingWritebackRefs, allowedWritebackKeys) &&
    progress.factStateChanges.every((change) =>
      writebackRefsAreSubset(change.supportingWritebackRefs, allowedWritebackKeys)
    )
  );
}

function writebackRefsAreSubset(
  refs: readonly DramaWritebackRef[],
  allowedWritebackKeys: Set<string>
): boolean {
  return refs.every((ref) => allowedWritebackKeys.has(writebackRefKey(ref)));
}

function normalizeNarrativeArcProgress(
  progress: NarrativeArcProgressTrace,
  actorIdAliases: Readonly<Record<string, string>> = {}
): NarrativeArcProgressTrace {
  return {
    ...progress,
    sourceRef: { ...progress.sourceRef },
    usedNodeIds: Array.from(new Set(progress.usedNodeIds)),
    supportingWritebackRefs: uniqueWritebackRefs(
      progress.supportingWritebackRefs.map((ref) =>
        canonicalizeDramaWritebackRef(ref, actorIdAliases)
      )
    )
  };
}

function narrativeArcProgressRefsAreSubset(
  progress: NarrativeArcProgressTrace,
  allowedWritebackKeys: Set<string>
): boolean {
  return writebackRefsAreSubset(progress.supportingWritebackRefs, allowedWritebackKeys);
}

function actorMemoriesFor(
  state: RuntimeState,
  actorId: string
): RuntimeState['memories'][string][] {
  return Object.values(state.memories).filter(
    (memory) =>
      memory.kind === 'actor' && memory.relatedActorIds.includes(actorId)
  );
}

function runtimeValueForRef(
  state: RuntimeState,
  ref: DramaWritebackRef
): unknown {
  switch (ref.kind) {
    case 'actor':
      return state.actors[ref.id];
    case 'actor_memory':
      return actorMemoriesFor(state, ref.id);
    case 'secret_fact':
      return state.secretFacts[ref.id];
    case 'place':
      return state.places[ref.id];
    case 'scene':
      return state.scenes[ref.id];
    case 'case':
      return state.cases[ref.id];
    case 'case_evidence':
      return state.caseEvidence[ref.id];
    case 'deferred_event':
      return state.deferredEvents[ref.id];
    case 'current_matter':
      return state.dynamicEvents.currentMatters[ref.id];
    case 'signal':
      return state.dynamicEvents.signals[ref.id];
    case 'news_issue':
      return state.dynamicEvents.newsIssues[ref.id];
    case 'organization':
      return state.organizations[ref.id];
    case 'city_situation_track':
      return state.citySituationTracks[ref.id];
    case 'judgement_check':
      return state.judgementChecks[ref.id];
    case 'combat_event':
      return state.combatEvents[ref.id];
    case 'relationship_thread':
      return state.relationshipThreads[ref.id];
    case 'pregnancy_risk':
    case 'pregnancy_resolution':
      return state.actors[ref.id]?.femaleProfile?.adultPrivateProfile;
    case 'gray_network':
      return state.grayNetworks.byAreaId[ref.id];
    case 'player':
    case 'civilian_role_profile':
      return ref.id === 'player' ? state.player : undefined;
    case 'identity_context':
      return ref.id === 'player'
        ? {
            playerIdentity: state.player.currentIdentity,
            lawIdentity: state.lawIdentity
          }
        : undefined;
    case 'location':
      return ref.id === 'player' ? state.location : undefined;
    case 'weather':
      return ref.id === 'world' ? state.environment.weather : undefined;
    case 'asset':
      return ref.id === 'player' ? state.assets : undefined;
    case 'finance':
      return ref.id === 'player' ? state.finance : undefined;
    case 'gray_ledger':
      return ref.id === 'player' ? state.grayLedger : undefined;
    default:
      return undefined;
  }
}

export function wasDramaWritebackRefApplied(
  before: RuntimeState,
  after: RuntimeState,
  ref: DramaWritebackRef
): boolean {
  const beforeValue = runtimeValueForRef(before, ref);
  const afterValue = runtimeValueForRef(after, ref);
  if (afterValue === undefined) return false;
  return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
}

export function reconcileDramaExecutionTraceAfterWriteback({
  stateBeforeWriteback,
  stateAfterWriteback,
  trace,
  context,
  plan,
  existingNarrativeArcs,
  includeNarrativeArcProgressAudit = false,
  requestId,
  turnId
}: {
  stateBeforeWriteback: RuntimeState;
  stateAfterWriteback: RuntimeState;
  trace?: DramaExecutionTrace;
  context?: DramaPlanningContext;
  plan?: DramaPlan;
  existingNarrativeArcs?: readonly NarrativeArcInstance[];
  includeNarrativeArcProgressAudit?: boolean;
  requestId?: string;
  turnId?: string;
}): {
  trace?: DramaExecutionTrace;
  diagnostics: DramaPlanningDiagnostic[];
  narrativeArcProgressAudits?: NarrativeArcProgressValidationDiagnostic[];
} {
  if (!trace || trace.status !== 'used_persistently') {
    return { trace, diagnostics: [] };
  }
  const actorIdAliases = stateAfterWriteback.actorIdAliases ?? {};
  const canonicalizeWritebackRef = (ref: DramaWritebackRef) =>
    canonicalizeDramaWritebackRef(ref, actorIdAliases);
  const canonicalResultingWritebackRefs = uniqueWritebackRefs(
    trace.resultingWritebackRefs.map(canonicalizeWritebackRef)
  );
  const resultingWritebackRefs = canonicalResultingWritebackRefs.filter((ref) =>
    wasDramaWritebackRefApplied(
      stateBeforeWriteback,
      stateAfterWriteback,
      ref
    )
  );
  const appliedWritebackKeys = new Set(resultingWritebackRefs.map(writebackRefKey));
  const normalizedCustomEventProgress = trace.customEventProgress?.map((progress) =>
    normalizeCustomEventProgress(progress, actorIdAliases)
  );
  const customEventProgress = normalizedCustomEventProgress?.filter((progress) =>
    progressRefsAreSubset(progress, appliedWritebackKeys)
  );
  const normalizedNarrativeArcProgress = trace.narrativeArcProgress?.map((progress) =>
    normalizeNarrativeArcProgress(progress, actorIdAliases)
  );
  let narrativeArcProgress = normalizedNarrativeArcProgress?.filter((progress) =>
    narrativeArcProgressRefsAreSubset(progress, appliedWritebackKeys)
  );
  const narrativeArcProgressAudits: NarrativeArcProgressValidationDiagnostic[] = [];
  if (includeNarrativeArcProgressAudit && context && trace.narrativeArcProgress) {
    const selectedSourceKeys = new Set(
      [plan?.primarySource, ...(plan?.supportSources ?? [])]
        .filter((ref): ref is NonNullable<DramaPlan['primarySource']> => Boolean(ref))
        .map(dramaSourceKey)
    );
    const usedSourceKeys = new Set(trace.usedSourceRefs.map(dramaSourceKey));
    const audit = buildNarrativeArcWritebackReferenceAudit({
      rawResponseRefs: canonicalResultingWritebackRefs,
      schemaValidatedRefs: canonicalResultingWritebackRefs,
      acceptedWritebackRefs: canonicalResultingWritebackRefs,
      appliedWritebackRefs: resultingWritebackRefs,
      appliedCheckAvailable: true
    });
    const acceptedProgress: NarrativeArcProgressTrace[] = [];
    trace.narrativeArcProgress.forEach((progress) => {
      const result = evaluateNarrativeArcProgress({
        candidate: progress,
        context,
        existingNarrativeArcs: existingNarrativeArcs ?? normalizeNarrativeArcs(stateBeforeWriteback.narrativeArcs),
        status: trace.status,
        selectedSourceKeys,
        usedSourceKeys,
        writebackAudit: audit,
        canonicalizeWritebackRef,
        requestId,
        turnId
      });
      narrativeArcProgressAudits.push(result.diagnostic);
      if (result.accepted && result.normalizedProgress) {
        acceptedProgress.push(result.normalizedProgress);
      }
    });
    narrativeArcProgress = acceptedProgress;
  }
  const customProgressUnchanged =
    (customEventProgress?.length ?? 0) ===
    (trace.customEventProgress?.length ?? 0);
  const narrativeArcProgressUnchanged =
    (narrativeArcProgress?.length ?? 0) ===
    (trace.narrativeArcProgress?.length ?? 0);
  const progressUnchanged = customProgressUnchanged && narrativeArcProgressUnchanged;
  const traceWithCanonicalRefs: DramaExecutionTrace = {
    ...trace,
    resultingWritebackRefs,
    ...(trace.customEventProgress
      ? { customEventProgress: customEventProgress ?? [] }
      : {}),
    ...(trace.narrativeArcProgress
      ? { narrativeArcProgress: narrativeArcProgress ?? [] }
      : {})
  };
  if (
    resultingWritebackRefs.length === canonicalResultingWritebackRefs.length &&
    progressUnchanged
  ) {
    return {
      trace: traceWithCanonicalRefs,
      diagnostics: [],
      ...(narrativeArcProgressAudits.length > 0
        ? { narrativeArcProgressAudits }
        : {})
    };
  }
  const ignoredRefs = canonicalResultingWritebackRefs.filter(
    (ref) =>
      !resultingWritebackRefs.some(
        (candidate) => writebackRefKey(candidate) === writebackRefKey(ref)
      )
  );
  const diagnostics: DramaPlanningDiagnostic[] = [];
  if (ignoredRefs.length > 0) {
    diagnostics.push({
      code: 'execution_trace_writeback_not_applied',
      message: `戏剧执行回执中的写回未实际进入运行时状态：${ignoredRefs
        .map(writebackRefKey)
        .join('、')}；已从最终执行回执移除。`,
      turnCounter: stateAfterWriteback.turnCounter
    });
  }
  if (!customProgressUnchanged) {
    diagnostics.push({
      code: 'execution_trace_custom_progress_invalid',
      message:
        '自定义事件进度引用的结构化写回没有实际进入运行时，相关进度已取消。',
      turnCounter: stateAfterWriteback.turnCounter
    });
  }
  if (narrativeArcProgressAudits.length > 0) {
    for (const audit of narrativeArcProgressAudits) {
      if (audit.accepted) continue;
      diagnostics.push({
        code: 'execution_trace_narrative_arc_progress_invalid',
        message: `剧情弧进度回执在运行时应用后被拒绝：${audit.rejectionReasons.join(',')}。`,
        turnCounter: stateAfterWriteback.turnCounter,
        narrativeArcProgressAudit: audit
      });
    }
  }
  return {
    trace: {
      ...traceWithCanonicalRefs,
      status:
        resultingWritebackRefs.length > 0
          ? 'used_persistently'
          : trace.usedSourceRefs.length > 0
            ? 'used_as_texture'
            : 'not_used',
      resultingWritebackRefs
    },
    diagnostics,
    ...(narrativeArcProgressAudits.length > 0
      ? { narrativeArcProgressAudits }
      : {})
  };
}

export function collectDramaWritebackRefs(
  writeback: NarratorResponse['writeback']
): DramaWritebackRef[] {
  const refs: DramaWritebackRef[] = [];
  for (const rule of writebackArrayRules) {
    const values = (writeback as unknown as Record<string, unknown>)[rule.property];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const id = rule.idPaths
        .map((path) => readStringPath(value, path))
        .find((candidate): candidate is string => Boolean(candidate));
      if (id) refs.push({ kind: rule.kind, id });
    }
  }
  if (writeback.playerPatch) refs.push({ kind: 'player', id: 'player' });
  if (writeback.identityContextPatch) refs.push({ kind: 'identity_context', id: 'player' });
  if (writeback.policeRoleProfilePatch) refs.push({ kind: 'police_role_profile', id: 'player' });
  if (writeback.civilianRoleProfilePatch) refs.push({ kind: 'civilian_role_profile', id: 'player' });
  if (writeback.locationPatch) refs.push({ kind: 'location', id: 'player' });
  if (writeback.weatherPatch) refs.push({ kind: 'weather', id: 'world' });
  if (writeback.assetPatch) refs.push({ kind: 'asset', id: 'player' });
  if (writeback.financePatch) refs.push({ kind: 'finance', id: 'player' });
  if (writeback.grayLedgerPatch) refs.push({ kind: 'gray_ledger', id: 'player' });
  return uniqueWritebackRefs(refs);
}

export function validateDramaExecutionTrace({
  response,
  context,
  plan,
  existingNarrativeArcs,
  includeNarrativeArcProgressAudit = false,
  requestId,
  turnId,
  rawResponse
}: {
  response: NarratorResponse;
  context: DramaPlanningContext;
  plan?: DramaPlan;
  existingNarrativeArcs?: readonly NarrativeArcInstance[];
  includeNarrativeArcProgressAudit?: boolean;
  requestId?: string;
  turnId?: string;
  rawResponse?: unknown;
}): {
  trace?: DramaExecutionTrace;
  diagnostics: DramaPlanningDiagnostic[];
  narrativeArcProgressAudits?: NarrativeArcProgressValidationDiagnostic[];
} {
  const trace = response.dramaExecutionTrace;
  if (!trace) {
    const diagnostics: DramaPlanningDiagnostic[] = [{
      code: 'execution_trace_missing',
      message: '主叙事没有返回本回合的 DramaExecutionTrace；正文与合法写回已保留。',
      turnCounter: context.turnCounter
    }];
    const officialPrimarySource =
      plan?.mode !== 'quiet' && plan?.primarySource?.providerId === 'official-dlc'
        ? plan.primarySource
        : undefined;
    if (plan && officialPrimarySource) {
      diagnostics.push({
        code: 'execution_trace_official_dlc_exposure_recovered',
        message: '本回合已明确选中官方 DLC 主来源，但模型漏写执行回执；本地仅恢复纹理曝光凭证，不补造世界写回或阶段进度。',
        turnCounter: context.turnCounter
      });
      return {
        trace: {
          planId: plan.planId,
          status: 'used_as_texture',
          usedSourceRefs: [{ ...officialPrimarySource }],
          resultingWritebackRefs: []
        },
        diagnostics
      };
    }
    return {
      diagnostics
    };
  }
  const diagnostics: DramaPlanningDiagnostic[] = [];
  if (!plan) {
    return {
      diagnostics: [{
        code: 'execution_trace_plan_mismatch',
        message: '本回合没有通过校验的 DramaPlan，已忽略主叙事返回的执行回执。',
        turnCounter: context.turnCounter
      }]
    };
  }
  const expectedPlanId = plan.planId;
  if (trace.planId !== expectedPlanId) {
    return {
      diagnostics: [{
        code: 'execution_trace_plan_mismatch',
        message: `主叙事回报的 planId "${trace.planId}" 与本回合 "${expectedPlanId}" 不一致。`,
        turnCounter: context.turnCounter
      }]
    };
  }

  const allowedSourceKeys = new Set(
    [plan.primarySource, ...plan.supportSources]
      .filter((ref): ref is NonNullable<DramaPlan['primarySource']> => Boolean(ref))
      .map(dramaSourceKey)
  );
  const validSourceRefs = trace.usedSourceRefs.filter(
    (ref) => allowedSourceKeys.has(dramaSourceKey(ref))
  );
  const invalidSourceRefs = trace.usedSourceRefs.filter(
    (ref) => !allowedSourceKeys.has(dramaSourceKey(ref))
  );
  if (invalidSourceRefs[0]) {
    diagnostics.push({
      code: 'execution_trace_source_missing',
      message: `主叙事回报了当前计划未选择的来源：${invalidSourceRefs
        .map(dramaSourceKey)
        .join('、')}；无效来源已从执行回执移除。`,
      turnCounter: context.turnCounter
    });
  }

  const actualWritebackKeys = new Set(
    collectDramaWritebackRefs(response.writeback).map(writebackRefKey)
  );
  const normalizedWritebackRefs = trace.resultingWritebackRefs.map((ref) => ({
    original: ref,
    normalized: normalizeDramaWritebackRef(ref)
  }));
  const validWritebackRefs = uniqueWritebackRefs(
    normalizedWritebackRefs
      .filter(({ normalized }) => actualWritebackKeys.has(writebackRefKey(normalized)))
      .map(({ normalized }) => normalized)
  );
  const invalidWritebackRefs = normalizedWritebackRefs
    .filter(({ normalized }) => !actualWritebackKeys.has(writebackRefKey(normalized)))
    .map(({ original }) => original);
  if (invalidWritebackRefs[0]) {
    diagnostics.push({
      code: 'execution_trace_writeback_missing',
      message: `戏剧执行回报引用了本回合并未提交的写回：${invalidWritebackRefs
        .map(writebackRefKey)
        .join('、')}；无效引用已从执行回执移除。`,
      turnCounter: context.turnCounter
    });
  }

  const persistentWithoutWriteback =
    trace.status === 'used_persistently' && validWritebackRefs.length === 0;
  const nonPersistentWithWriteback =
    trace.status !== 'used_persistently' && validWritebackRefs.length > 0;
  const unusedWithSources =
    trace.status === 'not_used' && validSourceRefs.length > 0;
  if (persistentWithoutWriteback || nonPersistentWithWriteback || unusedWithSources) {
    diagnostics.push({
      code: 'execution_trace_status_invalid',
      message: persistentWithoutWriteback
        ? '戏剧执行标记为持久使用，但没有可确认的实际写回引用；已按实际结果降级。'
        : nonPersistentWithWriteback
          ? '非持久使用的戏剧执行声明了持久写回引用；引用已移除。'
          : 'not_used 回执声明了已经使用的来源；已按实际来源修正为纹理使用。',
      turnCounter: context.turnCounter
    });
  }

  const usedSourceRefs = trace.status === 'not_used' && validSourceRefs.length === 0
    ? []
    : validSourceRefs;
  const resultingWritebackRefs =
    trace.status === 'used_persistently' && usedSourceRefs.length > 0
      ? validWritebackRefs
      : [];
  const status: DramaExecutionTrace['status'] =
    resultingWritebackRefs.length > 0
      ? 'used_persistently'
      : usedSourceRefs.length > 0
        ? trace.status === 'partially_used'
          ? 'partially_used'
          : 'used_as_texture'
        : 'not_used';
  const usedCustomEventInstanceIds = new Set(
    usedSourceRefs
      .filter(
        (ref) =>
          ref.providerId === 'custom-event-group' &&
          ref.sourceType === 'custom_event_group_instance'
      )
      .map((ref) => ref.sourceId)
  );
  const validWritebackKeys = new Set(resultingWritebackRefs.map(writebackRefKey));
  const normalizedCustomEventProgress = trace.customEventProgress?.map((progress) =>
    normalizeCustomEventProgress(progress)
  );
  const seenProgressInstanceIds = new Set<string>();
  const customEventProgress = normalizedCustomEventProgress?.filter((progress) => {
    const valid =
      status === 'used_persistently' &&
      usedCustomEventInstanceIds.has(progress.instanceId) &&
      !seenProgressInstanceIds.has(progress.instanceId) &&
      progressRefsAreSubset(progress, validWritebackKeys);
    if (valid) seenProgressInstanceIds.add(progress.instanceId);
    return valid;
  });
  if (
    normalizedCustomEventProgress &&
    customEventProgress?.length !== normalizedCustomEventProgress.length
  ) {
    diagnostics.push({
      code: 'execution_trace_custom_progress_invalid',
      message:
        '自定义事件进度回执必须对应本回合实际使用的事件，且只能引用已验证写回；无效进度项已移除。',
      turnCounter: context.turnCounter
    });
  }
  const normalizedNarrativeArcProgress = trace.narrativeArcProgress?.map((progress) =>
    normalizeNarrativeArcProgress(progress)
  );
  const progressConflictAudits = new Map(
    detectNarrativeArcProgressConflicts(normalizedNarrativeArcProgress ?? []).map((item) => [
      item.index,
      item.reasons
    ])
  );
  const usedSourceKeys = new Set(usedSourceRefs.map(dramaSourceKey));
  const narrativeArcProgressAudits: NarrativeArcProgressValidationDiagnostic[] = [];
  const selectedSourceKeys = new Set(
    [plan.primarySource, ...plan.supportSources]
      .filter((ref): ref is NonNullable<DramaPlan['primarySource']> => Boolean(ref))
      .map(dramaSourceKey)
  );
  const narrativeArcWritebackAudit = buildNarrativeArcWritebackReferenceAudit({
    rawResponseRefs: collectRawNarratorWritebackRefs(
      rawResponse,
      collectDramaWritebackRefs(response.writeback)
    ),
    schemaValidatedRefs: collectDramaWritebackRefs(response.writeback),
    acceptedWritebackRefs: validWritebackRefs
  });
  const narrativeArcProgress: NarrativeArcProgressTrace[] = [];
  normalizedNarrativeArcProgress?.forEach((progress, index) => {
    const result: NarrativeArcProgressValidationResult = evaluateNarrativeArcProgress({
      candidate: progress,
      context,
      existingNarrativeArcs: normalizeNarrativeArcs(existingNarrativeArcs),
      status,
      selectedSourceKeys,
      usedSourceKeys,
      writebackAudit: narrativeArcWritebackAudit,
      requestId,
      turnId
    });
    const advisoryReasons = progressConflictAudits.get(index);
    const diagnostic = advisoryReasons?.length
      ? {
          ...result.diagnostic,
          advisoryReasons
        }
      : result.diagnostic;
    if (includeNarrativeArcProgressAudit) {
      narrativeArcProgressAudits.push(diagnostic);
    }
    if (!result.accepted) {
      const invalidReason = diagnostic.rejectionReasons.join(',');
      diagnostics.push({
        code: 'execution_trace_narrative_arc_progress_invalid',
        message: `剧情弧进度回执已忽略：${invalidReason || 'progress_schema_invalid'}。`,
        turnCounter: context.turnCounter,
        narrativeArcProgressAudit: diagnostic
      });
    }
    if (result.accepted && result.normalizedProgress) {
      narrativeArcProgress.push(result.normalizedProgress);
    }
  });
  if (
    includeNarrativeArcProgressAudit &&
    (!normalizedNarrativeArcProgress || normalizedNarrativeArcProgress.length === 0)
  ) {
    const noProgressResult = evaluateNarrativeArcProgress({
      candidate: undefined,
      context,
      existingNarrativeArcs: normalizeNarrativeArcs(existingNarrativeArcs),
      status,
      selectedSourceKeys,
      usedSourceKeys,
      writebackAudit: narrativeArcWritebackAudit,
      requestId,
      turnId
    });
    narrativeArcProgressAudits.push(noProgressResult.diagnostic);
  }
  if (
    normalizedNarrativeArcProgress &&
    narrativeArcProgress.length !== normalizedNarrativeArcProgress.length &&
    !diagnostics.some((diagnostic) => diagnostic.code === 'execution_trace_narrative_arc_progress_invalid')
  ) {
    diagnostics.push({
      code: 'execution_trace_narrative_arc_progress_invalid',
      message: '剧情弧进度回执必须对应本回合实际使用的来源并引用已验证写回；无效进度项已移除。',
      turnCounter: context.turnCounter
    });
  }
  return {
    trace: {
      planId: trace.planId,
      status,
      usedSourceRefs,
      resultingWritebackRefs,
      ...(trace.customEventProgress
        ? { customEventProgress: customEventProgress ?? [] }
        : {}),
      ...(trace.narrativeArcProgress
        ? { narrativeArcProgress: narrativeArcProgress ?? [] }
        : {})
    },
    diagnostics,
    ...(includeNarrativeArcProgressAudit && narrativeArcProgressAudits.length > 0
      ? { narrativeArcProgressAudits }
      : {})
  };
}

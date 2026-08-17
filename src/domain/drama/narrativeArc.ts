import type { RuntimeState } from '../runtime/types';
import {
  dramaSourceKey,
  type DramaExecutionTrace,
  type DramaPayloadResolutionOptions,
  type DramaPlanningDiagnostic,
  type DramaPlanningContext,
  type DramaSourceRef,
  type NarrativeArcInstance,
  type NarrativeArcProgressTrace,
  type NarrativeArcContinuationSnapshot,
  type NarrativeArcGroundedFactSummary,
  type NarrativeArcStageContext,
  type NarrativeArcStatus,
  type NarrativeArcSummary,
  type NarrativeArcType,
  type ExecutionPayload,
  type PlanningSource,
  type DramaWritebackRef
} from './types';

const MAX_NARRATIVE_ARCS = 120;
const MAX_ARC_NODES = 80;
const MAX_ARC_WRITEBACK_REFS = 80;
const MAX_EXPOSED_ARC_SOURCES = 3;
const MAX_CONTINUATION_NODES = 16;
const MAX_CONTINUATION_REFS = 12;
const MAX_CONTINUATION_FACTS = 8;
const MAX_CONTINUATION_OPEN_ITEMS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function cloneRef(ref: DramaSourceRef): DramaSourceRef {
  return { ...ref };
}

function cloneArcProgressContract(
  contract: PlanningSource['arcProgressContract']
): PlanningSource['arcProgressContract'] {
  if (!contract) return undefined;
  return {
    stageIds: [...contract.stageIds],
    nodeIdsByStage: Object.fromEntries(
      Object.entries(contract.nodeIdsByStage).map(([stageId, nodeIds]) => [stageId, [...nodeIds]])
    ),
    ...(contract.allowedNextStageIds
      ? {
          allowedNextStageIds: Object.fromEntries(
            Object.entries(contract.allowedNextStageIds).map(([stageId, nextStageIds]) => [
              stageId,
              [...nextStageIds]
            ])
          )
        }
      : {}),
    ...(contract.completionStageIds
      ? { completionStageIds: [...contract.completionStageIds] }
      : {})
  };
}

function cloneWritebackRef(ref: DramaWritebackRef): DramaWritebackRef {
  return { kind: ref.kind, id: ref.id };
}

function writebackKey(ref: DramaWritebackRef): string {
  return `${ref.kind}:${ref.id}`;
}

function uniqueWritebackRefs(refs: readonly DramaWritebackRef[]): DramaWritebackRef[] {
  return Array.from(new Map(refs.map((ref) => [writebackKey(ref), cloneWritebackRef(ref)])).values());
}

function boundedText(value: string | undefined, max: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

function visibleToNarrator(visibility: string | undefined): boolean {
  return visibility !== 'hidden';
}

function resolveNarrativeArcRuntimeFact(
  state: RuntimeState,
  ref: DramaWritebackRef
): { fact?: NarrativeArcGroundedFactSummary; unresolved?: string } {
  const fact = (summary: string | undefined): NarrativeArcGroundedFactSummary | undefined => {
    const bounded = boundedText(summary, 280);
    return bounded ? { ref: cloneWritebackRef(ref), summary: bounded } : undefined;
  };

  switch (ref.kind) {
    case 'current_matter': {
      const matter = state.dynamicEvents.currentMatters[ref.id];
      if (!matter || matter.visibility === 'hidden') return {};
      const summary = `事项「${matter.title}」[${matter.status}]：${matter.summary}${matter.currentHook ? `；当前关注=${matter.currentHook}` : ''}`;
      const unresolved = ['active', 'dormant'].includes(matter.status)
        ? boundedText(`${matter.title}：${matter.currentHook ?? matter.consequenceHint ?? matter.summary}`, 240)
        : undefined;
      return { fact: fact(summary), unresolved };
    }
    case 'signal': {
      const signal = state.dynamicEvents.signals[ref.id];
      if (!signal || signal.visibility === 'hidden') return {};
      const summary = `信号「${signal.title}」[${signal.status}/${signal.reliability}]：${signal.summary}`;
      const unresolved = ['active', 'stale'].includes(signal.status)
        ? boundedText(`${signal.title}：${signal.summary}`, 240)
        : undefined;
      return { fact: fact(summary), unresolved };
    }
    case 'news_issue': {
      const issue = state.dynamicEvents.newsIssues[ref.id];
      if (!issue) return {};
      return { fact: fact(`新闻「${issue.headline}」：${issue.summary}`) };
    }
    case 'relationship_thread': {
      const thread = state.relationshipThreads[ref.id];
      if (!thread || !visibleToNarrator(thread.visibility)) return {};
      const detail = thread.conflictSummary ?? thread.currentPull ?? thread.riskSummary ?? thread.summary;
      const summary = `关系「${thread.title}」[${thread.status}]：${thread.summary}${detail !== thread.summary ? `；当前张力=${detail}` : ''}`;
      const unresolved = ['active', 'dormant', 'strained'].includes(thread.status)
        ? boundedText(`${thread.title}：${detail}`, 240)
        : undefined;
      return { fact: fact(summary), unresolved };
    }
    case 'case': {
      const caseFile = state.cases[ref.id];
      if (!caseFile || !visibleToNarrator(caseFile.visibility)) return {};
      const summary = `案件「${caseFile.title}」[${caseFile.status}/${caseFile.playerRole}]：${caseFile.summary}；当前重点=${caseFile.currentFocus}；玩家进展=${caseFile.playerVisibleProgress}`;
      const unresolved = !['archived', 'sentenced'].includes(caseFile.status)
        ? boundedText(`${caseFile.title}：${caseFile.currentFocus || caseFile.playerVisibleProgress || caseFile.summary}`, 240)
        : undefined;
      return { fact: fact(summary), unresolved };
    }
    case 'case_evidence': {
      const evidence = state.caseEvidence[ref.id];
      if (!evidence || !visibleToNarrator(evidence.visibility)) return {};
      const summary = `证据「${evidence.title}」：${evidence.summary}${evidence.disputeSummary ? `；争议=${evidence.disputeSummary}` : ''}`;
      return {
        fact: fact(summary),
        ...(evidence.disputeSummary
          ? { unresolved: boundedText(`${evidence.title}：${evidence.disputeSummary}`, 240) }
          : {})
      };
    }
    case 'city_situation_track': {
      const track = state.citySituationTracks[ref.id];
      if (!track || track.visibility === 'hidden') return {};
      const summary = `城市动态「${track.title}」[${track.status}]：${track.summary}；当前变化=${track.currentBeat}`;
      const unresolved = track.status !== 'resolved'
        ? boundedText(`${track.title}：${track.currentBeat || track.summary}`, 240)
        : undefined;
      return { fact: fact(summary), unresolved };
    }
    case 'actor': {
      const canonicalActorId = state.actorIdAliases?.[ref.id] ?? ref.id;
      const actor = state.actors[canonicalActorId];
      if (!actor || !visibleToNarrator(actor.visibility)) return {};
      return {
        fact: fact(`人物「${actor.name}」：${actor.publicIdentity ?? actor.positionSummary}；${actor.profileSummary}`)
      };
    }
    case 'actor_memory': {
      const canonicalActorId = state.actorIdAliases?.[ref.id] ?? ref.id;
      const actor = state.actors[canonicalActorId];
      if (!actor || !visibleToNarrator(actor.visibility)) return {};
      return { fact: fact(`人物「${actor.name}」已有与本剧情弧相关的已应用记忆写回；具体事实以剧情弧摘要和当前 Runtime 为准。`) };
    }
    default:
      return {};
  }
}

export function buildNarrativeArcContinuationSnapshot(
  state: RuntimeState,
  arc: NarrativeArcInstance
): NarrativeArcContinuationSnapshot {
  const appliedWritebackRefs = uniqueWritebackRefs(arc.writebackRefs).slice(
    -MAX_CONTINUATION_REFS
  );
  const resolved = appliedWritebackRefs.map((ref) =>
    resolveNarrativeArcRuntimeFact(state, ref)
  );
  const groundedFacts = resolved
    .flatMap((item) => (item.fact ? [item.fact] : []))
    .slice(-MAX_CONTINUATION_FACTS);
  const unresolvedContext = Array.from(
    new Set(
      resolved.flatMap((item) => {
        const unresolved = boundedText(item.unresolved, 240);
        return unresolved ? [unresolved] : [];
      })
    )
  ).slice(-MAX_CONTINUATION_OPEN_ITEMS);
  const progressSummary = boundedText(arc.lastSummary, 480);
  const groundedSummary = boundedText(
    groundedFacts.length > 0
      ? groundedFacts.map((item) => item.summary).join('；')
      : progressSummary ?? `当前阶段 ${arc.currentStageId ?? '未命名阶段'} 尚无可解析的 Runtime 事实摘要。`,
    720
  )!;
  return {
    usedNodeIds: Array.from(new Set(arc.usedNodeIds)).slice(-MAX_CONTINUATION_NODES),
    lastProgressTurn: arc.lastProgressTurn,
    ...(progressSummary ? { progressSummary } : {}),
    groundedSummary,
    appliedWritebackRefs,
    groundedFacts,
    unresolvedContext
  };
}

export function cloneNarrativeArcStageContext(
  context: NarrativeArcStageContext
): NarrativeArcStageContext {
  return {
    arcInstanceId: context.arcInstanceId,
    currentStageId: context.currentStageId,
    mode: context.mode,
    continuationSnapshot: {
      ...context.continuationSnapshot,
      usedNodeIds: [...context.continuationSnapshot.usedNodeIds],
      appliedWritebackRefs: context.continuationSnapshot.appliedWritebackRefs.map(
        cloneWritebackRef
      ),
      groundedFacts: context.continuationSnapshot.groundedFacts.map((item) => ({
        ref: cloneWritebackRef(item.ref),
        summary: item.summary
      })),
      unresolvedContext: [...context.continuationSnapshot.unresolvedContext]
    }
  };
}

export function narrativeArcTypeForSource(ref: DramaSourceRef): NarrativeArcType {
  if (ref.dlcId || ref.providerId === 'official-dlc' || ref.sourceType.startsWith('official_dlc')) {
    return 'official_dlc';
  }
  if (ref.providerId === 'custom-event-group' || ref.sourceType.startsWith('custom_event')) {
    return 'custom_content';
  }
  if (ref.providerId === 'storypack' || ref.sourceType.includes('storypack') || ref.sourceType.includes('era_')) {
    return 'storypack';
  }
  return 'dynamic_event';
}

function normalizeArc(value: unknown): NarrativeArcInstance | undefined {
  if (!isRecord(value)) return undefined;
  const arcInstanceId = nonEmptyString(value.arcInstanceId);
  const sourceRef = isRecord(value.sourceRef)
    ? {
        providerId: nonEmptyString(value.sourceRef.providerId),
        sourceType: nonEmptyString(value.sourceRef.sourceType),
        sourceId: nonEmptyString(value.sourceRef.sourceId),
        dlcId: nonEmptyString(value.sourceRef.dlcId)
      }
    : undefined;
  const status = value.status;
  const arcType = value.arcType;
  if (
    !arcInstanceId ||
    !sourceRef?.providerId ||
    !sourceRef.sourceType ||
    !sourceRef.sourceId ||
    !['active', 'paused', 'completed', 'abandoned'].includes(String(status)) ||
    !['official_dlc', 'custom_content', 'storypack', 'dynamic_event'].includes(String(arcType))
  ) {
    return undefined;
  }
  const usedNodeIds = Array.isArray(value.usedNodeIds)
    ? value.usedNodeIds.map(nonEmptyString).filter((item): item is string => Boolean(item))
    : [];
  const writebackRefs = Array.isArray(value.writebackRefs)
    ? value.writebackRefs
        .filter(isRecord)
        .map((item) => ({ kind: nonEmptyString(item.kind), id: nonEmptyString(item.id) }))
        .filter((item): item is DramaWritebackRef => Boolean(item.kind && item.id))
    : [];
  const createdTurn = Number.isFinite(value.createdTurn) ? Math.max(0, Number(value.createdTurn)) : 0;
  const lastProgressTurn = Number.isFinite(value.lastProgressTurn)
    ? Math.max(createdTurn, Number(value.lastProgressTurn))
    : createdTurn;
  return {
    arcInstanceId,
    sourceRef: {
      providerId: sourceRef.providerId,
      sourceType: sourceRef.sourceType,
      sourceId: sourceRef.sourceId,
      ...(sourceRef.dlcId ? { dlcId: sourceRef.dlcId } : {})
    },
    arcType: arcType as NarrativeArcType,
    status: status as NarrativeArcStatus,
    ...(nonEmptyString(value.currentStageId) ? { currentStageId: nonEmptyString(value.currentStageId) } : {}),
    ...(nonEmptyString(value.previousStageId) ? { previousStageId: nonEmptyString(value.previousStageId) } : {}),
    usedNodeIds: Array.from(new Set(usedNodeIds)).slice(-MAX_ARC_NODES),
    createdTurn,
    lastProgressTurn,
    writebackRefs: uniqueWritebackRefs(writebackRefs).slice(-MAX_ARC_WRITEBACK_REFS),
    ...(nonEmptyString(value.lastSummary) ? { lastSummary: nonEmptyString(value.lastSummary) } : {})
  };
}

/** Safe migration boundary for old saves and partially written runtime snapshots. */
export function normalizeNarrativeArcs(value: unknown): NarrativeArcInstance[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeArc).filter((item): item is NarrativeArcInstance => Boolean(item)).slice(-MAX_NARRATIVE_ARCS);
}

function persistedNarrativeArcSourceKey(ref: DramaSourceRef): string {
  return JSON.stringify([
    ref.providerId,
    ref.sourceType,
    ref.sourceId,
    ref.dlcId ?? null
  ]);
}

/**
 * Removes only the exact persistent source whose arc has completed. The DLC
 * binding stays active, so unrelated arcs, characters, news and future side
 * content from the same DLC remain eligible for projection.
 */
export function filterCompletedNarrativeArcSources(
  state: RuntimeState,
  projectedSources: readonly PlanningSource[]
): PlanningSource[] {
  const completedSourceKeys = new Set(
    normalizeNarrativeArcs(state.narrativeArcs)
      .filter((arc) => arc.status === 'completed')
      .map((arc) => persistedNarrativeArcSourceKey(arc.sourceRef))
  );
  if (completedSourceKeys.size === 0) return [...projectedSources];
  return projectedSources.filter(
    (source) => !completedSourceKeys.has(persistedNarrativeArcSourceKey(source.ref))
  );
}

/**
 * Projects an already-exposed arc back into the normal turn planner without
 * re-injecting the provider's full source inventory. The provider source is
 * still used for execution payload lookup after the planner selects it; only
 * this compact, current-stage candidate is sent through the planning context.
 */
export function buildNarrativeArcPlanningSources(
  state: RuntimeState,
  projectedSources: readonly PlanningSource[],
  max = MAX_EXPOSED_ARC_SOURCES
): PlanningSource[] {
  const activeArcs = normalizeNarrativeArcs(state.narrativeArcs)
    .filter((arc) => arc.status === 'active')
    .filter((arc) => {
      if (arc.arcType !== 'official_dlc') return true;
      const dlcId = arc.sourceRef.dlcId;
      return Boolean(
        dlcId &&
          state.world.officialDlcBindings?.some(
            (binding) => binding.dlcId === dlcId && binding.status === 'active'
          )
      );
    })
    .sort((left, right) => right.lastProgressTurn - left.lastProgressTurn)
    .slice(0, max);
  const usedArcKeys = new Set<string>();
  return activeArcs.flatMap((arc) => {
    const source = projectedSources.find(
      (candidate) => dramaSourceKey(candidate.ref) === dramaSourceKey(arc.sourceRef)
    );
    if (!source) return [];
    const arcKey = source.arcKey ?? dramaSourceKey(source.ref);
    if (usedArcKeys.has(arcKey)) return [];
    usedArcKeys.add(arcKey);
    const currentStageProjection = arc.currentStageId
      ? source.arcStageProjections?.[arc.currentStageId]
      : undefined;
    const summary = (
      arc.lastSummary ??
      currentStageProjection?.plannerSummary ??
      `已进入阶段 ${arc.currentStageId ?? '未命名阶段'}；只应在玩家行动合理接触时继续。`
    ).slice(0, 480);
    const continuationSnapshot = buildNarrativeArcContinuationSnapshot(state, arc);
    const linkedCaseIds = arc.writebackRefs
      .filter((ref) => ref.kind === 'case')
      .map((ref) => ref.id);
    const continuityHint = [
      continuationSnapshot.usedNodeIds.length > 0
        ? `已使用节点（不要作为新发现重复执行）：${continuationSnapshot.usedNodeIds.join('、')}`
        : '',
      continuationSnapshot.unresolvedContext.length > 0
        ? `当前未解决上下文：${continuationSnapshot.unresolvedContext.join('；')}`
        : ''
    ].filter(Boolean).join(' ');
    const sourceWithoutStageInventory: PlanningSource = { ...source };
    delete sourceWithoutStageInventory.arcStageProjections;
    return [{
      ...sourceWithoutStageInventory,
      title: currentStageProjection?.title ?? `${source.title} · ${arc.currentStageId ?? '当前阶段'}`,
      plannerSummary: currentStageProjection
        ? `${currentStageProjection.plannerSummary} 当前已成立摘要：${summary} ${continuityHint}`.slice(0, 900)
        : `已曝光剧情弧当前阶段：${arc.currentStageId ?? '未命名阶段'}。${summary} ${continuityHint}`.slice(0, 900),
      sourceStatus: 'active_process' as const,
      reusePolicy: 'context_reusable' as const,
      priorityClass: 'normal' as const,
      mandatory: false,
      score: Math.min(110, Math.max(60, source.score)),
      evidenceRefs: [{ ...source.ref }],
      channelIds: [...source.channelIds],
      softAffinities: Object.fromEntries(
        Object.entries(source.softAffinities).map(([key, values]) => [key, [...values]])
      ),
      relatedActorIds: currentStageProjection
        ? [...currentStageProjection.relatedActorIds]
        : [...source.relatedActorIds],
      relatedOrganizationIds: [...source.relatedOrganizationIds],
      relatedPlaceIds: currentStageProjection
        ? [...currentStageProjection.relatedPlaceIds]
        : [...source.relatedPlaceIds],
      relatedCaseIds: Array.from(new Set([
        ...source.relatedCaseIds,
        ...linkedCaseIds
      ])),
      ...(source.arcProgressContract
        ? { arcProgressContract: cloneArcProgressContract(source.arcProgressContract) }
        : {}),
      ...(source.contentIdentity ? { contentIdentity: { ...source.contentIdentity } } : {}),
      ...(arc.currentStageId
        ? {
            arcStageContext: {
              arcInstanceId: arc.arcInstanceId,
              currentStageId: arc.currentStageId,
              mode: 'continuation' as const,
              continuationSnapshot
            }
          }
        : {})
    }];
  });
}

export function narrativeArcSourceForContext(
  context: DramaPlanningContext,
  ref: DramaSourceRef
): PlanningSource | undefined {
  const sources = [
    ...context.requiredContextSources,
    ...context.userPrioritySources,
    ...context.optionalDynamicSources,
    ...context.staticSeedSources,
    ...(context.officialDlcSources ?? [])
  ];
  return sources.find((source) => dramaSourceKey(source.ref) === dramaSourceKey(ref));
}

export function narrativeArcInstanceIdForArcKey(arcKey: string): string {
  const slug = arcKey
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return `arc_${slug || 'narrative'}`;
}

function isOfficialDlcDisabled(state: RuntimeState, ref: DramaSourceRef): boolean {
  if (!ref.dlcId) return false;
  const binding = state.world.officialDlcBindings?.find(
    (candidate) => candidate.dlcId === ref.dlcId
  );
  return Boolean(binding && (binding.status === 'paused' || binding.status === 'completed'));
}

function isArcCapableSource(source: PlanningSource, payload?: ExecutionPayload): boolean {
  // Source type only identifies provenance. An official event may deliberately
  // be a one-shot rumor, so persistence must be declared by continuity
  // metadata instead of being inferred from the broad source type.
  if (source.arcProgressContract || source.contentIdentity) return true;
  return Boolean(payload?.arcKey && (payload.initialStageId || payload.arcProgressContract));
}

/**
 * Bridges a successful Drama execution into the existing narrative arc
 * progress protocol when a provider has declared continuity metadata. A
 * texture-only execution is still an exposure of the arc, so it may create
 * the orchestration record with no writeback refs; that record does not make
 * any world fact true. The model may still provide a richer progress item;
 * this only fills the missing first `remain` receipt.
 */
export function bridgeNarrativeArcCreation({
  state,
  context,
  trace,
  resolveExecutionPayload
}: {
  state: RuntimeState;
  context: DramaPlanningContext;
  trace?: DramaExecutionTrace;
  resolveExecutionPayload: (
    ref: DramaSourceRef,
    options?: DramaPayloadResolutionOptions
  ) => ExecutionPayload | undefined;
}): { trace?: DramaExecutionTrace; diagnostics: DramaPlanningDiagnostic[] } {
  if (
    !trace ||
    !['used_persistently', 'partially_used', 'used_as_texture'].includes(trace.status) ||
    trace.usedSourceRefs.length === 0
  ) {
    return { trace, diagnostics: [] };
  }

  const existingArcs = normalizeNarrativeArcs(state.narrativeArcs);
  const existingProgress = trace.narrativeArcProgress ?? [];
  const progressSourceKeys = new Set(
    existingProgress.map((progress) => dramaSourceKey(progress.sourceRef))
  );
  const bridgedProgress: NarrativeArcProgressTrace[] = [];
  const diagnostics: DramaPlanningDiagnostic[] = [];

  for (const sourceRef of trace.usedSourceRefs) {
    const source = narrativeArcSourceForContext(context, sourceRef);
    if (!source || progressSourceKeys.has(dramaSourceKey(sourceRef))) continue;
    const canonicalSourceRef = source.ref;
    if (isOfficialDlcDisabled(state, canonicalSourceRef)) continue;

    const payload = resolveExecutionPayload(
      canonicalSourceRef,
      source.arcStageContext
        ? { narrativeArc: cloneNarrativeArcStageContext(source.arcStageContext) }
        : undefined
    );
    if (!isArcCapableSource(source, payload)) continue;
    if (!payload) {
      diagnostics.push({
        code: 'arc_creation_failed',
        message: `连续剧情来源 ${sourceRef.sourceId} 执行成功但缺少 executionPayload，未创建 NarrativeArcInstance；missingField=executionPayload。`,
        turnCounter: state.turnCounter
      });
      continue;
    }

    const arcKey = payload.arcKey?.trim();
    const contract = payload.arcProgressContract ?? source.arcProgressContract;
    const initialStageId =
      payload.initialStageId?.trim() || contract?.stageIds[0]?.trim();
    if (!arcKey) {
      diagnostics.push({
        code: 'arc_creation_failed',
        message: `连续剧情来源 ${sourceRef.sourceId} 缺少 arcKey，未创建 NarrativeArcInstance；missingField=arcKey。`,
        turnCounter: state.turnCounter
      });
      continue;
    }

    const existing = existingArcs.find(
      (arc) => dramaSourceKey(arc.sourceRef) === dramaSourceKey(canonicalSourceRef)
    );
    if (existing?.status === 'paused' || existing?.status === 'completed') continue;
    const currentStageId = existing?.currentStageId ?? initialStageId;
    if (!currentStageId) {
      diagnostics.push({
        code: 'arc_creation_failed',
        message: `连续剧情来源 ${sourceRef.sourceId} 缺少首阶段 ID，未创建 NarrativeArcInstance；missingField=stageId。`,
        turnCounter: state.turnCounter
      });
      continue;
    }

    const progress: NarrativeArcProgressTrace = {
      arcInstanceId: existing?.arcInstanceId ?? narrativeArcInstanceIdForArcKey(arcKey),
      sourceRef: cloneRef(canonicalSourceRef),
      decision: 'remain',
      currentStageId,
      usedNodeIds: [],
      supportingWritebackRefs: trace.resultingWritebackRefs.map(cloneWritebackRef),
      ...(existing?.lastSummary
        ? { summary: existing.lastSummary }
        : { summary: `已进入 ${source.title} 的 ${currentStageId} 阶段。` })
    };
    const validationError = validateNarrativeArcProgressShape({
      progress,
      context,
      existingArcs
    });
    if (validationError) {
      diagnostics.push({
        code: 'arc_creation_failed',
        message: `连续剧情来源 ${sourceRef.sourceId} 的 Arc 桥接未通过结构校验：${validationError}；missingField=progressShape。`,
        turnCounter: state.turnCounter
      });
      continue;
    }
    bridgedProgress.push(progress);
    progressSourceKeys.add(dramaSourceKey(sourceRef));
    if (!existing) {
      diagnostics.push({
        code: 'arc_created',
        message: `已为连续剧情来源 ${sourceRef.sourceId} 创建 NarrativeArcInstance ${progress.arcInstanceId}，阶段=${currentStageId}。`,
        turnCounter: state.turnCounter
      });
    }
  }

  if (bridgedProgress.length === 0) return { trace, diagnostics };
  return {
    trace: {
      ...trace,
      narrativeArcProgress: [...existingProgress, ...bridgedProgress]
    },
    diagnostics
  };
}

/** Returns a diagnostic-safe reason when the progress item violates the declared structure. */
export function validateNarrativeArcProgressShape({
  progress,
  context,
  existingArcs
}: {
  progress: NarrativeArcProgressTrace;
  context: DramaPlanningContext;
  existingArcs: readonly NarrativeArcInstance[];
}): string | undefined {
  if (!progress.arcInstanceId.trim() || !progress.sourceRef.sourceId.trim()) return '缺少稳定剧情弧或来源 ID。';
  const source = narrativeArcSourceForContext(context, progress.sourceRef);
  if (!source) return '剧情弧来源不在本回合规划上下文中。';
  const contract = source.arcProgressContract;
  const existing = existingArcs.find((arc) => arc.arcInstanceId === progress.arcInstanceId);
  const sourceExisting = existingArcs.find(
    (arc) => dramaSourceKey(arc.sourceRef) === dramaSourceKey(progress.sourceRef)
  );
  if (sourceExisting && sourceExisting.arcInstanceId !== progress.arcInstanceId) {
    return '该来源已经有持久化剧情弧实例，不能重新创建新的 arcInstanceId。';
  }
  if (existing && dramaSourceKey(existing.sourceRef) !== dramaSourceKey(progress.sourceRef)) {
    return '同一剧情弧实例不能更换来源。';
  }
  if (progress.decision === 'advance_stage' && !progress.nextStageId) {
    return 'advance_stage 必须提供 nextStageId。';
  }
  if (progress.decision !== 'advance_stage' && progress.nextStageId) {
    return '只有 advance_stage 可以提供 nextStageId。';
  }
  if (existing && progress.previousStageId && progress.previousStageId !== existing.currentStageId) {
    return 'previousStageId 与已保存的当前阶段不一致。';
  }
  const currentStageId = progress.currentStageId ?? existing?.currentStageId;
  if ((progress.decision === 'remain' || progress.decision === 'advance_stage') && !currentStageId) {
    return '持续或推进剧情弧必须提供 currentStageId。';
  }
  if (contract) {
    const stageIds = new Set(contract.stageIds);
    if (currentStageId && !stageIds.has(currentStageId)) return `未知阶段 ${currentStageId}。`;
    if (progress.nextStageId && !stageIds.has(progress.nextStageId)) return `未知下一阶段 ${progress.nextStageId}。`;
    const nodeStage = currentStageId ? contract.nodeIdsByStage[currentStageId] : undefined;
    if (nodeStage && progress.usedNodeIds.some((nodeId) => !nodeStage.includes(nodeId))) {
      return 'usedNodeIds 不属于当前阶段。';
    }
    const allowedNext = currentStageId ? contract.allowedNextStageIds?.[currentStageId] : undefined;
    if (progress.nextStageId && allowedNext && !allowedNext.includes(progress.nextStageId)) {
      return '阶段转换不在来源声明的允许路径中。';
    }
    if (
      progress.decision === 'complete' &&
      contract.completionStageIds &&
      (!currentStageId || !contract.completionStageIds.includes(currentStageId))
    ) {
      return '当前阶段不允许完成剧情弧。';
    }
  }
  return undefined;
}

function officialDlcBindingStatus(state: RuntimeState, dlcId?: string): 'active' | 'paused' | 'completed' | undefined {
  if (!dlcId) return undefined;
  return state.world.officialDlcBindings?.find((binding) => binding.dlcId === dlcId)?.status;
}

function reconcileOfficialDlcPauseState(
  state: RuntimeState,
  arcs: NarrativeArcInstance[]
): NarrativeArcInstance[] {
  return arcs.map((arc) => {
    if (arc.arcType !== 'official_dlc') return arc;
    const bindingStatus = officialDlcBindingStatus(state, arc.sourceRef.dlcId);
    if (bindingStatus === 'paused' && arc.status === 'active') return { ...arc, status: 'paused' };
    if (bindingStatus === 'active' && arc.status === 'paused') return { ...arc, status: 'active' };
    if (
      bindingStatus === 'completed' &&
      (arc.status === 'active' || arc.status === 'paused')
    ) {
      return { ...arc, status: 'completed' };
    }
    return arc;
  });
}

export function applyNarrativeArcProgress(
  state: RuntimeState,
  trace: DramaExecutionTrace | undefined
): RuntimeState {
  const currentArcs = reconcileOfficialDlcPauseState(state, normalizeNarrativeArcs(state.narrativeArcs));
  const progressItems = trace?.narrativeArcProgress ?? [];
  if (
    !['used_persistently', 'partially_used', 'used_as_texture'].includes(trace?.status ?? '') ||
    progressItems.length === 0
  ) {
    return { ...state, narrativeArcs: currentArcs };
  }
  const arcs = currentArcs.map((arc) => ({
    ...arc,
    sourceRef: cloneRef(arc.sourceRef),
    usedNodeIds: [...arc.usedNodeIds],
    writebackRefs: arc.writebackRefs.map(cloneWritebackRef)
  }));
  for (const progress of progressItems) {
    const index = arcs.findIndex((arc) => arc.arcInstanceId === progress.arcInstanceId);
    const existing = index >= 0 ? arcs[index] : undefined;
    const processedStage = progress.currentStageId ?? existing?.currentStageId;
    const nextStageId = progress.decision === 'advance_stage' ? progress.nextStageId ?? processedStage : processedStage;
    const status: NarrativeArcStatus =
      progress.decision === 'complete'
        ? 'completed'
        : progress.decision === 'abandon'
          ? 'abandoned'
          : 'active';
    const next: NarrativeArcInstance = {
      arcInstanceId: progress.arcInstanceId,
      sourceRef: cloneRef(progress.sourceRef),
      arcType: existing?.arcType ?? narrativeArcTypeForSource(progress.sourceRef),
      status,
      ...(nextStageId ? { currentStageId: nextStageId } : {}),
      ...(existing?.currentStageId && nextStageId && existing.currentStageId !== nextStageId
        ? { previousStageId: existing.currentStageId }
        : existing?.previousStageId
          ? { previousStageId: existing.previousStageId }
          : {}),
      usedNodeIds: Array.from(new Set([...(existing?.usedNodeIds ?? []), ...progress.usedNodeIds])).slice(-MAX_ARC_NODES),
      createdTurn: existing?.createdTurn ?? state.turnCounter,
      lastProgressTurn: state.turnCounter,
      writebackRefs: uniqueWritebackRefs([...(existing?.writebackRefs ?? []), ...progress.supportingWritebackRefs]).slice(-MAX_ARC_WRITEBACK_REFS),
      ...(progress.summary?.trim() ? { lastSummary: progress.summary.trim().slice(0, 1200) } : existing?.lastSummary ? { lastSummary: existing.lastSummary } : {})
    };
    if (index >= 0) arcs[index] = next;
    else arcs.push(next);
  }
  return { ...state, narrativeArcs: arcs.slice(-MAX_NARRATIVE_ARCS) };
}

export function buildNarrativeArcSummaries(
  state: RuntimeState,
  max = 3
): NarrativeArcSummary[] {
  return normalizeNarrativeArcs(state.narrativeArcs)
    .filter((arc) => arc.status === 'active' || arc.status === 'paused')
    .sort((left, right) => right.lastProgressTurn - left.lastProgressTurn)
    .slice(0, max)
    .map((arc) => ({
      arcInstanceId: arc.arcInstanceId,
      sourceRef: cloneRef(arc.sourceRef),
      arcType: arc.arcType,
      status: arc.status,
      currentStageId: arc.currentStageId,
      summary: (arc.lastSummary ?? `已进入阶段 ${arc.currentStageId ?? '未命名阶段'}；只应在玩家行动合理接触时继续。`).slice(0, 480),
      lastProgressTurn: arc.lastProgressTurn
    }));
}

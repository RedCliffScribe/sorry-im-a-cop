import {
  dramaSourceKey,
  type DramaExecutionStatus,
  type DramaPlanningContext,
  type DramaSourceRef,
  type DramaWritebackRef,
  type NarrativeArcInstance,
  type NarrativeArcProgressDecision,
  type NarrativeArcProgressRejectReason,
  type NarrativeArcProgressTrace,
  type NarrativeArcProgressValidationDiagnostic,
  type NarrativeArcSupportingWritebackRefAudit,
  type NarrativeArcWritebackReferenceAudit
} from './types';
import {
  narrativeArcInstanceIdForArcKey,
  narrativeArcSourceForContext,
  validateNarrativeArcProgressShape
} from './narrativeArc';

const decisionValues = new Set<NarrativeArcProgressDecision>([
  'remain',
  'advance_stage',
  'complete',
  'abandon'
]);

const writebackKindAliases: Record<string, string> = {
  actorPatches: 'actor',
  actorMemories: 'actor_memory',
  secretFactPatches: 'secret_fact',
  placePatches: 'place',
  scenePatches: 'scene',
  casePatches: 'case',
  caseEvidencePatches: 'case_evidence',
  deferredEventPatches: 'deferred_event',
  currentMatterPatches: 'current_matter',
  signalPatches: 'signal',
  newsIssuePatches: 'news_issue',
  organizationPatches: 'organization',
  citySituationTrackPatches: 'city_situation_track',
  judgementCheckPatches: 'judgement_check',
  combatEventPatches: 'combat_event',
  relationshipThreadPatches: 'relationship_thread',
  pregnancyRiskPatches: 'pregnancy_risk',
  pregnancyResolutionPatches: 'pregnancy_resolution',
  grayNetworkPatches: 'gray_network',
  currentMatter: 'current_matter',
  signal: 'signal',
  newsIssue: 'news_issue'
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeWritebackRef(value: unknown): DramaWritebackRef | undefined {
  if (!isRecord(value) || !nonEmptyString(value.kind) || !nonEmptyString(value.id)) {
    return undefined;
  }
  return {
    kind: writebackKindAliases[value.kind] ?? value.kind,
    id: value.id.trim()
  };
}

function writebackKey(ref: DramaWritebackRef): string {
  return `${ref.kind}:${ref.id}`;
}

function uniqueRefs(refs: readonly DramaWritebackRef[]): DramaWritebackRef[] {
  return Array.from(
    new Map(refs.map((ref) => [writebackKey(ref), { kind: ref.kind, id: ref.id }])).values()
  );
}

function refSet(refs: readonly DramaWritebackRef[]): Set<string> {
  return new Set(uniqueRefs(refs).map(writebackKey));
}

function sourceRefFrom(value: unknown): DramaSourceRef | undefined {
  if (!isRecord(value)) return undefined;
  if (!nonEmptyString(value.providerId) || !nonEmptyString(value.sourceType) || !nonEmptyString(value.sourceId)) {
    return undefined;
  }
  return {
    providerId: value.providerId.trim(),
    sourceType: value.sourceType.trim(),
    sourceId: value.sourceId.trim(),
    ...(nonEmptyString(value.dlcId) ? { dlcId: value.dlcId.trim() } : {})
  };
}

function parseProgress(
  value: unknown,
  canonicalizeWritebackRef?: (ref: DramaWritebackRef) => DramaWritebackRef
): {
  progress?: NarrativeArcProgressTrace;
  schemaValid: boolean;
  requestedNodeIds: string[];
  supportingRefs: Array<{ originalKind: string; originalId: string; normalized?: DramaWritebackRef }>;
} {
  if (!isRecord(value)) {
    return { schemaValid: false, requestedNodeIds: [], supportingRefs: [] };
  }
  const sourceRef = sourceRefFrom(value.sourceRef);
  const arcInstanceId = nonEmptyString(value.arcInstanceId) ? value.arcInstanceId.trim() : undefined;
  const decision = nonEmptyString(value.decision) ? value.decision.trim() : undefined;
  const isRemain = decision === 'remain';
  const currentStageId = nonEmptyString(value.currentStageId) ? value.currentStageId.trim() : undefined;
  const previousStageId = nonEmptyString(value.previousStageId) ? value.previousStageId.trim() : undefined;
  const nextStageId = nonEmptyString(value.nextStageId) ? value.nextStageId.trim() : undefined;
  const requestedNodeIds = Array.isArray(value.usedNodeIds)
    ? value.usedNodeIds.filter(nonEmptyString).map((nodeId) => nodeId.trim())
    : [];
  const nodeListValid = Array.isArray(value.usedNodeIds) && value.usedNodeIds.every(nonEmptyString);
  const rawSupportingRefs = Array.isArray(value.supportingWritebackRefs)
    ? value.supportingWritebackRefs
    : [];
  const supportingRefs = rawSupportingRefs.map((ref) => {
    const normalized = normalizeWritebackRef(ref);
    return {
      originalKind: isRecord(ref) && typeof ref.kind === 'string' ? ref.kind : '',
      originalId: isRecord(ref) && typeof ref.id === 'string' ? ref.id : '',
      normalized: normalized && canonicalizeWritebackRef
        ? canonicalizeWritebackRef(normalized)
        : normalized
    };
  });
  const supportingFieldValid = isRemain
    ? value.supportingWritebackRefs === undefined || Array.isArray(value.supportingWritebackRefs)
    : Array.isArray(value.supportingWritebackRefs) && value.supportingWritebackRefs.length > 0;
  const schemaValid = Boolean(
    sourceRef &&
      arcInstanceId &&
      decision &&
      decisionValues.has(decision as NarrativeArcProgressDecision) &&
      nodeListValid &&
      supportingFieldValid &&
      (isRemain || supportingRefs.every((ref) => Boolean(ref.normalized)))
  );
  if (!schemaValid) {
    return { schemaValid: false, requestedNodeIds, supportingRefs };
  }
  return {
    schemaValid: true,
    requestedNodeIds,
    supportingRefs,
    progress: {
      arcInstanceId: arcInstanceId as string,
      sourceRef: sourceRef as DramaSourceRef,
      decision: decision as NarrativeArcProgressDecision,
      ...(currentStageId ? { currentStageId } : {}),
      ...(previousStageId ? { previousStageId } : {}),
      ...(nextStageId ? { nextStageId } : {}),
      usedNodeIds: Array.from(new Set(requestedNodeIds)),
      supportingWritebackRefs: uniqueRefs(
        supportingRefs.flatMap((ref) => ref.normalized ? [ref.normalized] : [])
      ),
      ...(nonEmptyString(value.summary) ? { summary: value.summary.trim().slice(0, 2000) } : {})
    }
  };
}

function uniqueReasons(reasons: NarrativeArcProgressRejectReason[]): NarrativeArcProgressRejectReason[] {
  return Array.from(new Set(reasons));
}

function shapeReasons({
  reason,
  progress,
  context,
  existingArcs
}: {
  reason: string;
  progress: NarrativeArcProgressTrace;
  context: DramaPlanningContext;
  existingArcs: readonly NarrativeArcInstance[];
}): NarrativeArcProgressRejectReason[] {
  if (reason.includes('缺少稳定剧情弧或来源 ID')) {
    return [progress.arcInstanceId ? 'arc_source_mismatch' : 'arc_instance_missing'];
  }
  if (reason.includes('已经有持久化剧情弧实例')) return ['duplicate_progress_candidate'];
  if (reason.includes('不能更换来源')) return ['arc_source_mismatch'];
  if (reason.includes('必须提供 nextStageId')) return ['next_stage_missing'];
  if (reason.includes('只有 advance_stage')) return ['progress_schema_invalid'];
  if (reason.includes('previousStageId')) return ['current_stage_mismatch'];
  if (reason.includes('未知下一阶段')) return ['next_stage_unknown'];
  if (reason.includes('未知阶段')) return ['current_stage_mismatch'];
  if (reason.includes('usedNodeIds')) {
    const source = narrativeArcSourceForContext(context, progress.sourceRef);
    const contract = source?.arcProgressContract;
    const allNodes = new Set(Object.values(contract?.nodeIdsByStage ?? {}).flat());
    return progress.usedNodeIds.some((nodeId) => !allNodes.has(nodeId))
      ? ['node_id_unknown']
      : ['node_not_in_current_contract'];
  }
  if (reason.includes('不允许完成剧情弧')) return ['transition_not_allowed'];
  if (reason.includes('阶段转换')) return ['transition_not_allowed'];
  if (reason.includes('规划上下文')) return ['source_not_selected'];
  if (reason.includes('当前阶段')) return ['current_stage_mismatch'];
  return ['progress_schema_invalid'];
}

function classification(
  decision: NarrativeArcProgressDecision | undefined,
  accepted: boolean
): NarrativeArcProgressValidationDiagnostic['classification'] {
  if (!decision) return accepted ? 'remain' : 'advance_rejected';
  if (decision === 'remain') return accepted ? 'remain' : 'remain_rejected';
  if (decision === 'advance_stage') return accepted ? 'advance_accepted' : 'advance_rejected';
  if (decision === 'complete') return accepted ? 'complete_accepted' : 'complete_rejected';
  return accepted ? 'abandon_accepted' : 'abandon_rejected';
}

function allowedContractDetails(
  context: DramaPlanningContext,
  progress: NarrativeArcProgressTrace | undefined,
  existingArcs: readonly NarrativeArcInstance[]
): { beforeStageId?: string; allowedNextStageIds?: string[]; allowedNodeIds?: string[] } {
  if (!progress) return {};
  const existing = existingArcs.find((arc) => arc.arcInstanceId === progress.arcInstanceId);
  const source = narrativeArcSourceForContext(context, progress.sourceRef);
  const contract = source?.arcProgressContract;
  const beforeStageId = existing?.currentStageId;
  const stageId = progress.currentStageId ?? beforeStageId;
  return {
    ...(beforeStageId ? { beforeStageId } : {}),
    ...(stageId && contract?.allowedNextStageIds?.[stageId]
      ? { allowedNextStageIds: [...contract.allowedNextStageIds[stageId]] }
      : {}),
    ...(stageId && contract?.nodeIdsByStage?.[stageId]
      ? { allowedNodeIds: [...contract.nodeIdsByStage[stageId]] }
      : {})
  };
}

export interface NarrativeArcProgressValidationInput {
  candidate: unknown;
  context: DramaPlanningContext;
  existingNarrativeArcs: readonly NarrativeArcInstance[];
  status: DramaExecutionStatus;
  selectedSourceKeys: ReadonlySet<string>;
  usedSourceKeys: ReadonlySet<string>;
  writebackAudit: NarrativeArcWritebackReferenceAudit;
  canonicalizeWritebackRef?: (ref: DramaWritebackRef) => DramaWritebackRef;
  requestId?: string;
  turnId?: string;
}

export interface NarrativeArcProgressValidationResult {
  accepted: boolean;
  normalizedProgress?: NarrativeArcProgressTrace;
  diagnostic: NarrativeArcProgressValidationDiagnostic;
}

export function buildNarrativeArcWritebackReferenceAudit({
  rawResponseRefs,
  schemaValidatedRefs,
  acceptedWritebackRefs,
  appliedWritebackRefs,
  appliedCheckAvailable = false
}: {
  rawResponseRefs: readonly DramaWritebackRef[];
  schemaValidatedRefs: readonly DramaWritebackRef[];
  acceptedWritebackRefs: readonly DramaWritebackRef[];
  appliedWritebackRefs?: readonly DramaWritebackRef[];
  appliedCheckAvailable?: boolean;
}): NarrativeArcWritebackReferenceAudit {
  return {
    rawResponseRefs: uniqueRefs(rawResponseRefs.map((ref) => normalizeWritebackRef(ref) ?? ref)),
    schemaValidatedRefs: uniqueRefs(schemaValidatedRefs.map((ref) => normalizeWritebackRef(ref) ?? ref)),
    acceptedWritebackRefs: uniqueRefs(acceptedWritebackRefs.map((ref) => normalizeWritebackRef(ref) ?? ref)),
    appliedWritebackRefs: uniqueRefs((appliedWritebackRefs ?? []).map((ref) => normalizeWritebackRef(ref) ?? ref)),
    appliedCheckAvailable
  };
}

export function evaluateNarrativeArcProgress({
  candidate,
  context,
  existingNarrativeArcs,
  status,
  selectedSourceKeys,
  usedSourceKeys,
  writebackAudit,
  canonicalizeWritebackRef,
  requestId,
  turnId
}: NarrativeArcProgressValidationInput): NarrativeArcProgressValidationResult {
  if (candidate === undefined) {
    return {
      accepted: true,
      diagnostic: {
        ...(requestId ? { requestId } : {}),
        ...(turnId ? { turnId } : {}),
        requestedNodeIds: [],
        candidatePresent: false,
        schemaValid: true,
        sourceValid: true,
        stageContractValid: true,
        writebackEvidenceValid: true,
        accepted: true,
        classification: 'no_progress_candidate',
        rejectionReasons: [],
        writebackReferenceAudit: buildNarrativeArcWritebackReferenceAudit(writebackAudit),
        supportingWritebackRefs: []
      }
    };
  }
  const parsed = parseProgress(candidate, canonicalizeWritebackRef);
  const progress = parsed.progress;
  const reasons: NarrativeArcProgressRejectReason[] = [];
  const sourceKey = progress ? dramaSourceKey(progress.sourceRef) : undefined;
  const source = progress ? narrativeArcSourceForContext(context, progress.sourceRef) : undefined;
  const sourceExisting = progress && source
    ? existingNarrativeArcs.find(
        (arc) => dramaSourceKey(arc.sourceRef) === dramaSourceKey(source.ref)
      )
    : undefined;
  const candidateArc = progress
    ? existingNarrativeArcs.find((arc) => arc.arcInstanceId === progress.arcInstanceId)
    : undefined;
  const canonicalArcInstanceId = sourceExisting?.arcInstanceId ?? (
    source?.arcKey?.trim()
      ? narrativeArcInstanceIdForArcKey(source.arcKey)
      : progress?.arcInstanceId
  );
  const baseNormalizedProgress = progress && source
    ? {
        ...progress,
        ...(canonicalArcInstanceId ? { arcInstanceId: canonicalArcInstanceId } : {}),
        sourceRef: { ...source.ref }
      }
    : progress;
  const sourceSelected = Boolean(sourceKey && selectedSourceKeys.has(sourceKey));
  const sourceUsed = Boolean(sourceKey && usedSourceKeys.has(sourceKey));
  const remainDecision = progress?.decision === 'remain';
  const statusAccepted = remainDecision
    ? ['used_as_texture', 'partially_used', 'used_persistently'].includes(status)
    : status === 'used_persistently';
  if (!parsed.schemaValid) reasons.push('progress_schema_invalid');
  if (isRecord(candidate) && !nonEmptyString(candidate.arcInstanceId)) {
    reasons.push('arc_instance_missing');
  }
  if (!statusAccepted) reasons.push('execution_status_not_persistent');
  if (progress && !progress.arcInstanceId.trim()) reasons.push('arc_instance_missing');
  if (progress && !sourceSelected) reasons.push('source_not_selected');
  else if (progress && !sourceUsed) reasons.push('source_not_used');
  if (progress && sourceSelected && !source) reasons.push('arc_source_mismatch');
  if (
    progress &&
    source &&
    candidateArc &&
    dramaSourceKey(candidateArc.sourceRef) !== dramaSourceKey(source.ref)
  ) {
    reasons.push('arc_source_mismatch');
  }

  const rawKeys = refSet(writebackAudit.rawResponseRefs);
  const schemaKeys = refSet(writebackAudit.schemaValidatedRefs);
  const acceptedKeys = refSet(writebackAudit.acceptedWritebackRefs);
  const appliedKeys = refSet(writebackAudit.appliedWritebackRefs);
  const evidenceReasons: NarrativeArcProgressRejectReason[] = [];
  const refAudits: NarrativeArcSupportingWritebackRefAudit[] = parsed.supportingRefs.map((ref) => {
    const normalized = ref.normalized;
    const normalizedKey = normalized ? writebackKey(normalized) : undefined;
    const presentInRawResponse = Boolean(normalizedKey && rawKeys.has(normalizedKey));
    const passedSchemaValidation = Boolean(normalizedKey && schemaKeys.has(normalizedKey));
    const acceptedByDomainGate = Boolean(normalizedKey && acceptedKeys.has(normalizedKey));
    const appliedToRuntime = Boolean(normalizedKey && appliedKeys.has(normalizedKey));
    if (!normalized) evidenceReasons.push('supporting_writeback_ref_invalid');
    else if (!presentInRawResponse) evidenceReasons.push('supporting_writeback_ref_not_in_raw_response');
    else if (!passedSchemaValidation) evidenceReasons.push('supporting_writeback_ref_dropped_by_validation');
    else if (!acceptedByDomainGate) evidenceReasons.push('supporting_writeback_ref_not_subset');
    else if (writebackAudit.appliedCheckAvailable && !appliedToRuntime) {
      evidenceReasons.push('supporting_writeback_ref_not_applied');
    }
    return {
      kind: ref.originalKind,
      originalRefId: ref.originalId,
      ...(normalized && normalized.id !== ref.originalId ? { normalizedRefId: normalized.id } : {}),
      presentInRawResponse,
      passedSchemaValidation,
      acceptedByDomainGate,
      appliedToRuntime,
      appliedCheckAvailable: writebackAudit.appliedCheckAvailable
    };
  });
  if (!remainDecision) reasons.push(...evidenceReasons);

  const normalizedProgress = baseNormalizedProgress && remainDecision
    ? {
        ...baseNormalizedProgress,
        supportingWritebackRefs: baseNormalizedProgress.supportingWritebackRefs.filter((ref) => {
          const key = writebackKey(ref);
          return acceptedKeys.has(key) && (
            !writebackAudit.appliedCheckAvailable || appliedKeys.has(key)
          );
        })
      }
    : baseNormalizedProgress;

  if (normalizedProgress) {
    const shapeReason = validateNarrativeArcProgressShape({
      progress: normalizedProgress,
      context,
      existingArcs: existingNarrativeArcs
    });
    if (shapeReason) reasons.push(...shapeReasons({ reason: shapeReason, progress: normalizedProgress, context, existingArcs: existingNarrativeArcs }));
  }
  const normalizedReasons = uniqueReasons(reasons);
  const accepted = Boolean(
    parsed.schemaValid &&
      normalizedProgress &&
      statusAccepted &&
      sourceSelected &&
      sourceUsed &&
      !validateNarrativeArcProgressShape({
        progress: normalizedProgress,
        context,
        existingArcs: existingNarrativeArcs
      }) &&
      (remainDecision || (
        normalizedProgress.supportingWritebackRefs.every((ref) => acceptedKeys.has(writebackKey(ref))) &&
        (!writebackAudit.appliedCheckAvailable ||
          normalizedProgress.supportingWritebackRefs.every((ref) => appliedKeys.has(writebackKey(ref))))
      ))
  );
  const contractDetails = allowedContractDetails(context, normalizedProgress, existingNarrativeArcs);
  const diagnostic: NarrativeArcProgressValidationDiagnostic = {
    ...(requestId ? { requestId } : {}),
    ...(turnId ? { turnId } : {}),
    ...(normalizedProgress?.arcInstanceId ? { arcInstanceId: normalizedProgress.arcInstanceId } : {}),
    ...(normalizedProgress?.sourceRef ? { sourceRef: { ...normalizedProgress.sourceRef } } : {}),
    ...(progress?.decision ? { decision: progress.decision } : {}),
    ...contractDetails,
    ...(progress?.currentStageId ? { requestedCurrentStageId: progress.currentStageId } : {}),
    ...(progress?.nextStageId ? { requestedNextStageId: progress.nextStageId } : {}),
    requestedNodeIds: parsed.requestedNodeIds,
    candidatePresent: candidate !== undefined,
    schemaValid: parsed.schemaValid,
    sourceValid: Boolean(source),
    stageContractValid: !normalizedReasons.some((reason) =>
      ['current_stage_mismatch', 'next_stage_missing', 'next_stage_unknown', 'transition_not_allowed', 'node_id_unknown', 'node_not_in_current_contract'].includes(reason)
    ),
    writebackEvidenceValid: remainDecision || !normalizedReasons.some((reason) => reason.startsWith('supporting_writeback_ref_')),
    accepted,
    classification: classification(progress?.decision, accepted),
    rejectionReasons: accepted ? [] : normalizedReasons,
    writebackReferenceAudit: buildNarrativeArcWritebackReferenceAudit(writebackAudit),
    supportingWritebackRefs: refAudits,
    ...(() => {
      const advisoryReasons = uniqueReasons([
        ...(remainDecision ? evidenceReasons : []),
        ...(parsed.supportingRefs.some(
          (ref) => ref.normalized && ref.normalized.id !== ref.originalId
        )
          ? ['writeback_ref_canonicalization_mismatch' as const]
          : [])
      ]);
      return advisoryReasons.length > 0 ? { advisoryReasons } : {};
    })()
  };
  return {
    accepted,
    ...(normalizedProgress ? { normalizedProgress } : {}),
    diagnostic
  };
}

/** Diagnostic-only conflict detection. It is intentionally not an acceptance gate. */
export function detectNarrativeArcProgressConflicts(
  candidates: readonly unknown[]
): Array<{ index: number; reasons: NarrativeArcProgressRejectReason[] }> {
  const seen = new Map<string, { index: number; fingerprint: string }>();
  const results: Array<{ index: number; reasons: NarrativeArcProgressRejectReason[] }> = [];
  candidates.forEach((candidate, index) => {
    const parsed = parseProgress(candidate).progress;
    if (!parsed) return;
    const key = parsed.arcInstanceId;
    const fingerprint = `${parsed.decision}:${parsed.currentStageId ?? ''}:${parsed.nextStageId ?? ''}`;
    const prior = seen.get(key);
    if (prior) {
      results.push({
        index,
        reasons: [prior.fingerprint === fingerprint ? 'duplicate_progress_candidate' : 'conflicting_progress_candidate']
      });
    } else {
      seen.set(key, { index, fingerprint });
    }
  });
  return results;
}

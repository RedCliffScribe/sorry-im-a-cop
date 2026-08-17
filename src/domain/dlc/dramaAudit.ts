import type { PromptContext } from '../context/selectContext';
import { getProjectedDramaPayload } from '../drama/sourceRegistry';
import type {
  DramaExecutionTrace,
  DramaPlan,
  DramaPlanningContext,
  DramaSourceRef,
  PlanningSource
} from '../drama/types';
import type { SaveDlcStatus } from './types';
import type { SaveDlcBinding } from './types';

export type OfficialDlcDramaAuditSourceType = 'event' | 'character' | 'news';

export interface OfficialDlcDramaAuditRecord {
  requestId: string;
  turn: number;
  dlcId: string;
  status: SaveDlcStatus;
  sourceGenerated: boolean;
  sourceProjected: boolean;
  sourceInPlanningContext: boolean;
  selected: boolean;
  executed: boolean;
  /** Whether the selected source resolved to an execution payload. */
  executionPayloadCreated: boolean;
  /** Whether the final response contained an execution trace for this source. */
  executionTracePresent: boolean;
  sourceType: OfficialDlcDramaAuditSourceType;
  sourceId: string;
  omittedReason?: string;
  createdAt: string;
}

export interface BuildOfficialDlcDramaAuditInput {
  requestId: string;
  turn: number;
  context: PromptContext;
  /** Explicit runtime binding snapshot; keeps the audit independent from prompt projection. */
  officialDlcBindings?: readonly SaveDlcBinding[];
  inventorySources: readonly PlanningSource[];
  generatedSources: readonly PlanningSource[];
  projectedSources: readonly PlanningSource[];
  planningContext?: DramaPlanningContext;
  plan?: DramaPlan;
  trace?: DramaExecutionTrace;
  createdAt?: string;
}

function sourceType(value: string): OfficialDlcDramaAuditSourceType | undefined {
  if (value === 'official_dlc_event') return 'event';
  if (value === 'official_dlc_character') return 'character';
  if (value === 'official_dlc_news') return 'news';
  return undefined;
}

function key(ref: DramaSourceRef): string {
  return `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`;
}

function sourceRefsFromPlan(plan: DramaPlan | undefined): Set<string> {
  if (!plan) return new Set();
  return new Set(
    [plan.primarySource, ...plan.supportSources]
      .filter((ref): ref is DramaSourceRef => Boolean(ref))
      .map(key)
  );
}

function sourceRefsFromTrace(trace: DramaExecutionTrace | undefined): Set<string> {
  return new Set((trace?.usedSourceRefs ?? []).map(key));
}

function sourceInPlanningContext(
  planningContext: DramaPlanningContext | undefined,
  source: PlanningSource
): boolean {
  if (!planningContext) return false;
  return [
    ...planningContext.requiredContextSources,
    ...planningContext.userPrioritySources,
    ...planningContext.optionalDynamicSources,
    ...planningContext.staticSeedSources,
    ...(planningContext.officialDlcSources ?? [])
  ].some((candidate) => key(candidate.ref) === key(source.ref));
}

function bindingStatus(
  context: PromptContext,
  dlcId: string,
  bindings?: readonly SaveDlcBinding[]
): { status: SaveDlcStatus; found: boolean } {
  const binding = (bindings ?? context.officialDlcBindings)?.find((candidate) => candidate.dlcId === dlcId);
  return binding
    ? { status: binding.status, found: true }
    : { status: 'paused', found: false };
}

function omittedReason(input: {
  statusFound: boolean;
  sourceGenerated: boolean;
  sourceProjected: boolean;
  sourceInPlanningContext: boolean;
  selected: boolean;
  executionPayloadCreated: boolean;
  executed: boolean;
  executionTracePresent: boolean;
}): string | undefined {
  if (!input.statusFound) return 'binding_missing';
  if (!input.sourceGenerated) return 'provider_inactive_or_unsupported';
  if (!input.sourceProjected) return 'projection_filtered';
  if (!input.sourceInPlanningContext) return 'planning_context_omitted';
  if (!input.selected) return 'candidate_not_selected';
  if (!input.executionPayloadCreated) return 'execution_payload_missing';
  if (!input.executionTracePresent) return 'execution_trace_missing';
  if (!input.executed) return 'execution_trace_did_not_use_source';
  return undefined;
}

/**
 * Builds a read-only, per-turn explanation of where each official DLC source
 * reached in the Drama pipeline. The result is deliberately ephemeral: callers
 * may display/export it, but it is never written into RuntimeState.
 */
export function buildOfficialDlcDramaAudit(
  input: BuildOfficialDlcDramaAuditInput
): OfficialDlcDramaAuditRecord[] {
  // A save without any official-DLC binding has no DLC source to audit. This
  // keeps the normal game's diagnostic export quiet while still reporting the
  // full inventory for a save that explicitly selected a DLC and then lost a
  // source at a later pipeline stage.
  const bindings = input.officialDlcBindings ?? input.context.officialDlcBindings;
  if (!bindings?.length) return [];
  const generatedKeys = new Set(input.generatedSources.map((source) => key(source.ref)));
  const projectedKeys = new Set(input.projectedSources.map((source) => key(source.ref)));
  const selectedKeys = sourceRefsFromPlan(input.plan);
  const executedKeys = sourceRefsFromTrace(input.trace);
  const tracePresent = Boolean(input.trace);
  const createdAt = input.createdAt ?? new Date().toISOString();

  return input.inventorySources.flatMap((source) => {
    if (source.ref.providerId !== 'official-dlc') return [];
    const normalizedType = sourceType(source.ref.sourceType);
    if (!normalizedType) return [];
    const dlcId = (source.ref as DramaSourceRef & { dlcId?: unknown }).dlcId;
    if (typeof dlcId !== 'string' || !dlcId.trim()) return [];
    const binding = bindingStatus(input.context, dlcId, bindings);
    const sourceGenerated = generatedKeys.has(key(source.ref));
    const sourceProjected = projectedKeys.has(key(source.ref));
    const sourceInPlanning = sourceInPlanningContext(input.planningContext, source);
    const selected = selectedKeys.has(key(source.ref));
    const executionPayloadCreated = selected && Boolean(getProjectedDramaPayload(input.context, source.ref));
    const executed = executedKeys.has(key(source.ref));
    const executionTracePresent = tracePresent && (selected || executed);
    const reason = omittedReason({
      statusFound: binding.found,
      sourceGenerated,
      sourceProjected,
      sourceInPlanningContext: sourceInPlanning,
      selected,
      executionPayloadCreated,
      executed,
      executionTracePresent
    });
    return [{
      requestId: input.requestId,
      turn: input.turn,
      dlcId,
      status: binding.status,
      sourceGenerated,
      sourceProjected,
      sourceInPlanningContext: sourceInPlanning,
      selected,
      executed,
      executionPayloadCreated,
      executionTracePresent,
      sourceType: normalizedType,
      sourceId: source.ref.sourceId,
      ...(reason ? { omittedReason: reason } : {}),
      createdAt
    }];
  });
}

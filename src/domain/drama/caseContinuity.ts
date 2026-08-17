import type { RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';
import type {
  DramaExecutionTrace,
  ForegroundContract
} from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveCaseId(caseId: string, aliases: ReadonlyMap<string, string>): string {
  return aliases.get(caseId) ?? caseId;
}

/**
 * Rewrites only typed case-reference slots. Narrative text and arbitrary string
 * values are deliberately left untouched; this is stable-ID reconciliation,
 * not fuzzy incident matching.
 */
function remapCaseReferences<T>(value: T, aliases: ReadonlyMap<string, string>): T {
  if (Array.isArray(value)) {
    return value.map((item) => remapCaseReferences(item, aliases)) as T;
  }
  if (!isRecord(value)) return value;

  const remapped: UnknownRecord = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'caseId' && typeof child === 'string') {
      remapped[key] = resolveCaseId(child, aliases);
      continue;
    }
    if (key === 'relatedCaseIds' && Array.isArray(child)) {
      remapped[key] = Array.from(new Set(child.map((item) =>
        typeof item === 'string'
          ? resolveCaseId(item, aliases)
          : remapCaseReferences(item, aliases)
      )));
      continue;
    }
    remapped[key] = remapCaseReferences(child, aliases);
  }

  if (remapped.kind === 'case') {
    if (typeof remapped.id === 'string') {
      remapped.id = resolveCaseId(remapped.id, aliases);
    }
    if (typeof remapped.refId === 'string') {
      remapped.refId = resolveCaseId(remapped.refId, aliases);
    }
    if (typeof remapped.originalRefId === 'string') {
      remapped.originalRefId = resolveCaseId(remapped.originalRefId, aliases);
    }
    if (typeof remapped.normalizedRefId === 'string') {
      remapped.normalizedRefId = resolveCaseId(remapped.normalizedRefId, aliases);
    }
  }
  return remapped as T;
}

function noChange(
  response: NarratorResponse,
  executionTrace?: DramaExecutionTrace
): CaseContinuityResult {
  return {
    response,
    ...(executionTrace ? { executionTrace } : {}),
    diagnostics: []
  };
}

export interface CaseContinuityResult {
  response: NarratorResponse;
  executionTrace?: DramaExecutionTrace;
  diagnostics: StoryDiagnosticIssue[];
  caseIdAliases?: Readonly<Record<string, string>>;
}

/**
 * A narrow post-validation guard for persistent incident arcs. It activates
 * only when the selected primary source explicitly opts in and points to one
 * existing Runtime case. The first case can still be created normally; later
 * parallel case IDs are reconciled to the already-linked stable case.
 */
export function enforceDramaCaseContinuity({
  state,
  response,
  contract,
  executionTrace
}: {
  state: RuntimeState;
  response: NarratorResponse;
  contract?: ForegroundContract;
  executionTrace?: DramaExecutionTrace;
}): CaseContinuityResult {
  if (contract?.caseContinuityPolicy !== 'reuse_linked_when_present') {
    return noChange(response, executionTrace);
  }

  const existingLinkedCaseIds = Array.from(new Set(contract.caseContinuityCaseIds ?? []))
    .filter((caseId) => Boolean(state.cases[caseId]));
  if (existingLinkedCaseIds.length !== 1) {
    return noChange(response, executionTrace);
  }

  const targetCaseId = existingLinkedCaseIds[0];
  const newCasePatches = response.writeback.casePatches
    .map((patch, index) => ({ patch, index }))
    .filter(({ patch }) => patch.caseId !== targetCaseId && !state.cases[patch.caseId]);
  if (newCasePatches.length === 0) {
    return noChange(response, executionTrace);
  }

  const aliases = new Map(newCasePatches.map(({ patch }) => [patch.caseId, targetCaseId]));
  const remappedResponse = remapCaseReferences(response, aliases);
  const remappedTrace = executionTrace
    ? remapCaseReferences(executionTrace, aliases)
    : undefined;
  const aliasedCaseIds = new Set(aliases.keys());
  const casePatches = remappedResponse.writeback.casePatches.map((patch, index) => {
    const originalCaseId = response.writeback.casePatches[index]?.caseId;
    if (!originalCaseId || !aliasedCaseIds.has(originalCaseId) || !patch.activityLog) {
      return patch;
    }
    return {
      ...patch,
      activityLog: patch.activityLog.map((activity) =>
        activity.kind === 'created'
          ? { ...activity, kind: 'note' as const }
          : activity
      )
    };
  });
  const normalizedResponse: NarratorResponse = {
    ...remappedResponse,
    ...(remappedTrace ? { dramaExecutionTrace: remappedTrace } : {}),
    writeback: {
      ...remappedResponse.writeback,
      casePatches
    }
  };
  const caseIdAliases = Object.fromEntries(aliases);

  return {
    response: normalizedResponse,
    ...(remappedTrace ? { executionTrace: remappedTrace } : {}),
    caseIdAliases,
    diagnostics: newCasePatches.map(({ patch, index }) => ({
      path: ['writeback', 'casePatches', index, 'caseId'],
      code: 'drama_case_continuity_reconciled',
      message: `持续剧情弧已将平行案件 ${patch.caseId} 对账为既有关联案件 ${targetCaseId}。`
    }))
  };
}

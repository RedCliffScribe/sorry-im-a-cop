import type { RuntimeState } from '../runtime/types';
import type {
  DramaExecutionReceipt,
  DramaExecutionTrace,
  DramaPlanningDiagnostic,
  ForegroundContract
} from './types';
import { collectOfficialDlcExposureRefs } from './sourceExposure';

const MAX_DRAMA_INSTANCES = 120;
const MAX_DRAMA_DIAGNOSTICS = 20;
const MAX_DRAMA_EXECUTIONS = 20;

export function recordDramaTurn(
  state: RuntimeState,
  trace: DramaExecutionTrace | undefined,
  diagnostics: DramaPlanningDiagnostic[],
  receipt?: DramaExecutionReceipt,
  contract?: ForegroundContract
): RuntimeState {
  const current = state.dramaticContent ?? {
    instances: [],
    recentDiagnostics: []
  };
  const exposedOfficialDlcSourceRefs = collectOfficialDlcExposureRefs(
    state,
    trace && trace.status !== 'not_used' ? trace.usedSourceRefs : []
  );
  const instances = current.instances.map((instance) => ({ ...instance }));
  const matchingArcIndex = contract?.primaryArcKey
    ? instances.findIndex(
        (instance) =>
          instance.status === 'active' && instance.arcKey === contract.primaryArcKey
      )
    : -1;
  if (matchingArcIndex >= 0) {
    const matching = instances[matchingArcIndex];
    instances[matchingArcIndex] = {
      ...matching,
      lastPlannedTurn: state.turnCounter,
      lastUsedTurn:
        trace && trace.status !== 'not_used'
          ? state.turnCounter
          : matching.lastUsedTurn,
      surfaceCount:
        trace && trace.status !== 'not_used'
          ? (matching.surfaceCount ?? 0) + 1
          : matching.surfaceCount,
      cooldownUntilTurn: state.turnCounter + 2
    };
  }
  if (trace?.status === 'used_persistently' && trace.resultingWritebackRefs.length > 0) {
    const turnId = state.storyLog.at(-1)?.turnId ?? `turn_${state.turnCounter}`;
    if (matchingArcIndex >= 0) {
      const matching = instances[matchingArcIndex];
      instances[matchingArcIndex] = {
        ...matching,
        sourceRefs: Array.from(
          new Map(
            [...matching.sourceRefs, ...trace.usedSourceRefs].map((ref) => [
              `${ref.providerId}:${ref.sourceType}:${ref.sourceId}`,
              { ...ref }
            ])
          ).values()
        ),
        resultingWritebackRefs: Array.from(
          new Map(
            [
              ...matching.resultingWritebackRefs,
              ...trace.resultingWritebackRefs
            ].map((ref) => [`${ref.kind}:${ref.id}`, { ...ref }])
          ).values()
        ),
        lastUsedTurn: state.turnCounter,
        surfaceCount: Math.max(1, matching.surfaceCount ?? 0),
        cooldownUntilTurn: state.turnCounter + 2
      };
    } else {
      instances.push({
        instanceId: `${trace.planId}:${turnId}`,
        sourceRefs: trace.usedSourceRefs.map((ref) => ({ ...ref })),
        resultingWritebackRefs: trace.resultingWritebackRefs.map((ref) => ({ ...ref })),
        createdTurnId: turnId,
        ...(contract
          ? {
              arcKey: contract.primaryArcKey,
              lastPlannedTurn: state.turnCounter,
              lastUsedTurn: state.turnCounter,
              surfaceCount: 1,
              cooldownUntilTurn: state.turnCounter + 2
            }
          : {}),
        status: 'active'
      });
    }
  }
  return {
    ...state,
    dramaticContent: {
      ...current,
      instances: instances.slice(-MAX_DRAMA_INSTANCES),
      recentDiagnostics: [...current.recentDiagnostics, ...diagnostics].slice(-MAX_DRAMA_DIAGNOSTICS),
      recentExecutions: receipt
        ? [...(current.recentExecutions ?? []), receipt].slice(-MAX_DRAMA_EXECUTIONS)
        : current.recentExecutions,
      exposedOfficialDlcSourceRefs
    }
  };
}

import type { PromptContext } from '../context/selectContext';
import {
  isDramaSourceAlreadyExposed,
  listProjectedDramaSources
} from '../drama/sourceRegistry';
import type { RuntimeState } from '../runtime/types';
import type { PlanningSource, DramaSourceRef } from '../drama/types';
import { filterCompletedNarrativeArcSources } from '../drama/narrativeArc';
import type { SaveDlcStatus } from './types';

export interface OfficialDlcPlanningIntent {
  dlcId: string;
  enabled: boolean;
  status: SaveDlcStatus;
  firstExposureCompleted: boolean;
  sourceCount: number;
  exposedSourceCount: number;
  unexposedSourceCount: number;
  lastPlanningTurn?: number;
}

export interface OfficialDlcPlanningResolution {
  eligible: boolean;
  intents: OfficialDlcPlanningIntent[];
  sources: PlanningSource[];
  reason?:
    | 'no_active_binding'
    | 'planning_disabled'
    | 'already_exposed'
    | 'cooldown'
    | 'no_projected_sources';
}

function sourceDlcId(ref: DramaSourceRef): string | undefined {
  const value = (ref as DramaSourceRef & { dlcId?: unknown }).dlcId;
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function resolveBindings(state: RuntimeState, context: PromptContext) {
  return context.officialDlcBindings?.length
    ? context.officialDlcBindings
    : state.world.officialDlcBindings ?? [];
}

/**
 * Resolves the lightweight planning intent from an explicit save binding and
 * the bounded Drama history. It deliberately does not create a DLC runtime
 * object or mutate the save.
 */
export function resolveOfficialDlcPlanning(
  state: RuntimeState,
  context: PromptContext,
  turnCounter = state.turnCounter + 1
): OfficialDlcPlanningResolution {
  const bindings = resolveBindings(state, context);
  const activeBindings = bindings.filter((binding) => binding.status === 'active');
  if (activeBindings.length === 0) {
    return { eligible: false, intents: [], sources: [], reason: 'no_active_binding' };
  }

  const planningContext = context.officialDlcBindings?.length
    ? context
    : { ...context, officialDlcBindings: [...bindings] };
  const projectedSources = filterCompletedNarrativeArcSources(
    state,
    listProjectedDramaSources(planningContext)
  ).filter(
    (source) =>
      source.ref.providerId === 'official-dlc' &&
      source.ref.sourceType === 'official_dlc_event'
  );
  const recentExecutions = state.dramaticContent?.recentExecutions ?? [];

  const intents = activeBindings.map((binding) => {
    const dlcId = binding.dlcId;
    const bindingSources = projectedSources.filter(
      (source) => sourceDlcId(source.ref) === dlcId
    );
    const exposedSourceCount = bindingSources.filter((source) =>
      isDramaSourceAlreadyExposed(state, source)
    ).length;
    const sourceCount = bindingSources.length;
    const unexposedSourceCount = sourceCount - exposedSourceCount;
    const firstExposureCompleted = sourceCount > 0 && unexposedSourceCount === 0;
    const lastPlanningTurn = [...recentExecutions]
      .reverse()
      .find(
        (receipt) =>
          receipt.resolvedPlanningRoute === 'official_dlc_only' &&
          receipt.officialDlcSourceCount && receipt.officialDlcSourceCount > 0
      )?.turnCounter;
    return {
      dlcId,
      enabled: binding.planningEnabled !== false,
      status: binding.status,
      firstExposureCompleted,
      sourceCount,
      exposedSourceCount,
      unexposedSourceCount,
      ...(lastPlanningTurn === undefined ? {} : { lastPlanningTurn })
    };
  });

  const eligibleIntents = intents.filter((intent) => {
    if (!intent.enabled || intent.firstExposureCompleted) return false;
    return intent.lastPlanningTurn === undefined || turnCounter - intent.lastPlanningTurn >= 3;
  });
  const sources = projectedSources.filter((source) => {
    const dlcId = sourceDlcId(source.ref);
    return (
      dlcId !== undefined &&
      !isDramaSourceAlreadyExposed(state, source) &&
      eligibleIntents.some((intent) => intent.dlcId === dlcId)
    );
  });

  if (sources.length === 0) {
    const reason =
      intents.some((intent) => intent.firstExposureCompleted)
        ? 'already_exposed'
        : intents.some((intent) => intent.lastPlanningTurn !== undefined && turnCounter - intent.lastPlanningTurn < 3)
          ? 'cooldown'
          : intents.some((intent) => !intent.enabled)
            ? 'planning_disabled'
            : 'no_projected_sources';
    return { eligible: false, intents, sources: [], reason };
  }
  return { eligible: true, intents, sources };
}

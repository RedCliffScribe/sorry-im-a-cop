import { gameTimeToEpochMinutes } from '../backgroundEvolution/time';
import type { GameTime, RuntimeState, Signal, SignalStatus } from '../runtime/types';

const ACTIVE_LIFETIME_HOURS: Record<Signal['reliability'], number> = {
  unknown: 48,
  low: 72,
  medium: 120,
  high: 168
};

const ARCHIVE_AFTER_STALE_HOURS = 7 * 24;
const ARCHIVE_RESOLVED_AFTER_HOURS = 24;

export type DynamicArchiveTarget =
  | { kind: 'matter'; id: string }
  | { kind: 'signal'; id: string };

function elapsedHours(from: GameTime, to: GameTime): number {
  return (gameTimeToEpochMinutes(to) - gameTimeToEpochMinutes(from)) / 60;
}

export function resolveSignalLifecycleStatus(signal: Signal, now: GameTime): SignalStatus {
  if (signal.status === 'archived') return 'archived';

  const ageHours = elapsedHours(signal.updatedAt, now);
  if (!Number.isFinite(ageHours) || ageHours < 0) return signal.status;

  if (signal.status === 'resolved') {
    return ageHours >= ARCHIVE_RESOLVED_AFTER_HOURS ? 'archived' : 'resolved';
  }

  const activeLifetime = ACTIVE_LIFETIME_HOURS[signal.reliability];
  const archiveAge = activeLifetime + ARCHIVE_AFTER_STALE_HOURS;
  if (ageHours >= archiveAge) return 'archived';
  if (signal.status === 'stale' || ageHours >= activeLifetime) return 'stale';
  return 'active';
}

export function isCurrentSignal(signal: Signal, now: GameTime): boolean {
  return resolveSignalLifecycleStatus(signal, now) === 'active';
}

export interface SignalLifecycleResult {
  state: RuntimeState;
  staleSignalIds: string[];
  archivedSignalIds: string[];
}

export function advanceSignalLifecycle(state: RuntimeState): SignalLifecycleResult {
  let nextSignals = state.dynamicEvents.signals;
  const staleSignalIds: string[] = [];
  const archivedSignalIds: string[] = [];

  for (const signal of Object.values(state.dynamicEvents.signals)) {
    const status = resolveSignalLifecycleStatus(signal, state.time);
    if (status === signal.status) continue;
    if (nextSignals === state.dynamicEvents.signals) nextSignals = { ...nextSignals };
    nextSignals[signal.id] = { ...signal, status };
    if (status === 'stale') staleSignalIds.push(signal.id);
    if (status === 'archived') archivedSignalIds.push(signal.id);
  }

  if (nextSignals === state.dynamicEvents.signals) {
    return { state, staleSignalIds, archivedSignalIds };
  }

  return {
    state: {
      ...state,
      dynamicEvents: {
        ...state.dynamicEvents,
        signals: nextSignals
      }
    },
    staleSignalIds,
    archivedSignalIds
  };
}

export function archiveDynamicEntry(state: RuntimeState, target: DynamicArchiveTarget): RuntimeState {
  if (target.kind === 'signal') {
    const signal = state.dynamicEvents.signals[target.id];
    if (!signal || signal.status === 'archived') return state;
    return {
      ...state,
      dynamicEvents: {
        ...state.dynamicEvents,
        signals: {
          ...state.dynamicEvents.signals,
          [target.id]: {
            ...signal,
            status: 'archived',
            updatedAt: { ...state.time }
          }
        }
      }
    };
  }

  const matter = state.dynamicEvents.currentMatters[target.id];
  if (!matter || matter.status === 'archived') return state;
  return {
    ...state,
    dynamicEvents: {
      ...state.dynamicEvents,
      currentMatters: {
        ...state.dynamicEvents.currentMatters,
        [target.id]: {
          ...matter,
          status: 'archived',
          unread: false,
          updatedAt: { ...state.time }
        }
      }
    }
  };
}

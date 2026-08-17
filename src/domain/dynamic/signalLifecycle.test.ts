import { describe, expect, it } from 'vitest';
import { addGameHours } from '../backgroundEvolution/time';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Signal } from '../runtime/types';
import {
  advanceSignalLifecycle,
  archiveDynamicEntry,
  isCurrentSignal,
  resolveSignalLifecycleStatus
} from './signalLifecycle';

function createSignal(overrides: Partial<Signal> = {}): Signal {
  const state = createInitialRuntimeState();
  return {
    id: 'signal_test',
    title: '街口风声',
    summary: '有人说夜场准备换看场人。',
    signalType: 'rumor',
    reliability: 'unknown',
    status: 'active',
    visibility: 'known',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: { ...state.time },
    updatedAt: { ...state.time },
    ...overrides
  };
}

describe('signal lifecycle', () => {
  it('marks an unrefreshed unknown rumor stale after two game days', () => {
    const signal = createSignal();
    const now = addGameHours(signal.updatedAt, 49);

    expect(resolveSignalLifecycleStatus(signal, now)).toBe('stale');
    expect(isCurrentSignal(signal, now)).toBe(false);
  });

  it('keeps higher reliability signals active for longer', () => {
    const signal = createSignal({ reliability: 'high' });

    expect(resolveSignalLifecycleStatus(signal, addGameHours(signal.updatedAt, 120))).toBe('active');
  });

  it('archives old active and resolved signals without changing their content timestamp', () => {
    const state = createInitialRuntimeState();
    const oldSignal = createSignal({ updatedAt: addGameHours(state.time, -(48 + 7 * 24 + 1)) });
    const resolvedSignal = createSignal({
      id: 'signal_resolved',
      status: 'resolved',
      updatedAt: addGameHours(state.time, -25)
    });
    state.dynamicEvents.signals = {
      [oldSignal.id]: oldSignal,
      [resolvedSignal.id]: resolvedSignal
    };

    const result = advanceSignalLifecycle(state);

    expect(result.archivedSignalIds).toEqual(['signal_test', 'signal_resolved']);
    expect(result.state.dynamicEvents.signals.signal_test.status).toBe('archived');
    expect(result.state.dynamicEvents.signals.signal_test.updatedAt).toEqual(oldSignal.updatedAt);
  });

  it('persists a local stale transition without mutating the input state', () => {
    const state = createInitialRuntimeState();
    const signal = createSignal({ updatedAt: addGameHours(state.time, -49) });
    state.dynamicEvents.signals = { [signal.id]: signal };

    const result = advanceSignalLifecycle(state);

    expect(state.dynamicEvents.signals.signal_test.status).toBe('active');
    expect(result.staleSignalIds).toEqual(['signal_test']);
    expect(result.state.dynamicEvents.signals.signal_test.status).toBe('stale');
  });

  it('manually archives a signal or matter while preserving other dynamic entries', () => {
    const state = createInitialRuntimeState();
    const signal = createSignal();
    state.dynamicEvents.signals[signal.id] = signal;
    state.dynamicEvents.currentMatters.matter_test = {
      id: 'matter_test',
      title: '仍在发酵的事项',
      summary: '玩家决定不再把它放在当前列表。',
      status: 'active',
      priority: 50,
      visibility: 'known',
      source: 'street',
      relatedActorIds: [],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: { ...state.time },
      updatedAt: { ...state.time },
      unread: true
    };

    const signalArchived = archiveDynamicEntry(state, { kind: 'signal', id: signal.id });
    const matterArchived = archiveDynamicEntry(signalArchived, { kind: 'matter', id: 'matter_test' });

    expect(matterArchived.dynamicEvents.signals.signal_test.status).toBe('archived');
    expect(matterArchived.dynamicEvents.currentMatters.matter_test.status).toBe('archived');
    expect(matterArchived.dynamicEvents.currentMatters.matter_test.unread).toBe(false);
    expect(state.dynamicEvents.signals.signal_test.status).toBe('active');
  });
});

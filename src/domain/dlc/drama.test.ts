import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import { listProjectedDramaSources, projectedDramaSourceProviders } from '../drama/sourceRegistry';
import { createOfficialDlcDiagnostics } from './diagnostics';
import {
  filterOfficialDlcSources,
  isOfficialDlcSourceActive,
  officialDlcDramaSourceContract
} from './drama';
import { officialDlcTestStubManifest, officialDlcTestStubProvider } from './testing';
import type { PlanningSource } from '../drama/types';

function source(ref: PlanningSource['ref']): PlanningSource {
  return {
    ref,
    title: ref.sourceId,
    plannerSummary: ref.sourceId,
    sourceStatus: 'undecided_suggestion',
    reusePolicy: 'context_reusable',
    priorityClass: 'normal',
    channelIds: ['city_news'],
    softAffinities: {},
    mandatory: false,
    score: 1,
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    relatedCaseIds: []
  };
}

describe('official DLC Drama boundary', () => {
  it('filters only official DLC sources by binding status and leaves ordinary sources untouched', () => {
    const officialRef = {
      providerId: 'official-dlc',
      sourceType: 'official_dlc_event',
      sourceId: 'event_1',
      dlcId: 'dlc_a'
    } as PlanningSource['ref'] & { dlcId: string };
    const ordinary = source({ providerId: 'runtime-dynamic', sourceType: 'signal', sourceId: 'signal_1' });

    expect(isOfficialDlcSourceActive([{ dlcId: 'dlc_a', version: '1', status: 'active' }], officialRef)).toBe(true);
    expect(isOfficialDlcSourceActive([{ dlcId: 'dlc_a', version: '1', status: 'paused' }], officialRef)).toBe(false);
    expect(filterOfficialDlcSources(undefined, [source(officialRef), ordinary])).toEqual([ordinary]);
  });

  it('keeps the registered provider contract explicit without changing ordinary source rules', () => {
    expect(officialDlcDramaSourceContract.registered).toBe(true);
    expect(officialDlcDramaSourceContract.sourceTypes).toContain('official_dlc_news');
  });

  it('projects the test-only NPC, event and news sources only for an active supported binding', () => {
    const state = createInitialRuntimeState();
    state.world.officialDlcBindings = [{
      dlcId: officialDlcTestStubManifest.dlcId,
      version: officialDlcTestStubManifest.version,
      status: 'active'
    }];
    const context = selectContext(state, '继续');
    const sources = officialDlcTestStubProvider.list(context);

    expect(sources.map((item) => item.ref.sourceType)).toEqual([
      'official_dlc_character',
      'official_dlc_event',
      'official_dlc_news'
    ]);
    expect(officialDlcTestStubProvider.getExecutionPayload(context, sources[0]!.ref)?.ref).toEqual(
      sources[0]!.ref
    );

    state.world.officialDlcBindings[0]!.status = 'paused';
    expect(officialDlcTestStubProvider.list(selectContext(state, '继续'))).toEqual([]);

    state.world.officialDlcBindings[0]!.status = 'active';
    const registeredForTest = listProjectedDramaSources(
      selectContext(state, '继续'),
      [...projectedDramaSourceProviders, officialDlcTestStubProvider]
    );
    expect(registeredForTest.some((item) => item.ref.providerId === 'official-dlc')).toBe(true);
    state.world.officialDlcBindings[0]!.status = 'paused';
    expect(listProjectedDramaSources(
      selectContext(state, '继续'),
      [...projectedDramaSourceProviders, officialDlcTestStubProvider]
    ).some((item) => item.ref.providerId === 'official-dlc')).toBe(false);
    state.world.officialDlcBindings[0]!.status = 'completed';
    expect(officialDlcTestStubProvider.list(selectContext(state, '继续'))).toEqual([]);
  });

  it('builds diagnostics from bindings without adding activity to runtime state', () => {
    const diagnostics = createOfficialDlcDiagnostics(
      [{
        dlcId: officialDlcTestStubManifest.dlcId,
        version: officialDlcTestStubManifest.version,
        status: 'active',
        activatedAt: '2026-08-04T00:00:00.000Z'
      }],
      [officialDlcTestStubManifest],
      { official_dlc_test: { lastTurnId: 'turn_3', eventsProduced: 1 } }
    );

    expect(diagnostics).toEqual([{
      dlcId: officialDlcTestStubManifest.dlcId,
      title: officialDlcTestStubManifest.title,
      version: officialDlcTestStubManifest.version,
      status: 'active',
      activatedAt: '2026-08-04T00:00:00.000Z',
      dramaSource: 'enabled',
      recentProgress: { lastTurnId: 'turn_3', eventsProduced: 1 }
    }]);
  });
});

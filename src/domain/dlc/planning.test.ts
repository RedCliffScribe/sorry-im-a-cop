import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import {
  assembleDramaPlanningContext,
  assembleOfficialDlcPlanningContext,
  allDramaPlanningSources
} from '../drama/assemblePlanningContext';
import { defaultDramaticContentSettings } from '../drama/settings';
import { createInitialRuntimeState } from '../runtime/initialState';
import { listProjectedDramaSources } from '../drama/sourceRegistry';
import { urbanLegendsAlphaManifest } from './urbanLegendsAlpha/content';
import { urbanLegendsFormalManifest } from './urbanLegends/content';
import { resolveOfficialDlcPlanning } from './planning';

function activeState() {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsAlphaManifest.dlcId,
    version: urbanLegendsAlphaManifest.version,
    status: 'active'
  }];
  const context = selectContext(state, '继续巡逻');
  return { state, context };
}

function formalActiveState() {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsFormalManifest.dlcId,
    version: urbanLegendsFormalManifest.version,
    status: 'active'
  }];
  const context = selectContext(state, '继续巡逻');
  return { state, context };
}

describe('official DLC planning intent', () => {
  it('keeps the original route quiet when no official DLC is bound', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const context = selectContext(state, '继续巡逻');
    const resolution = resolveOfficialDlcPlanning(state, context, 1);
    expect(resolution).toEqual({
      eligible: false,
      intents: [],
      sources: [],
      reason: 'no_active_binding'
    });
  });

  it('enables a compact official-DLC route under original pacing', () => {
    const { state, context } = activeState();
    const resolution = resolveOfficialDlcPlanning(state, context, 1);
    expect(resolution.eligible).toBe(true);
    expect(resolution.sources.length).toBeGreaterThan(0);

    const planning = assembleOfficialDlcPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '继续巡逻',
      resolution.sources
    );
    expect(planning.planningMode).toBe('official_dlc_only');
    expect(planning.planningRoute).toBe('official_dlc_only');
    expect(planning.officialDlcSources?.length).toBeLessThanOrEqual(4);
    expect(planning.officialDlcSources?.length).toBeGreaterThan(0);
    expect(allDramaPlanningSources(planning).every((source) =>
      source.ref.providerId === 'official-dlc' ||
      ['runtime-dynamic', 'runtime-relationship', 'runtime-case', 'runtime-evolution', 'livelihood']
        .includes(source.ref.providerId)
    )).toBe(true);
  });

  it('honours the per-save planning switch without changing DLC status', () => {
    const { state } = activeState();
    state.world.officialDlcBindings![0]!.planningEnabled = false;
    const context = selectContext(state, '继续巡逻');
    const resolution = resolveOfficialDlcPlanning(state, context, 1);
    expect(resolution.eligible).toBe(false);
    expect(resolution.reason).toBe('planning_disabled');
    expect(state.world.officialDlcBindings![0]!.status).toBe('active');
  });

  it('does not enable a route for paused or completed bindings', () => {
    const { state } = activeState();
    for (const status of ['paused', 'completed'] as const) {
      state.world.officialDlcBindings![0]!.status = status;
      const nextContext = selectContext(state, '继续巡逻');
      const resolution = resolveOfficialDlcPlanning(state, nextContext, 1);
      expect(resolution.eligible).toBe(false);
      expect(resolution.reason).toBe('no_active_binding');
    }
  });

  it('stops the first-exposure route after an official source has been used', () => {
    const { state, context } = activeState();
    const source = listProjectedDramaSources(context).find(
      (candidate) =>
        candidate.ref.providerId === 'official-dlc' &&
        candidate.ref.sourceType === 'official_dlc_event'
    );
    expect(source).toBeDefined();
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      recentExecutions: [{
        turnCounter: 0,
        pacing: 'original',
        planningRoute: 'auto',
        resolvedPlanningRoute: 'official_dlc_only',
        officialDlcSourceCount: 4,
        officialDlcSelected: true,
        officialDlcExecuted: true,
        materialLevel: 'standard',
        storypackInfluence: 'off',
        screenCharacterSeedsEnabled: true,
        planningCalled: true,
        planningSucceeded: true,
        planningDurationMs: 1,
        inputCandidateCount: 4,
        inputCharacterCount: 10,
        estimatedInputTokens: 3,
        primarySourceRef: source!.ref,
        supportSourceRefs: [],
        usedSourceRefs: [source!.ref],
        persistentWriteCount: 0,
        filterRuleIds: []
      }]
    };
    const resolution = resolveOfficialDlcPlanning(state, context, 1);
    expect(resolution.eligible).toBe(false);
    expect(resolution.reason).toBe('already_exposed');
  });

  it('tracks first exposure per formal story source instead of disabling the whole DLC', () => {
    const { state, context } = formalActiveState();
    const sources = listProjectedDramaSources(context).filter(
      (candidate) =>
        candidate.ref.providerId === 'official-dlc' &&
        candidate.ref.sourceType === 'official_dlc_event'
    );
    expect(sources).toHaveLength(17);
    const usedSource = sources[0]!;
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      recentExecutions: [{
        turnCounter: 0,
        pacing: 'original',
        planningRoute: 'auto',
        resolvedPlanningRoute: 'official_dlc_only',
        officialDlcSourceCount: 4,
        officialDlcSelected: true,
        officialDlcExecuted: true,
        materialLevel: 'standard',
        storypackInfluence: 'off',
        screenCharacterSeedsEnabled: true,
        planningCalled: true,
        planningSucceeded: true,
        planningDurationMs: 1,
        inputCandidateCount: 4,
        inputCharacterCount: 8,
        estimatedInputTokens: 3,
        primarySourceRef: usedSource.ref,
        supportSourceRefs: [],
        usedSourceRefs: [usedSource.ref],
        persistentWriteCount: 0,
        filterRuleIds: []
      }]
    };

    const resolution = resolveOfficialDlcPlanning(state, context, 3);
    expect(resolution.eligible).toBe(true);
    expect(resolution.sources).toHaveLength(16);
    expect(resolution.sources.map((source) => source.ref.sourceId)).not.toContain(
      usedSource.ref.sourceId
    );
    expect(resolution.intents[0]).toMatchObject({
      sourceCount: 17,
      exposedSourceCount: 1,
      unexposedSourceCount: 16,
      firstExposureCompleted: false
    });
  });

  it('recovers an older char-siu-bun exposure from its exact stable Actor ID', () => {
    const { state, context } = formalActiveState();
    const sources = listProjectedDramaSources(context).filter(
      (candidate) =>
        candidate.ref.providerId === 'official-dlc' &&
        candidate.ref.sourceType === 'official_dlc_event'
    );
    const charSiuSource = sources.find((source) => source.title === '深夜叉烧包');
    const evidenceActorId = charSiuSource?.exposureEvidenceActorIds?.[0];
    expect(evidenceActorId).toBeDefined();
    state.actors[evidenceActorId!] = {
      ...state.actors.player,
      actorId: evidenceActorId!,
      name: '黎忠'
    };

    const resolution = resolveOfficialDlcPlanning(state, context, 3);

    expect(resolution.eligible).toBe(true);
    expect(resolution.sources).toHaveLength(16);
    expect(resolution.sources.map((source) => source.ref.sourceId)).not.toContain(
      charSiuSource?.ref.sourceId
    );
    expect(resolution.intents[0]).toMatchObject({
      exposedSourceCount: 1,
      unexposedSourceCount: 16
    });
  });

  it('keeps a formal story exposed after bounded receipts and instances are gone', () => {
    const { state, context } = formalActiveState();
    const sources = listProjectedDramaSources(context).filter(
      (candidate) =>
        candidate.ref.providerId === 'official-dlc' &&
        candidate.ref.sourceType === 'official_dlc_event'
    );
    const charSiuSource = sources.find((source) => source.title === '深夜叉烧包')!;
    state.dramaticContent = {
      instances: [],
      recentDiagnostics: [],
      recentExecutions: [],
      exposedOfficialDlcSourceRefs: [{ ...charSiuSource.ref }]
    };

    const resolution = resolveOfficialDlcPlanning(state, context, 80);

    expect(resolution.eligible).toBe(true);
    expect(resolution.sources).toHaveLength(16);
    expect(resolution.sources.map((source) => source.ref.sourceId)).not.toContain(
      charSiuSource.ref.sourceId
    );
  });

  it('keeps a persisted official DLC arc out of first exposure and on the normal planner', () => {
    const { state, context } = activeState();
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.sourceType === 'official_dlc_event'
    );
    expect(source).toBeDefined();
    state.narrativeArcs = [{
      arcInstanceId: 'arc_midnight_bus_persisted',
      sourceRef: { ...source!.ref },
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'first_clues',
      usedNodeIds: [],
      createdTurn: 1,
      lastProgressTurn: 8,
      writebackRefs: [],
      lastSummary: '这条官方剧情弧已经完成首次曝光。'
    }];

    const resolution = resolveOfficialDlcPlanning(state, context, 9);
    expect(resolution.eligible).toBe(false);
    expect(resolution.reason).toBe('already_exposed');
    const planning = assembleDramaPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '继续核对现有线索'
    );
    const persistedSource = allDramaPlanningSources(planning).find(
      (candidate) => candidate.ref.sourceId === source!.ref.sourceId
    );
    expect(persistedSource?.arcStageContext).toMatchObject({
      arcInstanceId: 'arc_midnight_bus_persisted',
      currentStageId: 'first_clues',
      mode: 'continuation'
    });
  });

  it('returns an exposed arc to the normal planner as one compact source', () => {
    const { state, context } = activeState();
    const source = listProjectedDramaSources(context).find(
      (candidate) => candidate.ref.sourceType === 'official_dlc_event'
    );
    expect(source).toBeDefined();
    state.narrativeArcs = [{
      arcInstanceId: 'arc_midnight_bus',
      sourceRef: source!.ref,
      arcType: 'official_dlc',
      status: 'active',
      currentStageId: 'street_rumor',
      usedNodeIds: [],
      createdTurn: 1,
      lastProgressTurn: 1,
      writebackRefs: [],
      lastSummary: '司机证词与旧线路资料出现矛盾。'
    }];

    const planning = assembleDramaPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '询问相关记录'
    );
    const exposedSource = allDramaPlanningSources(planning).find(
      (candidate) => candidate.ref.sourceId === source!.ref.sourceId
    );

    expect(planning.planningRoute).toBe('auto');
    expect(exposedSource).toMatchObject({
      sourceStatus: 'active_process',
      priorityClass: 'normal',
      title: expect.stringContaining('street_rumor')
    });
    expect(exposedSource?.plannerSummary).toContain('司机证词与旧线路资料出现矛盾');
    expect(allDramaPlanningSources(planning).filter(
      (candidate) => candidate.ref.providerId === 'official-dlc'
    )).toHaveLength(1);
  });

  it('keeps an active DLC available while suppressing the exact source of a completed arc', () => {
    const { state, context } = formalActiveState();
    const projectedSources = listProjectedDramaSources(context).filter(
      (candidate) => candidate.ref.providerId === 'official-dlc'
    );
    const completedSource = projectedSources.find(
      (candidate) => candidate.ref.sourceType === 'official_dlc_event'
    );
    expect(completedSource).toBeDefined();
    state.narrativeArcs = [{
      arcInstanceId: 'arc_completed_midnight_bus',
      sourceRef: completedSource!.ref,
      arcType: 'official_dlc',
      status: 'completed',
      currentStageId: 'aftermath',
      usedNodeIds: [],
      createdTurn: 1,
      lastProgressTurn: 8,
      writebackRefs: [],
      lastSummary: '这条剧情弧已经完成。'
    }];

    const regularPlanning = assembleDramaPlanningContext(
      state,
      context,
      defaultDramaticContentSettings,
      '继续处理当前生活'
    );
    const regularOfficialSources = allDramaPlanningSources(regularPlanning).filter(
      (candidate) => candidate.ref.providerId === 'official-dlc'
    );
    expect(regularOfficialSources.map((source) => source.ref.sourceId)).not.toContain(
      completedSource!.ref.sourceId
    );
    expect(regularOfficialSources.some(
      (source) => source.ref.sourceId !== completedSource!.ref.sourceId
    )).toBe(true);

    const officialResolution = resolveOfficialDlcPlanning(state, context, 1);
    expect(officialResolution.sources.map((source) => source.ref.sourceId)).not.toContain(
      completedSource!.ref.sourceId
    );
    expect(officialResolution.sources.some(
      (source) => source.ref.sourceId !== completedSource!.ref.sourceId
    )).toBe(true);
    expect(state.world.officialDlcBindings![0]!.status).toBe('active');
  });

  it('enforces a three-turn cooldown after a quiet planning attempt', () => {
    const { state, context } = activeState();
    state.turnCounter = 4;
    state.dramaticContent = {
      ...(state.dramaticContent ?? { instances: [], recentDiagnostics: [] }),
      recentExecutions: [{
        turnCounter: 1,
        pacing: 'original',
        planningRoute: 'auto',
        resolvedPlanningRoute: 'official_dlc_only',
        officialDlcSourceCount: 4,
        materialLevel: 'standard',
        storypackInfluence: 'off',
        screenCharacterSeedsEnabled: true,
        planningCalled: true,
        planningSucceeded: true,
        planningDurationMs: 1,
        inputCandidateCount: 4,
        inputCharacterCount: 10,
        estimatedInputTokens: 3,
        supportSourceRefs: [],
        usedSourceRefs: [],
        persistentWriteCount: 0,
        filterRuleIds: []
      }]
    };
    expect(resolveOfficialDlcPlanning(state, context, 3).eligible).toBe(false);
    expect(resolveOfficialDlcPlanning(state, context, 5).eligible).toBe(true);
  });
});

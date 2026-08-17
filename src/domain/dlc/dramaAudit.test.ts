import { describe, expect, it } from 'vitest';
import { selectContext } from '../context/selectContext';
import { assembleDramaPlanningContext } from '../drama/assemblePlanningContext';
import {
  listGeneratedOfficialDlcSources,
  listOfficialDlcSourcesForAudit,
  listProjectedDramaSources
} from '../drama/sourceRegistry';
import { defaultDramaticContentSettings } from '../drama/settings';
import { createInitialRuntimeState } from '../runtime/initialState';
import { urbanLegendsAlphaManifest, urbanLegendsAlphaEventGroup } from './urbanLegendsAlpha/content';
import { buildOfficialDlcDramaAudit } from './dramaAudit';

function activeContext() {
  const state = createInitialRuntimeState({ currentIdentity: 'police' });
  state.world.officialDlcBindings = [{
    dlcId: urbanLegendsAlphaManifest.dlcId,
    version: urbanLegendsAlphaManifest.version,
    status: 'active'
  }];
  const context = selectContext(state, '听听街坊最近在聊什么');
  return { state, context };
}

describe('official DLC Drama source audit', () => {
  it('records provider, projection, planning, selection and execution separately', () => {
    const { state, context } = activeContext();
    const planningContext = assembleDramaPlanningContext(
      state,
      context,
      { ...defaultDramaticContentSettings, pacing: 'balanced' },
      '听听街坊最近在聊什么'
    );
    const event = listProjectedDramaSources(context).find(
      (source) => source.ref.sourceType === 'official_dlc_event'
    )!;
    const plan = {
      planId: 'plan_audit_1',
      planningScope: 'turn' as const,
      mode: 'surface' as const,
      primarySource: event.ref,
      supportSources: [],
      sceneFunction: 'information' as const,
      intensity: 'low' as const,
      playerMayIgnore: true,
      maxNewActors: 1,
      reasonSummary: '审计测试'
    };
    const trace = {
      planId: plan.planId,
      status: 'used_as_texture' as const,
      usedSourceRefs: [event.ref],
      resultingWritebackRefs: []
    };
    const records = buildOfficialDlcDramaAudit({
      requestId: 'audit_request_1',
      turn: state.turnCounter + 1,
      context,
      inventorySources: listOfficialDlcSourcesForAudit(context),
      generatedSources: listGeneratedOfficialDlcSources(context),
      projectedSources: listProjectedDramaSources(context),
      planningContext,
      plan,
      trace
    });

    const alphaRecords = records.filter(
      (record) => record.dlcId === urbanLegendsAlphaManifest.dlcId
    );
    expect(alphaRecords).toHaveLength(8);
    expect(records.find((record) => record.dlcId === 'urban_legends')).toMatchObject({
      omittedReason: 'binding_missing',
      sourceGenerated: false,
      sourceProjected: false
    });
    const eventRecord = alphaRecords.find(
      (record) => record.sourceId === urbanLegendsAlphaEventGroup.eventGroupId
    )!;
    expect(eventRecord).toMatchObject({
      status: 'active',
      sourceGenerated: true,
      sourceProjected: true,
      sourceInPlanningContext: true,
      selected: true,
      executed: true,
      executionPayloadCreated: true,
      executionTracePresent: true
    });
    expect(alphaRecords.filter((record) => !record.selected)).toHaveLength(7);
    expect(records.every((record) => record.requestId === 'audit_request_1')).toBe(true);
    expect((state as { officialDlcDramaAudit?: unknown }).officialDlcDramaAudit).toBeUndefined();
  });

  it('explains an inactive binding without changing projected source behavior', () => {
    const { state } = activeContext();
    state.world.officialDlcBindings![0]!.status = 'paused';
    const pausedContext = selectContext(state, '暂停 DLC');
    const records = buildOfficialDlcDramaAudit({
      requestId: 'audit_request_2',
      turn: state.turnCounter + 1,
      context: pausedContext,
      inventorySources: listOfficialDlcSourcesForAudit(pausedContext),
      generatedSources: listGeneratedOfficialDlcSources(pausedContext),
      projectedSources: listProjectedDramaSources(pausedContext)
    });

    const alphaRecords = records.filter(
      (record) => record.dlcId === urbanLegendsAlphaManifest.dlcId
    );
    expect(alphaRecords).toHaveLength(8);
    expect(alphaRecords.every((record) =>
      record.status === 'paused' &&
      !record.sourceGenerated &&
      !record.sourceProjected &&
      record.omittedReason === 'provider_inactive_or_unsupported'
    )).toBe(true);
    expect(records.find((record) => record.dlcId === 'urban_legends')?.omittedReason)
      .toBe('binding_missing');
  });

  it('accepts an explicit runtime binding snapshot when prompt projection is legacy', () => {
    const { state, context } = activeContext();
    const legacyContext = { ...context, officialDlcBindings: undefined };
    const records = buildOfficialDlcDramaAudit({
      requestId: 'audit_request_legacy_context',
      turn: state.turnCounter + 1,
      context: legacyContext,
      officialDlcBindings: state.world.officialDlcBindings,
      inventorySources: listOfficialDlcSourcesForAudit(context),
      generatedSources: listGeneratedOfficialDlcSources(context),
      projectedSources: listProjectedDramaSources(context)
    });

    const alphaRecords = records.filter(
      (record) => record.dlcId === urbanLegendsAlphaManifest.dlcId
    );
    expect(alphaRecords).toHaveLength(8);
    expect(alphaRecords.every((record) => record.status === 'active')).toBe(true);
    expect(records.find((record) => record.dlcId === 'urban_legends')?.omittedReason)
      .toBe('binding_missing');
  });
});

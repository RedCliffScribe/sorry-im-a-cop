import { describe, expect, it } from 'vitest';
import type { RuntimeSaveRecord } from '../persistence/SaveRepository';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import { selectContext } from '../context/selectContext';
import { urbanLegendsFormalManifest } from './urbanLegends/content';
import { policePromotionManifest } from './policePromotion/content';
import { resolveOfficialDlcPlanning } from './planning';
import {
  createExistingSaveDlcCandidate,
  evaluateExistingSaveDlcEligibility,
  prepareExistingSaveDlcAttachment
} from './existingSave';

function createRecord(): RuntimeSaveRecord {
  const runtimeState = createInitialRuntimeState();
  runtimeState.turnCounter = 37;
  runtimeState.storyLog.push({
    turnId: 'turn_0037',
    speaker: 'narrator',
    text: '旧存档已经发生的世界事实。',
    gameTime: runtimeState.time
  });
  return {
    saveId: 'save_existing',
    rollbackChainId: 'chain_existing',
    saveName: '旺角旧档',
    saveKind: 'auto',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-08T00:00:00.000Z',
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: '1988-09-15 星期四 09:00',
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
}

describe('existing-save official DLC attachment', () => {
  it('marks a compatible Hong Kong save as eligible without changing it', () => {
    const record = createRecord();
    const before = structuredClone(record);

    const candidate = createExistingSaveDlcCandidate(record, urbanLegendsFormalManifest);

    expect(candidate.eligibility).toMatchObject({ eligible: true, code: 'eligible' });
    expect(record).toEqual(before);
  });

  it('creates an independent backup and appends only the exact active binding', () => {
    const record = createRecord();
    const beforeState = structuredClone(record.runtimeState);

    const prepared = prepareExistingSaveDlcAttachment({
      record,
      manifest: urbanLegendsFormalManifest,
      backupSaveId: 'save_before_dlc',
      activatedAt: '2026-08-09T08:00:00.000Z'
    });

    expect(prepared.backupRecord).toMatchObject({
      saveId: 'save_before_dlc',
      saveName: '旺角旧档（加入都市怪谈前备份）',
      saveKind: 'manual',
      rollbackChainId: 'chain_existing'
    });
    expect(prepared.backupRecord.runtimeState).toEqual(beforeState);
    expect(prepared.updatedRecord.saveId).toBe(record.saveId);
    expect(prepared.updatedRecord.rollbackChainId).toBe(record.rollbackChainId);
    expect(prepared.updatedRecord.runtimeState.world.officialDlcBindings).toEqual([{
      dlcId: 'urban_legends',
      version: urbanLegendsFormalManifest.version,
      status: 'active',
      planningEnabled: true,
      activatedAt: '2026-08-09T08:00:00.000Z'
    }]);
    expect({
      ...prepared.updatedRecord.runtimeState,
      world: {
        ...prepared.updatedRecord.runtimeState.world,
        officialDlcBindings: beforeState.world.officialDlcBindings
      }
    }).toEqual(beforeState);
    expect(record.runtimeState).toEqual(beforeState);
  });

  it('initializes a police old save from its current game time without rewriting established facts', () => {
    const record = createRecord();
    record.runtimeState.lawIdentity.rank = '警员';
    record.runtimeState.lawIdentity.department = '军装巡逻';
    record.runtimeState.lawIdentity.stationOrPost = '旺角警署';
    record.runtimeState.lawIdentity.assignmentSummary = '弥敦道夜更巡逻。';
    record.runtimeState.policePanel.unitName = '旺角警署军装巡逻小队';
    record.runtimeState.policePanel.careerPath.routeSummary = '旧档原有的职业经历摘要。';
    record.runtimeState.player.economy.cashOnHand = 812;
    record.runtimeState.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '1.2.0',
      status: 'active',
      planningEnabled: true
    }];
    const beforeState = structuredClone(record.runtimeState);

    expect(createExistingSaveDlcCandidate(record, policePromotionManifest).eligibility).toMatchObject({
      eligible: true,
      code: 'eligible'
    });

    const prepared = prepareExistingSaveDlcAttachment({
      record,
      manifest: policePromotionManifest,
      backupSaveId: 'save_before_police_promotion',
      activatedAt: '2026-08-24T14:30:00.000Z'
    });
    const updated = prepared.updatedRecord.runtimeState;

    expect(prepared.backupRecord.runtimeState).toEqual(beforeState);
    expect(updated.world.officialDlcBindings).toEqual([
      beforeState.world.officialDlcBindings![0],
      {
        dlcId: 'police_promotion',
        version: '1.0.0',
        status: 'active',
        activatedAt: '2026-08-24T14:30:00.000Z'
      }
    ]);
    expect(updated.policePanel.careerPath.promotionProgress).toMatchObject({
      routeId: 'hk1988_pc_to_sgt',
      processStage: 'not_eligible',
      serviceBasis: 'established_service',
      rankEffectiveAt: beforeState.time,
      evidence: [],
      vacancyStatus: 'unknown'
    });
    expect(updated.lawIdentity).toEqual(beforeState.lawIdentity);
    expect(updated.player).toEqual(beforeState.player);
    expect(updated.policePanel.unitName).toBe(beforeState.policePanel.unitName);
    expect(updated.policePanel.careerPath.routeSummary).toBe(
      beforeState.policePanel.careerPath.routeSummary
    );
    expect(updated.storyLog).toEqual(beforeState.storyLog);
    expect(record.runtimeState).toEqual(beforeState);
  });

  it('blocks unsafe police old saves instead of creating a half-bound system DLC', () => {
    const civilian = createRecord();
    civilian.runtimeState.player.currentIdentity = 'civilian';
    expect(evaluateExistingSaveDlcEligibility(
      civilian.runtimeState,
      policePromotionManifest
    ).code).toBe('police_identity_required');

    const unknownRank = createRecord();
    unknownRank.runtimeState.lawIdentity.rank = '临时特别调查员';
    expect(evaluateExistingSaveDlcEligibility(
      unknownRank.runtimeState,
      policePromotionManifest
    ).code).toBe('police_rank_unrecognized');

    const unsupportedRank = createRecord();
    unsupportedRank.runtimeState.lawIdentity.rank = '总督察';
    expect(evaluateExistingSaveDlcEligibility(
      unsupportedRank.runtimeState,
      policePromotionManifest
    ).code).toBe('police_promotion_route_unavailable');

    const inconsistent = createRecord();
    inconsistent.runtimeState.world.officialDlcBindings = [{
      dlcId: 'police_promotion',
      version: '1.0.0',
      status: 'active'
    }];
    const progress = createInitialRuntimeState({
      currentIdentity: 'police',
      officialDlcIds: ['police_promotion']
    }).policePanel.careerPath.promotionProgress;
    inconsistent.runtimeState.world.officialDlcBindings = [];
    inconsistent.runtimeState.policePanel.careerPath.promotionProgress = progress;
    expect(evaluateExistingSaveDlcEligibility(
      inconsistent.runtimeState,
      policePromotionManifest
    ).code).toBe('police_promotion_state_conflict');
  });

  it('keeps the forward-only police program stable after old-save reload normalization', () => {
    const prepared = prepareExistingSaveDlcAttachment({
      record: createRecord(),
      manifest: policePromotionManifest,
      backupSaveId: 'save_before_police_promotion',
      activatedAt: '2026-08-24T14:30:00.000Z'
    });
    const beforeReload = prepared.updatedRecord.runtimeState;
    const reloaded = withRuntimeDefaults(structuredClone(beforeReload));

    expect(reloaded.world.officialDlcBindings).toEqual(beforeReload.world.officialDlcBindings);
    expect(reloaded.policePanel.careerPath.promotionProgress).toEqual(
      beforeReload.policePanel.careerPath.promotionProgress
    );
    expect(reloaded.policePanel.careerPath.promotionProgress?.rankEffectiveAt).toEqual(
      beforeReload.time
    );
    expect(reloaded.policePanel.careerPath.promotionProgress?.evidence).toEqual([]);
  });

  it('does not expose attachment for a manifest that omits the capability', () => {
    const { existingSaveAttachment: _capability, ...manifestWithoutAttachment } =
      urbanLegendsFormalManifest;
    expect(evaluateExistingSaveDlcEligibility(
      createRecord().runtimeState,
      manifestWithoutAttachment
    ).code).toBe('existing_save_attachment_unavailable');
  });

  it('makes the existing save eligible for the normal official-DLC planning route after load', () => {
    const prepared = prepareExistingSaveDlcAttachment({
      record: createRecord(),
      manifest: urbanLegendsFormalManifest,
      backupSaveId: 'save_before_dlc',
      activatedAt: '2026-08-09T08:00:00.000Z'
    });
    const state = prepared.updatedRecord.runtimeState;
    const context = selectContext(state, '继续正常巡逻');

    const planning = resolveOfficialDlcPlanning(state, context, state.turnCounter + 1);

    expect(planning.eligible).toBe(true);
    expect(planning.sources.some((source) =>
      source.ref.providerId === 'official-dlc' && source.ref.dlcId === 'urban_legends'
    )).toBe(true);
  });

  it('blocks duplicate formal bindings and the frozen Alpha combination', () => {
    const formal = createRecord();
    formal.runtimeState.world.officialDlcBindings = [{
      dlcId: 'urban_legends',
      version: '1.0.0',
      status: 'paused'
    }];
    expect(evaluateExistingSaveDlcEligibility(
      formal.runtimeState,
      urbanLegendsFormalManifest
    ).code).toBe('already_bound');

    const alpha = createRecord();
    alpha.runtimeState.world.officialDlcBindings = [{
      dlcId: 'urban_legends_alpha',
      version: '1.0.0',
      status: 'active'
    }];
    expect(evaluateExistingSaveDlcEligibility(
      alpha.runtimeState,
      urbanLegendsFormalManifest
    ).code).toBe('incompatible_binding');
  });

  it('blocks unsupported worlds and unavailable exact runtime versions', () => {
    const unsupported = createRecord();
    unsupported.runtimeState.world.worldpackId = 'san_delaro';
    expect(evaluateExistingSaveDlcEligibility(
      unsupported.runtimeState,
      urbanLegendsFormalManifest
    ).code).toBe('unsupported_worldpack');

    const record = createRecord();
    expect(evaluateExistingSaveDlcEligibility(
      record.runtimeState,
      urbanLegendsFormalManifest,
      []
    ).code).toBe('runtime_manifest_unavailable');
  });

  it('refuses to proceed when a distinct backup id cannot be created', () => {
    const record = createRecord();
    expect(() => prepareExistingSaveDlcAttachment({
      record,
      manifest: urbanLegendsFormalManifest,
      backupSaveId: record.saveId,
      activatedAt: '2026-08-09T08:00:00.000Z'
    })).toThrow(/独立的加入前备份/);
  });
});

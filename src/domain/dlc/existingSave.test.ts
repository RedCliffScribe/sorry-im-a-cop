import { describe, expect, it } from 'vitest';
import type { RuntimeSaveRecord } from '../persistence/SaveRepository';
import { createInitialRuntimeState } from '../runtime/initialState';
import { selectContext } from '../context/selectContext';
import { urbanLegendsFormalManifest } from './urbanLegends/content';
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

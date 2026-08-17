import { describe, expect, it } from 'vitest';
import {
  getOfficialDlcManifest,
  getOfficialDlcRuntimeManifest,
  getOfficialDlcWorldCompatibility,
  getOfficialDlcWorldpackTitle,
  isOfficialDlcSupportedByWorldpack,
  officialDlcManifests,
  officialDlcRuntimeManifests,
  resolveOfficialDlcBindings
} from './manifest';
import { urbanLegendsAlphaManifest } from './urbanLegendsAlpha/content';
import {
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest
} from './urbanLegends/content';
import {
  normalizeSaveDlcBindings,
  updateSaveDlcStatus,
  updateSaveDlcVersion
} from './saveDlc';

describe('official DLC framework', () => {
  it('separates the public new-game catalog from frozen runtime compatibility manifests', () => {
    expect(officialDlcManifests).toEqual([urbanLegendsFormalManifest]);
    expect(officialDlcRuntimeManifests).toEqual([
      urbanLegendsAlphaManifest,
      urbanLegendsFormalV1Manifest,
      urbanLegendsFormalV1_1Manifest,
      urbanLegendsFormalManifest
    ]);
    expect(getOfficialDlcManifest('urban_legends_alpha')).toBe(urbanLegendsAlphaManifest);
    expect(getOfficialDlcManifest('urban_legends')).toBe(urbanLegendsFormalManifest);
    expect(getOfficialDlcRuntimeManifest('urban_legends_alpha', '1.0.0')).toBe(
      urbanLegendsAlphaManifest
    );
    expect(getOfficialDlcRuntimeManifest('urban_legends_alpha', '0.9.0')).toBeUndefined();
    expect(getOfficialDlcRuntimeManifest('urban_legends', '1.0.0')).toBe(
      urbanLegendsFormalV1Manifest
    );
    expect(getOfficialDlcRuntimeManifest('urban_legends', '1.1.0')).toBe(
      urbanLegendsFormalV1_1Manifest
    );
    expect(getOfficialDlcRuntimeManifest('urban_legends', '1.2.0')).toBe(
      urbanLegendsFormalManifest
    );
    expect(resolveOfficialDlcBindings(['urban_legends_alpha'], 'hk_1988')).toEqual([]);
    expect(
      resolveOfficialDlcBindings(['urban_legends_alpha', 'urban_legends'], 'hk_1988')
    ).toEqual([{ dlcId: 'urban_legends', version: '1.2.0', status: 'active' }]);
  });

  it('does not create a binding for an unknown or unsupported manifest', () => {
    expect(resolveOfficialDlcBindings(['future_dlc'], 'hk_1988')).toEqual([]);
  });

  it('resolves compatibility and player-facing worldpack titles without exposing raw ids', () => {
    expect(getOfficialDlcWorldCompatibility(urbanLegendsAlphaManifest, 'hk_1988')).toEqual({
      worldpackId: 'hk_1988',
      status: 'supported'
    });
    expect(getOfficialDlcWorldpackTitle('hk_1988')).toBe('香港 1988');
    expect(getOfficialDlcWorldpackTitle('unknown_worldpack')).toBe('其他世界包');
    expect(isOfficialDlcSupportedByWorldpack(urbanLegendsAlphaManifest, 'hk_1988')).toBe(true);
    expect(isOfficialDlcSupportedByWorldpack(urbanLegendsAlphaManifest, 'unknown_worldpack')).toBe(false);
  });

  it('locks a supported selected DLC to its manifest version', () => {
    expect(
      resolveOfficialDlcBindings(['urban_mysteries', 'urban_mysteries'], 'hk_1988', [
        {
          dlcId: 'urban_mysteries',
          title: '都市怪谈',
          description: '测试用官方叙事扩展。',
          type: 'narrative',
          version: '1.0.0',
          worldCompatibility: [{ worldpackId: 'hk_1988', status: 'supported' }]
        }
      ])
    ).toEqual([
      { dlcId: 'urban_mysteries', version: '1.0.0', status: 'active' }
    ]);
  });

  it('normalizes legacy or malformed save bindings without failing the save', () => {
    expect(
      normalizeSaveDlcBindings([
        { dlcId: 'dlc_a', version: '1.0.0', status: 'paused' },
        { dlcId: 'dlc_a', version: '1.0.1', status: 'active' },
        { dlcId: '', version: '1.0.0', status: 'active' },
        null
      ])
    ).toEqual([{ dlcId: 'dlc_a', version: '1.0.0', status: 'paused' }]);
  });

  it('changes only the requested binding status', () => {
    expect(
      updateSaveDlcStatus(
        [
          { dlcId: 'dlc_a', version: '1.0.0', status: 'active' },
          { dlcId: 'dlc_b', version: '1.0.0', status: 'completed' }
        ],
        'dlc_a',
        'paused'
      )
    ).toEqual([
      { dlcId: 'dlc_a', version: '1.0.0', status: 'paused' },
      { dlcId: 'dlc_b', version: '1.0.0', status: 'completed' }
    ]);
  });

  it('upgrades only an explicitly selected known binding version', () => {
    const bindings = [{
      dlcId: 'urban_legends',
      version: '1.0.0',
      status: 'paused' as const,
      planningEnabled: false,
      activatedAt: '2026-08-04T00:00:00.000Z'
    }];
    expect(updateSaveDlcVersion(bindings, 'urban_legends', '1.2.0')).toEqual([{
      ...bindings[0],
      version: '1.2.0'
    }]);
    expect(updateSaveDlcVersion(bindings, 'urban_legends', '9.9.9')).toEqual(bindings);
  });

  it('preserves activation metadata and drops malformed metadata during migration', () => {
    expect(normalizeSaveDlcBindings([
      { dlcId: 'dlc_a', version: '1.0.0', status: 'active', activatedAt: '2026-08-04T00:00:00.000Z' },
      { dlcId: 'dlc_b', version: '1.0.0', status: 'paused', activatedAt: 123 }
    ])).toEqual([
      { dlcId: 'dlc_a', version: '1.0.0', status: 'active', activatedAt: '2026-08-04T00:00:00.000Z' },
      { dlcId: 'dlc_b', version: '1.0.0', status: 'paused' }
    ]);
  });

  it('preserves the optional per-save planning switch for official DLC', () => {
    expect(normalizeSaveDlcBindings([
      { dlcId: 'dlc_a', version: '1.0.0', status: 'active', planningEnabled: false },
      { dlcId: 'dlc_b', version: '1.0.0', status: 'active', planningEnabled: 'false' }
    ])).toEqual([
      { dlcId: 'dlc_a', version: '1.0.0', status: 'active', planningEnabled: false },
      { dlcId: 'dlc_b', version: '1.0.0', status: 'active' }
    ]);
  });
});

import type { OfficialDlcManifest, SaveDlcBinding } from './types';
import { urbanLegendsAlphaManifest } from './urbanLegendsAlpha/content';
import {
  urbanLegendsFormalManifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalV1Manifest
} from './urbanLegends/content';
import { policePromotionManifest } from './policePromotion/content';
import { getWorldpackAdaptationDescriptor } from '../worldpack/adaptationRegistry';

/**
 * Public catalog consumed by the DLC page and new-game selection.
 *
 * Alpha is a frozen compatibility asset and is not offered to new saves.
 * Formal packages are added only after their release gate is complete.
 */
export const officialDlcManifests: readonly OfficialDlcManifest[] = [
  urbanLegendsFormalManifest,
  policePromotionManifest
];

/**
 * Runtime lookup for DLCs that can already exist in saves. This registry is
 * deliberately separate from the public catalog: removing Alpha from new-game
 * selection must not break an existing Alpha binding or its provider.
 */
export const officialDlcRuntimeManifests: readonly OfficialDlcManifest[] = [
  urbanLegendsAlphaManifest,
  urbanLegendsFormalV1Manifest,
  urbanLegendsFormalV1_1Manifest,
  urbanLegendsFormalManifest,
  policePromotionManifest
];

export function getOfficialDlcManifest(dlcId: string): OfficialDlcManifest | undefined {
  return officialDlcManifests.find((manifest) => manifest.dlcId === dlcId)
    ?? officialDlcRuntimeManifests.find((manifest) => manifest.dlcId === dlcId);
}

/**
 * Resolves the exact immutable runtime/display contract bound to a save.
 * A newer catalog manifest must never masquerade as an older save version.
 */
export function getOfficialDlcRuntimeManifest(
  dlcId: string,
  version: string,
  manifests: readonly OfficialDlcManifest[] = officialDlcRuntimeManifests
): OfficialDlcManifest | undefined {
  return manifests.find(
    (manifest) => manifest.dlcId === dlcId && manifest.version === version
  );
}

export function getOfficialDlcWorldCompatibility(
  manifest: OfficialDlcManifest,
  worldpackId: string
): OfficialDlcManifest['worldCompatibility'][number] | undefined {
  return manifest.worldCompatibility.find(
    (compatibility) => compatibility.worldpackId === worldpackId
  );
}

export function getOfficialDlcWorldpackTitle(worldpackId: string): string {
  return getWorldpackAdaptationDescriptor(worldpackId)?.title ?? '其他世界包';
}

export function isOfficialDlcSupportedByWorldpack(
  manifest: OfficialDlcManifest,
  worldpackId: string
): boolean {
  const compatibility = getOfficialDlcWorldCompatibility(manifest, worldpackId);
  return compatibility !== undefined && compatibility.status !== 'unsupported';
}

export function resolveOfficialDlcBindings(
  selectedDlcIds: readonly string[] | undefined,
  worldpackId: string,
  manifests: readonly OfficialDlcManifest[] = officialDlcManifests,
  activatedAt?: string
): SaveDlcBinding[] {
  if (!selectedDlcIds || selectedDlcIds.length === 0) return [];

  const seen = new Set<string>();
  return selectedDlcIds.flatMap((dlcId) => {
    if (seen.has(dlcId)) return [];
    const manifest = manifests.find((candidate) => candidate.dlcId === dlcId);
    if (!manifest || !isOfficialDlcSupportedByWorldpack(manifest, worldpackId)) return [];
    seen.add(dlcId);
    return [{
      dlcId: manifest.dlcId,
      version: manifest.version,
      status: 'active' as const,
      ...(activatedAt ? { activatedAt } : {})
    }];
  });
}

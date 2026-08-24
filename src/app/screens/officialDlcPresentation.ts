import {
  getOfficialDlcWorldCompatibility,
  getOfficialDlcWorldpackTitle
} from '../../domain/dlc/manifest';
import type {
  DlcCompatibilityStatus,
  OfficialDlcManifest
} from '../../domain/dlc/types';
import policePromotionCover from '../../assets/dlc/police-promotion-cover.webp';

const officialDlcCoverImages: Readonly<Record<string, string>> = {
  'police_promotion@1.0.0': policePromotionCover
};

const compatibilityLabels: Record<DlcCompatibilityStatus, string> = {
  supported: '支持',
  adapted: '已适配',
  unsupported: '不支持'
};

export interface OfficialDlcCompatibilityPresentation {
  worldpackId: string;
  worldpackTitle: string;
  status: DlcCompatibilityStatus;
  statusLabel: string;
  reason: string;
  supported: boolean;
}

export function presentOfficialDlcCompatibility(
  manifest: OfficialDlcManifest,
  worldpackId: string
): OfficialDlcCompatibilityPresentation {
  const compatibility = getOfficialDlcWorldCompatibility(manifest, worldpackId);
  const worldpackTitle = getOfficialDlcWorldpackTitle(worldpackId);
  const status = compatibility?.status ?? 'unsupported';
  const reason = compatibility?.reason
    ?? (status === 'unsupported'
      ? `该扩展尚未提供${worldpackTitle}适配。`
      : status === 'adapted'
        ? `该扩展已针对${worldpackTitle}完成内容适配。`
        : `该扩展可在${worldpackTitle}中使用。`);

  return {
    worldpackId,
    worldpackTitle,
    status,
    statusLabel: compatibilityLabels[status],
    reason,
    supported: status !== 'unsupported' && compatibility !== undefined
  };
}

export function getOfficialDlcTagline(manifest: OfficialDlcManifest): string | undefined {
  return manifest.presentation?.tagline;
}

export function getOfficialDlcExperienceKeywords(
  manifest: OfficialDlcManifest
): readonly string[] {
  return manifest.presentation?.experienceKeywords ?? [];
}

export function getOfficialDlcContentHighlights(
  manifest: OfficialDlcManifest
): readonly string[] {
  return manifest.presentation?.contentHighlights ?? [];
}

/**
 * Cover art is resolved against the exact immutable content version so an old
 * save never receives artwork that belongs to a newer runtime manifest.
 */
export function getOfficialDlcCoverImage(
  manifest: OfficialDlcManifest
): string | undefined {
  return officialDlcCoverImages[`${manifest.dlcId}@${manifest.version}`];
}

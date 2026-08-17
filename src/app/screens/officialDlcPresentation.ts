import {
  getOfficialDlcWorldCompatibility,
  getOfficialDlcWorldpackTitle
} from '../../domain/dlc/manifest';
import type {
  DlcCompatibilityStatus,
  OfficialDlcManifest
} from '../../domain/dlc/types';

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

/** Optional cover artwork is distributed separately from this source snapshot. */
export function getOfficialDlcCoverImage(
  _manifest: OfficialDlcManifest
): string | undefined {
  return undefined;
}

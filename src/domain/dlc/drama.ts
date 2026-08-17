import type { PlanningSource, DramaSourceRef } from '../drama/types';
import { OFFICIAL_DLC_PROVIDER_ID, type OfficialDlcSourceType, type SaveDlcBinding } from './types';

/**
 * The official-DLC source contract is registered by the concrete content
 * provider in the Drama source registry.  It remains a content-source
 * boundary, not a second scheduler or runtime.
 */
export const officialDlcDramaSourceContract = {
  providerId: OFFICIAL_DLC_PROVIDER_ID,
  sourceTypes: ['official_dlc_event', 'official_dlc_character', 'official_dlc_news'] as const,
  registered: true
} as const;

function isOfficialDlcSourceType(value: string): value is OfficialDlcSourceType {
  return officialDlcDramaSourceContract.sourceTypes.includes(value as OfficialDlcSourceType);
}

/**
 * Official DLC is a content source, not a second runtime.  Only an active
 * binding may project new source candidates; paused/completed bindings keep
 * their already-written facts but are invisible to future Drama planning.
 */
export function isOfficialDlcSourceActive(
  bindings: readonly SaveDlcBinding[] | undefined,
  ref: DramaSourceRef
): boolean {
  if (ref.providerId !== OFFICIAL_DLC_PROVIDER_ID) return true;
  if (!isOfficialDlcSourceType(ref.sourceType)) return false;

  const dlcId = (ref as DramaSourceRef & { dlcId?: unknown }).dlcId;
  if (typeof dlcId !== 'string' || !dlcId.trim()) return false;
  return (bindings ?? []).some((binding) => binding.dlcId === dlcId && binding.status === 'active');
}

export function filterOfficialDlcSources(
  bindings: readonly SaveDlcBinding[] | undefined,
  sources: readonly PlanningSource[]
): PlanningSource[] {
  return sources.filter((source) => isOfficialDlcSourceActive(bindings, source.ref));
}

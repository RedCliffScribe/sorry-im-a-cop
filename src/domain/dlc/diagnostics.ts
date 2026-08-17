import { officialDlcRuntimeManifests } from './manifest';
import { officialDlcDramaSourceContract } from './drama';
import type { OfficialDlcManifest, SaveDlcBinding } from './types';

export interface OfficialDlcActivitySnapshot {
  lastTurnId?: string;
  eventsProduced?: number;
  charactersProduced?: number;
  newsProduced?: number;
}

export interface OfficialDlcDiagnosticRecord {
  dlcId: string;
  title: string;
  version: string;
  status: SaveDlcBinding['status'];
  activatedAt?: string;
  dramaSource: 'enabled' | 'paused' | 'completed' | 'not_registered';
  recentProgress?: OfficialDlcActivitySnapshot;
}

/**
 * Builds an ephemeral diagnostic view. Activity is supplied by the caller's
 * diagnostic trace and is deliberately not persisted into RuntimeState.
 */
export function createOfficialDlcDiagnostics(
  bindings: readonly SaveDlcBinding[] | undefined,
  manifests: readonly OfficialDlcManifest[] = officialDlcRuntimeManifests,
  activityByDlc: Readonly<Record<string, OfficialDlcActivitySnapshot>> = {}
): OfficialDlcDiagnosticRecord[] {
  return (bindings ?? []).map((binding) => {
    const manifest = manifests.find((candidate) => candidate.dlcId === binding.dlcId);
    const dramaEnabled = manifest?.dramaIntegration?.enabled === true;
    const dramaSource = binding.status === 'paused'
      ? 'paused'
      : binding.status === 'completed'
        ? 'completed'
        : dramaEnabled && officialDlcDramaSourceContract.registered
          ? 'enabled'
          : 'not_registered';
    const recentProgress = activityByDlc[binding.dlcId];
    return {
      dlcId: binding.dlcId,
      title: manifest?.title ?? binding.dlcId,
      version: binding.version,
      status: binding.status,
      ...(binding.activatedAt ? { activatedAt: binding.activatedAt } : {}),
      dramaSource,
      ...(recentProgress ? { recentProgress: { ...recentProgress } } : {})
    };
  });
}

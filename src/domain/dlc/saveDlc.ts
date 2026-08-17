import { getOfficialDlcRuntimeManifest } from './manifest';
import type { SaveDlcBinding, SaveDlcStatus } from './types';

const validStatuses = new Set<SaveDlcStatus>(['active', 'paused', 'completed']);

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function normalizeSaveDlcBindings(value: unknown): SaveDlcBinding[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const bindings: SaveDlcBinding[] = [];

  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') continue;
    const record = candidate as Record<string, unknown>;
    const dlcId = normalizeText(record.dlcId);
    const version = normalizeText(record.version);
    const status = record.status;
    if (!dlcId || !version || typeof status !== 'string' || !validStatuses.has(status as SaveDlcStatus)) {
      continue;
    }
    if (seen.has(dlcId)) continue;
    seen.add(dlcId);
    const activatedAt = normalizeText(record.activatedAt);
    const planningEnabled =
      typeof record.planningEnabled === 'boolean' ? record.planningEnabled : undefined;
    bindings.push({
      dlcId,
      version,
      status: status as SaveDlcStatus,
      ...(planningEnabled === undefined ? {} : { planningEnabled }),
      ...(activatedAt ? { activatedAt } : {})
    });
  }

  return bindings;
}

export function updateSaveDlcStatus(
  bindings: readonly SaveDlcBinding[] | undefined,
  dlcId: string,
  status: SaveDlcStatus
): SaveDlcBinding[] {
  const normalized = normalizeSaveDlcBindings(bindings);
  return normalized.map((binding) =>
    binding.dlcId === dlcId ? { ...binding, status } : binding
  );
}

/**
 * Explicitly upgrades one bound DLC to an already registered immutable runtime
 * version. Existing status, planning preference and activation metadata remain
 * unchanged; callers must obtain player confirmation before invoking it.
 */
export function updateSaveDlcVersion(
  bindings: readonly SaveDlcBinding[] | undefined,
  dlcId: string,
  targetVersion: string
): SaveDlcBinding[] {
  const normalized = normalizeSaveDlcBindings(bindings);
  if (!getOfficialDlcRuntimeManifest(dlcId, targetVersion)) return normalized;
  return normalized.map((binding) =>
    binding.dlcId === dlcId ? { ...binding, version: targetVersion } : binding
  );
}

export function describeSaveDlcBinding(binding: SaveDlcBinding): string {
  return getOfficialDlcRuntimeManifest(binding.dlcId, binding.version)?.title ?? binding.dlcId;
}

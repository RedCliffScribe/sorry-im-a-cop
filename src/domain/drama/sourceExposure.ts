import type { RuntimeState } from '../runtime/types';
import { dramaSourceKey, type DramaSourceRef } from './types';

function normalizeSourceRef(value: unknown): DramaSourceRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as Partial<Record<keyof DramaSourceRef, unknown>>;
  if (
    typeof candidate.providerId !== 'string' || !candidate.providerId.trim() ||
    typeof candidate.sourceType !== 'string' || !candidate.sourceType.trim() ||
    typeof candidate.sourceId !== 'string' || !candidate.sourceId.trim()
  ) {
    return undefined;
  }
  return {
    providerId: candidate.providerId.trim(),
    sourceType: candidate.sourceType.trim(),
    sourceId: candidate.sourceId.trim(),
    ...(typeof candidate.dlcId === 'string' && candidate.dlcId.trim()
      ? { dlcId: candidate.dlcId.trim() }
      : {})
  };
}

function normalizeSourceRefArray(value: unknown): DramaSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeSourceRef)
    .filter((ref): ref is DramaSourceRef => Boolean(ref));
}

/**
 * Builds the durable official-DLC exposure set from both the explicit ledger
 * and every older persistence surface that can still prove a source was used.
 * The set grows by unique content sources, not by turns.
 */
export function collectOfficialDlcExposureRefs(
  state: RuntimeState,
  additionalRefs: readonly DramaSourceRef[] = []
): DramaSourceRef[] {
  const current = state.dramaticContent;
  const refs = [
    ...normalizeSourceRefArray(current?.exposedOfficialDlcSourceRefs),
    ...(Array.isArray(current?.instances)
      ? current.instances.flatMap((instance) => normalizeSourceRefArray(instance?.sourceRefs))
      : []),
    ...(Array.isArray(current?.recentExecutions)
      ? current.recentExecutions.flatMap((receipt) => normalizeSourceRefArray(receipt?.usedSourceRefs))
      : []),
    ...(Array.isArray(state.narrativeArcs)
      ? state.narrativeArcs.flatMap((arc) => normalizeSourceRefArray([arc?.sourceRef]))
      : []),
    ...normalizeSourceRefArray(additionalRefs)
  ].filter((ref) => ref.providerId === 'official-dlc');

  return Array.from(
    new Map(refs.map((ref) => [dramaSourceKey(ref), { ...ref }])).values()
  );
}

export function isOfficialDlcSourceRefExposed(
  state: RuntimeState,
  ref: DramaSourceRef
): boolean {
  if (ref.providerId !== 'official-dlc') return false;
  const key = dramaSourceKey(ref);
  return collectOfficialDlcExposureRefs(state).some(
    (candidate) => dramaSourceKey(candidate) === key
  );
}

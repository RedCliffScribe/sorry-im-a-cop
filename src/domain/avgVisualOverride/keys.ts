import { normalizeAvgWorldpackId } from '../avgWorldpackId';
import type {
  AvgActorVisualOverrideKey,
  AvgActorOutfitVisualOverrideKey,
  AvgSceneOverrideAnchor,
  AvgSceneVisualOverrideKey
} from './types';

const KEY_SEPARATOR = '\u001f';

export function avgActorOverrideKey(key: AvgActorVisualOverrideKey): string {
  return [
    key.visualPartitionId,
    normalizeAvgWorldpackId(key.worldpackId),
    key.actorId
  ].join(KEY_SEPARATOR);
}

export function avgActorIdentityKey(key: AvgActorVisualOverrideKey): string {
  return avgActorOverrideKey(key);
}

export function avgUserOutfitKey(
  key: AvgActorVisualOverrideKey,
  outfitId: string
): string {
  return [avgActorIdentityKey(key), outfitId].join(KEY_SEPARATOR);
}

export function avgActorOutfitOverrideKey(
  key: AvgActorOutfitVisualOverrideKey
): string {
  return [
    avgActorIdentityKey(key),
    key.outfit.type,
    key.outfit.type === 'resource_outfit' ? key.outfit.basePackId : '',
    key.outfit.outfitId
  ].join(KEY_SEPARATOR);
}

export function avgSceneOverrideKey(key: AvgSceneVisualOverrideKey): string {
  return [
    key.visualPartitionId,
    normalizeAvgWorldpackId(key.worldpackId),
    key.anchor.type,
    key.anchor.id
  ].join(KEY_SEPARATOR);
}

export function createAvgSceneOverrideAnchor(input: {
  runtimeSceneId?: string;
  runtimePlaceId?: string;
}): AvgSceneOverrideAnchor | undefined {
  const runtimeSceneId = input.runtimeSceneId?.trim();
  if (runtimeSceneId) return { type: 'runtime_scene', id: runtimeSceneId };
  const runtimePlaceId = input.runtimePlaceId?.trim();
  if (runtimePlaceId) return { type: 'runtime_place', id: runtimePlaceId };
  return undefined;
}

export function createAvgOverrideAssetId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `avg-override:${suffix}`;
}

export function createAvgUserOutfitId(): string {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `user_outfit_${suffix}`;
}

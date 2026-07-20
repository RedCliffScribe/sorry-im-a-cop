import type { CityPowerFigureAnchor } from './cityPowerTypes';

export function cityPowerCanonicalId(anchor: Pick<CityPowerFigureAnchor, 'canonicalSeedId'>): string {
  return anchor.canonicalSeedId.trim();
}

export function cityPowerRuntimeActorId(canonicalSeedId: string): string {
  return `npc_power_${canonicalSeedId}`;
}

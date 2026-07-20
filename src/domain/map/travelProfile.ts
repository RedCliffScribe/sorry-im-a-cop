import type { Place, VehicleAsset } from '../runtime/types';

export type TravelMode = 'walk' | 'taxi' | 'patrolCar' | 'mtr' | 'ferry';
export type TravelUrgency = 'normal' | 'hurried' | 'emergency';

export interface TravelReferenceOptions {
  urgency?: TravelUrgency;
  vehicle?: VehicleAsset;
}

export interface TravelReference {
  fromPlaceId: string;
  fromPlaceName: string;
  toPlaceId: string;
  toPlaceName: string;
  mode: TravelMode;
  urgency: TravelUrgency;
  minMinutes: number;
  maxMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  riskNote?: string;
}

const MODE_MULTIPLIERS: Record<TravelMode, number> = {
  walk: 1,
  taxi: 0.45,
  patrolCar: 0.38,
  mtr: 0.5,
  ferry: 0.7
};

const MODE_EXTRA_MINUTES: Record<TravelMode, number> = {
  walk: 0,
  taxi: 4,
  patrolCar: 2,
  mtr: 8,
  ferry: 12
};

const URGENCY_MULTIPLIERS: Record<TravelUrgency, number> = {
  normal: 1,
  hurried: 0.88,
  emergency: 0.68
};

function isHongKongIsland(regionId: string | undefined): boolean {
  return regionId === 'region_hong_kong_island' || regionId === 'region_hk_island';
}

function isKowloon(regionId: string | undefined): boolean {
  return regionId === 'region_kowloon';
}

function isCrossHarbour(from: Place, to: Place): boolean {
  return (isKowloon(from.regionId) && isHongKongIsland(to.regionId)) || (isHongKongIsland(from.regionId) && isKowloon(to.regionId));
}

function normalizedDistance(from: Place, to: Place): number | undefined {
  const fromAnchor = from.visualAnchor;
  const toAnchor = to.visualAnchor;
  if (!fromAnchor || !toAnchor || fromAnchor.mapId !== toAnchor.mapId) return undefined;

  return Math.hypot(fromAnchor.x - toAnchor.x, fromAnchor.y - toAnchor.y);
}

function precisionConfidence(from: Place, to: Place): TravelReference['confidence'] {
  const precisions = [from.visualAnchor?.precision, to.visualAnchor?.precision];
  if (precisions.includes('district_only')) return 'low';
  if (precisions.every((precision) => precision === 'exact')) return 'high';
  return 'medium';
}

function baseMinutes(distance: number, from: Place, to: Place): { minutes: number; reason: string; confidencePenalty?: boolean } {
  if (isCrossHarbour(from, to)) {
    return {
      minutes: 35 + distance * 160,
      reason: '跨九龙与港岛，需要过海交通',
      confidencePenalty: true
    };
  }

  if (from.districtId && to.districtId && from.districtId === to.districtId) {
    return {
      minutes: 6 + distance * 180,
      reason: '同一街区或同一警区范围'
    };
  }

  if (from.regionId && to.regionId && from.regionId === to.regionId) {
    return {
      minutes: 10 + distance * 260,
      reason: '同一区域内的相邻或近距街区'
    };
  }

  return {
    minutes: 18 + distance * 300,
    reason: '跨区域移动，按坐标和区域关系估算',
    confidencePenalty: true
  };
}

function clampMinutes(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function lowerConfidence(confidence: TravelReference['confidence']): TravelReference['confidence'] {
  if (confidence === 'high') return 'medium';
  return 'low';
}

function getVehicleMultiplier(vehicle: VehicleAsset | undefined): number {
  const multiplier = vehicle?.mobilityProfile?.timeMultiplier;
  return typeof multiplier === 'number' && Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
}

function createRiskNote(urgency: TravelUrgency): string | undefined {
  if (urgency === 'emergency') return 'emergency movement may draw attention, increase collision risk, and create procedural exposure.';
  if (urgency === 'hurried') return 'hurried movement may reduce observation time and raise minor traffic risk.';
  return undefined;
}

function formatReason(baseReason: string, urgency: TravelUrgency, vehicle: VehicleAsset | undefined): string {
  const details = [baseReason];
  if (urgency !== 'normal') details.push(`${urgency} urgency`);
  if (vehicle?.mobilityProfile) {
    details.push(`${vehicle.name}: ${vehicle.mobilityProfile.availabilitySummary}`);
  }
  return details.join(' / ');
}

export function estimateTravelReference(
  from: Place,
  to: Place,
  mode: TravelMode,
  options: TravelReferenceOptions = {}
): TravelReference | null {
  const distance = normalizedDistance(from, to);
  if (distance === undefined || from.placeId === to.placeId) return null;

  const urgency = options.urgency ?? 'normal';
  const base = baseMinutes(distance, from, to);
  const center = base.minutes * MODE_MULTIPLIERS[mode] * URGENCY_MULTIPLIERS[urgency] * getVehicleMultiplier(options.vehicle) + MODE_EXTRA_MINUTES[mode];
  const minMinutes = clampMinutes(center * 0.75, 3, 240);
  const maxMinutes = Math.max(minMinutes + 3, clampMinutes(center * 1.35 + 1, 5, 300));
  const confidence = base.confidencePenalty ? lowerConfidence(precisionConfidence(from, to)) : precisionConfidence(from, to);

  return {
    fromPlaceId: from.placeId,
    fromPlaceName: from.nameZh ?? from.name,
    toPlaceId: to.placeId,
    toPlaceName: to.nameZh ?? to.name,
    mode,
    urgency,
    minMinutes,
    maxMinutes,
    confidence,
    reason: formatReason(base.reason, urgency, options.vehicle),
    riskNote: createRiskNote(urgency)
  };
}

export function estimateTravelReferences(
  from: Place,
  to: Place,
  mode?: TravelMode,
  options: TravelReferenceOptions = {}
): TravelReference[] {
  const modes: TravelMode[] = mode ? [mode] : ['walk', 'taxi'];
  return modes
    .map((candidateMode) => estimateTravelReference(from, to, candidateMode, options))
    .filter((reference): reference is TravelReference => reference !== null);
}

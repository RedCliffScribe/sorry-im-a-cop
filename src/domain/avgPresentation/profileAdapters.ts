import { hk1988GenericPortraitProfileAdapter } from '../worldpack/hk1988AvgPortraitProfile';
import type { AvgGenericPortraitProfileAdapter } from './types';
import { normalizeAvgWorldpackId } from './worldpackId';

export function getBuiltInGenericPortraitProfileAdapter(
  worldpackId: string
): AvgGenericPortraitProfileAdapter | undefined {
  return normalizeAvgWorldpackId(worldpackId) === 'hk1988'
    ? hk1988GenericPortraitProfileAdapter
    : undefined;
}

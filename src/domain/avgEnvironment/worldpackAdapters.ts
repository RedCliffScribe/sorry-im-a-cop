import { hk1988AvgEnvironmentAdapter } from '../worldpack/hk1988AvgSceneEnvironment';
import type { AvgEnvironmentWorldpackAdapter } from './types';

export function getAvgEnvironmentWorldpackAdapter(
  worldpackId: string
): AvgEnvironmentWorldpackAdapter | undefined {
  if (worldpackId === 'hk1988' || worldpackId === 'hk_1988') {
    return hk1988AvgEnvironmentAdapter;
  }
  return undefined;
}

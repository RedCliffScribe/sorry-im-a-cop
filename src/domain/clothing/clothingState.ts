import type { AssetItemId, ClothingMode, GameTime, PlayerClothingState } from '../runtime/types';

export interface PlayerClothingPatch {
  currentSummary: string;
  mode: ClothingMode;
  sourceItemId?: AssetItemId;
  sourceItemSignificance?: string;
  lastChangedReason?: string;
}

function cloneTime(time: GameTime): GameTime {
  return { ...time };
}

export function applyPlayerClothingPatch(
  existing: PlayerClothingState | undefined,
  patch: PlayerClothingPatch,
  time: GameTime
): { clothing: string; clothingState: PlayerClothingState } {
  return {
    clothing: patch.currentSummary,
    clothingState: {
      currentSummary: patch.currentSummary,
      mode: patch.mode,
      sourceItemId: patch.sourceItemId,
      sourceItemSignificance: patch.sourceItemSignificance,
      lastChangedReason: patch.lastChangedReason,
      lastChangedAt: cloneTime(time)
    }
  };
}

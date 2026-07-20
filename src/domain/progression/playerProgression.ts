import type { AttributeBlock, PlayerProfile, PlayerProgression } from '../runtime/types';

export type PlayerAttributeKey = keyof AttributeBlock;

export interface ProgressionUpdateResult {
  progression: PlayerProgression;
  levelsGained: number;
  attributePointsGained: number;
}

export interface AttributePointSpendResult {
  player: PlayerProfile;
  applied: boolean;
  reason?: 'no_points' | 'attribute_at_cap' | 'invalid_attribute';
}

export const PLAYER_ATTRIBUTE_KEYS: PlayerAttributeKey[] = [
  'body',
  'action',
  'perception',
  'thinking',
  'negotiation',
  'will'
];

export const ATTRIBUTE_POINT_CAP = 100;
export const ATTRIBUTE_POINTS_PER_LEVEL = 5;

export function normalizePlayerProgression(value: Partial<PlayerProgression> | undefined): PlayerProgression {
  return {
    level: Math.max(1, Math.trunc(value?.level ?? 1)),
    experience: Math.max(0, Math.trunc(value?.experience ?? 0)),
    unspentAttributePoints: Math.max(0, Math.trunc(value?.unspentAttributePoints ?? 0))
  };
}

export function experienceNeededForNextLevel(level: number): number {
  return Math.max(1, Math.trunc(level)) * 100;
}

export function applyExperienceGain(
  current: Partial<PlayerProgression> | undefined,
  experienceGain: number
): ProgressionUpdateResult {
  const normalized = normalizePlayerProgression(current);
  let level = normalized.level;
  let experience = normalized.experience + Math.max(0, Math.trunc(experienceGain));
  let levelsGained = 0;

  while (experience >= experienceNeededForNextLevel(level)) {
    experience -= experienceNeededForNextLevel(level);
    level += 1;
    levelsGained += 1;
  }

  const attributePointsGained = levelsGained * ATTRIBUTE_POINTS_PER_LEVEL;
  return {
    progression: {
      level,
      experience,
      unspentAttributePoints: normalized.unspentAttributePoints + attributePointsGained
    },
    levelsGained,
    attributePointsGained
  };
}

export function spendPlayerAttributePoint(
  player: PlayerProfile,
  attribute: PlayerAttributeKey
): AttributePointSpendResult {
  if (!PLAYER_ATTRIBUTE_KEYS.includes(attribute)) {
    return { player, applied: false, reason: 'invalid_attribute' };
  }

  const progression = normalizePlayerProgression(player.progression);
  if (progression.unspentAttributePoints <= 0) {
    return { player, applied: false, reason: 'no_points' };
  }

  if (player.attributes[attribute] >= ATTRIBUTE_POINT_CAP) {
    return { player, applied: false, reason: 'attribute_at_cap' };
  }

  return {
    applied: true,
    player: {
      ...player,
      attributes: {
        ...player.attributes,
        [attribute]: player.attributes[attribute] + 1
      },
      progression: {
        ...progression,
        unspentAttributePoints: progression.unspentAttributePoints - 1
      }
    }
  };
}

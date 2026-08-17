import type { GameDifficultyLevel } from '../runtime/types';

export interface GameDifficultyProfile {
  id: GameDifficultyLevel;
  label: string;
  modifier: number;
  summary: string;
}

export const gameDifficultyProfiles: readonly GameDifficultyProfile[] = [
  {
    id: 'story',
    label: '剧情',
    modifier: 20,
    summary: '更容易通过有风险的行动，但仍保留失败和大失败。'
  },
  {
    id: 'easy',
    label: '轻松',
    modifier: 10,
    summary: '适度提高本地判定目标值，适合更顺畅的长期游玩。'
  },
  {
    id: 'standard',
    label: '标准',
    modifier: 0,
    summary: '不额外修正目标值，完整体现六维、难度和现场因素。'
  },
  {
    id: 'hard',
    label: '困难',
    modifier: -10,
    summary: '降低本地判定目标值，冒险行动更需要高属性与准备。'
  },
  {
    id: 'brutal',
    label: '严酷',
    modifier: -20,
    summary: '显著压低目标值，失败与代价会更常见，但不会取消成功机会。'
  }
];

export function getGameDifficultyProfile(
  difficulty: GameDifficultyLevel | string | null | undefined
): GameDifficultyProfile {
  return (
    gameDifficultyProfiles.find((profile) => profile.id === difficulty) ??
    gameDifficultyProfiles[2]
  );
}

export function normalizeGameDifficulty(
  difficulty: GameDifficultyLevel | string | null | undefined
): GameDifficultyLevel {
  return getGameDifficultyProfile(difficulty).id;
}

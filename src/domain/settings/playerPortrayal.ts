import type { PlayerPortrayalMode } from './types';

export interface PlayerPortrayalProfile {
  value: PlayerPortrayalMode;
  label: string;
  marker: string;
  description: string;
  exampleInput: string;
  exampleOutput: string;
}

export const playerPortrayalProfiles: PlayerPortrayalProfile[] = [
  {
    value: 'original',
    label: '原始',
    marker: '1.0 经典写法',
    description: '恢复 1.0 版较重场面与氛围、按“场景—行动—反馈”推进的写法；也可配合酒馆预设继续调整成自己喜欢的风格。',
    exampleInput: '问阿强昨晚去了哪里。',
    exampleOutput:
      '【旁白】吊扇把报案室里的烟气推得一阵浓一阵淡。你把话题带回昨夜，阿强捏着纸杯，先望了一眼门外。\n【阿强】“十一点几啰，喺庙街帮人收档。点解突然问呢样？”'
  },
  {
    value: 'player_led',
    label: '玩家主导',
    marker: '严格按输入',
    description: '严格围绕玩家已经明确说出或做出的内容展开，不替主角增加台词、感受和下一步行动。',
    exampleInput: '问阿强昨晚去了哪里。',
    exampleOutput:
      '【旁白】你当面询问阿强昨晚的去向。阿强没有立刻回答，只把纸杯搁回桌面，抬眼等你把问题说清楚。'
  },
  {
    value: 'natural',
    label: '自然代演',
    marker: '自然演出输入 · 默认',
    description: '把本回合输入自然写成主角对白与动作，可按人物口吻润色，但不会新增立场或替玩家作关键决定。',
    exampleInput: '问阿强昨晚去了哪里。',
    exampleOutput:
      '【陈启明】“阿强，寻晚你去咗边？我想听你自己讲。”\n【旁白】问题落下后，阿强握着纸杯的手停了一下。'
  }
];

export function isPlayerPortrayalMode(value: unknown): value is PlayerPortrayalMode {
  return value === 'original' || value === 'player_led' || value === 'natural';
}

export function resolvePlayerPortrayalMode(value: unknown): PlayerPortrayalMode {
  return isPlayerPortrayalMode(value) ? value : 'natural';
}

export function getPlayerPortrayalProfile(value: unknown): PlayerPortrayalProfile {
  const resolved = resolvePlayerPortrayalMode(value);
  return playerPortrayalProfiles.find((profile) => profile.value === resolved) ?? playerPortrayalProfiles[2];
}

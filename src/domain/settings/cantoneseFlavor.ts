import type { CantoneseFlavorLevel } from '../runtime/types';

export interface CantoneseFlavorProfile {
  id: CantoneseFlavorLevel;
  label: string;
  summary: string;
  promptGuide: string;
}

export const cantoneseFlavorProfiles: CantoneseFlavorProfile[] = [
  {
    id: 'off',
    label: '关闭',
    summary: '对白保持标准中文，不主动加入粤语。',
    promptGuide: '对白使用标准书面中文，不主动加入粤语词汇。'
  },
  {
    id: 'light',
    label: '轻微',
    summary: '少量称呼、语气词和港式口吻。',
    promptGuide: '对白可轻微加入粤语语气词和称呼，正文仍以书面中文为主。'
  },
  {
    id: 'medium',
    label: '中等',
    summary: '主要对白带香港味，叙述仍易读。',
    promptGuide: '对白保持中等粤语风味，关键人物口吻可带港式词汇，叙述仍保持易读。'
  },
  {
    id: 'heavy',
    label: '较多',
    summary: '人物对白较多粤语和港式句式。',
    promptGuide: '对白较多使用粤语表达和港式句式，但需要保证非粤语读者能理解。'
  },
  {
    id: 'full',
    label: '全粤语',
    summary: '对白尽量粤语化，适合强风味游玩。',
    promptGuide: '人物对白尽量使用粤语/港式口语，必要时用上下文保证意思清楚。'
  }
];

export function getCantoneseFlavorProfile(
  flavor: CantoneseFlavorLevel | string | null | undefined
): CantoneseFlavorProfile {
  return cantoneseFlavorProfiles.find((profile) => profile.id === flavor) ?? cantoneseFlavorProfiles[2];
}

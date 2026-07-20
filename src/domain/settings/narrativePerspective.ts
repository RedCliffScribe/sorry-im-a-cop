import type { NarrativePerspective } from './types';

export interface NarrativePerspectiveProfile {
  value: NarrativePerspective;
  label: string;
  marker: string;
  description: string;
}

export const narrativePerspectiveProfiles: NarrativePerspectiveProfile[] = [
  {
    value: 'first_person',
    label: '第一人称',
    marker: '我',
    description: '旁白以“我”承接玩家的动作与感知，更贴近主角视角。'
  },
  {
    value: 'second_person',
    label: '第二人称',
    marker: '你 · 默认',
    description: '旁白直接面向玩家，维持当前最常见的互动叙事方式。'
  },
  {
    value: 'third_person',
    label: '第三人称',
    marker: '姓名 / 他 / 她',
    description: '旁白使用主角姓名与对应代词，呈现更接近小说的阅读感。'
  }
];

export function isNarrativePerspective(value: unknown): value is NarrativePerspective {
  return value === 'first_person' || value === 'second_person' || value === 'third_person';
}

export function resolveNarrativePerspective(value: unknown): NarrativePerspective {
  return isNarrativePerspective(value) ? value : 'second_person';
}

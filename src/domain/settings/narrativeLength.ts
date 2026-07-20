export const narrativeLengthLevels = ['compact', 'standard', 'long', 'immersive'] as const;

export type NarrativeLengthLevel = (typeof narrativeLengthLevels)[number];

export interface NarrativeLengthProfile {
  level: NarrativeLengthLevel;
  label: string;
  uiRange: string;
  description: string;
  openingTarget: string;
  openingMinimum: number;
  turnTarget: string;
  complexTurnTarget: string;
  transitionMinimum: number;
  paragraphTarget: string;
}

export const narrativeLengthProfiles: NarrativeLengthProfile[] = [
  {
    level: 'compact',
    label: '精简',
    uiRange: '约300-600字',
    description: '节奏更快，适合调试、过渡和短行动。',
    openingTarget: '600-900',
    openingMinimum: 500,
    turnTarget: '300-600',
    complexTurnTarget: '600-1000',
    transitionMinimum: 180,
    paragraphTarget: '3-5'
  },
  {
    level: 'standard',
    label: '标准',
    uiRange: '约500-900字',
    description: '默认篇幅，兼顾现场感、节奏和 token 消耗。',
    openingTarget: '900-1400',
    openingMinimum: 700,
    turnTarget: '500-900',
    complexTurnTarget: '900-1500',
    transitionMinimum: 250,
    paragraphTarget: '4-8'
  },
  {
    level: 'long',
    label: '长篇',
    uiRange: '约900-1400字',
    description: '更重视场面、人物反馈和关系承接。',
    openingTarget: '1300-2000',
    openingMinimum: 1000,
    turnTarget: '900-1400',
    complexTurnTarget: '1400-2200',
    transitionMinimum: 350,
    paragraphTarget: '7-12'
  },
  {
    level: 'immersive',
    label: '沉浸',
    uiRange: '约1400-2200字',
    description: '更长的沉浸式正文，适合关键剧情，消耗更多 token。',
    openingTarget: '1800-2800',
    openingMinimum: 1200,
    turnTarget: '1400-2200',
    complexTurnTarget: '2200-3200',
    transitionMinimum: 500,
    paragraphTarget: '10-16'
  }
];

export function isNarrativeLengthLevel(value: unknown): value is NarrativeLengthLevel {
  return typeof value === 'string' && (narrativeLengthLevels as readonly string[]).includes(value);
}

export function getNarrativeLengthProfile(level: unknown): NarrativeLengthProfile {
  return narrativeLengthProfiles.find((profile) => profile.level === level) ?? narrativeLengthProfiles[1];
}

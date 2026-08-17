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
  turnMinimum: number;
  complexTurnTarget: string;
}

export const narrativeLengthProfiles: NarrativeLengthProfile[] = [
  {
    level: 'compact',
    label: '精简',
    uiRange: '约300-600字',
    description: '节奏更快，适合调试、过渡和短行动。',
    openingTarget: '600-900',
    openingMinimum: 600,
    turnTarget: '300-600',
    turnMinimum: 300,
    complexTurnTarget: '600-1000',
  },
  {
    level: 'standard',
    label: '标准',
    uiRange: '约500-900字',
    description: '默认篇幅，兼顾现场感、节奏和 token 消耗。',
    openingTarget: '900-1400',
    openingMinimum: 900,
    turnTarget: '500-900',
    turnMinimum: 500,
    complexTurnTarget: '900-1500',
  },
  {
    level: 'long',
    label: '长篇',
    uiRange: '约900-1400字',
    description: '更重视场面、人物反馈和关系承接。',
    openingTarget: '1300-2000',
    openingMinimum: 1300,
    turnTarget: '900-1400',
    turnMinimum: 900,
    complexTurnTarget: '1400-2200',
  },
  {
    level: 'immersive',
    label: '沉浸',
    uiRange: '约1400-2200字',
    description: '更长的沉浸式正文，适合关键剧情，消耗更多 token。',
    openingTarget: '1800-2800',
    openingMinimum: 1800,
    turnTarget: '1400-2200',
    turnMinimum: 1400,
    complexTurnTarget: '2200-3200',
  }
];

export function isNarrativeLengthLevel(value: unknown): value is NarrativeLengthLevel {
  return typeof value === 'string' && (narrativeLengthLevels as readonly string[]).includes(value);
}

export function getNarrativeLengthProfile(level: unknown): NarrativeLengthProfile {
  return narrativeLengthProfiles.find((profile) => profile.level === level) ?? narrativeLengthProfiles[1];
}

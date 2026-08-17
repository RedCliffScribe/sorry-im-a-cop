import {
  getNarrativeLengthProfile,
  type NarrativeLengthLevel,
  type NarrativeLengthProfile
} from '../settings/narrativeLength';

export type NarrativeLengthContext = 'opening' | 'turn';

export const severeNarrativeUndershootRatio = 0.7;

export interface NarrativeLengthMeasurement {
  actual: number;
  minimum: number;
  retryBelow: number;
  target: string;
  severelyShort: boolean;
}

export function countVisibleNarrativeCharacters(narrativeText: string): number {
  const visibleText = narrativeText.replace(/【[^】]*】/gu, '').replace(/\s/gu, '');
  return Array.from(visibleText).length;
}

function getMinimum(profile: NarrativeLengthProfile, context: NarrativeLengthContext): number {
  return context === 'opening' ? profile.openingMinimum : profile.turnMinimum;
}

function getTarget(profile: NarrativeLengthProfile, context: NarrativeLengthContext): string {
  return context === 'opening' ? profile.openingTarget : profile.turnTarget;
}

export function measureNarrativeLength(
  narrativeText: string,
  level: NarrativeLengthLevel,
  context: NarrativeLengthContext
): NarrativeLengthMeasurement {
  const profile = getNarrativeLengthProfile(level);
  const minimum = getMinimum(profile, context);
  const retryBelow = Math.ceil(minimum * severeNarrativeUndershootRatio);
  const actual = countVisibleNarrativeCharacters(narrativeText);
  return {
    actual,
    minimum,
    retryBelow,
    target: getTarget(profile, context),
    severelyShort: actual < retryBelow
  };
}

export function extractNarrativeText(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const narrativeText = (value as { narrativeText?: unknown }).narrativeText;
  return typeof narrativeText === 'string' ? narrativeText : undefined;
}

export function createNarrativeLengthRetryPrompt(
  originalPrompt: string,
  measurement: NarrativeLengthMeasurement
): string {
  return [
    originalPrompt,
    '',
    '## 正文篇幅合同失败后的完整重生成（最高优先级）',
    `上一份候选正文只有 ${measurement.actual} 个可见字符，严重低于本档最低 ${measurement.minimum} 个字符。请从头重新生成完整 JSON object，narrativeText 目标 ${measurement.target} 个中文字符且不得低于 ${measurement.minimum} 个字符。`,
    '上一份候选不会写入存档；不要提及重试、字数检查、系统或模型。不要续写、拼接或只返回补充段落。',
    '保持原玩家输入、结构化事实、人物信息边界和写回协议不变。围绕同一现场纵向展开已经授权的行动过程、现有 NPC 的具体回应与对白、信息交换、现实限制和直接后果。',
    '不得用同义反复、五感清单、形容词堆砌、重复反应或新造电话、访客、案件、危险和远场钩子补长度，也不得替玩家新增决定、承诺、感受、对白或超出输入范围的动作。'
  ].join('\n');
}

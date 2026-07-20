import {
  createDefaultAdultRelationshipStyleGuide,
  resolvePromptText
} from '../prompts/promptRegistry';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import { resolveNarrativePerspective } from '../settings/narrativePerspective';
import type { NarrativePerspective, PromptSettings } from '../settings/types';

export function createNarrativeStyleAndDisplayGuide(
  level?: NarrativeLengthLevel,
  promptSettings?: PromptSettings
): string {
  return resolvePromptText('narrative.styleAndDisplay', promptSettings, level);
}

export const narrativeStyleAndDisplayGuide = createNarrativeStyleAndDisplayGuide('standard');

interface NarrativePerspectiveSubject {
  playerName?: string;
  playerGender?: 'male' | 'female' | 'nonbinary' | 'unknown';
}

export function createNarrativePerspectiveGuide(
  perspective?: NarrativePerspective,
  subject: NarrativePerspectiveSubject = {}
): string {
  const resolved = resolveNarrativePerspective(perspective);
  const playerName = subject.playerName?.trim() || '玩家姓名';
  const thirdPersonPronoun =
    subject.playerGender === 'male' ? '他' : subject.playerGender === 'female' ? '她' : playerName;
  const selectedRule: Record<NarrativePerspective, string> = {
    first_person:
      '- 本局选择第一人称：在【旁白】中叙述玩家的动作、处境和可感知体验时，固定以“我”指代玩家；不得切换为“你”，也不得改用玩家姓名或“他/她”叙述玩家。',
    second_person:
      '- 本局选择第二人称：在【旁白】中叙述玩家的动作、处境和可感知体验时，固定以“你”指代玩家；不得切换为叙述者的“我”，也不得改用玩家姓名或“他/她”叙述玩家。',
    third_person: `- 本局选择第三人称：在【旁白】中使用玩家姓名“${playerName}”或代词“${thirdPersonPronoun}”叙述玩家；不得使用“你”称呼玩家，也不得把玩家叙述成“我”。`
  };

  return [
    '正文叙事人称（硬约束，优先于可编辑文风）：',
    selectedRule[resolved],
    '- 单个回合内和跨回合都必须保持所选人称，不得在段落之间来回切换。',
    '- 该规则只约束【旁白】对玩家的叙述。人物对白仍按说话关系自然使用“我、你、他/她”；玩家明确说出的对白可以自称“我”，不视为叙事人称切换。',
    '- 无论选择哪种人称，都不得替玩家补写其未输入的对白、心理、决定或承诺。'
  ].join('\n');
}

export function createAdultRelationshipStyleGuide(promptSettings?: PromptSettings): string {
  return resolvePromptText('relationship.adultStyleGuide', promptSettings);
}

export const adultRelationshipStyleGuide = createDefaultAdultRelationshipStyleGuide();

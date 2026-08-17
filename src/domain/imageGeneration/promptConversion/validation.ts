import type {
  CharacterAnchorConversionInput,
  CharacterAnchorConversionOutput,
  CharacterAnchorImageExtractionInput,
  CharacterPromptBatchInput,
  CharacterPromptBatchOutput,
  ProviderPromptRenderInput,
  ProviderPromptRenderOutput,
  SceneShotPromptInput,
  SceneShotPromptOutput,
  TurnScenePlanningInput,
  TurnScenePlanningOutput
} from './schemas';
import { CHARACTER_VISUAL_PURPOSES } from './types';

function hasResolvedText(positive: string, negative: string): boolean {
  return Boolean(positive.trim() || negative.trim());
}

const SCENE_MEDIUM_NEGATIVE_DIRECTIVES = new Set([
  '插画',
  '照片',
  '摄影',
  '油画',
  '水彩',
  '数字绘画',
  '现代数字绘画',
  '动漫',
  '动画',
  '赛璐璐',
  '三维渲染',
  'cg',
  'cgi',
  '3d render',
  '3d rendering',
  'illustration',
  'photo',
  'photograph',
  'photography',
  'painting',
  'digital art',
  'digital painting',
  'anime',
  'animation',
  'cel shading'
]);

function findSceneMediumNegativeDirectives(value: string): string[] {
  return value
    .split(/[，,、；;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const normalized = part
        .toLocaleLowerCase('en-US')
        .replace(/^(?:不要|避免|排除|禁用|no|avoid|exclude)\s*/u, '')
        .replace(/\s+(?:风格|style|look)$/u, '')
        .trim();
      return SCENE_MEDIUM_NEGATIVE_DIRECTIVES.has(normalized);
    });
}

export function validateCharacterAnchorOutput(
  input: CharacterAnchorConversionInput | CharacterAnchorImageExtractionInput,
  output: CharacterAnchorConversionOutput
): string[] {
  return output.actorId === input.actor.actorId ? [] : ['返回的 actorId 与输入角色不一致'];
}

export function validateCharacterPromptBatchOutput(
  input: CharacterPromptBatchInput,
  output: CharacterPromptBatchOutput
): string[] {
  const issues: string[] = [];
  if (output.actorId !== input.actorId) issues.push('返回的 actorId 与输入角色不一致');
  const purposes = new Set(output.views.map((view) => view.purpose));
  for (const purpose of CHARACTER_VISUAL_PURPOSES) {
    if (!purposes.has(purpose)) issues.push(`缺少人物图片用途 ${purpose}`);
  }
  if (purposes.size !== output.views.length) issues.push('人物图片用途重复');
  const hasAdditionalRequirement = Boolean(input.additionalRequirementText?.trim());
  for (const view of output.views) {
    if (view.appearanceSource && !view.resolvedAppearancePositive?.trim()) {
      issues.push(`${view.purpose} 未解析当前装扮`);
    }
    if (view.appearanceSource === 'additional-requirement-override' && !hasAdditionalRequirement) {
      issues.push(`${view.purpose} 没有额外要求时不得声明当前装扮覆盖`);
    }
    if (!hasAdditionalRequirement && hasResolvedText(
      view.resolvedAdditionalPositive,
      view.resolvedAdditionalNegative
    )) {
      issues.push(`${view.purpose} 在没有输入额外要求时返回了额外要求`);
    }
    if (
      hasAdditionalRequirement &&
      !hasResolvedText(view.resolvedAdditionalPositive, view.resolvedAdditionalNegative) &&
      !(view.appearanceSource === 'additional-requirement-override' && view.resolvedAppearancePositive?.trim())
    ) {
      issues.push(`${view.purpose} 未解析额外要求`);
    }
  }
  return issues;
}

export function validateTurnScenePlanningOutput(
  input: TurnScenePlanningInput,
  output: TurnScenePlanningOutput
): string[] {
  const issues: string[] = [];
  if (output.shots.length > input.requestedMaxScenes) {
    issues.push(`镜头数量 ${output.shots.length} 超过本回合上限 ${input.requestedMaxScenes}`);
  }
  const blocks = new Map(input.blocks.map((block) => [block.blockIndex, block.blockHash]));
  const allowedActorIds = new Set(input.actors.map((actor) => actor.actorId));
  const orders = new Set<number>();
  for (const [index, shot] of output.shots.entries()) {
    if (shot.order !== index) issues.push(`镜头 order 必须从 0 连续排列，索引 ${index} 返回 ${shot.order}`);
    if (orders.has(shot.order)) issues.push(`镜头 order ${shot.order} 重复`);
    orders.add(shot.order);
    if (blocks.get(shot.placement.blockIndex) !== shot.placement.blockHash) {
      issues.push(`镜头 ${index} 的正文块索引或哈希不匹配`);
    }
    for (const actorId of shot.knownActorIds) {
      if (!allowedActorIds.has(actorId)) issues.push(`镜头 ${index} 使用了未允许的 actorId ${actorId}`);
    }
  }
  return issues;
}

export function validateSceneShotPromptOutput(
  input: SceneShotPromptInput,
  output: SceneShotPromptOutput
): string[] {
  const issues: string[] = [];
  const mediumNegativeDirectives = findSceneMediumNegativeDirectives(output.baseNegative);
  if (mediumNegativeDirectives.length) {
    issues.push(
      `baseNegative 不得排除图片媒介或画风（${mediumNegativeDirectives.join('、')}）；媒介与画风由独立风格段负责`
    );
  }
  const expected = new Map(input.participants.map((participant) => [participant.actorId, participant]));
  const actual = new Set<string>();
  for (const resolution of output.participantResolutions) {
    if (actual.has(resolution.actorId)) issues.push(`参与者解析 actorId ${resolution.actorId} 重复`);
    actual.add(resolution.actorId);
    const participant = expected.get(resolution.actorId);
    if (!participant) {
      issues.push(`参与者解析包含未允许的 actorId ${resolution.actorId}`);
      continue;
    }
    const expectedAppearanceSource = participant.sceneSpecificAppearance?.trim()
      ? 'scene-specific-override'
      : 'anchor-default';
    if (!resolution.resolvedAppearancePositive.trim()) {
      issues.push(`参与者 ${resolution.actorId} 的当前装扮没有被解析`);
    }
    if (resolution.appearanceSource && resolution.appearanceSource !== expectedAppearanceSource) {
      issues.push(
        `参与者 ${resolution.actorId} 的装扮来源应为 ${expectedAppearanceSource}，实际为 ${resolution.appearanceSource}`
      );
    }
    if (
      participant.persistentAdditionalRequirementText?.trim() &&
      !hasResolvedText(resolution.resolvedAdditionalPositive, resolution.resolvedAdditionalNegative)
    ) {
      issues.push(`参与者 ${resolution.actorId} 的长期额外要求没有被解析`);
    }
  }
  for (const actorId of expected.keys()) {
    if (!actual.has(actorId)) issues.push(`缺少参与者解析 ${actorId}`);
  }
  if (
    input.oneTimeInstruction?.trim() &&
    !hasResolvedText(output.resolvedOneTimePositive, output.resolvedOneTimeNegative)
  ) {
    issues.push('本次额外要求没有被解析');
  }
  return issues;
}

export function validateProviderPromptRenderOutput(
  input: ProviderPromptRenderInput,
  output: ProviderPromptRenderOutput
): string[] {
  const issues: string[] = [];
  const expected = new Map(input.segments.map((segment) => [segment.segmentId, segment]));
  const actual = new Set<string>();
  for (const segment of output.segments) {
    if (actual.has(segment.segmentId)) {
      issues.push(`模型提示词格式转换重复返回 segmentId ${segment.segmentId}`);
      continue;
    }
    actual.add(segment.segmentId);
    const source = expected.get(segment.segmentId);
    if (!source) {
      issues.push(`模型提示词格式转换新增了未允许的 segmentId ${segment.segmentId}`);
      continue;
    }
    if (Boolean(source.positive) !== Boolean(segment.positive)) {
      issues.push(`语义段 ${segment.segmentId} 的正向内容不得被新增或清空`);
    }
    if (Boolean(source.negative) !== Boolean(segment.negative)) {
      issues.push(`语义段 ${segment.segmentId} 的负向内容不得被新增或清空`);
    }
  }
  for (const segmentId of expected.keys()) {
    if (!actual.has(segmentId)) issues.push(`模型提示词格式转换缺少 segmentId ${segmentId}`);
  }
  return issues;
}

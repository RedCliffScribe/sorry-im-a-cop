import { z } from 'zod';
import { IMAGE_PROMPT_DIALECT_FAMILIES } from './promptPresetLibrary';
import {
  CHARACTER_VISUAL_PURPOSES,
  SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS
} from './types';

const trimmedText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();
const actorIdSchema = trimmedText(200);
const sha256HexSchema = z.string().regex(/^[a-f0-9]{64}$/, '必须是 64 位小写 SHA-256 十六进制摘要');

export const visualWorldContextSchema = z.object({
  year: z.number().int().min(1800).max(2300),
  region: trimmedText(300),
  visualStyle: trimmedText(2000)
}).strict();

export const visualActorPublicProfileSchema = z.object({
  actorId: actorIdSchema,
  publicName: trimmedText(300),
  gender: z.enum(['male', 'female', 'nonbinary', 'unknown']),
  publicIdentity: optionalText(1000),
  positionSummary: optionalText(1000),
  visualAgeAnchor: optionalText(500),
  appearance: optionalText(3000),
  appearanceDescription: optionalText(3000),
  bodyDescription: optionalText(2000),
  clothing: optionalText(3000),
  clothingStyle: optionalText(2000),
  appearanceExtension: optionalText(2000),
  equipment: z.array(trimmedText(300)).max(30).default([])
}).strict();

export const characterAnchorConversionInputSchema = z.object({
  actor: visualActorPublicProfileSchema,
  world: visualWorldContextSchema,
  existingAnchorText: optionalText(8000)
}).strict();

export const characterAnchorImageExtractionInputSchema = z.object({
  actor: visualActorPublicProfileSchema,
  world: visualWorldContextSchema,
  sourceImages: z.array(z.object({
    imageId: trimmedText(300),
    mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    contentHash: sha256HexSchema
  }).strict()).min(1).max(4),
  existingAnchorText: optionalText(8000),
  additionalInstruction: optionalText(4000)
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.sourceImages.forEach((image, index) => {
    if (ids.has(image.imageId)) {
      context.addIssue({ code: 'custom', path: ['sourceImages', index, 'imageId'], message: '来源图片不能重复' });
    }
    ids.add(image.imageId);
  });
});

const ANCHOR_SECTIONS = ['【固定外观】', '【默认服装】', '【一致性要求】', '【避免偏移】'] as const;

export interface CharacterAnchorSections {
  fixedAppearance: string;
  defaultClothing: string;
  consistencyRequirements: string;
  driftAvoidance: string;
}

export function parseCharacterAnchorSections(value: string): CharacterAnchorSections | undefined {
  const positions = ANCHOR_SECTIONS.map((heading) => value.indexOf(heading));
  if (positions.some((position) => position < 0)) return undefined;
  if (positions.some((position, index) => index > 0 && position <= positions[index - 1]!)) return undefined;
  const contents = ANCHOR_SECTIONS.map((heading, index) => {
    const start = positions[index]! + heading.length;
    const end = positions[index + 1] ?? value.length;
    return value.slice(start, end).trim();
  });
  if (contents.some((content) => !content)) return undefined;
  return {
    fixedAppearance: contents[0]!,
    defaultClothing: contents[1]!,
    consistencyRequirements: contents[2]!,
    driftAvoidance: contents[3]!
  };
}

export function validateCharacterAnchorText(value: string): string[] {
  const issues: string[] = [];
  if (!value.trim().startsWith(ANCHOR_SECTIONS[0])) {
    issues.push(`锚点必须从 ${ANCHOR_SECTIONS[0]} 开始`);
  }
  const lineHeadings = Array.from(value.matchAll(/^【[^】]+】/gm), (match) => match[0]);
  if (
    lineHeadings.length !== ANCHOR_SECTIONS.length ||
    lineHeadings.some((heading, index) => heading !== ANCHOR_SECTIONS[index])
  ) {
    issues.push('锚点只能包含规定的四个标题且必须按固定顺序排列');
  }
  let previousIndex = -1;
  for (const heading of ANCHOR_SECTIONS) {
    const index = value.indexOf(heading);
    if (index < 0) {
      issues.push(`缺少锚点分段 ${heading}`);
      continue;
    }
    if (value.indexOf(heading, index + heading.length) >= 0) {
      issues.push(`锚点分段 ${heading} 重复`);
    }
    if (index <= previousIndex) issues.push(`锚点分段 ${heading} 顺序错误`);
    previousIndex = index;
  }
  for (let index = 0; index < ANCHOR_SECTIONS.length; index += 1) {
    const heading = ANCHOR_SECTIONS[index];
    const start = value.indexOf(heading);
    if (start < 0) continue;
    const nextHeading = ANCHOR_SECTIONS[index + 1];
    const end = nextHeading ? value.indexOf(nextHeading, start + heading.length) : value.length;
    if (!value.slice(start + heading.length, end < 0 ? value.length : end).trim()) {
      issues.push(`锚点分段 ${heading} 不能为空`);
    }
  }
  return issues;
}

export const characterAnchorConversionOutputSchema = z.object({
  actorId: actorIdSchema,
  anchorText: z.string().trim().min(1).max(8000).superRefine((value, context) => {
    for (const message of validateCharacterAnchorText(value)) {
      context.addIssue({ code: 'custom', message });
    }
  })
}).strict();

export const characterPromptBatchInputSchema = z.object({
  actorId: actorIdSchema,
  anchorText: characterAnchorConversionOutputSchema.shape.anchorText,
  additionalRequirementText: optionalText(4000),
  world: visualWorldContextSchema
}).strict();

export const characterAppearanceSourceSchema = z.enum([
  'anchor-default',
  'additional-requirement-override'
]);

export const characterViewPromptSchema = z.object({
  purpose: z.enum(CHARACTER_VISUAL_PURPOSES),
  basePositive: trimmedText(12000),
  baseNegative: z.string().trim().max(6000),
  appearanceSource: characterAppearanceSourceSchema.optional(),
  resolvedAppearancePositive: z.string().trim().max(6000).optional(),
  resolvedAdditionalPositive: z.string().trim().max(6000),
  resolvedAdditionalNegative: z.string().trim().max(6000)
}).strict();

export const characterPromptBatchOutputSchema = z.object({
  actorId: actorIdSchema,
  views: z.array(characterViewPromptSchema).length(4)
}).strict();

export const storyVisualBlockSchema = z.object({
  blockIndex: z.number().int().nonnegative(),
  blockHash: sha256HexSchema,
  kind: z.enum(['narration', 'dialogue', 'plain']),
  speakerLabel: optionalText(300),
  text: trimmedText(10000)
}).strict();

export const sceneActorContextSchema = z.object({
  actorId: actorIdSchema,
  publicName: optionalText(300),
  publicAliases: z.array(trimmedText(300)).max(50).optional(),
  anchorText: characterAnchorConversionOutputSchema.shape.anchorText,
  persistentAdditionalRequirementText: optionalText(4000)
}).strict();

export const turnScenePlanningInputSchema = z.object({
  sourceTurnId: trimmedText(200),
  sourceStoryTextHash: sha256HexSchema,
  mode: z.enum(['automatic', 'manual']),
  requestedMaxScenes: z.number().int().min(1).max(4),
  storyText: trimmedText(40000),
  summaryText: optionalText(5000),
  blocks: z.array(storyVisualBlockSchema).min(1).max(500),
  frozenContext: z.object({
    timeDescription: trimmedText(500),
    locationDescription: trimmedText(2000),
    weatherDescription: optionalText(1000),
    presentActorIds: z.array(actorIdSchema).max(100)
  }).strict(),
  actors: z.array(sceneActorContextSchema).max(100),
  manualInstruction: optionalText(4000)
}).strict().superRefine((value, context) => {
  const present = new Set<string>();
  for (const [index, actorId] of value.frozenContext.presentActorIds.entries()) {
    if (present.has(actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['frozenContext', 'presentActorIds', index],
        message: '冻结的在场人物 actorId 重复'
      });
    }
    present.add(actorId);
  }
  const actors = new Set<string>();
  for (const [index, actor] of value.actors.entries()) {
    if (actors.has(actor.actorId)) {
      context.addIssue({ code: 'custom', path: ['actors', index, 'actorId'], message: '角色上下文 actorId 重复' });
    }
    actors.add(actor.actorId);
  }
  const blockIndexes = new Set<number>();
  for (const [index, block] of value.blocks.entries()) {
    if (blockIndexes.has(block.blockIndex)) {
      context.addIssue({
        code: 'custom',
        path: ['blocks', index, 'blockIndex'],
        message: '正文候选块 blockIndex 重复'
      });
    }
    blockIndexes.add(block.blockIndex);
  }
});

export const sceneActorVisualStateSchema = z.object({
  actorId: actorIdSchema,
  sceneSpecificAppearance: optionalText(4000)
}).strict();

export const sceneShotPlanDraftSchema = z.object({
  placement: z.object({
    blockIndex: z.number().int().nonnegative(),
    blockHash: sha256HexSchema
  }).strict(),
  order: z.number().int().nonnegative(),
  sceneSummary: trimmedText(2000),
  knownActorIds: z.array(actorIdSchema).max(30),
  actorVisualStates: z.array(sceneActorVisualStateSchema).max(30),
  unboundCharacterDescriptions: z.array(trimmedText(1000)).max(30),
  locationDescription: trimmedText(3000),
  actionDescription: trimmedText(3000),
  atmosphere: trimmedText(2000),
  composition: trimmedText(2000)
}).strict().superRefine((value, context) => {
  const knownActorIds = new Set<string>();
  for (const [index, actorId] of value.knownActorIds.entries()) {
    if (knownActorIds.has(actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['knownActorIds', index],
        message: '场景人物 actorId 重复'
      });
    }
    knownActorIds.add(actorId);
  }
  const stateActorIds = new Set<string>();
  for (const [index, state] of value.actorVisualStates.entries()) {
    if (stateActorIds.has(state.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['actorVisualStates', index, 'actorId'],
        message: '场景临时外观 actorId 重复'
      });
    }
    stateActorIds.add(state.actorId);
    if (!knownActorIds.has(state.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['actorVisualStates', index, 'actorId'],
        message: '场景临时外观必须绑定已知场景人物 actorId'
      });
    }
  }
});

export const turnScenePlanningOutputSchema = z.object({
  shots: z.array(sceneShotPlanDraftSchema).max(4)
}).strict();

export const sceneShotPromptInputSchema = z.object({
  shot: sceneShotPlanDraftSchema,
  participants: z.array(sceneActorContextSchema.extend({
    sceneSpecificAppearance: optionalText(4000)
  }).strict()).max(30),
  world: visualWorldContextSchema,
  oneTimeInstruction: optionalText(4000)
}).strict().superRefine((value, context) => {
  const expected = new Set(value.shot.knownActorIds);
  const actual = new Set<string>();
  const sceneStates = new Map(
    value.shot.actorVisualStates.map((state) => [state.actorId, state.sceneSpecificAppearance?.trim() ?? ''])
  );
  for (const [index, participant] of value.participants.entries()) {
    if (actual.has(participant.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['participants', index, 'actorId'],
        message: '场景提示词参与者 actorId 重复'
      });
    }
    actual.add(participant.actorId);
    if (!expected.has(participant.actorId)) {
      context.addIssue({
        code: 'custom',
        path: ['participants', index, 'actorId'],
        message: '场景提示词参与者不在镜头计划内'
      });
    }
    if ((participant.sceneSpecificAppearance?.trim() ?? '') !== (sceneStates.get(participant.actorId) ?? '')) {
      context.addIssue({
        code: 'custom',
        path: ['participants', index, 'sceneSpecificAppearance'],
        message: '参与者场景临时外观与镜头计划不一致'
      });
    }
  }
  for (const actorId of expected) {
    if (!actual.has(actorId)) {
      context.addIssue({ code: 'custom', path: ['participants'], message: `缺少镜头参与者 ${actorId}` });
    }
  }
});

const currentSceneParticipantResolutionSchema = z.object({
  actorId: actorIdSchema,
  fixedIdentityPositive: trimmedText(6000),
  fixedIdentityNegative: z.string().trim().max(6000).optional().default(''),
  appearanceSource: z.enum(['anchor-default', 'scene-specific-override']).optional(),
  resolvedAppearancePositive: trimmedText(6000),
  resolvedAdditionalPositive: z.string().trim().max(6000),
  resolvedAdditionalNegative: z.string().trim().max(6000)
}).strict();

export const sceneParticipantResolutionSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if (
    typeof record.sceneSpecificAppearancePositive !== 'string' ||
    typeof record.resolvedAppearancePositive === 'string'
  ) {
    return value;
  }
  const {
    sceneSpecificAppearancePositive,
    ...rest
  } = record;
  return {
    ...rest,
    resolvedAppearancePositive: sceneSpecificAppearancePositive
  };
}, currentSceneParticipantResolutionSchema);

export const sceneShotPromptOutputSchema = z.object({
  basePositive: trimmedText(12000),
  baseNegative: z.string().trim().max(6000),
  participantResolutions: z.array(sceneParticipantResolutionSchema).max(30),
  resolvedOneTimePositive: z.string().trim().max(6000),
  resolvedOneTimeNegative: z.string().trim().max(6000)
}).strict();

export const semanticImagePromptSegmentSchema = z.object({
  segmentId: trimmedText(1000),
  kind: z.enum(SEMANTIC_IMAGE_PROMPT_SEGMENT_KINDS),
  priority: z.number().int().min(0).max(100),
  positive: z.string().trim().max(20_000),
  negative: z.string().trim().max(20_000),
  required: z.boolean(),
  renderPolicy: z.enum(['transform', 'preserve-literal']).optional(),
  provenance: z.object({
    kind: z.literal('png-style'),
    presetId: trimmedText(1000),
    imageHash: sha256HexSchema,
    parserVersion: z.number().int().min(1).max(10_000)
  }).strict().optional()
}).strict().superRefine((value, context) => {
  if (value.required && !value.positive) {
    context.addIssue({ code: 'custom', path: ['positive'], message: '必需语义段的正向内容不能为空' });
  }
  if (value.kind === 'artist-style' && value.renderPolicy !== 'preserve-literal') {
    context.addIssue({
      code: 'custom',
      path: ['renderPolicy'],
      message: '画师风格段必须使用 preserve-literal'
    });
  }
  if (value.renderPolicy === 'preserve-literal' && value.kind !== 'artist-style') {
    context.addIssue({
      code: 'custom',
      path: ['kind'],
      message: '只有 artist-style 段可以绕过模型转换'
    });
  }
  if (value.kind === 'artist-style' && !value.provenance) {
    context.addIssue({
      code: 'custom',
      path: ['provenance'],
      message: '画师风格段必须记录 PNG 画风来源'
    });
  }
});

export const providerPromptRenderInputSchema = z.object({
  segments: z.array(semanticImagePromptSegmentSchema).min(1).max(200),
  dialect: z.object({
    dialectPresetId: trimmedText(1000),
    name: trimmedText(200),
    family: z.enum(IMAGE_PROMPT_DIALECT_FAMILIES),
    renderingInstruction: trimmedText(40_000),
    positivePrefix: z.string().max(20_000),
    positiveSuffix: z.string().max(20_000),
    negativePrefix: z.string().max(20_000),
    negativeSuffix: z.string().max(20_000)
  }).strict()
}).strict().superRefine((value, context) => {
  const ids = new Set<string>();
  value.segments.forEach((segment, index) => {
    if (ids.has(segment.segmentId)) {
      context.addIssue({
        code: 'custom',
        path: ['segments', index, 'segmentId'],
        message: '语义段 segmentId 不得重复'
      });
    }
    ids.add(segment.segmentId);
  });
});

export const providerPromptRenderOutputSchema = z.object({
  segments: z.array(z.object({
    segmentId: trimmedText(1000),
    positive: z.string().trim().max(20_000),
    negative: z.string().trim().max(20_000)
  }).strict()).min(1).max(200)
}).strict();

export type VisualWorldContext = z.infer<typeof visualWorldContextSchema>;
export type VisualActorPublicProfile = z.infer<typeof visualActorPublicProfileSchema>;
export type CharacterAnchorConversionInput = z.infer<typeof characterAnchorConversionInputSchema>;
export type CharacterAnchorImageExtractionInput = z.infer<typeof characterAnchorImageExtractionInputSchema>;
export type CharacterAnchorConversionOutput = z.infer<typeof characterAnchorConversionOutputSchema>;
export type CharacterPromptBatchInput = z.infer<typeof characterPromptBatchInputSchema>;
export type CharacterViewPrompt = z.infer<typeof characterViewPromptSchema>;
export type CharacterPromptBatchOutput = z.infer<typeof characterPromptBatchOutputSchema>;
export type StoryVisualBlock = z.infer<typeof storyVisualBlockSchema>;
export type SceneActorContext = z.infer<typeof sceneActorContextSchema>;
export type TurnScenePlanningInput = z.infer<typeof turnScenePlanningInputSchema>;
export type SceneShotPlanDraft = z.infer<typeof sceneShotPlanDraftSchema>;
export type TurnScenePlanningOutput = z.infer<typeof turnScenePlanningOutputSchema>;
export type SceneShotPromptInput = z.infer<typeof sceneShotPromptInputSchema>;
export type SceneShotPromptOutput = z.infer<typeof sceneShotPromptOutputSchema>;
export type ProviderPromptRenderInput = z.infer<typeof providerPromptRenderInputSchema>;
export type ProviderPromptRenderOutput = z.infer<typeof providerPromptRenderOutputSchema>;

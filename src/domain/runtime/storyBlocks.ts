import { z } from 'zod';
import {
  resolveStoryDialogueActorId
} from './storyDialogueActors';
import type { Actor, ActorId, StoryEntry } from './types';

export const STORY_EMOTIONS = [
  'neutral',
  'happy',
  'excited',
  'ecstatic',
  'sad',
  'angry',
  'surprised',
  'serious',
  'worried',
  'afraid',
  'embarrassed',
  'shy',
  'tired',
  'thinking',
  'secretive'
] as const;

export type StoryEmotion = (typeof STORY_EMOTIONS)[number];

export interface NarrationStoryBlock {
  type: 'narration';
  text: string;
  sourceStyle?: 'tagged' | 'plain';
}

export interface DialogueStoryBlock {
  type: 'dialogue';
  text: string;
  speakerLabel: string;
  speakerActorId?: ActorId;
  emotion: StoryEmotion;
}

export interface InnerMonologueStoryBlock {
  type: 'inner_monologue';
  text: string;
  actorId?: ActorId;
  emotion: StoryEmotion;
}

export type StoryBlock =
  | NarrationStoryBlock
  | DialogueStoryBlock
  | InnerMonologueStoryBlock;

export type ParsedStoryBlock =
  | NarrationStoryBlock
  | { type: 'dialogue'; text: string; speakerLabel: string }
  | { type: 'inner_monologue'; text: string };

export interface StoryPresentationHints {
  dialogueEmotions?: StoryEmotion[];
  innerMonologueEmotions?: StoryEmotion[];
}

export const storyEmotionSchema = z.enum(STORY_EMOTIONS);

export const storyBlockSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('narration'),
      text: z.string(),
      sourceStyle: z.enum(['tagged', 'plain']).optional()
    })
    .strict(),
  z
    .object({
      type: z.literal('dialogue'),
      text: z.string(),
      speakerLabel: z.string(),
      speakerActorId: z.string().min(1).optional(),
      emotion: storyEmotionSchema
    })
    .strict(),
  z
    .object({
      type: z.literal('inner_monologue'),
      text: z.string(),
      actorId: z.string().min(1).optional(),
      emotion: storyEmotionSchema
    })
    .strict()
]);

const storyEmotionSet = new Set<string>(STORY_EMOTIONS);

export function normalizeStoryEmotion(value: unknown): StoryEmotion {
  if (typeof value !== 'string') return 'neutral';
  const normalized = value.trim().toLocaleLowerCase();
  return storyEmotionSet.has(normalized) ? (normalized as StoryEmotion) : 'neutral';
}

function normalizeEmotionList(value: unknown): StoryEmotion[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(normalizeStoryEmotion);
}

export function normalizeStoryPresentationHints(value: unknown): StoryPresentationHints | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const dialogueEmotions = normalizeEmotionList(record.dialogueEmotions);
  const innerMonologueEmotions = normalizeEmotionList(record.innerMonologueEmotions);
  if (!dialogueEmotions && !innerMonologueEmotions) return undefined;
  return {
    ...(dialogueEmotions ? { dialogueEmotions } : {}),
    ...(innerMonologueEmotions ? { innerMonologueEmotions } : {})
  };
}

export const storyPresentationHintsSchema = z.preprocess(
  normalizeStoryPresentationHints,
  z
    .object({
      dialogueEmotions: z.array(storyEmotionSchema).optional(),
      innerMonologueEmotions: z.array(storyEmotionSchema).optional()
    })
    .strict()
    .optional()
);

/**
 * Parses only the visible line syntax. This intentionally preserves the
 * pre-AVG StoryEntryBody behavior: blank lines are ignored, non-empty lines
 * are trimmed, and an empty tagged body falls back to the complete source line.
 */
export function parseStoryTextToBlocks(text: string): ParsedStoryBlock[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return [{ type: 'narration', text, sourceStyle: 'plain' }];

  return lines.map((line) => {
    const match = /^【([^】]+)】\s*(.*)$/.exec(line);
    if (!match) return { type: 'narration', text: line, sourceStyle: 'plain' };
    const [, label, body] = match;
    if (label === '旁白') {
      return { type: 'narration', text: body || line, sourceStyle: 'tagged' };
    }
    if (label === '内心') {
      return { type: 'inner_monologue', text: body || line };
    }
    return { type: 'dialogue', speakerLabel: label, text: body || line };
  });
}

export function applyPresentationHints(
  parsedBlocks: readonly ParsedStoryBlock[],
  rawHints?: unknown
): StoryBlock[] {
  const hints = normalizeStoryPresentationHints(rawHints);
  let dialogueIndex = 0;
  let innerMonologueIndex = 0;

  return parsedBlocks.map((block) => {
    if (block.type === 'dialogue') {
      const emotion = hints?.dialogueEmotions?.[dialogueIndex] ?? 'neutral';
      dialogueIndex += 1;
      return { ...block, emotion };
    }
    if (block.type === 'inner_monologue') {
      const emotion = hints?.innerMonologueEmotions?.[innerMonologueIndex] ?? 'thinking';
      innerMonologueIndex += 1;
      return { ...block, emotion };
    }
    return { ...block };
  });
}

export function resolveStoryBlockActors(
  blocks: readonly StoryBlock[],
  {
    dialogueSpeakerActorIds,
    playerActorId
  }: {
    dialogueSpeakerActorIds?: Readonly<Record<string, ActorId>>;
    playerActorId?: ActorId;
  } = {}
): StoryBlock[] {
  return blocks.map((block) => {
    if (block.type === 'dialogue') {
      const speakerActorId =
        dialogueSpeakerActorIds?.[block.speakerLabel] ??
        dialogueSpeakerActorIds?.[block.speakerLabel.trim()];
      return { ...block, ...(speakerActorId ? { speakerActorId } : {}) };
    }
    if (block.type === 'inner_monologue') {
      return { ...block, ...(playerActorId ? { actorId: playerActorId } : {}) };
    }
    return { ...block };
  });
}

export function buildStoryBlocks(
  text: string,
  options: {
    dialogueSpeakerActorIds?: Readonly<Record<string, ActorId>>;
    playerActorId?: ActorId;
    presentationHints?: unknown;
  } = {}
): StoryBlock[] {
  return resolveStoryBlockActors(
    applyPresentationHints(parseStoryTextToBlocks(text), options.presentationHints),
    options
  );
}

/**
 * Lazily derives blocks for legacy entries. The returned blocks are never
 * written back to the entry or save. Historical frozen speaker mappings win;
 * current actors are only consulted through the existing conservative resolver.
 */
export function getStoryBlocks(
  entry: StoryEntry,
  context: {
    actors?: Record<ActorId, Actor>;
    actorIdAliases?: Record<ActorId, ActorId>;
    playerActorId?: ActorId;
  } = {}
): StoryBlock[] {
  if (entry.blocks) return entry.blocks;

  const parsedBlocks = parseStoryTextToBlocks(entry.text);
  const dialogueSpeakerActorIds: Record<string, ActorId> = {};
  for (const block of parsedBlocks) {
    if (block.type !== 'dialogue') continue;
    const frozenActorId = entry.dialogueSpeakerActorIds?.[block.speakerLabel];
    const actorId = context.actors
      ? resolveStoryDialogueActorId(
          entry,
          block.speakerLabel,
          context.actors,
          context.actorIdAliases
        )
      : frozenActorId;
    if (actorId) dialogueSpeakerActorIds[block.speakerLabel] = actorId;
  }

  return resolveStoryBlockActors(applyPresentationHints(parsedBlocks), {
    dialogueSpeakerActorIds:
      Object.keys(dialogueSpeakerActorIds).length > 0 ? dialogueSpeakerActorIds : undefined,
    playerActorId: context.playerActorId
  });
}

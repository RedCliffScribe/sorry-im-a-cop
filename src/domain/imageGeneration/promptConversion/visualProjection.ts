import type { Actor } from '../../runtime/types';
import {
  storyVisualBlockSchema,
  visualActorPublicProfileSchema,
  type SceneActorContext,
  type StoryVisualBlock,
  type VisualActorPublicProfile
} from './schemas';

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function projectActorForVisualConversion(actor: Actor): VisualActorPublicProfile {
  return visualActorPublicProfileSchema.parse({
    actorId: actor.actorId,
    publicName: actor.name,
    gender: actor.gender,
    publicIdentity: nonEmpty(actor.publicIdentity),
    positionSummary: nonEmpty(actor.positionSummary),
    visualAgeAnchor: nonEmpty(actor.visualAgeAnchor),
    appearance: nonEmpty(actor.appearance),
    appearanceDescription: nonEmpty(actor.femaleProfile?.appearanceDescription),
    bodyDescription: nonEmpty(actor.femaleProfile?.bodyDescription),
    clothing: nonEmpty(actor.clothing),
    clothingStyle: nonEmpty(actor.femaleProfile?.clothingStyle),
    appearanceExtension: nonEmpty(actor.femaleProfile?.appearanceExtension),
    equipment: actor.equipment.map((item) => item.trim()).filter(Boolean)
  });
}

export function projectActorIdentityForScenePlanning(
  actor: Actor
): Pick<SceneActorContext, 'publicName' | 'publicAliases'> {
  const publicName = nonEmpty(actor.name);
  const seen = new Set(publicName ? [publicName] : []);
  const publicAliases = [actor.callName, actor.englishName, ...actor.aliases]
    .map((value) => nonEmpty(value))
    .filter((value): value is string => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  return {
    ...(publicName ? { publicName } : {}),
    ...(publicAliases.length ? { publicAliases } : {})
  };
}

export function projectAnchoredActorsForScenePlanning(input: {
  actors: Record<string, Actor>;
  anchors: Array<Pick<SceneActorContext, 'actorId' | 'anchorText' | 'persistentAdditionalRequirementText'>>;
  priorityActorIds?: string[];
}): SceneActorContext[] {
  const anchorsByActor = new Map(input.anchors.map((anchor) => [anchor.actorId, anchor]));
  const orderedActorIds = Array.from(new Set([
    ...(input.priorityActorIds ?? []),
    ...input.anchors.map((anchor) => anchor.actorId)
  ]));
  return orderedActorIds.flatMap((actorId) => {
    const actor = input.actors[actorId];
    const anchor = anchorsByActor.get(actorId);
    if (!actor || !anchor) return [];
    return [{
      actorId,
      ...projectActorIdentityForScenePlanning(actor),
      anchorText: anchor.anchorText,
      ...(anchor.persistentAdditionalRequirementText
        ? { persistentAdditionalRequirementText: anchor.persistentAdditionalRequirementText }
        : {})
    }];
  }).slice(0, 100);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashStoryText(text: string): Promise<string> {
  return sha256Hex(text);
}

export async function createStoryVisualBlocks(turnId: string, text: string): Promise<StoryVisualBlock[]> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const drafts = lines.map((line, blockIndex) => {
    const match = /^【([^】]+)】\s*(.*)$/.exec(line);
    if (!match) return { blockIndex, kind: 'plain' as const, text: line };
    const [, speakerLabel, body] = match;
    if (speakerLabel === '旁白') {
      return { blockIndex, kind: 'narration' as const, text: body || line };
    }
    return { blockIndex, kind: 'dialogue' as const, speakerLabel, text: body || line };
  });

  return Promise.all(
    drafts.map(async (draft) => storyVisualBlockSchema.parse({
      ...draft,
      blockHash: await sha256Hex(
        JSON.stringify([turnId, draft.blockIndex, draft.kind, draft.speakerLabel ?? '', draft.text])
      )
    }))
  );
}

export async function validateTurnScenePlanningInputIntegrity(input: {
  sourceTurnId: string;
  sourceStoryTextHash: string;
  storyText: string;
  blocks: StoryVisualBlock[];
}): Promise<string[]> {
  const issues: string[] = [];
  const expectedStoryHash = await hashStoryText(input.storyText);
  if (input.sourceStoryTextHash !== expectedStoryHash) {
    issues.push('正文整体哈希与当前 storyText 不一致');
  }
  const expectedBlocks = new Map(
    (await createStoryVisualBlocks(input.sourceTurnId, input.storyText)).map((block) => [block.blockIndex, block])
  );
  for (const block of input.blocks) {
    const expected = expectedBlocks.get(block.blockIndex);
    if (!expected || JSON.stringify(block) !== JSON.stringify(expected)) {
      issues.push(`正文候选块 ${block.blockIndex} 与当前 storyText 不一致`);
    }
  }
  return issues;
}

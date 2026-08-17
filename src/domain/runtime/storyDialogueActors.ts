import type { Actor, ActorId, StoryEntry } from './types';

function normalizeSpeakerLabel(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/[·・•\s_-]+/g, '');
}

const SAFE_SPEAKER_ROLE_PREFIXES = [
  '高级警司',
  '总警司',
  '高级督察',
  '总督察',
  '见习督察',
  '重案组',
  '反黑组',
  '冲锋队',
  '军装巡逻',
  '军装',
  '便衣',
  '警司',
  '督察',
  '警署警长',
  '警长',
  '警员',
  'ptu',
  'cid',
  'ocb',
  'o记'
] as const;

function stripSafeSpeakerRolePrefix(value: string): string | undefined {
  let remaining = value;
  let stripped = false;
  while (remaining) {
    const prefix = SAFE_SPEAKER_ROLE_PREFIXES.find((candidate) => remaining.startsWith(candidate));
    if (!prefix) break;
    remaining = remaining.slice(prefix.length);
    stripped = true;
  }
  return stripped && remaining ? remaining : undefined;
}

export function extractStoryDialogueSpeakerLabels(text: string): string[] {
  const labels: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*【([^】]+)】/.exec(line);
    const label = match?.[1]?.trim();
    if (label && label !== '旁白' && label !== '内心' && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

function actorLabels(actor: Actor): string[] {
  return [actor.name, actor.englishName, actor.callName, ...actor.aliases]
    .filter((value): value is string => Boolean(value?.trim()));
}

export function resolveUniqueActorIdBySpeakerLabel(
  speakerLabel: string,
  actors: Record<ActorId, Actor>
): ActorId | undefined {
  const normalized = normalizeSpeakerLabel(speakerLabel);
  const matches = Object.values(actors).filter((actor) =>
    actorLabels(actor).some((label) => normalizeSpeakerLabel(label) === normalized)
  );
  if (matches.length === 1) return matches[0].actorId;
  if (matches.length > 1) return undefined;

  const withoutRolePrefix = stripSafeSpeakerRolePrefix(normalized);
  if (!withoutRolePrefix) return undefined;
  const prefixedMatches = Object.values(actors).filter((actor) =>
    actorLabels(actor).some((label) => normalizeSpeakerLabel(label) === withoutRolePrefix)
  );
  return prefixedMatches.length === 1 ? prefixedMatches[0].actorId : undefined;
}

export function resolveCanonicalActorId(
  actorId: ActorId,
  actors: Record<ActorId, Actor>,
  actorIdAliases?: Record<ActorId, ActorId>
): ActorId | undefined {
  const visited = new Set<ActorId>();
  let current = actorId;
  while (actorIdAliases?.[current] && !visited.has(current)) {
    visited.add(current);
    current = actorIdAliases[current];
  }
  return actors[current] ? current : undefined;
}

export function deriveHistoricalActorIdAliases(
  entries: StoryEntry[],
  actors: Record<ActorId, Actor>,
  authoritativeAliases?: Record<ActorId, ActorId>
): Record<ActorId, ActorId> | undefined {
  const inferredTargets = new Map<ActorId, Set<ActorId>>();
  for (const entry of entries) {
    for (const [speakerLabel, frozenActorId] of Object.entries(entry.dialogueSpeakerActorIds ?? {})) {
      if (actors[frozenActorId] || authoritativeAliases?.[frozenActorId]) continue;
      const currentActorId = resolveUniqueActorIdBySpeakerLabel(speakerLabel, actors);
      if (!currentActorId || currentActorId === frozenActorId) continue;
      const candidates = inferredTargets.get(frozenActorId) ?? new Set<ActorId>();
      candidates.add(currentActorId);
      inferredTargets.set(frozenActorId, candidates);
    }
  }

  const inferred = Object.fromEntries(
    [...inferredTargets].flatMap(([sourceActorId, candidates]) =>
      candidates.size === 1 ? [[sourceActorId, [...candidates][0]] as const] : []
    )
  );
  const merged = { ...inferred, ...authoritativeAliases };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

export function createStoryDialogueSpeakerActorIds(
  text: string,
  actors: Record<ActorId, Actor>
): Record<string, ActorId> | undefined {
  const entries = extractStoryDialogueSpeakerLabels(text).flatMap((label) => {
    const actorId = resolveUniqueActorIdBySpeakerLabel(label, actors);
    return actorId ? [[label, actorId] as const] : [];
  });
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function resolveStoryDialogueActorId(
  entry: StoryEntry,
  speakerLabel: string,
  actors: Record<ActorId, Actor>,
  actorIdAliases?: Record<ActorId, ActorId>
): ActorId | undefined {
  const frozen = entry.dialogueSpeakerActorIds?.[speakerLabel];
  if (frozen) {
    const canonical = resolveCanonicalActorId(frozen, actors, actorIdAliases);
    if (canonical) return canonical;
  }
  return resolveUniqueActorIdBySpeakerLabel(speakerLabel, actors);
}

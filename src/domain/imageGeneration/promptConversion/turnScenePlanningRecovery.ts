import type {
  SceneActorContext,
  TurnScenePlanningInput
} from './schemas';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function asInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function firstText(record: UnknownRecord, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const text = asText(record[key]);
    if (text) return text;
  }
  return undefined;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function stringArray(value: unknown): string[] | undefined {
  if (value === null || value === undefined) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return undefined;
  return uniqueStrings(value.flatMap((item) => {
    const text = asText(item);
    return text ? [text] : [];
  }));
}

function actorAliases(actor: SceneActorContext): string[] {
  return uniqueStrings([
    actor.actorId,
    actor.publicName ?? '',
    ...(actor.publicAliases ?? [])
  ].map((value) => value.trim()).filter(Boolean));
}

function resolveActorId(
  actors: readonly SceneActorContext[],
  value: unknown
): string | undefined {
  const text = asText(value);
  if (!text) return undefined;
  const matches = actors.filter((actor) =>
    actorAliases(actor).some((alias) => alias.localeCompare(text, undefined, {
      sensitivity: 'accent'
    }) === 0)
  );
  return matches.length === 1 ? matches[0]!.actorId : text;
}

function normalizeKnownActorIds(
  actors: readonly SceneActorContext[],
  value: unknown
): unknown {
  const values = stringArray(value);
  if (!values) return value;
  return uniqueStrings(values.flatMap((item) => {
    const actorId = resolveActorId(actors, item);
    return actorId ? [actorId] : [];
  }));
}

function normalizeActorVisualStates(
  actors: readonly SceneActorContext[],
  value: unknown
): unknown {
  if (value === null || value === undefined) return [];
  let entries: unknown[];
  if (Array.isArray(value)) {
    entries = value;
  } else {
    const record = asRecord(value);
    if (!record) return value;
    entries = record.actorId || record.id
      ? [record]
      : Object.entries(record).map(([actorId, appearance]) => ({
          actorId,
          sceneSpecificAppearance: appearance
        }));
  }

  const normalized: unknown[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const record = asRecord(entry);
    if (!record) {
      normalized.push(entry);
      continue;
    }
    const actorId = resolveActorId(actors, record.actorId ?? record.id);
    if (!actorId) {
      normalized.push(entry);
      continue;
    }
    if (seen.has(actorId)) continue;
    seen.add(actorId);
    const appearance = firstText(record, [
      'sceneSpecificAppearance',
      'appearance',
      'visualState',
      'description'
    ]);
    normalized.push({
      actorId,
      ...(appearance ? { sceneSpecificAppearance: appearance } : {})
    });
  }
  return normalized;
}

function resolvePlacement(
  input: TurnScenePlanningInput,
  shot: UnknownRecord
): unknown {
  const placement = asRecord(shot.placement) ?? {};
  const rawBlockIndex = placement.blockIndex ?? shot.blockIndex;
  const blockIndex = asInteger(rawBlockIndex);
  const blockHash = asText(placement.blockHash ?? shot.blockHash);
  const blockByIndex = blockIndex === undefined
    ? undefined
    : input.blocks.find((block) => block.blockIndex === blockIndex);
  const blockByHash = blockHash
    ? input.blocks.find((block) => block.blockHash === blockHash)
    : undefined;

  if (blockByIndex && blockByHash && blockByIndex.blockIndex !== blockByHash.blockIndex) {
    return {
      blockIndex,
      blockHash
    };
  }
  const resolved = blockByIndex
    ?? blockByHash
    ?? (input.blocks.length === 1 && blockIndex === undefined && !blockHash
      ? input.blocks[0]
      : undefined);
  return resolved
    ? {
        blockIndex: resolved.blockIndex,
        blockHash: resolved.blockHash
      }
    : {
        blockIndex: blockIndex ?? rawBlockIndex,
        blockHash
      };
}

function normalizeShot(
  input: TurnScenePlanningInput,
  value: unknown,
  order: number
): unknown {
  const shot = asRecord(value);
  if (!shot) return value;

  const actorVisualStates = normalizeActorVisualStates(
    input.actors,
    shot.actorVisualStates ?? shot.actorStates
  );
  const stateActorIds = Array.isArray(actorVisualStates)
    ? actorVisualStates.flatMap((state) => {
        const actorId = asText(asRecord(state)?.actorId);
        return actorId ? [actorId] : [];
      })
    : [];
  const knownActorIds = normalizeKnownActorIds(
    input.actors,
    shot.knownActorIds ?? shot.actorIds ?? shot.characters
  );
  const mergedKnownActorIds = Array.isArray(knownActorIds)
    ? uniqueStrings([
        ...knownActorIds.filter((actorId): actorId is string => typeof actorId === 'string'),
        ...stateActorIds.filter((actorId) =>
          input.actors.some((actor) => actor.actorId === actorId)
        )
      ])
    : knownActorIds;

  return {
    placement: resolvePlacement(input, shot),
    order,
    sceneSummary: firstText(shot, ['sceneSummary', 'summary', 'scene']),
    knownActorIds: mergedKnownActorIds,
    actorVisualStates,
    unboundCharacterDescriptions: stringArray(
      shot.unboundCharacterDescriptions
        ?? shot.unboundCharacters
        ?? shot.backgroundCharacters
    ) ?? shot.unboundCharacterDescriptions,
    locationDescription: firstText(shot, [
      'locationDescription',
      'location',
      'setting'
    ]),
    actionDescription: firstText(shot, [
      'actionDescription',
      'action',
      'visualAction'
    ]),
    atmosphere: firstText(shot, ['atmosphere', 'mood', 'ambience']),
    composition: firstText(shot, [
      'composition',
      'cameraComposition',
      'camera'
    ])
  };
}

/**
 * Repairs only deterministic envelope mistakes in model scene-planning output.
 * Narrative fields that cannot be recovered without guessing remain invalid and
 * continue through the existing one-shot model repair contract.
 */
export function normalizeTurnScenePlanningCandidate(
  input: TurnScenePlanningInput,
  value: unknown
): unknown {
  const record = asRecord(value);
  const rawShots = Array.isArray(value)
    ? value
    : record?.shots
      ?? record?.sceneShots
      ?? record?.scenes
      ?? record?.shot;
  const shots = Array.isArray(rawShots)
    ? rawShots
    : asRecord(rawShots)
      ? [rawShots]
      : undefined;
  if (!shots) return value;
  return {
    shots: shots
      .slice(0, input.requestedMaxScenes)
      .map((shot, index) => normalizeShot(input, shot, index))
  };
}

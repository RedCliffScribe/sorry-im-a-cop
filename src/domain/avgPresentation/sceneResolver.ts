import type {
  AvgResolvedSceneAsset,
  AvgResourceResolver,
  AvgSceneAssetEntry
} from '../avgResourcePack';
import { createStoryVisualContext } from '../runtime/storyVisualContext';
import type { RuntimeState, StoryEntry } from '../runtime/types';
import type {
  AvgEnvironmentPresentationContext,
  AvgScenePresentationInput,
  AvgSceneResolutionDiagnostic,
  ResolvedAvgScene
} from './types';

const SCENE_CORE_TAG_GROUPS: readonly ReadonlySet<string>[] = [
  new Set(['police', 'cid', 'detective', 'interrogation', 'custody', 'evidence', 'armoury', 'forensic', 'checkpoint']),
  new Set(['triad', 'gang', 'society', 'smuggling', 'gambling', 'illegal', 'loan']),
  new Set(['hospital', 'medical', 'morgue', 'autopsy', 'clinic']),
  new Set(['residential', 'apartment', 'flat', 'tenement', 'housing', 'mansion', 'home']),
  new Set(['street', 'road', 'harbour', 'dock', 'pier', 'alley', 'rooftop', 'cemetery', 'outdoor']),
  new Set(['business', 'office', 'bank', 'legal', 'court', 'government']),
  new Set(['entertainment', 'film', 'tv', 'television', 'studio', 'record', 'nightclub', 'karaoke', 'dance']),
  new Set(['school', 'education', 'campus', 'university']),
  new Set(['restaurant', 'canteen', 'teahouse', 'food', 'market']),
  new Set(['prison', 'cell'])
];

const SCENE_SPATIAL_FALLBACK_GROUPS = new Set([4]);

const SCENE_LOW_INFORMATION_MATCH_TAGS = new Set([
  'district',
  'functional',
  'hong',
  'kong',
  'kowloon',
  'region'
]);

const TAG_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  cid: ['police', 'detective', 'office'],
  cops: ['police'],
  nightclub: ['nightclub', 'entertainment'],
  hospital: ['hospital', 'medical'],
  morgue: ['morgue', 'medical'],
  harbourfront: ['harbour', 'outdoor'],
  headquarters: ['office'],
  hq: ['office']
};

const SCENE_LOCATION_SIGNATURES = [
  { id: 'central', requiredTags: ['central'] },
  { id: 'causeway_bay', requiredTags: ['causeway'] },
  { id: 'mid_levels', requiredTags: ['mid', 'levels'] },
  { id: 'mong_kok', requiredTags: ['mong', 'kok'] },
  { id: 'sham_shui_po', requiredTags: ['sham', 'shui', 'po'] },
  { id: 'tsim_sha_tsui', requiredTags: ['tsim', 'sha', 'tsui'] },
  { id: 'wan_chai', requiredTags: ['wan', 'chai'] }
] as const;

function tokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .toLocaleLowerCase('en-US')
    .replace(/^(?:scene|place)[_-]/u, '')
    .split(/[^\p{L}\p{N}]+/gu)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function expandTags(values: readonly string[]): string[] {
  const result = new Set<string>();
  for (const value of values.flatMap(tokens)) {
    result.add(value);
    for (const expansion of TAG_EXPANSIONS[value] ?? []) result.add(expansion);
  }
  return [...result].sort();
}

function normalizedAlias(value: string | undefined): string | undefined {
  const result = tokens(value).join('_');
  return result || undefined;
}

function groupsFor(tags: ReadonlySet<string>): Set<number> {
  const groups = new Set<number>();
  SCENE_CORE_TAG_GROUPS.forEach((group, index) => {
    if ([...tags].some((tag) => group.has(tag))) groups.add(index);
  });
  return groups;
}

function locationSignaturesFor(tags: ReadonlySet<string>): Set<string> {
  const signatures = new Set<string>();
  for (const signature of SCENE_LOCATION_SIGNATURES) {
    if (signature.requiredTags.every((tag) => tags.has(tag))) {
      signatures.add(signature.id);
    }
  }
  return signatures;
}

function intersectionSize<T>(left: ReadonlySet<T>, right: ReadonlySet<T>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function meaningfulTagIntersectionSize(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>
): number {
  let count = 0;
  for (const value of left) {
    if (!SCENE_LOW_INFORMATION_MATCH_TAGS.has(value) && right.has(value)) count += 1;
  }
  return count;
}

function resolvedScene(
  result: AvgResolvedSceneAsset,
  matchType: ResolvedAvgScene['matchType'],
  score?: number
): ResolvedAvgScene {
  return {
    sceneAssetId: result.entry.sceneAssetId,
    asset: result.entry.image,
    tags: [...result.entry.tags],
    resourceSource: result.source,
    sourcePackId: result.sourcePackId,
    matchType,
    ...(score !== undefined ? { score } : {})
  };
}

export function createAvgEnvironmentPresentationContext(
  storyEntry: StoryEntry,
  runtimeState: RuntimeState
): AvgEnvironmentPresentationContext {
  const snapshot = storyEntry.visualContext ?? createStoryVisualContext({
    time: runtimeState.time,
    environment: runtimeState.environment,
    location: runtimeState.location,
    places: runtimeState.places,
    scenes: runtimeState.scenes
  });
  return {
    timeDescription: snapshot.timeDescription,
    locationDescription: snapshot.locationDescription,
    weatherDescription: snapshot.weatherDescription
  };
}

export function createAvgScenePresentationInput(
  storyEntry: StoryEntry,
  runtimeState: RuntimeState,
  override: AvgScenePresentationInput = {}
): Required<Pick<AvgScenePresentationInput, 'tags'>> & AvgScenePresentationInput {
  const runtimeSceneId = override.runtimeSceneId ?? runtimeState.location.currentSceneId;
  const runtimePlaceId = override.runtimePlaceId ?? runtimeState.location.currentPlaceId;
  const scene = runtimeSceneId ? runtimeState.scenes[runtimeSceneId] : undefined;
  const place = runtimePlaceId ? runtimeState.places[runtimePlaceId] : undefined;
  const rawTags = [
    ...(override.tags ?? []),
    runtimeSceneId,
    runtimePlaceId,
    scene?.name,
    place?.nameEn,
    ...(place?.aliases ?? []),
    place?.districtId,
    place?.regionId,
    place?.type,
    place?.category,
    place?.streetAddressText,
    ...(place?.roadAnchors ?? []),
    storyEntry.visualContext?.locationDescription
  ].filter((value): value is string => Boolean(value));
  return {
    runtimeSceneId,
    runtimePlaceId,
    tags: expandTags(rawTags),
    absentActorIds: override.absentActorIds
  };
}

interface ScoredSceneCandidate {
  entry: AvgSceneAssetEntry;
  score: number;
  matchCount: number;
}

function scoreSceneCandidate(
  entry: AvgSceneAssetEntry,
  requestedTags: ReadonlySet<string>
): ScoredSceneCandidate | undefined {
  const candidateTags = new Set(expandTags([...entry.tags, entry.sceneAssetId]));
  const matchCount = meaningfulTagIntersectionSize(requestedTags, candidateTags);
  const requestedGroups = groupsFor(requestedTags);
  const candidateGroups = groupsFor(candidateTags);
  const requestedFunctionalGroups = new Set(
    [...requestedGroups].filter((group) => !SCENE_SPATIAL_FALLBACK_GROUPS.has(group))
  );
  const requestedLocations = locationSignaturesFor(requestedTags);
  const candidateLocations = locationSignaturesFor(candidateTags);
  if (
    requestedLocations.size > 0 &&
    candidateLocations.size > 0 &&
    intersectionSize(requestedLocations, candidateLocations) === 0
  ) {
    return undefined;
  }
  if (
    requestedFunctionalGroups.size > 0 &&
    intersectionSize(requestedFunctionalGroups, candidateGroups) === 0
  ) {
    return undefined;
  }
  const coreMatches = intersectionSize(requestedGroups, candidateGroups);
  if (requestedGroups.size > 0 && coreMatches === 0) return undefined;
  if (matchCount < 2 && !(matchCount >= 1 && coreMatches >= 1)) return undefined;
  const score =
    matchCount * 20 +
    coreMatches * 20 +
    (entry.priority ?? 0) / 10 +
    (entry.reusePolicy === 'specific' ? 5 : 0);
  const threshold = entry.reusePolicy === 'generic' ? 45 : 35;
  return score >= threshold ? { entry, score, matchCount } : undefined;
}

export function resolveAvgScene(input: {
  resolver?: AvgResourceResolver;
  storyEntry: StoryEntry;
  runtimeState: RuntimeState;
  sceneInput?: AvgScenePresentationInput;
}): { scene: ResolvedAvgScene | null; diagnostic: AvgSceneResolutionDiagnostic } {
  const sceneInput = createAvgScenePresentationInput(
    input.storyEntry,
    input.runtimeState,
    input.sceneInput
  );
  const diagnostic: AvgSceneResolutionDiagnostic = {
    runtimeSceneId: sceneInput.runtimeSceneId,
    runtimePlaceId: sceneInput.runtimePlaceId,
    inputTags: [...sceneInput.tags]
  };
  if (!input.resolver) {
    return {
      scene: null,
      diagnostic: { ...diagnostic, fallbackReason: 'resource-pack-unavailable' }
    };
  }

  const exact = input.resolver.resolveScene({
    runtimeSceneId: sceneInput.runtimeSceneId,
    runtimePlaceId: sceneInput.runtimePlaceId
  });
  if (exact?.matchReason === 'runtime_scene_id') {
    const scene = resolvedScene(exact, 'runtime_scene_id');
    return {
      scene,
      diagnostic: {
        ...diagnostic,
        resolvedSceneAssetId: scene.sceneAssetId,
        matchType: scene.matchType
      }
    };
  }
  if (exact?.matchReason === 'runtime_place_id') {
    const scene = resolvedScene(exact, 'runtime_place_id');
    return {
      scene,
      diagnostic: {
        ...diagnostic,
        resolvedSceneAssetId: scene.sceneAssetId,
        matchType: scene.matchType
      }
    };
  }

  const aliases = [
    normalizedAlias(sceneInput.runtimeSceneId),
    normalizedAlias(sceneInput.runtimePlaceId),
    normalizedAlias(input.runtimeState.scenes[sceneInput.runtimeSceneId ?? '']?.name),
    normalizedAlias(input.runtimeState.places[sceneInput.runtimePlaceId ?? '']?.nameEn)
  ].filter((value): value is string => Boolean(value));
  for (const alias of aliases) {
    const match = input.resolver.resolveScene({ sceneAssetId: alias });
    if (match?.matchReason === 'scene_asset_id') {
      const scene = resolvedScene(match, 'explicit_alias');
      return {
        scene,
        diagnostic: {
          ...diagnostic,
          resolvedSceneAssetId: scene.sceneAssetId,
          matchType: scene.matchType
        }
      };
    }
  }

  const requestedTags = new Set(sceneInput.tags);
  const candidates = input.resolver
    .findScenesByTags(sceneInput.tags)
    .map((entry) => scoreSceneCandidate(entry, requestedTags))
    .filter((candidate): candidate is ScoredSceneCandidate => Boolean(candidate))
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.matchCount - left.matchCount ||
        left.entry.sceneAssetId.localeCompare(right.entry.sceneAssetId)
    );
  for (const candidate of candidates) {
    const match = input.resolver.resolveScene({ sceneAssetId: candidate.entry.sceneAssetId });
    if (match?.matchReason !== 'scene_asset_id') continue;
    const matchType = candidate.entry.reusePolicy === 'generic' ? 'generic' : 'tag_match';
    const scene = resolvedScene(match, matchType, candidate.score);
    return {
      scene,
      diagnostic: {
        ...diagnostic,
        resolvedSceneAssetId: scene.sceneAssetId,
        matchType,
        score: candidate.score
      }
    };
  }

  return {
    scene: null,
    diagnostic: { ...diagnostic, fallbackReason: 'no-compatible-scene' }
  };
}

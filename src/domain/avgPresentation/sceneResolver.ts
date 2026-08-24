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
  'domain_business',
  'domain_education',
  'domain_food',
  'domain_hospitality',
  'domain_legal',
  'domain_medical',
  'domain_police',
  'domain_prison',
  'domain_residential',
  'domain_triad',
  'district',
  'functional',
  'hong',
  'kong',
  'kowloon',
  'region'
]);

const SCENE_PROTECTED_DOMAIN_TAGS = new Set([
  'domain_education',
  'domain_food',
  'domain_hospitality',
  'domain_legal',
  'domain_medical',
  'domain_police',
  'domain_prison',
  'domain_residential',
  'domain_triad'
]);

const SCENE_REQUIRED_CONTEXT_TAGS = new Set([
  'context_abandoned',
  'context_crime',
  'context_hideout',
  'context_illegal',
  'context_robbery',
  'context_safehouse',
  'context_smuggling',
  'context_undercover'
]);

const SCENE_EXCLUSIVE_TAG_FAMILIES: readonly ReadonlySet<string>[] = [
  new Set(['tier_luxury', 'tier_middle', 'tier_working']),
  new Set(['restaurant_seafood', 'restaurant_tea', 'restaurant_upscale']),
  new Set(['scope_exterior', 'scope_interior']),
  new Set([
    'space_corridor',
    'space_exterior',
    'space_office',
    'space_public_hall',
    'space_room',
    'space_stairwell'
  ])
];

const SCENE_REQUIRED_QUALIFIER_FAMILIES = SCENE_EXCLUSIVE_TAG_FAMILIES.slice(0, 2);

const TAG_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
  apartment: ['residential', 'flat', 'home', 'domain_residential', 'scope_interior'],
  abandoned: ['context_abandoned'],
  autopsy: ['medical', 'domain_medical'],
  canteen: ['restaurant', 'food', 'domain_food'],
  cid: ['police', 'detective', 'office', 'domain_police', 'domain_business'],
  clinic: ['medical', 'domain_medical'],
  cops: ['police', 'domain_police'],
  corridor: ['space_corridor', 'scope_interior'],
  detective: ['police', 'domain_police'],
  education: ['school', 'domain_education'],
  entrance: ['space_exterior', 'scope_exterior'],
  exterior: ['space_exterior', 'scope_exterior'],
  flat: ['residential', 'apartment', 'home', 'domain_residential', 'scope_interior'],
  front: ['space_exterior', 'scope_exterior'],
  hall: ['space_public_hall', 'scope_interior'],
  hideout: ['context_hideout'],
  home: ['residential', 'apartment', 'domain_residential'],
  hospital: ['hospital', 'medical', 'domain_medical'],
  hotel: ['domain_hospitality'],
  housing: ['residential', 'home', 'domain_residential'],
  harbourfront: ['harbour', 'outdoor'],
  headquarters: ['office', 'domain_business', 'space_office'],
  hq: ['office', 'domain_business', 'space_office'],
  illegal: ['context_illegal'],
  law: ['legal', 'domain_legal'],
  living: ['space_room', 'scope_interior'],
  lobby: ['space_public_hall', 'scope_interior'],
  mansion: ['luxury', 'residential', 'home', 'domain_residential', 'tier_luxury', 'scope_interior'],
  medical: ['domain_medical'],
  middle: ['tier_middle'],
  morgue: ['morgue', 'medical', 'domain_medical'],
  nightclub: ['nightclub', 'entertainment'],
  office: ['business', 'domain_business', 'space_office', 'scope_interior'],
  police: ['domain_police'],
  prison: ['domain_prison'],
  residence: ['residential', 'apartment', 'home', 'domain_residential'],
  residential: ['apartment', 'flat', 'home', 'domain_residential'],
  restaurant: ['food', 'domain_food'],
  robbery: ['context_robbery', 'context_crime'],
  room: ['space_room', 'scope_interior'],
  safehouse: ['context_safehouse'],
  school: ['education', 'domain_education'],
  seafood: ['restaurant', 'food', 'domain_food', 'restaurant_seafood'],
  smuggling: ['context_smuggling'],
  stairwell: ['space_stairwell', 'scope_interior'],
  tea: ['restaurant', 'food', 'domain_food', 'restaurant_tea'],
  teahouse: ['restaurant', 'food', 'domain_food', 'restaurant_tea'],
  tenement: ['residential', 'home', 'domain_residential'],
  triad: ['domain_triad'],
  undercover: ['context_undercover'],
  working: ['tier_working']
};

const TAG_PHRASE_EXPANSIONS: readonly {
  pattern: RegExp;
  tags: readonly string[];
}[] = [
  {
    pattern: /(?:茶餐[厅廳]|冰室)/u,
    tags: ['tea', 'restaurant', 'food', 'domain_food', 'restaurant_tea']
  },
  {
    pattern: /(?:cha[\s_-]*chaan[\s_-]*teng|tea[\s_-]*restaurant)/iu,
    tags: ['tea', 'restaurant', 'food', 'domain_food', 'restaurant_tea']
  },
  {
    pattern: /(?:海鲜|海鮮)[^,，。；;]*(?:餐厅|餐廳|酒家|饭店|飯店)|seafood[\s_-]*restaurant/iu,
    tags: ['seafood', 'restaurant', 'food', 'domain_food', 'restaurant_seafood']
  },
  {
    pattern: /(?:(?:高档|高檔|高级|高級|豪华|豪華|奢华|奢華)[^,，。；;]*(?:餐厅|餐廳|酒家|饭店|飯店)|high[\s_-]*end[\s_-]*restaurant)/iu,
    tags: ['high', 'end', 'restaurant', 'food', 'domain_food', 'restaurant_upscale']
  },
  {
    pattern: /(?:餐厅|餐廳|酒家|饭店|飯店|食肆|restaurant|canteen|teahouse)/iu,
    tags: ['restaurant', 'food', 'domain_food']
  },
  {
    pattern: /(?:(?:高档|高檔|高级|高級|豪华|豪華|奢华|奢華)[^,，。；;]*(?:公寓|住宅|住处|住處|住所|寓所|屋苑)|豪宅|别墅|別墅|luxury[\s_-]*(?:apartment|mansion|residence)|(?:mansion|penthouse|villa)(?:$|[\s_-]))/iu,
    tags: ['luxury', 'mansion', 'residential', 'apartment', 'home', 'domain_residential', 'tier_luxury']
  },
  {
    pattern: /(?:普通住宅|中产[^,，。；;]*(?:住宅|公寓|屋苑)|中產[^,，。；;]*(?:住宅|公寓|屋苑)|middle[\s_-]*class|residential[\s_-]*flat[\s_-]*middle)/iu,
    tags: ['middle', 'class', 'residential', 'flat', 'apartment', 'domain_residential', 'tier_middle']
  },
  {
    pattern: /(?:公共屋邨|公共屋村|公屋|廉租[^,，。；;]*(?:住宅|公寓)|public[\s_-]*housing)/iu,
    tags: ['public', 'housing', 'residential', 'home', 'domain_residential', 'tier_working']
  },
  {
    pattern: /(?:基层[^,，。；;]*(?:住宅|公寓)|基層[^,，。；;]*(?:住宅|公寓)|工人[^,，。；;]*(?:住宅|公寓)|working[\s_-]*class)/iu,
    tags: ['working', 'class', 'residential', 'apartment', 'domain_residential', 'tier_working']
  },
  {
    pattern: /(?:公寓|住宅|住处|住處|住所|寓所|屋苑|豪宅|别墅|別墅|apartment|residence|residential|flat|mansion|tenement|housing)/iu,
    tags: ['residential', 'apartment', 'home', 'domain_residential']
  },
  {
    pattern: /(?:酒店|宾馆|賓館|旅馆|旅館|hotel)/iu,
    tags: ['hotel', 'domain_hospitality']
  },
  {
    pattern: /(?:客房|客厅|客廳|房间|房間|包厢|包廂|living[\s_-]*room|private[\s_-]*room|guest[\s_-]*room|hotel[\s_-]*room)/iu,
    tags: ['room', 'space_room', 'scope_interior']
  },
  {
    pattern: /(?:走廊|长廊|長廊|过道|過道|corridor)/iu,
    tags: ['corridor', 'space_corridor', 'scope_interior']
  },
  {
    pattern: /(?:楼梯间|樓梯間|梯间|梯間|stairwell)/iu,
    tags: ['stairwell', 'space_stairwell', 'scope_interior']
  },
  {
    pattern: /(?:大堂|lobby)/iu,
    tags: ['lobby', 'space_public_hall', 'scope_interior']
  },
  {
    pattern: /(?:办公室|辦公室|office)/iu,
    tags: ['office', 'business', 'domain_business', 'space_office', 'scope_interior']
  },
  {
    pattern: /(?:正门|正門|门面|門面|入口|外观|外觀|外墙|外牆|exterior|entrance|front)/iu,
    tags: ['exterior', 'space_exterior', 'scope_exterior']
  },
  {
    pattern: /(?:outlying[\s_-]*residential[\s_-]*district|residence[\s_-]*exterior)/iu,
    tags: ['scope_exterior']
  },
  {
    pattern: /(?:案发现场|案發現場|犯罪现场|犯罪現場|crime[\s_-]*scene)/iu,
    tags: ['crime', 'scene', 'context_crime']
  },
  {
    pattern: /^crime$/iu,
    tags: ['context_crime']
  },
  {
    pattern: /(?:劫案|抢劫|搶劫|robbery)/iu,
    tags: ['robbery', 'crime', 'context_robbery', 'context_crime']
  },
  {
    pattern: /(?:安全屋|safehouse)/iu,
    tags: ['safehouse', 'context_safehouse']
  },
  {
    pattern: /(?:藏身处|藏身處|hideout)/iu,
    tags: ['hideout', 'context_hideout']
  }
];

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
  for (const rawValue of values) {
    for (const phraseExpansion of TAG_PHRASE_EXPANSIONS) {
      if (!phraseExpansion.pattern.test(rawValue)) continue;
      for (const tag of phraseExpansion.tags) result.add(tag);
    }
    for (const value of tokens(rawValue)) {
      result.add(value);
      for (const expansion of TAG_EXPANSIONS[value] ?? []) result.add(expansion);
    }
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

function tagsFromFamily(
  tags: ReadonlySet<string>,
  family: ReadonlySet<string>
): Set<string> {
  return new Set([...tags].filter((tag) => family.has(tag)));
}

function protectedDomainsAreCompatible(
  requestedTags: ReadonlySet<string>,
  candidateTags: ReadonlySet<string>
): boolean {
  const requestedDomains = tagsFromFamily(requestedTags, SCENE_PROTECTED_DOMAIN_TAGS);
  const candidateDomains = tagsFromFamily(candidateTags, SCENE_PROTECTED_DOMAIN_TAGS);
  return (
    intersectionSize(requestedDomains, candidateDomains) === requestedDomains.size &&
    intersectionSize(candidateDomains, requestedDomains) === candidateDomains.size
  );
}

function requiredContextsAreCompatible(
  requestedTags: ReadonlySet<string>,
  candidateTags: ReadonlySet<string>
): boolean {
  const candidateContexts = tagsFromFamily(candidateTags, SCENE_REQUIRED_CONTEXT_TAGS);
  return [...candidateContexts].every((tag) => requestedTags.has(tag));
}

function exclusiveSemanticsAreCompatible(
  requestedTags: ReadonlySet<string>,
  candidateTags: ReadonlySet<string>
): boolean {
  return SCENE_EXCLUSIVE_TAG_FAMILIES.every((family) => {
    const requested = tagsFromFamily(requestedTags, family);
    const candidate = tagsFromFamily(candidateTags, family);
    return (
      requested.size === 0 ||
      candidate.size === 0 ||
      intersectionSize(requested, candidate) > 0
    );
  });
}

function candidateNeedsMissingQualifier(
  requestedTags: ReadonlySet<string>,
  candidateTags: ReadonlySet<string>
): boolean {
  return SCENE_REQUIRED_QUALIFIER_FAMILIES.some(
    (family) =>
      tagsFromFamily(requestedTags, family).size === 0 &&
      tagsFromFamily(candidateTags, family).size > 0
  );
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
    place?.name,
    place?.nameZh,
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
  semanticTags: ReadonlySet<string>;
}

function scoreSceneCandidate(
  entry: AvgSceneAssetEntry,
  requestedTags: ReadonlySet<string>
): ScoredSceneCandidate | undefined {
  const candidateTags = new Set(expandTags([...entry.tags, entry.sceneAssetId]));
  if (!protectedDomainsAreCompatible(requestedTags, candidateTags)) return undefined;
  if (!requiredContextsAreCompatible(requestedTags, candidateTags)) return undefined;
  if (!exclusiveSemanticsAreCompatible(requestedTags, candidateTags)) return undefined;
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
  return score >= threshold
    ? { entry, score, matchCount, semanticTags: candidateTags }
    : undefined;
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
  if (
    candidates[0] &&
    candidateNeedsMissingQualifier(requestedTags, candidates[0].semanticTags)
  ) {
    return {
      scene: null,
      diagnostic: { ...diagnostic, fallbackReason: 'ambiguous-scene-semantics' }
    };
  }
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

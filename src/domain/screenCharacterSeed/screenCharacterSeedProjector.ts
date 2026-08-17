import type { Place, RuntimeState } from '../runtime/types';
import { hkLateColonialScreenCharacterSeeds } from './hkLateColonialScreenCharacterSeeds';
import {
  screenCharacterCanonicalId,
  screenCharacterRuntimeActorId
} from './screenCharacterIdentityLock';
import type {
  ScreenCharacterCategory,
  ScreenCharacterProjectionReason,
  ScreenCharacterSeedCard,
  ScreenCharacterSeedProjection,
  ScreenCharacterSeedProjectionCard,
  ScreenCharacterSeedProjectionOptions,
  ScreenCharacterSeedValidationResult
} from './screenCharacterSeedTypes';

const MAX_SCREEN_CHARACTERS = 8;
const SCREEN_CHARACTER_TEXT_BUDGET = 9200;
const MIN_SCREEN_CHARACTER_SCORE = 88;

function categoryCounts(): Record<ScreenCharacterCategory, number> {
  return {
    police_law: 0,
    triad_crime: 0,
    business_finance: 0,
    media_entertainment: 0,
    civilian_relationship: 0
  };
}

function compactText(value: string, maxChars: number): string {
  const compacted = value.trim().replace(/\s+/g, ' ');
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase().normalize('NFKC');
}

function normalizeIdentityValue(value: string): string {
  return normalizeText(value).replace(/[^\p{L}\p{N}]+/gu, '');
}

function isValidCategory(value: unknown): value is ScreenCharacterCategory {
  return (
    value === 'police_law' ||
    value === 'triad_crime' ||
    value === 'business_finance' ||
    value === 'media_entertainment' ||
    value === 'civilian_relationship'
  );
}

function hasIdentityHooks(card: ScreenCharacterSeedCard): boolean {
  return Boolean(
    card.identityHooks?.police?.trim() &&
      card.identityHooks.civilian?.trim() &&
      card.identityHooks.gang_member?.trim()
  );
}

function hasPerformerMetadata(card: ScreenCharacterSeedCard): boolean {
  const blockedKeys = new Set(['performer', 'performerName', 'actorName', 'portrayedBy', 'playedBy']);
  return Object.keys(card as unknown as Record<string, unknown>).some((key) => blockedKeys.has(key));
}

function hasSourceReleaseMetadata(card: ScreenCharacterSeedCard): boolean {
  const blockedKeys = new Set([
    'firstReleaseYear',
    'releaseYear',
    'premiereYear',
    'publicationYear'
  ]);
  return Object.keys(card as unknown as Record<string, unknown>).some((key) => blockedKeys.has(key));
}

export function validateScreenCharacterSeeds(
  cards: ScreenCharacterSeedCard[]
): ScreenCharacterSeedValidationResult {
  const counts = categoryCounts();
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenCanonicalIds = new Set<string>();
  const seenRuntimeActorIds = new Set<string>();
  const workIds = new Set<string>();

  cards.forEach((card, index) => {
    const label = card.id?.trim() || `line ${index + 1}`;
    if (card.type !== 'ScreenCharacterSeedCard') errors.push(`${label}: invalid type`);
    if (!card.id?.trim()) errors.push(`line ${index + 1}: missing id`);
    if (seenIds.has(card.id)) errors.push(`${label}: duplicate id`);
    seenIds.add(card.id);

    const canonicalId = screenCharacterCanonicalId(card);
    if (seenCanonicalIds.has(canonicalId)) errors.push(`${label}: duplicate canonicalCharacterId`);
    seenCanonicalIds.add(canonicalId);
    const runtimeActorId = screenCharacterRuntimeActorId(canonicalId);
    if (seenRuntimeActorIds.has(runtimeActorId)) errors.push(`${label}: duplicate runtimeActorId`);
    seenRuntimeActorIds.add(runtimeActorId);

    if (!card.displayName?.trim()) errors.push(`${label}: missing displayName`);
    if (!card.sourceWorkId?.trim()) errors.push(`${label}: missing sourceWorkId`);
    else {
      workIds.add(card.sourceWorkId);
      if (/_(?:19|20)\d{2}$/u.test(card.sourceWorkId)) {
        errors.push(`${label}: sourceWorkId must not encode a release year`);
      }
    }
    if (!card.sourceWorkTitle?.trim()) errors.push(`${label}: missing sourceWorkTitle`);
    if (
      !Number.isInteger(card.availableYears.from) ||
      !Number.isInteger(card.availableYears.to) ||
      card.availableYears.from < 1980 ||
      card.availableYears.from > card.availableYears.to ||
      card.availableYears.to > 1996
    ) {
      errors.push(`${label}: invalid availableYears`);
    }
    if (!isValidCategory(card.category)) errors.push(`${label}: invalid category`);
    else counts[card.category] += 1;
    if (!card.publicIdentity?.trim()) errors.push(`${label}: missing publicIdentity`);
    if (!card.profileSummary?.trim()) errors.push(`${label}: missing profileSummary`);
    if (!card.personality?.trim()) errors.push(`${label}: missing personality`);
    if (!card.speechStyle?.trim()) errors.push(`${label}: missing speechStyle`);
    if (!card.motivation?.trim()) errors.push(`${label}: missing motivation`);
    if (!card.values?.trim()) errors.push(`${label}: missing values`);
    if (!card.appearanceAnchor?.trim()) errors.push(`${label}: missing appearanceAnchor`);
    if (!card.clothingAnchor?.trim()) errors.push(`${label}: missing clothingAnchor`);
    if (!card.capabilityProfile?.trim()) errors.push(`${label}: missing capabilityProfile`);
    if (!card.accessRoutes.length) errors.push(`${label}: missing accessRoutes`);
    if (!card.promptHooks.length) errors.push(`${label}: missing promptHooks`);
    if (!hasIdentityHooks(card)) errors.push(`${label}: missing identityHooks`);
    if (hasPerformerMetadata(card)) errors.push(`${label}: performer metadata is not allowed`);
    if (hasSourceReleaseMetadata(card)) errors.push(`${label}: source release metadata is not allowed`);
  });

  return {
    total: cards.length,
    counts,
    workCount: workIds.size,
    errors
  };
}

function currentPlace(state: RuntimeState): Place | undefined {
  return state.places[state.location.currentPlaceId];
}

function isCardAvailable(card: ScreenCharacterSeedCard, year: number): boolean {
  return card.availableYears.from <= year && year <= card.availableYears.to;
}

function cardIdentityValues(card: ScreenCharacterSeedCard): string[] {
  return [card.displayName, card.englishName, ...card.recognitionAliases].filter(
    (value): value is string => Boolean(value?.trim())
  );
}

function cardSearchValues(card: ScreenCharacterSeedCard): string[] {
  return [
    card.id,
    card.displayName,
    card.englishName,
    card.sourceWorkTitle,
    card.sourceWorkTitleEn,
    card.worldpackPlacementAnchor,
    card.publicIdentity,
    card.actualIdentitySummary,
    card.profileSummary,
    card.personality,
    card.motivation,
    card.values,
    ...card.recognitionAliases,
    ...card.sectors,
    ...card.eraTags,
    ...card.relationshipAnchors,
    ...card.accessRoutes,
    ...card.promptHooks,
    ...card.usualPlaceIds
  ].filter((value): value is string => Boolean(value?.trim()));
}

function extractInputSignals(playerInput: string): string[] {
  const normalized = normalizeText(playerInput);
  if (!normalized) return [];
  const tokens = new Set<string>();

  for (const token of normalized.split(/[^\p{L}\p{N}_]+/u)) {
    if (token.length >= 2) tokens.add(token);
  }

  const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  for (const run of cjkRuns) {
    for (let size = 2; size <= Math.min(9, run.length); size += 1) {
      for (let start = 0; start + size <= run.length; start += 1) {
        tokens.add(run.slice(start, start + size));
      }
    }
  }

  return [...tokens];
}

function hasDirectIdentityMatch(card: ScreenCharacterSeedCard, playerInput: string): boolean {
  const normalizedInput = normalizeIdentityValue(playerInput);
  if (!normalizedInput) return false;
  return cardIdentityValues(card).some((value) => {
    const normalizedValue = normalizeIdentityValue(value);
    return normalizedValue.length >= 2 && normalizedInput.includes(normalizedValue);
  });
}

function hasSourceWorkMatch(card: ScreenCharacterSeedCard, playerInput: string): boolean {
  const normalizedInput = normalizeIdentityValue(playerInput);
  if (!normalizedInput) return false;
  return [card.sourceWorkTitle, card.sourceWorkTitleEn]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => normalizedInput.includes(normalizeIdentityValue(value)));
}

function scoreInputMatch(card: ScreenCharacterSeedCard, playerInput: string): number {
  if (!playerInput.trim()) return 0;
  let score = 0;
  if (hasDirectIdentityMatch(card, playerInput)) score += 340;
  if (hasSourceWorkMatch(card, playerInput)) score += 240;

  const search = cardSearchValues(card).map(normalizeText).join(' ');
  for (const signal of extractInputSignals(playerInput)) {
    if (!search.includes(signal)) continue;
    if (signal.length >= 8) score += 36;
    else if (signal.length >= 5) score += 22;
    else if (signal.length >= 3) score += 10;
    else score += 4;
  }

  return Math.min(score, 520);
}

function categorySignalScore(card: ScreenCharacterSeedCard, playerInput: string): number {
  if (card.category === 'police_law' && /警察|警队|警署|案件|调查|法庭|检控|律师|证人/u.test(playerInput)) {
    return 72;
  }
  if (card.category === 'triad_crime' && /社团|江湖|黑帮|堂口|地盘|走私|军火|毒品|夜场|卧底/u.test(playerInput)) {
    return 72;
  }
  if (
    card.category === 'business_finance' &&
    /公司|商界|老板|股票|证券|交易所|投资|银行|合约|保险/u.test(playerInput)
  ) {
    return 72;
  }
  if (
    card.category === 'media_entertainment' &&
    /电影|电视|片场|明星|歌手|唱片|记者|报馆|娱乐|夜总会/u.test(playerInput)
  ) {
    return 72;
  }
  if (
    card.category === 'civilian_relationship' &&
    /市民|工作|家庭|亲友|住所|街坊|恋爱|伴侣|生活|移民/u.test(playerInput)
  ) {
    return 68;
  }
  return 0;
}

function scoreSectorHints(
  card: ScreenCharacterSeedCard,
  place: Place | undefined,
  playerInput: string,
  sectorHintSet: Set<string>
): number {
  let score = categorySignalScore(card, playerInput);
  const placeText = [place?.type, place?.category, place?.summary, place?.publicKnowledge, place?.name, place?.nameEn]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText)
    .join(' ');
  const normalizedInput = normalizeText(playerInput);

  for (const sector of card.sectors) {
    const normalizedSector = normalizeText(sector);
    if (sectorHintSet.has(normalizedSector)) score += 44;
    if (placeText.includes(normalizedSector)) score += 24;
    if (normalizedInput.includes(normalizedSector)) score += 28;
  }

  return Math.min(score, 180);
}

function identityFitScore(card: ScreenCharacterSeedCard, state: RuntimeState): number {
  if (state.player.currentIdentity === 'police' && card.category === 'police_law') return 24;
  if (state.player.currentIdentity === 'gang_member' && card.category === 'triad_crime') return 24;
  if (
    state.player.currentIdentity === 'civilian' &&
    (card.category === 'civilian_relationship' ||
      card.category === 'business_finance' ||
      card.category === 'media_entertainment')
  ) {
    return 18;
  }
  return 0;
}

function scoreCard(
  card: ScreenCharacterSeedCard,
  state: RuntimeState,
  playerInput: string,
  relatedPlaceIdSet: Set<string>,
  sectorHintSet: Set<string>,
  linkedWorkIds: Set<string>
): { score: number; reasons: ScreenCharacterProjectionReason[] } {
  const reasons: ScreenCharacterProjectionReason[] = ['time_window'];
  let score = 8;

  const inputScore = scoreInputMatch(card, playerInput);
  if (inputScore > 0) {
    score += inputScore;
    reasons.push('player_input');
  }
  if (hasDirectIdentityMatch(card, playerInput)) reasons.push('character_name');
  if (hasSourceWorkMatch(card, playerInput)) reasons.push('source_work');

  if (card.usualPlaceIds.includes(state.location.currentPlaceId)) {
    score += 100;
    reasons.push('current_place');
  }
  if (card.usualPlaceIds.some((placeId) => relatedPlaceIdSet.has(placeId))) {
    score += 70;
    reasons.push('related_place');
  }

  const sectorScore = scoreSectorHints(card, currentPlace(state), playerInput, sectorHintSet);
  if (sectorScore > 0) {
    score += sectorScore;
    reasons.push('sector_hint');
  }

  const identityScore = identityFitScore(card, state);
  if (identityScore > 0) {
    score += identityScore;
    reasons.push('identity_fit');
  }

  if (linkedWorkIds.has(card.sourceWorkId) && !hasDirectIdentityMatch(card, playerInput)) {
    score += 96;
    reasons.push('linked_character');
  }

  if (inputScore > 0 && card.importance >= 90) score += 24;

  return { score, reasons: Array.from(new Set(reasons)) };
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function selectionVarietyBias(
  card: ScreenCharacterSeedCard,
  state: RuntimeState,
  playerInput: string
): number {
  if (hasDirectIdentityMatch(card, playerInput) || hasSourceWorkMatch(card, playerInput)) return 0;
  const scope = [
    state.world.worldpackId,
    state.player.name,
    state.player.currentIdentity,
    state.location.currentPlaceId,
    state.time.year,
    state.time.month,
    state.time.day,
    state.turnCounter,
    normalizeText(playerInput),
    card.id
  ].join('|');
  return stableHash(scope) % 17;
}

function toProjectionCard(
  card: ScreenCharacterSeedCard,
  score: number,
  reasons: ScreenCharacterProjectionReason[],
  identity: RuntimeState['player']['currentIdentity']
): ScreenCharacterSeedProjectionCard {
  const canonicalCharacterId = screenCharacterCanonicalId(card);
  return {
    id: card.id,
    canonicalCharacterId,
    runtimeActorId: screenCharacterRuntimeActorId(canonicalCharacterId),
    displayName: card.displayName,
    englishName: card.englishName,
    recognitionAliases: card.recognitionAliases.slice(0, 5),
    sourceWorkId: card.sourceWorkId,
    sourceWorkTitle: card.sourceWorkTitle,
    sourceWorkTitleEn: card.sourceWorkTitleEn,
    medium: card.medium,
    availableYears: { ...card.availableYears },
    worldpackPlacementAnchor: card.worldpackPlacementAnchor
      ? compactText(card.worldpackPlacementAnchor, 320)
      : undefined,
    category: card.category,
    score,
    reasons,
    gender: card.gender,
    ageRange: { ...card.ageRange },
    currentIdentity: card.currentIdentity,
    publicIdentity: compactText(card.publicIdentity, 180),
    actualIdentitySummary: compactText(card.actualIdentitySummary, 260),
    positionSummary: compactText(card.positionSummary, 180),
    profileSummary: compactText(card.profileSummary, 420),
    appearanceAnchor: compactText(card.appearanceAnchor, 180),
    clothingAnchor: compactText(card.clothingAnchor, 180),
    personality: compactText(card.personality, 220),
    speechStyle: compactText(card.speechStyle, 220),
    motivation: compactText(card.motivation, 220),
    longTermGoal: compactText(card.longTermGoal, 220),
    values: compactText(card.values, 220),
    capabilityProfile: compactText(card.capabilityProfile, 200),
    sectors: card.sectors.slice(0, 8),
    relationshipAnchors: card.relationshipAnchors.map((value) => compactText(value, 150)).slice(0, 6),
    accessRoutes: card.accessRoutes.map((value) => compactText(value, 120)).slice(0, 5),
    promptHooks: card.promptHooks.map((value) => compactText(value, 150)).slice(0, 4),
    identityHook: compactText(card.identityHooks[identity], 200),
    importance: card.importance,
    sourceConfidence: card.sourceConfidence
  };
}

function projectionTextLength(card: ScreenCharacterSeedProjectionCard): number {
  return [
    card.id,
    card.canonicalCharacterId,
    card.runtimeActorId,
    card.displayName,
    card.englishName,
    card.sourceWorkTitle,
    card.sourceWorkTitleEn,
    card.worldpackPlacementAnchor,
    card.publicIdentity,
    card.actualIdentitySummary,
    card.profileSummary,
    card.appearanceAnchor,
    card.clothingAnchor,
    card.personality,
    card.speechStyle,
    card.motivation,
    card.values,
    card.capabilityProfile,
    card.identityHook,
    ...card.recognitionAliases,
    ...card.sectors,
    ...card.relationshipAnchors,
    ...card.accessRoutes,
    ...card.promptHooks
  ]
    .filter(Boolean)
    .join(' ').length;
}

export function projectScreenCharacterSeedContext(
  state: RuntimeState,
  playerInput: string,
  options: ScreenCharacterSeedProjectionOptions = {}
): ScreenCharacterSeedProjection {
  if (state.world.screenCharacterSeedsEnabled === false) {
    return {
      characters: [],
      rules: [
        '当前存档已关闭银幕角色种子。不得引用、激活或新建银幕角色候选。'
      ],
      diagnostics: {
        totalCharacters: (options.cards ?? []).length,
        eligibleCharacters: 0,
        selectedCharacterIds: [],
        selectedTextChars: 0,
        estimatedTokenBudget: 0,
        omittedCharacterCount: (options.cards ?? []).length
      }
    };
  }
  const sourceCards = options.cards ?? hkLateColonialScreenCharacterSeeds;
  const relatedPlaceIdSet = new Set(options.relatedPlaceIds ?? []);
  const sectorHintSet = new Set((options.sectorHints ?? []).map(normalizeText));
  const eligible = sourceCards.filter((card) => isCardAvailable(card, state.time.year));
  const linkedWorkIds = new Set(
    eligible
      .filter((card) => hasDirectIdentityMatch(card, playerInput) || hasSourceWorkMatch(card, playerInput))
      .map((card) => card.sourceWorkId)
  );

  const scored = eligible
    .map((card) => {
      const { score, reasons } = scoreCard(
        card,
        state,
        playerInput,
        relatedPlaceIdSet,
        sectorHintSet,
        linkedWorkIds
      );
      return {
        card,
        score,
        reasons,
        selectionScore: score + selectionVarietyBias(card, state, playerInput)
      };
    })
    .filter((entry) => entry.score >= MIN_SCREEN_CHARACTER_SCORE)
    .sort(
      (left, right) =>
        right.selectionScore - left.selectionScore ||
        right.score - left.score ||
        right.card.importance - left.card.importance ||
        left.card.sourceWorkId.localeCompare(right.card.sourceWorkId) ||
        left.card.id.localeCompare(right.card.id)
    );

  const characters: ScreenCharacterSeedProjectionCard[] = [];
  let selectedTextChars = 0;
  for (const entry of scored) {
    if (characters.length >= MAX_SCREEN_CHARACTERS) break;
    const projectionCard = toProjectionCard(entry.card, entry.score, entry.reasons, state.player.currentIdentity);
    const nextTextChars = selectedTextChars + projectionTextLength(projectionCard);
    if (nextTextChars > SCREEN_CHARACTER_TEXT_BUDGET) break;
    characters.push(projectionCard);
    selectedTextChars = nextTextChars;
  }

  return {
    characters,
    rules: [
      'SCREEN_CHARACTER_IDENTITY_LOCK: each selected character is an independent in-world person with one canonicalCharacterId and at most one runtime Actor. Use the provided npc_screen_* runtimeActorId when direct contact creates the Actor.',
      'Rule: treat selected characters exactly like ordinary NPCs in the current Hong Kong world. Never describe them as adaptations, roles, fictional people, homages, or products of a source work in player-facing narration or writeback.',
      'Rule: source-work identity is an internal characterization and relationship anchor only. Never expose it, and never introduce performer identity, performer appearance, or performer biography.',
      'WORLD_TIME_LOCK: availableYears is the only chronological field supplied for this character. Never infer in-world timing from a source title, source identifier, publication date or release date; worldpackPlacementAnchor defines the valid status inside that window.',
      'WORLD_TIME_LOCK: use only identity, relationships and circumstances already valid on the exact current game date. Any source-work event later than the current game date has not happened: never leak later promotions, betrayals, elections, romances, deaths, endings or post-1996 history.',
      'Rule: selection is context supply, not scene presence. Create or mention a character only when current place, work, case, relationship, organization, or a durable event naturally establishes contact.',
      'Rule: keep the supplied personality, speech, motivation, identity, and relationships, but do not reenact a fixed plot or quote recognizable dialogue. Let this save evolve independently.',
      'Rule: screen characters and era public figures use different canonical IDs. Never merge a npc_screen_* Actor into a npc_seed_* public figure, even when aliases or names resemble one another.'
    ],
    diagnostics: {
      totalCharacters: sourceCards.length,
      eligibleCharacters: eligible.length,
      selectedCharacterIds: characters.map((character) => character.id),
      selectedTextChars,
      estimatedTokenBudget: SCREEN_CHARACTER_TEXT_BUDGET,
      omittedCharacterCount: Math.max(0, scored.length - characters.length)
    }
  };
}

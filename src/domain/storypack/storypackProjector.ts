import type { Place, RuntimeState } from '../runtime/types';
import { hk1988StorypackCards } from './hk1988StorypackCards';
import type {
  DramaMotifCard,
  HistoricalEventCard,
  SectorPressureCard,
  StorypackCard,
  StorypackCardType,
  StorypackProjection,
  StorypackProjectionCard,
  StorypackProjectionOptions,
  StorypackProjectionReason,
  StorypackValidationResult
} from './storypackTypes';

const forbiddenPromptSafeTerms = [
  'TVB',
  'ATV',
  '无间道',
  '無間道',
  '英雄本色',
  '古惑仔',
  '寒战',
  '寒戰',
  'PTU',
  '十二少',
  '赌神',
  '賭神',
  '跛豪',
  '五亿探长',
  '五億探長',
  '喋血双雄',
  '喋血雙雄',
  '监狱风云',
  '監獄風雲',
  '龙虎风云',
  '龍虎風雲',
  '辣手神探',
  '胭脂扣',
  '甜蜜蜜',
  '倩女幽魂',
  '黄飞鸿',
  '黃飛鴻',
  '东方不败',
  '東方不敗',
  '新扎师兄',
  '新紮師兄',
  '壹号皇庭',
  '壹號皇庭'
];

const generatedArtifactTerms = ['同relatedSectors', 'undefined', 'null', 'TODO', 'TBD'];

const influenceProfiles: Record<
  RuntimeState['world']['storypackInfluence'],
  { maxCards: number; textBudget: number; scoreFloor: number }
> = {
  off: { maxCards: 0, textBudget: 0, scoreFloor: Number.POSITIVE_INFINITY },
  low: { maxCards: 4, textBudget: 3500, scoreFloor: 80 },
  medium: { maxCards: 8, textBudget: 7000, scoreFloor: 70 },
  high: { maxCards: 12, textBudget: 10000, scoreFloor: 55 }
};

const genericInputSignals = new Set([
  '继续',
  '接着',
  '然后',
  '看看',
  '一下',
  '这里',
  '那边',
  '现在',
  '等待',
  '观察',
  '回应',
  '开口'
]);

const broadStorypackPlaceIds = new Set([
  'place_mong_kok_police_station',
  'place_wan_chai_police_headquarters',
  'place_icac_headquarters'
]);

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function compactText(value: string, maxChars: number): string {
  const compacted = value.trim().replace(/\s+/g, ' ');
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

function typeCounts(): Record<StorypackCardType, number> {
  return {
    HistoricalEventCard: 0,
    SectorPressureCard: 0,
    DramaMotifCard: 0
  };
}

function isStorypackCardType(value: unknown): value is StorypackCardType {
  return value === 'HistoricalEventCard' || value === 'SectorPressureCard' || value === 'DramaMotifCard';
}

function hasIdentityHooks(card: StorypackCard): boolean {
  const hooks = card.type === 'DramaMotifCard' ? card.identityVariants : card.identityHooks;
  return Boolean(hooks?.police?.trim() && hooks.civilian?.trim() && hooks.gang_member?.trim());
}

function validateHistorical(card: HistoricalEventCard): string[] {
  const errors: string[] = [];
  if (!card.timeWindow) errors.push(`${card.id}: missing timeWindow`);
  if (card.timeWindow && card.timeWindow.firstUsableYear > card.timeWindow.afterlifeUntilYear) {
    errors.push(`${card.id}: invalid timeWindow`);
  }
  return errors;
}

function validateSector(card: SectorPressureCard): string[] {
  const errors: string[] = [];
  if (!card.activeYears) errors.push(`${card.id}: missing activeYears`);
  if (card.activeYears && card.activeYears.from > card.activeYears.to) {
    errors.push(`${card.id}: invalid activeYears`);
  }
  return errors;
}

function validateDrama(card: DramaMotifCard): string[] {
  const errors: string[] = [];
  if (!card.timeWindow) errors.push(`${card.id}: missing timeWindow`);
  if (card.timeWindow && card.timeWindow.applicableFromYear > card.timeWindow.applicableUntilYear) {
    errors.push(`${card.id}: invalid drama timeWindow`);
  }
  if (card.copyRisk === 'high' && (card.paraphraseVariants?.length ?? 0) < 3) {
    errors.push(`${card.id}: high copyRisk needs paraphraseVariants`);
  }
  return errors;
}

function promptVisibleFields(card: StorypackCard): Array<{ field: string; value: string }> {
  const hooks = card.type === 'DramaMotifCard' ? card.identityVariants : card.identityHooks;
  return [
    { field: 'title', value: cardTitle(card) },
    { field: 'promptSafeVersion', value: typeof card.promptSafeVersion === 'string' ? card.promptSafeVersion : '' },
    {
      field: 'identityHook',
      value: [hooks?.police, hooks?.civilian, hooks?.gang_member]
        .filter((hook): hook is string => Boolean(hook?.trim()))
        .join('\n')
    },
    {
      field: 'structuralInspiration',
      value: card.type === 'HistoricalEventCard' ? card.structuralInspiration ?? '' : ''
    }
  ];
}

export function validateStorypackCards(cards: StorypackCard[]): StorypackValidationResult {
  const counts = typeCounts();
  const errors: string[] = [];
  const seenIds = new Set<string>();

  cards.forEach((card, index) => {
    if (!card.id?.trim()) errors.push(`line ${index + 1}: missing id`);
    if (seenIds.has(card.id)) errors.push(`${card.id}: duplicate id`);
    seenIds.add(card.id);
    if (!isStorypackCardType(card.type)) errors.push(`${card.id}: invalid type`);
    else counts[card.type] += 1;
    const promptSafeVersion = typeof card.promptSafeVersion === 'string' ? card.promptSafeVersion : '';
    if (!promptSafeVersion.trim()) errors.push(`${card.id}: missing promptSafeVersion`);
    if (forbiddenPromptSafeTerms.some((term) => promptSafeVersion.includes(term))) {
      errors.push(`${card.id}: promptSafeVersion leaks protected source term`);
    }
    for (const field of promptVisibleFields(card)) {
      if (field.field === 'promptSafeVersion') continue;
      if (forbiddenPromptSafeTerms.some((term) => field.value.includes(term))) {
        errors.push(`${card.id}: prompt-visible field ${field.field} leaks protected source term`);
      }
      if (generatedArtifactTerms.some((term) => field.value.includes(term))) {
        errors.push(`${card.id}: prompt-visible field ${field.field} contains generator artifact`);
      }
    }
    if (!hasIdentityHooks(card)) errors.push(`${card.id}: missing identity hooks`);

    if (card.type === 'HistoricalEventCard') errors.push(...validateHistorical(card));
    if (card.type === 'SectorPressureCard') errors.push(...validateSector(card));
    if (card.type === 'DramaMotifCard') errors.push(...validateDrama(card));
  });

  return {
    total: cards.length,
    counts,
    errors
  };
}

function cardTitle(card: StorypackCard): string {
  return card.type === 'DramaMotifCard' ? card.motifName : card.title;
}

function categoryOrSector(card: StorypackCard): string | undefined {
  if (card.type === 'HistoricalEventCard') return card.category;
  if (card.type === 'SectorPressureCard') return card.sector;
  return undefined;
}

function relatedSectors(card: StorypackCard): string[] {
  if (card.type === 'HistoricalEventCard') return card.relatedSectors ?? [];
  if (card.type === 'DramaMotifCard') return card.relatedSectors ?? [];
  return [card.sector];
}

function relatedPlaces(card: StorypackCard): string[] {
  return card.type === 'HistoricalEventCard' ? card.relatedPlaces ?? [] : [];
}

function identityHook(card: StorypackCard, identity: RuntimeState['player']['currentIdentity']): string | undefined {
  const hooks = card.type === 'DramaMotifCard' ? card.identityVariants : card.identityHooks;
  return hooks?.[identity];
}

function isCardActive(card: StorypackCard, year: number): boolean {
  if (card.type === 'HistoricalEventCard') {
    return card.timeWindow.firstUsableYear <= year && year <= card.timeWindow.afterlifeUntilYear;
  }
  if (card.type === 'SectorPressureCard') {
    return card.activeYears.from <= year && year <= card.activeYears.to;
  }
  return card.timeWindow.applicableFromYear <= year && year <= card.timeWindow.applicableUntilYear;
}

function cardSearchValues(card: StorypackCard): string[] {
  const common = [
    card.id,
    cardTitle(card),
    card.promptSafeVersion,
    categoryOrSector(card),
    identityHook(card, 'police'),
    identityHook(card, 'civilian'),
    identityHook(card, 'gang_member'),
    ...relatedSectors(card),
    ...relatedPlaces(card)
  ];

  if (card.type === 'HistoricalEventCard') {
    return [
      ...common,
      card.realEventBasis,
      card.publicSummary,
      card.socialImpact,
      card.fictionalizedEcho,
      card.structuralInspiration,
      ...(card.usableAngles ?? [])
    ].filter((value): value is string => Boolean(value?.trim()));
  }

  if (card.type === 'SectorPressureCard') {
    return [
      ...common,
      card.publicFace,
      card.policeContactModes,
      card.civilianContactModes,
      card.gangContactModes,
      ...(card.hiddenPressures ?? []),
      ...(card.commonRoles ?? []),
      ...(card.commonPlaces ?? []),
      ...(card.conflictTypes ?? [])
    ].filter((value): value is string => Boolean(value?.trim()));
  }

  return [
    ...common,
    card.coreTension,
    card.sourceEraHint,
    ...(card.paraphraseVariants ?? []),
    ...(card.commonRoles ?? []),
    ...(card.sceneIngredients ?? []),
    ...(card.escalationShapes ?? [])
  ].filter((value): value is string => Boolean(value?.trim()));
}

function extractInputSignals(playerInput: string): string[] {
  const normalized = normalizeText(playerInput);
  if (!normalized) return [];
  const tokens = new Set<string>();

  for (const token of normalized.split(/[^\p{L}\p{N}_]+/u)) {
    if (token.length >= 2 && !genericInputSignals.has(token)) tokens.add(token);
  }

  const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  for (const run of cjkRuns) {
    for (let size = 3; size <= Math.min(8, run.length); size += 1) {
      for (let start = 0; start + size <= run.length; start += 1) {
        tokens.add(run.slice(start, start + size));
      }
    }
  }

  return [...tokens];
}

function isBroadStorypackPlace(placeId: string | undefined): boolean {
  return Boolean(placeId && broadStorypackPlaceIds.has(placeId));
}

function scoreInputMatch(card: StorypackCard, playerInput: string): number {
  const search = cardSearchValues(card).map(normalizeText).join(' ');
  const signals = extractInputSignals(playerInput);
  let score = 0;

  for (const signal of signals) {
    if (!search.includes(signal)) continue;
    if (signal.length >= 6) score += 80;
    else if (signal.length >= 4) score += 45;
    else score += 20;
  }

  return Math.min(score, 260);
}

function currentPlace(state: RuntimeState): Place | undefined {
  return state.places[state.location.currentPlaceId];
}

function scoreCard(
  card: StorypackCard,
  state: RuntimeState,
  playerInput: string,
  relatedPlaceIdSet: Set<string>
): { score: number; reasons: StorypackProjectionReason[] } {
  const reasons: StorypackProjectionReason[] = ['time_window'];
  let score = 20;

  const hook = identityHook(card, state.player.currentIdentity);
  if (hook?.trim()) {
    score += 65;
    reasons.push('identity');
  }

  const inputScore = scoreInputMatch(card, playerInput);
  if (inputScore > 0) {
    score += inputScore;
    reasons.push('player_input');
  }

  const cardPlaces = relatedPlaces(card);
  const currentPlaceCanStandAlone = inputScore > 0 || !isBroadStorypackPlace(state.location.currentPlaceId);
  if (cardPlaces.includes(state.location.currentPlaceId) && currentPlaceCanStandAlone) {
    score += 140;
    reasons.push('current_place');
  }
  if (
    cardPlaces.some(
      (placeId) => relatedPlaceIdSet.has(placeId) && (inputScore > 0 || !isBroadStorypackPlace(placeId))
    )
  ) {
    score += 95;
    reasons.push('related_place');
  }

  const place = currentPlace(state);
  const sectors = relatedSectors(card);
  if (place?.regionId && sectors.includes(place.regionId)) {
    score += 25;
    reasons.push('current_region');
  }
  if (place?.districtId && sectors.includes(place.districtId)) {
    score += 25;
    reasons.push('current_district');
  }

  if (score === 85 && card.type !== 'DramaMotifCard') {
    score += 8;
    reasons.push('baseline_era');
  }

  return { score, reasons: Array.from(new Set(reasons)) };
}

function hasConcreteStorypackRelevance(reasons: StorypackProjectionReason[]): boolean {
  return reasons.some(
    (reason) =>
      reason === 'player_input' ||
      reason === 'current_place' ||
      reason === 'related_place' ||
      reason === 'current_region' ||
      reason === 'current_district'
  );
}

function toProjectionCard(
  card: StorypackCard,
  score: number,
  reasons: StorypackProjectionReason[],
  identity: RuntimeState['player']['currentIdentity']
): StorypackProjectionCard {
  return {
    id: card.id,
    type: card.type,
    title: cardTitle(card),
    score,
    reasons,
    promptSafeVersion: compactText(card.promptSafeVersion, 420),
    structuralInspiration:
      card.type === 'HistoricalEventCard' ? compactText(card.structuralInspiration ?? '', 260) || undefined : undefined,
    identityHook: compactText(identityHook(card, identity) ?? '', 180) || undefined,
    categoryOrSector: categoryOrSector(card),
    relatedSectors: relatedSectors(card),
    relatedPlaces: relatedPlaces(card),
    copyRisk: card.copyRisk,
    sourceConfidence: card.type === 'HistoricalEventCard' ? card.sourceConfidence : undefined
  };
}

function projectionTextLength(card: StorypackProjectionCard): number {
  return [
    card.id,
    card.type,
    card.title,
    card.promptSafeVersion,
    card.structuralInspiration,
    card.identityHook,
    card.categoryOrSector,
    ...card.relatedSectors,
    ...card.relatedPlaces
  ]
    .filter(Boolean)
    .join(' ').length;
}

export function projectStorypackContext(
  state: RuntimeState,
  playerInput: string,
  options: StorypackProjectionOptions = {}
): StorypackProjection {
  const profile = influenceProfiles[state.world.storypackInfluence];
  const sourceCards = options.cards ?? hk1988StorypackCards;
  const rules = [
    'Rule: optional story texture; not a fixed event, opening event, task chain, quest pool, or local trigger.',
    'Rule: use a card only when it naturally fits the current scene, identity, NPC, place, sector, or player intent.',
    'Rule: do not mention source works, source hints, or homage mechanics in narration.',
    'Rule: public-figure Chinese and English names in factual era cards are canonical data; continue to transform protected film, drama, song, and source-character material instead of copying it.',
    'Rule: durable consequences still require normal structured writeback; Storypack cards are read-only inspiration.'
  ];

  if (state.world.storypackInfluence === 'off') {
    return {
      influence: state.world.storypackInfluence,
      cards: [],
      rules,
      diagnostics: {
        totalCards: sourceCards.length,
        eligibleCards: 0,
        selectedCardIds: [],
        selectedTextChars: 0,
        estimatedTokenBudget: 0,
        omittedCardCount: sourceCards.length
      }
    };
  }

  const relatedPlaceIdSet = new Set(options.relatedPlaceIds ?? []);
  const eligible = sourceCards.filter((card) => isCardActive(card, state.time.year));
  const scored = eligible
    .map((card) => {
      const { score, reasons } = scoreCard(card, state, playerInput, relatedPlaceIdSet);
      return { card, score, reasons };
    })
    .filter((entry) => entry.score >= profile.scoreFloor && hasConcreteStorypackRelevance(entry.reasons))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.card.type.localeCompare(right.card.type) ||
        left.card.id.localeCompare(right.card.id)
    );

  const cards: StorypackProjectionCard[] = [];
  let selectedTextChars = 0;
  for (const entry of scored) {
    if (cards.length >= profile.maxCards) break;
    const projectionCard = toProjectionCard(entry.card, entry.score, entry.reasons, state.player.currentIdentity);
    const nextTextChars = selectedTextChars + projectionTextLength(projectionCard);
    if (nextTextChars > profile.textBudget) break;
    cards.push(projectionCard);
    selectedTextChars = nextTextChars;
  }

  return {
    influence: state.world.storypackInfluence,
    cards,
    rules,
    diagnostics: {
      totalCards: sourceCards.length,
      eligibleCards: eligible.length,
      selectedCardIds: cards.map((card) => card.id),
      selectedTextChars,
      estimatedTokenBudget: profile.textBudget,
      omittedCardCount: Math.max(0, scored.length - cards.length)
    }
  };
}

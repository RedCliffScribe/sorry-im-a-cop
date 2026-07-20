import type { Place, RuntimeState } from '../runtime/types';
import { hkLateColonialEraSeedFigures } from './hkLateColonialEraSeedFigures';
import type {
  EraSeedFigureCard,
  EraSeedFigureCategory,
  EraSeedFigureProjection,
  EraSeedFigureProjectionCard,
  EraSeedFigureProjectionOptions,
  EraSeedFigureProjectionReason,
  EraSeedFigureValidationResult
} from './eraSeedFigureTypes';
import { seedCanonicalId, seedRuntimeActorId } from './seedIdentityLock';

const MAX_SEED_FIGURES = 12;
const SEED_FIGURE_TEXT_BUDGET = 8000;
const MIN_SEED_FIGURE_SCORE = 80;

function typeCounts(): Record<EraSeedFigureCategory, number> {
  return {
    entertainment: 0,
    literature_media: 0,
    business_backstage: 0
  };
}

function compactText(value: string, maxChars: number): string {
  const compacted = value.trim().replace(/\s+/g, ' ');
  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function normalizeIdentityValue(value: string): string {
  return normalizeText(value).normalize('NFKC').replace(/[\s\-–—·.(),'’]/gu, '');
}

function isValidCategory(value: unknown): value is EraSeedFigureCategory {
  return value === 'entertainment' || value === 'literature_media' || value === 'business_backstage';
}

function hasIdentityHooks(card: EraSeedFigureCard): boolean {
  return Boolean(
    card.identityHooks?.police?.trim() &&
      card.identityHooks.civilian?.trim() &&
      card.identityHooks.gang_member?.trim()
  );
}

export function validateEraSeedFigures(cards: EraSeedFigureCard[]): EraSeedFigureValidationResult {
  const counts = typeCounts();
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const seenDisplayNames = new Map<string, string>();
  const seenEnglishNames = new Map<string, string>();

  cards.forEach((card, index) => {
    if (card.type !== 'EraSeedFigureCard') errors.push(`line ${index + 1}: invalid type`);
    if (!card.id?.trim()) errors.push(`line ${index + 1}: missing id`);
    if (seenIds.has(card.id)) errors.push(`${card.id}: duplicate id`);
    seenIds.add(card.id);
    if (!card.displayName?.trim()) errors.push(`${card.id}: missing displayName`);
    else {
      const normalizedDisplayName = normalizeIdentityValue(card.displayName);
      const ownerId = seenDisplayNames.get(normalizedDisplayName);
      if (ownerId) errors.push(`${card.id}: duplicate displayName with ${ownerId}`);
      else seenDisplayNames.set(normalizedDisplayName, card.id);
    }
    if (card.englishName?.trim()) {
      const normalizedEnglishName = normalizeIdentityValue(card.englishName);
      const ownerId = seenEnglishNames.get(normalizedEnglishName);
      if (ownerId) errors.push(`${card.id}: duplicate englishName with ${ownerId}`);
      else seenEnglishNames.set(normalizedEnglishName, card.id);
    }
    if (!isValidCategory(card.category)) errors.push(`${card.id}: invalid category`);
    else counts[card.category] += 1;
    if (!card.activeYears) errors.push(`${card.id}: missing activeYears`);
    if (card.activeYears && card.activeYears.from > card.activeYears.to) {
      errors.push(`${card.id}: invalid activeYears`);
    }
    if (!card.publicRole?.trim()) errors.push(`${card.id}: missing publicRole`);
    if (!card.promptSafeProfile?.trim()) errors.push(`${card.id}: missing promptSafeProfile`);
    if (!card.recognitionAliases.length) errors.push(`${card.id}: missing recognitionAliases`);
    if (!card.accessRoutes.length) errors.push(`${card.id}: missing accessRoutes`);
    if (!card.promptSafeHooks.length) errors.push(`${card.id}: missing promptSafeHooks`);
    if (!hasIdentityHooks(card)) errors.push(`${card.id}: missing identity hooks`);

  });

  return {
    total: cards.length,
    counts,
    errors
  };
}

function currentPlace(state: RuntimeState): Place | undefined {
  return state.places[state.location.currentPlaceId];
}

function isCardActive(card: EraSeedFigureCard, year: number): boolean {
  return card.activeYears.from <= year && year <= card.activeYears.to;
}

function cardSearchValues(card: EraSeedFigureCard): string[] {
  return [
    card.id,
    card.displayName,
    card.englishName,
    card.publicRole,
    card.promptSafeProfile,
    ...card.recognitionAliases,
    ...card.sectors,
    ...card.eraTags,
    ...card.accessRoutes,
    ...card.promptSafeHooks,
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
    for (let size = 2; size <= Math.min(8, run.length); size += 1) {
      for (let start = 0; start + size <= run.length; start += 1) {
        tokens.add(run.slice(start, start + size));
      }
    }
  }

  return [...tokens];
}

function scoreInputMatch(card: EraSeedFigureCard, playerInput: string): number {
  const search = cardSearchValues(card).map(normalizeText).join(' ');
  const signals = extractInputSignals(playerInput);
  let score = 0;

  for (const signal of signals) {
    if (!search.includes(signal)) continue;
    if (card.recognitionAliases.some((alias) => normalizeText(alias).includes(signal))) score += 85;
    else if (normalizeText(card.displayName).includes(signal)) score += 90;
    else if (signal.length >= 6) score += 70;
    else if (signal.length >= 4) score += 45;
    else score += 20;
  }

  return Math.min(score, 360);
}

function scoreSectorHints(card: EraSeedFigureCard, place: Place | undefined, playerInput: string): number {
  let score = 0;
  const normalizedInput = normalizeText(playerInput);
  const values = [place?.type, place?.category, place?.summary, place?.publicKnowledge, place?.name, place?.nameEn]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeText)
    .join(' ');

  for (const sector of card.sectors) {
    const normalizedSector = normalizeText(sector);
    if (values.includes(normalizedSector)) score += 20;
    if (normalizedInput.includes(normalizedSector)) score += 35;
  }

  if (card.category === 'entertainment' && /片场|电影|明星|导演|演员|歌手|电视|电台|唱片/u.test(playerInput)) {
    score += 45;
  }
  if (card.category === 'literature_media' && /报馆|报纸|专栏|武侠|作家|小说|社论/u.test(playerInput)) {
    score += 45;
  }
  if (card.category === 'business_backstage' && /经纪|老板|合约|公司|片商|资本|投资/u.test(playerInput)) {
    score += 45;
  }

  return score;
}

function scoreCard(
  card: EraSeedFigureCard,
  state: RuntimeState,
  playerInput: string,
  relatedPlaceIdSet: Set<string>
): { score: number; reasons: EraSeedFigureProjectionReason[] } {
  const reasons: EraSeedFigureProjectionReason[] = ['time_window'];
  let score = 10;

  const inputScore = scoreInputMatch(card, playerInput);
  if (inputScore > 0) {
    score += inputScore;
    reasons.push('player_input');
  }

  if (card.usualPlaceIds.includes(state.location.currentPlaceId)) {
    score += 120;
    reasons.push('current_place');
  }
  if (card.usualPlaceIds.some((placeId) => relatedPlaceIdSet.has(placeId))) {
    score += 80;
    reasons.push('related_place');
  }

  const sectorScore = scoreSectorHints(card, currentPlace(state), playerInput);
  if (sectorScore > 0) {
    score += sectorScore;
    reasons.push('sector_hint');
  }

  if (card.importance >= 90 && inputScore > 0) {
    score += 35;
    reasons.push('high_importance');
  }

  return { score, reasons: Array.from(new Set(reasons)) };
}

function hasDirectIdentityMatch(card: EraSeedFigureCard, playerInput: string): boolean {
  const normalizedInput = normalizeIdentityValue(playerInput);
  if (!normalizedInput) return false;

  return [card.displayName, card.englishName, ...card.recognitionAliases]
    .filter((value): value is string => Boolean(value?.trim()))
    .some((value) => normalizedInput.includes(normalizeIdentityValue(value)));
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function selectionVarietyBias(card: EraSeedFigureCard, state: RuntimeState, playerInput: string): number {
  if (hasDirectIdentityMatch(card, playerInput)) return 0;

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

  return stableHash(scope) % 13;
}

function identityHook(card: EraSeedFigureCard, identity: RuntimeState['player']['currentIdentity']): string {
  return card.identityHooks[identity];
}

function toProjectionCard(
  card: EraSeedFigureCard,
  score: number,
  reasons: EraSeedFigureProjectionReason[],
  identity: RuntimeState['player']['currentIdentity']
): EraSeedFigureProjectionCard {
  return {
    id: card.id,
    canonicalSeedId: seedCanonicalId(card),
    runtimeActorId: seedRuntimeActorId(seedCanonicalId(card)),
    displayName: card.displayName,
    englishName: card.englishName,
    category: card.category,
    publicRole: card.publicRole,
    contactPolicy: card.contactPolicy,
    score,
    reasons,
    sectors: [...card.sectors],
    recognitionAliases: card.recognitionAliases.slice(0, 5),
    accessRoutes: card.accessRoutes.slice(0, 5),
    promptSafeProfile: compactText(card.promptSafeProfile, 420),
    promptSafeHooks: card.promptSafeHooks.map((hook) => compactText(hook, 160)).slice(0, 4),
    identityHook: compactText(identityHook(card, identity), 180),
    copyRisk: card.copyRisk,
    sourceConfidence: card.sourceConfidence
  };
}

function projectionTextLength(card: EraSeedFigureProjectionCard): number {
  return [
    card.id,
    card.canonicalSeedId,
    card.runtimeActorId,
    card.displayName,
    card.englishName,
    card.publicRole,
    card.promptSafeProfile,
    card.identityHook,
    ...card.sectors,
    ...card.recognitionAliases,
    ...card.accessRoutes,
    ...card.promptSafeHooks
  ]
    .filter(Boolean)
    .join(' ').length;
}

export function projectEraSeedFigureContext(
  state: RuntimeState,
  playerInput: string,
  options: EraSeedFigureProjectionOptions = {}
): EraSeedFigureProjection {
  const sourceCards = options.cards ?? hkLateColonialEraSeedFigures;
  const relatedPlaceIdSet = new Set(options.relatedPlaceIds ?? []);
  const eligible = sourceCards.filter((card) => isCardActive(card, state.time.year));
  const scored = eligible
    .map((card) => {
      const { score, reasons } = scoreCard(card, state, playerInput, relatedPlaceIdSet);
      return {
        card,
        score,
        reasons,
        selectionScore: score + selectionVarietyBias(card, state, playerInput)
      };
    })
    .filter((entry) => entry.score >= MIN_SEED_FIGURE_SCORE)
    .sort(
      (left, right) =>
        right.selectionScore - left.selectionScore ||
        right.score - left.score ||
        right.card.importance - left.card.importance ||
        left.card.category.localeCompare(right.card.category) ||
        left.card.id.localeCompare(right.card.id)
    );

  const figures: EraSeedFigureProjectionCard[] = [];
  let selectedTextChars = 0;
  for (const entry of scored) {
    if (figures.length >= MAX_SEED_FIGURES) break;
    const projectionCard = toProjectionCard(entry.card, entry.score, entry.reasons, state.player.currentIdentity);
    const nextTextChars = selectedTextChars + projectionTextLength(projectionCard);
    if (nextTextChars > SEED_FIGURE_TEXT_BUDGET) break;
    figures.push(projectionCard);
    selectedTextChars = nextTextChars;
  }

  return {
    figures,
    rules: [
      'Rule: era seed figures are public/cultural knowledge anchors, not fixed NPCs, not automatically present, and not quest givers by default.',
      'SEED_IDENTITY_LOCK: each public figure has one canonicalSeedId and at most one runtime Actor. If direct contact creates an Actor, use the provided runtimeActorId, Chinese displayName, English name, and aliases; do not create a duplicate alternate-name person for the same figure.',
      'Rule: Create Actor only when the current scene naturally establishes direct contact, a stable name, and enough identity detail for writeback.',
      'Rule: public-figure Chinese and English names are canonical era data; do not reveal hidden source notes or homage mechanics.',
      'Rule: seed figure events still need normal Storypack, memory, case, actor, organization, or deferred-event writeback when they become durable facts.'
    ],
    diagnostics: {
      totalFigures: sourceCards.length,
      eligibleFigures: eligible.length,
      selectedFigureIds: figures.map((figure) => figure.id),
      selectedTextChars,
      estimatedTokenBudget: SEED_FIGURE_TEXT_BUDGET,
      omittedFigureCount: Math.max(0, scored.length - figures.length)
    }
  };
}

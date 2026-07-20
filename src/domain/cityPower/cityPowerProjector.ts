import type { RuntimeState } from '../runtime/types';
import type {
  CityOrganizationAnchor,
  CityPowerFigureAnchor,
  CityPowerProjection,
  CityPowerProjectionOptions,
  CityPowerProjectionReason,
  CityPowerVisibility,
  ProjectedCityOrganizationAnchor,
  ProjectedCityPowerFigureAnchor
} from './cityPowerTypes';
import { hkLateColonialOrganizations } from './hkLateColonialOrganizations';
import { hkLateColonialPowerFigures } from './hkLateColonialPowerFigures';

const MAX_ORGANIZATIONS = 12;
const MAX_FIGURES = 10;
const TEXT_BUDGET = 10000;
const MIN_ORGANIZATION_SCORE = 65;
const MIN_FIGURE_SCORE = 80;

function compactText(value: string, maxChars: number): string {
  const compacted = value.trim().replace(/\s+/g, ' ');
  return compacted.length <= maxChars ? compacted : `${compacted.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isActive(activeYears: { from: number; to: number }, year: number): boolean {
  return activeYears.from <= year && year <= activeYears.to;
}

function visibilityForIdentity(
  defaultVisibility: CityPowerVisibility,
  byIdentity: Partial<Record<RuntimeState['player']['currentIdentity'], CityPowerVisibility>> | undefined,
  identity: RuntimeState['player']['currentIdentity']
): CityPowerVisibility {
  return byIdentity?.[identity] ?? defaultVisibility;
}

function addSubstrings(tokens: Set<string>, value: string): void {
  for (let size = 2; size <= Math.min(8, value.length); size += 1) {
    for (let start = 0; start + size <= value.length; start += 1) {
      tokens.add(value.slice(start, start + size));
    }
  }
}

function extractInputSignals(playerInput: string): string[] {
  const normalized = normalizeText(playerInput);
  if (!normalized) return [];
  const tokens = new Set<string>();

  for (const token of normalized.split(/[^\p{L}\p{N}_]+/u)) {
    if (token.length >= 2) {
      tokens.add(token);
      addSubstrings(tokens, token);
    }
  }

  const cjkRuns = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  for (const run of cjkRuns) {
    addSubstrings(tokens, run);
  }

  return [...tokens];
}

function scoreSearchValues(values: string[], playerInput: string): number {
  const search = values.map(normalizeText).join(' ');
  let score = 0;

  for (const signal of extractInputSignals(playerInput)) {
    if (!search.includes(signal)) continue;
    if (signal.length >= 6) score += 80;
    else if (signal.length >= 4) score += 50;
    else score += 35;
  }

  return Math.min(score, 360);
}

function organizationSearchValues(anchor: CityOrganizationAnchor): string[] {
  return [
    anchor.organizationId,
    anchor.displayName,
    anchor.englishName,
    ...anchor.disguisedNames,
    anchor.publicKnowledge,
    anchor.promptSafeProfile,
    ...anchor.sectorTags,
    ...anchor.headquartersPlaceIds,
    ...anchor.territoryPlaceIds
  ].filter((value): value is string => Boolean(value?.trim()));
}

function figureSearchValues(anchor: CityPowerFigureAnchor): string[] {
  return [
    anchor.canonicalSeedId,
    anchor.displayName,
    anchor.englishName,
    ...anchor.recognitionAliases,
    ...(anchor.protectedRealNames ?? []),
    anchor.publicRole,
    anchor.promptSafeProfile,
    ...anchor.promptSafeHooks,
    ...anchor.accessRoutes,
    ...anchor.affiliationOrganizationIds,
    ...anchor.relatedOrganizationIds,
    ...anchor.usualPlaceIds
  ].filter((value): value is string => Boolean(value?.trim()));
}

function scoreOrganization(
  anchor: CityOrganizationAnchor,
  state: RuntimeState,
  playerInput: string,
  relatedPlaceIdSet: Set<string>,
  sectorHints: Set<string>
): { score: number; reasons: CityPowerProjectionReason[] } {
  const reasons: CityPowerProjectionReason[] = ['time_window'];
  let score = 8;
  const inputScore = scoreSearchValues(organizationSearchValues(anchor), playerInput);

  if (inputScore > 0) {
    score += inputScore;
    reasons.push('player_input');
  }
  if (
    anchor.headquartersPlaceIds.includes(state.location.currentPlaceId) ||
    anchor.territoryPlaceIds.includes(state.location.currentPlaceId)
  ) {
    score += 120;
    reasons.push('current_place');
  }
  if ([...anchor.headquartersPlaceIds, ...anchor.territoryPlaceIds].some((placeId) => relatedPlaceIdSet.has(placeId))) {
    score += 65;
    reasons.push('related_place');
  }
  if (anchor.sectorTags.some((tag) => sectorHints.has(normalizeText(tag)))) {
    score += 45;
    reasons.push('storypack_sector');
  }
  if (state.organizations[anchor.organizationId]) {
    score += 55;
    reasons.push('organization_state');
  }
  if (anchor.influence >= 90 && inputScore > 0) {
    score += 30;
    reasons.push('high_importance');
  }

  return { score, reasons: Array.from(new Set(reasons)) };
}

function scoreFigure(
  anchor: CityPowerFigureAnchor,
  state: RuntimeState,
  playerInput: string,
  relatedPlaceIdSet: Set<string>,
  selectedOrganizationIds: Set<string>
): { score: number; reasons: CityPowerProjectionReason[] } {
  const reasons: CityPowerProjectionReason[] = ['time_window'];
  let score = 8;
  const inputScore = scoreSearchValues(figureSearchValues(anchor), playerInput);

  if (inputScore > 0) {
    score += inputScore;
    reasons.push('player_input');
  }
  if (anchor.usualPlaceIds.includes(state.location.currentPlaceId)) {
    score += 100;
    reasons.push('current_place');
  }
  if (anchor.usualPlaceIds.some((placeId) => relatedPlaceIdSet.has(placeId))) {
    score += 60;
    reasons.push('related_place');
  }
  if ([...anchor.affiliationOrganizationIds, ...anchor.relatedOrganizationIds].some((id) => selectedOrganizationIds.has(id))) {
    score += 55;
    reasons.push('organization_state');
  }
  if (anchor.importance >= 90 && inputScore > 0) {
    score += 35;
    reasons.push('high_importance');
  }

  return { score, reasons: Array.from(new Set(reasons)) };
}

function toProjectedOrganization(
  anchor: CityOrganizationAnchor,
  score: number,
  reasons: CityPowerProjectionReason[],
  visibility: CityPowerVisibility
): ProjectedCityOrganizationAnchor {
  return {
    organizationId: anchor.organizationId,
    displayName: anchor.displayName,
    organizationType: anchor.organizationType,
    visibility,
    score,
    reasons,
    publicKnowledge: compactText(anchor.publicKnowledge, 220),
    promptSafeProfile: compactText(anchor.promptSafeProfile, 360),
    sectorTags: anchor.sectorTags.slice(0, 8),
    sourceConfidence: anchor.sourceConfidence
  };
}

function toProjectedFigure(
  anchor: CityPowerFigureAnchor,
  score: number,
  reasons: CityPowerProjectionReason[],
  visibility: CityPowerVisibility,
  identity: RuntimeState['player']['currentIdentity'],
  selectedOrganizationIds: Set<string>
): ProjectedCityPowerFigureAnchor {
  return {
    canonicalSeedId: anchor.canonicalSeedId,
    runtimeActorId: anchor.runtimeActorId,
    displayName: anchor.displayName,
    englishName: anchor.englishName,
    category: anchor.category,
    publicRole: anchor.publicRole,
    contactPolicy: anchor.contactPolicy,
    visibility,
    score,
    reasons,
    recognitionAliases: anchor.recognitionAliases.slice(0, 5),
    affiliationOrganizationIds: anchor.affiliationOrganizationIds.filter((id) => selectedOrganizationIds.has(id)),
    relatedOrganizationIds: anchor.relatedOrganizationIds.filter((id) => selectedOrganizationIds.has(id)),
    accessRoutes: anchor.accessRoutes.slice(0, 5),
    promptSafeProfile: compactText(anchor.promptSafeProfile, 420),
    promptSafeHooks: anchor.promptSafeHooks.map((hook) => compactText(hook, 160)).slice(0, 4),
    identityHook: compactText(anchor.identityHooks[identity], 180),
    sourceConfidence: anchor.sourceConfidence,
    copyRisk: anchor.copyRisk
  };
}

function projectedTextLength(value: ProjectedCityOrganizationAnchor | ProjectedCityPowerFigureAnchor): number {
  return JSON.stringify(value).length;
}

function collectMissingOrganizationRefs(
  organizations: CityOrganizationAnchor[],
  figures: CityPowerFigureAnchor[]
): string[] {
  const organizationIds = new Set(organizations.map((organization) => organization.organizationId));
  const missingRefs = new Set<string>();

  for (const figure of figures) {
    for (const organizationId of [...figure.affiliationOrganizationIds, ...figure.relatedOrganizationIds]) {
      if (!organizationIds.has(organizationId)) {
        missingRefs.add(organizationId);
      }
    }
  }

  return [...missingRefs];
}

export function projectCityPowerContext(
  state: RuntimeState,
  playerInput: string,
  options: CityPowerProjectionOptions = {}
): CityPowerProjection {
  const organizations = options.organizations ?? hkLateColonialOrganizations;
  const figures = options.figures ?? hkLateColonialPowerFigures;
  const relatedPlaceIdSet = new Set(options.relatedPlaceIds ?? []);
  const sectorHints = new Set((options.sectorHints ?? []).map(normalizeText));
  const identity = state.player.currentIdentity;
  const missingOrganizationRefs = collectMissingOrganizationRefs(organizations, figures);
  let omittedHiddenCount = 0;

  const eligibleOrganizations = organizations.filter((anchor) => isActive(anchor.activeYears, state.time.year));
  const scoredOrganizations = eligibleOrganizations
    .map((anchor) => {
      const visibility = visibilityForIdentity(anchor.defaultVisibility, anchor.visibilityByIdentity, identity);
      const { score, reasons } = scoreOrganization(anchor, state, playerInput, relatedPlaceIdSet, sectorHints);
      return { anchor, score, reasons, visibility };
    })
    .filter((entry) => {
      if (entry.visibility === 'hidden') {
        omittedHiddenCount += 1;
        return false;
      }
      return entry.score >= MIN_ORGANIZATION_SCORE;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.anchor.influence - left.anchor.influence ||
        left.anchor.organizationId.localeCompare(right.anchor.organizationId)
    );

  const projectedOrganizations: ProjectedCityOrganizationAnchor[] = [];
  let selectedTextChars = 0;
  for (const entry of scoredOrganizations) {
    if (projectedOrganizations.length >= MAX_ORGANIZATIONS) break;
    const projected = toProjectedOrganization(entry.anchor, entry.score, entry.reasons, entry.visibility);
    const nextChars = selectedTextChars + projectedTextLength(projected);
    if (nextChars > TEXT_BUDGET) break;
    projectedOrganizations.push(projected);
    selectedTextChars = nextChars;
  }

  const selectedOrganizationIds = new Set(projectedOrganizations.map((item) => item.organizationId));
  const eligibleFigures = figures.filter((anchor) => isActive(anchor.activeYears, state.time.year));
  const scoredFigures = eligibleFigures
    .map((anchor) => {
      const visibility = visibilityForIdentity(anchor.defaultVisibility, anchor.visibilityByIdentity, identity);
      const { score, reasons } = scoreFigure(anchor, state, playerInput, relatedPlaceIdSet, selectedOrganizationIds);
      return { anchor, score, reasons, visibility };
    })
    .filter((entry) => {
      if (entry.visibility === 'hidden') {
        omittedHiddenCount += 1;
        return false;
      }
      if (entry.anchor.category === 'triad_leader' && identity === 'civilian' && entry.visibility !== 'rumor') return false;
      return entry.score >= MIN_FIGURE_SCORE;
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.anchor.importance - left.anchor.importance ||
        left.anchor.canonicalSeedId.localeCompare(right.anchor.canonicalSeedId)
    );

  const projectedFigures: ProjectedCityPowerFigureAnchor[] = [];
  for (const entry of scoredFigures) {
    if (projectedFigures.length >= MAX_FIGURES) break;
    const projected = toProjectedFigure(
      entry.anchor,
      entry.score,
      entry.reasons,
      entry.visibility,
      identity,
      selectedOrganizationIds
    );
    const nextChars = selectedTextChars + projectedTextLength(projected);
    if (nextChars > TEXT_BUDGET) break;
    projectedFigures.push(projected);
    selectedTextChars = nextChars;
  }

  return {
    organizations: projectedOrganizations,
    figures: projectedFigures,
    rules: [
      'Rule: city power anchors are stable background facts, not automatic scene participants or quest givers.',
      'CITY_POWER_IDENTITY_LOCK: each projected power figure has one canonicalSeedId and one runtimeActorId. If direct contact creates an Actor, reuse the provided runtimeActorId, Chinese displayName, and English name.',
      'Rule: public-figure Chinese and English names are canonical era data; do not reveal hidden source notes or hierarchy mechanics in narration.',
      'Rule: triad and gray-network claims must distinguish public rumor, police intelligence, gang-world hearsay, and confirmed fact; do not promote rumor to confirmed fact without writeback evidence.',
      'Rule: durable organization changes use organizationPatches; durable actor roles use actorPatches[].organizationRelations; area-level rumors use grayNetworkPatches; visible background developments may use currentMatterPatches or newsIssuePatches.'
    ],
    diagnostics: {
      totalOrganizations: organizations.length,
      eligibleOrganizations: eligibleOrganizations.length,
      selectedOrganizationIds: projectedOrganizations.map((item) => item.organizationId),
      totalFigures: figures.length,
      eligibleFigures: eligibleFigures.length,
      selectedFigureIds: projectedFigures.map((item) => item.canonicalSeedId),
      selectedTextChars,
      estimatedTokenBudget: TEXT_BUDGET,
      omittedOrganizationCount: Math.max(0, scoredOrganizations.length - projectedOrganizations.length),
      omittedFigureCount: Math.max(0, scoredFigures.length - projectedFigures.length),
      omittedHiddenCount,
      missingOrganizationRefs
    }
  };
}

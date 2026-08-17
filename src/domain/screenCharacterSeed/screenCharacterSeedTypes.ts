import type { CurrentIdentity, PlaceId } from '../runtime/types';

export type ScreenCharacterMedium = 'film' | 'television';

export type ScreenCharacterCategory =
  | 'police_law'
  | 'triad_crime'
  | 'business_finance'
  | 'media_entertainment'
  | 'civilian_relationship';

export interface ScreenCharacterIdentityHooks {
  police: string;
  civilian: string;
  gang_member: string;
}

export interface ScreenCharacterSeedCard {
  type: 'ScreenCharacterSeedCard';
  id: string;
  canonicalCharacterId?: string;
  displayName: string;
  englishName?: string;
  recognitionAliases: string[];
  sourceWorkId: string;
  sourceWorkTitle: string;
  sourceWorkTitleEn?: string;
  medium: ScreenCharacterMedium;
  availableYears: {
    from: number;
    to: number;
  };
  /**
   * Internal-only placement rule used when the source work was released after
   * the worldpack period or when this save intentionally enters the character
   * before the work's published chronology. It must never be shown to players.
   */
  worldpackPlacementAnchor?: string;
  category: ScreenCharacterCategory;
  sectors: string[];
  eraTags: string[];
  usualPlaceIds: PlaceId[];
  gender: 'male' | 'female' | 'nonbinary';
  ageRange: {
    min: number;
    max: number;
  };
  currentIdentity: CurrentIdentity;
  publicIdentity: string;
  actualIdentitySummary: string;
  positionSummary: string;
  profileSummary: string;
  appearanceAnchor: string;
  clothingAnchor: string;
  personality: string;
  speechStyle: string;
  motivation: string;
  longTermGoal: string;
  values: string;
  capabilityProfile: string;
  relationshipAnchors: string[];
  accessRoutes: string[];
  promptHooks: string[];
  identityHooks: ScreenCharacterIdentityHooks;
  importance: number;
  sourceConfidence: 'medium' | 'high';
}

export type ScreenCharacterProjectionReason =
  | 'time_window'
  | 'character_name'
  | 'source_work'
  | 'player_input'
  | 'current_place'
  | 'related_place'
  | 'sector_hint'
  | 'identity_fit'
  | 'linked_character';

export interface ScreenCharacterSeedProjectionCard {
  id: string;
  canonicalCharacterId: string;
  runtimeActorId: string;
  displayName: string;
  englishName?: string;
  recognitionAliases: string[];
  sourceWorkId: string;
  sourceWorkTitle: string;
  sourceWorkTitleEn?: string;
  medium: ScreenCharacterMedium;
  availableYears: ScreenCharacterSeedCard['availableYears'];
  worldpackPlacementAnchor?: string;
  category: ScreenCharacterCategory;
  score: number;
  reasons: ScreenCharacterProjectionReason[];
  gender: ScreenCharacterSeedCard['gender'];
  ageRange: ScreenCharacterSeedCard['ageRange'];
  currentIdentity: CurrentIdentity;
  publicIdentity: string;
  actualIdentitySummary: string;
  positionSummary: string;
  profileSummary: string;
  appearanceAnchor: string;
  clothingAnchor: string;
  personality: string;
  speechStyle: string;
  motivation: string;
  longTermGoal: string;
  values: string;
  capabilityProfile: string;
  sectors: string[];
  relationshipAnchors: string[];
  accessRoutes: string[];
  promptHooks: string[];
  identityHook: string;
  importance: number;
  sourceConfidence: ScreenCharacterSeedCard['sourceConfidence'];
}

export interface ScreenCharacterSeedProjection {
  characters: ScreenCharacterSeedProjectionCard[];
  rules: string[];
  diagnostics: {
    totalCharacters: number;
    eligibleCharacters: number;
    selectedCharacterIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedCharacterCount: number;
  };
}

export interface ScreenCharacterSeedProjectionOptions {
  cards?: ScreenCharacterSeedCard[];
  relatedPlaceIds?: string[];
  sectorHints?: string[];
}

export interface ScreenCharacterSeedValidationResult {
  total: number;
  counts: Record<ScreenCharacterCategory, number>;
  workCount: number;
  errors: string[];
}

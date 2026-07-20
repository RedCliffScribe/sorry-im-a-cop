import type { CurrentIdentity } from '../runtime/types';

export type StorypackCardType = 'HistoricalEventCard' | 'SectorPressureCard' | 'DramaMotifCard';

export interface StorypackIdentityHooks {
  police?: string;
  civilian?: string;
  gang_member?: string;
}

export type StorypackCopyRisk = 'low' | 'medium' | 'high';

export interface HistoricalEventCard {
  type: 'HistoricalEventCard';
  id: string;
  title: string;
  category: string;
  timeWindow: {
    firstUsableYear: number;
    factualFromYear: number;
    factualUntilYear: number;
    afterlifeUntilYear: number;
  };
  realEventBasis?: string;
  publicSummary?: string;
  socialImpact?: string;
  usableAngles?: string[];
  relatedSectors?: string[];
  relatedPlaces?: string[];
  fictionalizedEcho?: string;
  promptSafeVersion: string;
  structuralInspiration?: string;
  copyRisk?: StorypackCopyRisk;
  sourceConfidence?: 'low' | 'medium' | 'high';
  identityHooks: StorypackIdentityHooks;
}

export interface SectorPressureCard {
  type: 'SectorPressureCard';
  id: string;
  sector: string;
  title: string;
  activeYears: {
    from: number;
    to: number;
  };
  publicFace?: string;
  hiddenPressures?: string[];
  commonRoles?: string[];
  commonPlaces?: string[];
  conflictTypes?: string[];
  policeContactModes?: string;
  civilianContactModes?: string;
  gangContactModes?: string;
  promptSafeVersion: string;
  identityHooks: StorypackIdentityHooks;
  copyRisk?: StorypackCopyRisk;
}

export interface DramaMotifCard {
  type: 'DramaMotifCard';
  id: string;
  motifName: string;
  internalSourceHint?: string;
  sourceType?: string;
  timeWindow: {
    applicableFromYear: number;
    applicableUntilYear: number;
  };
  sourceEraHint?: string;
  homageNames?: string[];
  quoteAnchors?: string[];
  paraphraseVariants?: string[];
  coreTension?: string;
  commonRoles?: string[];
  sceneIngredients?: string[];
  escalationShapes?: string[];
  relatedSectors?: string[];
  identityVariants?: StorypackIdentityHooks;
  promptSafeVersion: string;
  forbiddenDirectCopyRules?: string[];
  copyRisk?: StorypackCopyRisk;
}

export type StorypackCard = HistoricalEventCard | SectorPressureCard | DramaMotifCard;

export type StorypackProjectionReason =
  | 'time_window'
  | 'identity'
  | 'player_input'
  | 'related_place'
  | 'current_place'
  | 'current_region'
  | 'current_district'
  | 'baseline_era';

export interface StorypackProjectionCard {
  id: string;
  type: StorypackCardType;
  title: string;
  score: number;
  reasons: StorypackProjectionReason[];
  promptSafeVersion: string;
  structuralInspiration?: string;
  identityHook?: string;
  categoryOrSector?: string;
  relatedSectors: string[];
  relatedPlaces: string[];
  copyRisk?: StorypackCopyRisk;
  sourceConfidence?: HistoricalEventCard['sourceConfidence'];
}

export interface StorypackProjection {
  influence: 'off' | 'low' | 'medium' | 'high';
  cards: StorypackProjectionCard[];
  rules: string[];
  diagnostics: {
    totalCards: number;
    eligibleCards: number;
    selectedCardIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedCardCount: number;
  };
}

export interface StorypackProjectionOptions {
  cards?: StorypackCard[];
  relatedPlaceIds?: string[];
}

export interface StorypackValidationResult {
  total: number;
  counts: Record<StorypackCardType, number>;
  errors: string[];
}

export type StorypackIdentity = CurrentIdentity;

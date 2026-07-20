import type { CurrentIdentity, PlaceId } from '../runtime/types';

export type EraSeedFigureCategory = 'entertainment' | 'literature_media' | 'business_backstage';

export type EraSeedFigureContactPolicy = 'background_only' | 'rumor_only' | 'contactable_seed';

export type EraSeedFigureCopyRisk = 'low' | 'medium' | 'high';

export interface EraSeedFigureIdentityHooks {
  police: string;
  civilian: string;
  gang_member: string;
}

export interface EraSeedFigureCard {
  type: 'EraSeedFigureCard';
  id: string;
  canonicalSeedId?: string;
  displayName: string;
  englishName?: string;
  category: EraSeedFigureCategory;
  sectors: string[];
  activeYears: {
    from: number;
    to: number;
  };
  recognitionAliases: string[];
  protectedRealNames?: string[];
  publicRole: string;
  usualPlaceIds: PlaceId[];
  accessRoutes: string[];
  promptSafeProfile: string;
  promptSafeHooks: string[];
  eraTags: string[];
  contactPolicy: EraSeedFigureContactPolicy;
  identityHooks: EraSeedFigureIdentityHooks;
  copyRisk: EraSeedFigureCopyRisk;
  sourceConfidence: 'low' | 'medium' | 'high';
  importance: number;
}

export type EraSeedFigureProjectionReason =
  | 'time_window'
  | 'player_input'
  | 'current_place'
  | 'related_place'
  | 'sector_hint'
  | 'high_importance';

export interface EraSeedFigureProjectionCard {
  id: string;
  canonicalSeedId: string;
  runtimeActorId: string;
  displayName: string;
  englishName?: string;
  category: EraSeedFigureCategory;
  publicRole: string;
  contactPolicy: EraSeedFigureContactPolicy;
  score: number;
  reasons: EraSeedFigureProjectionReason[];
  sectors: string[];
  recognitionAliases: string[];
  accessRoutes: string[];
  promptSafeProfile: string;
  promptSafeHooks: string[];
  identityHook?: string;
  copyRisk: EraSeedFigureCopyRisk;
  sourceConfidence: EraSeedFigureCard['sourceConfidence'];
}

export interface EraSeedFigureProjection {
  figures: EraSeedFigureProjectionCard[];
  rules: string[];
  diagnostics: {
    totalFigures: number;
    eligibleFigures: number;
    selectedFigureIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedFigureCount: number;
  };
}

export interface EraSeedFigureProjectionOptions {
  cards?: EraSeedFigureCard[];
  relatedPlaceIds?: string[];
}

export interface EraSeedFigureValidationResult {
  total: number;
  counts: Record<EraSeedFigureCategory, number>;
  errors: string[];
}

export type EraSeedFigureIdentity = CurrentIdentity;

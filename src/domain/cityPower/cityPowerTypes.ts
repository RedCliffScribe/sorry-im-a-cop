import type { ActorId, CurrentIdentity, OrganizationId, PlaceId } from '../runtime/types';

export type CityPowerVisibility = 'public' | 'rumor' | 'restricted' | 'identity_gated' | 'hidden';
export type CityPowerSourceConfidence = 'low' | 'medium' | 'high';
export type CityPowerCopyRisk = 'low' | 'medium' | 'high';

export type CityOrganizationType =
  | 'police'
  | 'icac'
  | 'government'
  | 'legal'
  | 'triad'
  | 'media'
  | 'entertainment'
  | 'finance'
  | 'property'
  | 'transport'
  | 'public_service'
  | 'business';

export type CityPowerFigureCategory =
  | 'triad_leader'
  | 'police_command'
  | 'icac_command'
  | 'government_official'
  | 'legal_official'
  | 'media_boss'
  | 'business_tycoon'
  | 'entertainment_backstage';

export type CityPowerContactPolicy = 'background_only' | 'rumor_only' | 'contactable_seed' | 'restricted_contact';

export interface CityOrganizationAnchor {
  type: 'CityOrganizationAnchor';
  organizationId: OrganizationId;
  displayName: string;
  englishName?: string;
  disguisedNames: string[];
  organizationType: CityOrganizationType;
  activeYears: { from: number; to: number };
  publicKnowledge: string;
  promptSafeProfile: string;
  headquartersPlaceIds: PlaceId[];
  territoryPlaceIds: PlaceId[];
  relatedOrganizationIds: OrganizationId[];
  sectorTags: string[];
  influence: number;
  defaultVisibility: CityPowerVisibility;
  visibilityByIdentity?: Partial<Record<CurrentIdentity, CityPowerVisibility>>;
  sourceConfidence: CityPowerSourceConfidence;
}

export interface CityPowerFigureAnchor {
  type: 'CityPowerFigureAnchor';
  canonicalSeedId: string;
  runtimeActorId: ActorId;
  displayName: string;
  englishName?: string;
  recognitionAliases: string[];
  protectedRealNames?: string[];
  category: CityPowerFigureCategory;
  activeYears: { from: number; to: number };
  publicRole: string;
  affiliationOrganizationIds: OrganizationId[];
  relatedOrganizationIds: OrganizationId[];
  usualPlaceIds: PlaceId[];
  accessRoutes: string[];
  promptSafeProfile: string;
  promptSafeHooks: string[];
  identityHooks: Record<CurrentIdentity, string>;
  contactPolicy: CityPowerContactPolicy;
  defaultVisibility: CityPowerVisibility;
  visibilityByIdentity?: Partial<Record<CurrentIdentity, CityPowerVisibility>>;
  sourceConfidence: CityPowerSourceConfidence;
  copyRisk: CityPowerCopyRisk;
  importance: number;
}

export type CityPowerProjectionReason =
  | 'time_window'
  | 'player_input'
  | 'current_place'
  | 'related_place'
  | 'organization_state'
  | 'dynamic_context'
  | 'storypack_sector'
  | 'gray_network'
  | 'high_importance';

export interface ProjectedCityOrganizationAnchor {
  organizationId: OrganizationId;
  displayName: string;
  organizationType: CityOrganizationType;
  visibility: CityPowerVisibility;
  score: number;
  reasons: CityPowerProjectionReason[];
  publicKnowledge: string;
  promptSafeProfile: string;
  sectorTags: string[];
  sourceConfidence: CityPowerSourceConfidence;
}

export interface ProjectedCityPowerFigureAnchor {
  canonicalSeedId: string;
  runtimeActorId: ActorId;
  displayName: string;
  englishName?: string;
  category: CityPowerFigureCategory;
  publicRole: string;
  contactPolicy: CityPowerContactPolicy;
  visibility: CityPowerVisibility;
  score: number;
  reasons: CityPowerProjectionReason[];
  recognitionAliases: string[];
  affiliationOrganizationIds: OrganizationId[];
  relatedOrganizationIds: OrganizationId[];
  accessRoutes: string[];
  promptSafeProfile: string;
  promptSafeHooks: string[];
  identityHook: string;
  sourceConfidence: CityPowerSourceConfidence;
  copyRisk: CityPowerCopyRisk;
}

export interface CityPowerProjection {
  organizations: ProjectedCityOrganizationAnchor[];
  figures: ProjectedCityPowerFigureAnchor[];
  rules: string[];
  diagnostics: {
    totalOrganizations: number;
    eligibleOrganizations: number;
    selectedOrganizationIds: string[];
    totalFigures: number;
    eligibleFigures: number;
    selectedFigureIds: string[];
    selectedTextChars: number;
    estimatedTokenBudget: number;
    omittedOrganizationCount: number;
    omittedFigureCount: number;
    omittedHiddenCount: number;
    missingOrganizationRefs: string[];
  };
}

export interface CityPowerProjectionOptions {
  organizations?: CityOrganizationAnchor[];
  figures?: CityPowerFigureAnchor[];
  relatedPlaceIds?: string[];
  sectorHints?: string[];
}

export interface CityPowerValidationResult {
  organizationCount: number;
  figureCount: number;
  errors: string[];
}

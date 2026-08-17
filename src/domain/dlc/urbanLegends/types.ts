import type { CurrentIdentity } from '../../runtime/types';
import type { NarrativeArcProgressDecision } from '../../drama/types';
import type { OfficialDlcManifest } from '../types';

export type UrbanLegendsCharacterTier = 'core' | 'supporting';

export type UrbanLegendsRuntimeKind =
  | 'signal'
  | 'currentMatter'
  | 'newsIssue'
  | 'relationshipThread'
  | 'actorMemory'
  | 'case';

export type UrbanLegendsStageWritebackKind =
  | UrbanLegendsRuntimeKind
  | 'actor'
  | 'citySituation';

export type UrbanLegendsStageSemanticKey =
  | 'street_rumor'
  | 'first_clues'
  | 'interest_conflict'
  | 'truth_investigation'
  | 'aftermath';

export type UrbanLegendsNodeSemanticKey =
  | 'reported_missing_passenger'
  | 'neighborhood_rumor'
  | 'route_business_rumor'
  | 'driver_testimony'
  | 'old_route_records'
  | 'contradictory_witness'
  | 'press_exaggeration'
  | 'society_uses_rumor'
  | 'internal_disagreement'
  | 'timeline_reconstruction'
  | 'route_surveillance'
  | 'mundane_lead'
  | 'public_account'
  | 'unanswered_detail'
  | 'abandoned_inquiry';

export interface UrbanLegendsCandidateSecretDomain {
  secretDomainId: string;
  possibility: string;
  possibleEvidenceKinds: readonly string[];
  /** Other candidate explanations that cannot become true in the same save without new evidence. */
  incompatibleWith?: readonly string[];
}

export interface UrbanLegendsInformationBoundary {
  knows: readonly string[];
  mayBelieve: readonly string[];
  doesNotKnow: readonly string[];
  accessChannels: readonly string[];
}

export interface UrbanLegendsFormalCharacter {
  actorId: string;
  name: string;
  age: number;
  tier: UrbanLegendsCharacterTier;
  publicIdentity: string;
  occupation: string;
  commonPlaceId: string;
  publicFacts: readonly string[];
  desires: readonly string[];
  fears: readonly string[];
  personality: string;
  speechStyle: string;
  candidateSecretDomains: readonly UrbanLegendsCandidateSecretDomain[];
  informationBoundary: UrbanLegendsInformationBoundary;
  longTermArcDirections: readonly string[];
  forbiddenConfirmations: readonly string[];
}

export interface UrbanLegendsFormalPlace {
  placeId: string;
  name: string;
  summary: string;
  worldpackId: 'hk_1988';
  publicFacts: readonly string[];
  informationChannels: readonly string[];
  forbiddenAdaptations: readonly string[];
}

export interface UrbanLegendsRelationshipSeed {
  relationshipSeedId: string;
  actorIds: readonly [string, string];
  initialTension: string;
  mutualNeeds: readonly string[];
  possibleConflicts: readonly string[];
  informationChannels: readonly string[];
  runtimeKinds: readonly Extract<
    UrbanLegendsRuntimeKind,
    'signal' | 'currentMatter' | 'newsIssue' | 'relationshipThread' | 'actorMemory'
  >[];
  forbiddenAssumptions: readonly string[];
}

export interface UrbanLegendsEntryRouteMatrixItem {
  identity: CurrentIdentity;
  contactSources: readonly string[];
  interventionMotivations: readonly string[];
  reasonablePermissions: readonly string[];
  restrictions: readonly string[];
  realisticRisks: readonly string[];
  initiallyVisibleActorIds: readonly string[];
  initiallyVisibleInformation: readonly string[];
  ordinaryInitialRuntimeKinds: readonly Exclude<UrbanLegendsRuntimeKind, 'case'>[];
  caseCreationBoundary: {
    automaticOnExposure: false;
    stageRestriction: 'none';
    authorityRule: string;
    allowedConditions: readonly string[];
    forbiddenConditions: readonly string[];
    requiresExistingRuntimeGates: true;
  };
  diversionRoutes: readonly string[];
}

export interface UrbanLegendsTruthBoundary {
  confirmableRealityKinds: readonly string[];
  ambiguousExplanationKinds: readonly string[];
  unexplainedResidueRules: readonly string[];
  forbiddenObjectiveFacts: readonly string[];
}

export interface UrbanLegendsNarrativeIdentity {
  dlcId: string;
  eventGroupId: string;
  arcKey: string;
  title: string;
  worldpackId: 'hk_1988';
  coreTheme: string;
  playerExperience: readonly string[];
  initialStageSemanticKey: 'street_rumor';
  stageContractStatus: 'formal_phase_2c';
}

export interface UrbanLegendsStageCaseBoundary {
  automaticFromStageEntry: false;
  stageBlocksFormalProcedure: false;
  allowedConditions: readonly string[];
  forbiddenConditions: readonly string[];
  requiresExistingRuntimeGates: true;
}

export interface UrbanLegendsFormalNodeContract {
  nodeId: string;
  semanticKey: UrbanLegendsNodeSemanticKey;
  title: string;
  narrativeUse: string;
  compatibleIdentities: readonly CurrentIdentity[];
  relevantActorIds: readonly string[];
  relevantPlaceIds: readonly string[];
  permittedFactKinds: readonly string[];
  progressSignals: readonly string[];
  forbiddenConfirmations: readonly string[];
  allowedWritebackKinds: readonly UrbanLegendsStageWritebackKind[];
}

export interface UrbanLegendsFormalStageContract {
  stageId: string;
  semanticKey: UrbanLegendsStageSemanticKey;
  title: string;
  narrativeFunction: string;
  allowedNextStageIds: readonly string[];
  permittedFactKinds: readonly string[];
  advanceEvidence: {
    requiresStructuredWorldChange: true;
    signals: readonly string[];
    insufficientOnTheirOwn: readonly string[];
  };
  progressDecisionGuidance: {
    remainWhen: readonly string[];
    advanceOrCompleteWhen: readonly string[];
    transitionMeaning: string;
  };
  forbiddenConfirmations: readonly string[];
  identityAdaptationHints: Readonly<Record<CurrentIdentity, readonly string[]>>;
  allowedWritebackKinds: readonly UrbanLegendsStageWritebackKind[];
  caseBoundary: UrbanLegendsStageCaseBoundary;
  nodes: readonly UrbanLegendsFormalNodeContract[];
}

export type UrbanLegendsPlayerEngagementKind =
  | 'intervene'
  | 'ignore'
  | 'failed_attempt'
  | 'withdraw';

export interface UrbanLegendsPlayerEngagementContract {
  kind: UrbanLegendsPlayerEngagementKind;
  narrativeRule: string;
  allowedArcDecisions: readonly NarrativeArcProgressDecision[];
  allowedWritebackKinds: readonly UrbanLegendsStageWritebackKind[];
  requiresAppliedWritebackForProgress: true;
  preservesArcInstanceId: true;
  neverResetsStage: true;
  reminderPolicy: 'no_forced_reminder';
  possibleWorldConsequences: readonly string[];
  forbiddenResults: readonly string[];
}

export interface UrbanLegendsNpcAutonomyContract {
  eligibleActorIds: readonly string[];
  possibleActions: readonly string[];
  requiresEstablishedActorOrExplicitActorWriteback: true;
  requiresKnownInformationChannel: true;
  requiresAppliedWritebackForStageProgress: true;
  mayContinueOutsidePlayerView: true;
  mayForcePlayerReturn: false;
  forbiddenResults: readonly string[];
}

export interface UrbanLegendsStageWorldFeedbackContract {
  stageId: string;
  engagement: Readonly<Record<UrbanLegendsPlayerEngagementKind, UrbanLegendsPlayerEngagementContract>>;
  npcAutonomy: UrbanLegendsNpcAutonomyContract;
  completionAllowed: boolean;
  availableResolutionIds: readonly string[];
}

export type UrbanLegendsResolutionMode =
  | 'reality_leaning'
  | 'plural_ambiguity'
  | 'bounded_unexplained_residue';

export interface UrbanLegendsResolutionContract {
  resolutionId: string;
  mode: UrbanLegendsResolutionMode;
  title: string;
  narrativeBoundary: string;
  minimumEvidence: readonly string[];
  requiredWorldResults: readonly string[];
  allowedWritebackKinds: readonly UrbanLegendsStageWritebackKind[];
  forbiddenClaims: readonly string[];
}

export interface UrbanLegendsNewsEvolutionTemplate {
  templateId: string;
  availableStageIds: readonly string[];
  purpose: string;
  allowedWhen: readonly string[];
  publicFactBoundary: string;
  forbiddenClaims: readonly string[];
}

export interface UrbanLegendsDlcCompletionPolicy {
  primaryArcId: string;
  primaryArcCompletionCompletesDlc: false;
  automaticallyMutatesBindingStatus: false;
  completedArcHistoryIsRetained: true;
  completedActorsRemainOrdinaryWorldActors: true;
  currentVersionPolicy: 'keep_dlc_active_after_primary_arc';
  futureDlcCompletionRequirements: readonly string[];
}

export interface UrbanLegendsReleaseGate {
  manifest: OfficialDlcManifest;
  publicationStatus: 'internal_content_draft' | 'release_candidate' | 'published';
  selectableInNewGame: boolean;
  providerRegistered: boolean;
  alphaMigration: 'none';
  incompatibleDlcIds: readonly ['urban_legends_alpha'];
  publicRegistrationRequires: readonly [
    'phase_2c',
    'phase_2d',
    'phase_2e',
    'ui_acceptance',
    'phase_3_real_api'
  ];
}

export type UrbanLegendsAssetDisposition = 'freeze_alpha_create_formal_counterpart';

export interface UrbanLegendsAssetIdentityAudit {
  assetType: 'dlc' | 'arc' | 'event' | 'actor' | 'place' | 'news' | 'stage' | 'node';
  alphaId: string;
  formalId?: string;
  disposition: UrbanLegendsAssetDisposition;
  reason: string;
}

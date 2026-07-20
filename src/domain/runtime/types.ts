export type ActorId = string;
export type AreaId = string;
export type CaseId = string;
export type CaseEvidenceId = string;
export type CombatEventId = string;
export type DeferredEventId = string;
export type JudgementCheckId = string;
export type MemoryId = string;
export type OrganizationId = string;
export type PlaceId = string;
export type PressureId = string;
export type SceneId = string;
export type SecretFactId = string;
export type TraitId = string;
export type TurnId = string;

export type Visibility = 'public' | 'player_known' | 'private' | 'hidden';
export type ActorPresence = 'present' | 'nearby' | 'mentioned' | 'absent';
export type CurrentIdentity = 'civilian' | 'gang_member' | 'police';
export type OrganizationType =
  | 'police_force'
  | 'government'
  | 'icac'
  | 'legal'
  | 'court'
  | 'media'
  | 'entertainment'
  | 'business'
  | 'triad'
  | 'community'
  | 'family'
  | 'other';
export type ActorOrganizationRelationType =
  | 'employee'
  | 'officer'
  | 'member'
  | 'owner'
  | 'manager'
  | 'contractor'
  | 'informal_contact'
  | 'family_tie'
  | 'target'
  | 'source'
  | 'other';
export type CantoneseFlavorLevel = 'off' | 'light' | 'medium' | 'heavy' | 'full';
export type GrayNetworkConfidence = 'low' | 'medium' | 'high';
export type GrayNetworkVisibilityLevel = 'hidden' | 'rumor' | 'known' | 'confirmed';
export type GrayNetworkClimateLevel =
  | 'unknown'
  | 'low'
  | 'medium'
  | 'high'
  | 'rising'
  | 'falling'
  | 'active'
  | 'quiet'
  | 'tense'
  | 'rumor'
  | 'known'
  | 'confirmed';

export interface IdentityVisibility {
  police?: GrayNetworkVisibilityLevel;
  gang_member?: GrayNetworkVisibilityLevel;
  civilian?: GrayNetworkVisibilityLevel;
}

export interface GrayNetworkClimateItem {
  key: string;
  label: string;
  level: GrayNetworkClimateLevel;
  summary: string;
  confidence: GrayNetworkConfidence;
  lastUpdatedTurn?: number;
}

export interface KnownGrayOrganization {
  organizationId?: OrganizationId;
  name: string;
  visibleName: string;
  summary: string;
  knownScope: string;
  confidence: GrayNetworkConfidence;
  visibility: IdentityVisibility;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  updatedAtTurn?: number;
}

export interface GrayNetworkPlaceProjection {
  placeId: PlaceId;
  visibleRole: string;
  tieSummary: string;
  riskSummary: string;
  confidence: GrayNetworkConfidence;
  visibility: IdentityVisibility;
  relatedActorIds: ActorId[];
  relatedOrganizationIds: OrganizationId[];
  relatedCaseIds: CaseId[];
  updatedAtTurn?: number;
}

export interface GrayNetworkPersonProjection {
  actorId: ActorId;
  visibleRole: string;
  knownTieSummary: string;
  attitudeToPlayer?: string;
  contactDepth?: number;
  riskNote?: string;
  confidence: GrayNetworkConfidence;
  visibility: IdentityVisibility;
  relatedPlaceIds: PlaceId[];
  relatedOrganizationIds: OrganizationId[];
  relatedCaseIds: CaseId[];
  updatedAtTurn?: number;
}

export interface GrayNetworkRelationClue {
  clueId: string;
  summary: string;
  certainty: 'fact' | 'claim' | 'rumor' | 'disputed' | 'unknown';
  confidence: GrayNetworkConfidence;
  visibility: IdentityVisibility;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedOrganizationIds: OrganizationId[];
  relatedCaseIds: CaseId[];
  updatedAtTurn?: number;
}

export interface IdentityProjectedActionRisk {
  riskId: string;
  identity: CurrentIdentity;
  title: string;
  level: 'low' | 'medium' | 'high' | 'critical';
  summary: string;
  suggestedMitigation?: string;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  updatedAtTurn?: number;
}

export interface IdentityProjectedSuggestedAction {
  actionId: string;
  identity: CurrentIdentity;
  text: string;
  rationale: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  updatedAtTurn?: number;
}

export interface GrayNetworkProfile {
  areaId: AreaId;
  areaName: string;
  updatedAtTurn?: number;
  updatedAtTime?: GameTime;
  climate: GrayNetworkClimateItem[];
  knownOrganizations: KnownGrayOrganization[];
  keyPlaces: GrayNetworkPlaceProjection[];
  relatedPeople: GrayNetworkPersonProjection[];
  relationClues: GrayNetworkRelationClue[];
  actionRisks: IdentityProjectedActionRisk[];
  suggestedActions: IdentityProjectedSuggestedAction[];
}

export interface GrayNetworksState {
  byAreaId: Record<AreaId, GrayNetworkProfile>;
}

export interface GameTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export type WeatherCondition =
  | 'clear'
  | 'cloudy'
  | 'light_rain'
  | 'heavy_rain'
  | 'thunderstorm'
  | 'typhoon_signal'
  | 'foggy'
  | 'humid_hot'
  | 'cool_dry';

export interface WeatherState {
  label: string;
  condition: WeatherCondition;
  intensity: number;
  impactSummary: string;
  startedAt: GameTime;
  validUntil: GameTime;
  source: 'seasonal' | 'llm';
  tags: string[];
  reason?: string;
}

export interface RuntimeEnvironmentState {
  weather: WeatherState;
}

export interface LastMapMovement {
  turnId: TurnId;
  fromPlaceId: PlaceId;
  fromSceneId?: SceneId;
  toPlaceId: PlaceId;
  toSceneId?: SceneId;
  startedAt: GameTime;
  arrivedAt: GameTime;
  elapsedMinutes: number;
}

export interface RuntimeMapState {
  lastMovement?: LastMapMovement;
}

export interface AttributeBlock {
  body: number;
  action: number;
  perception: number;
  thinking: number;
  negotiation: number;
  will: number;
}

export interface Vitals {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  conditionSummary: string;
}

export type ReputationCircle =
  | 'police'
  | 'neighborhoodMedia'
  | 'triad'
  | 'entertainment'
  | 'business'
  | 'politics';

export interface ReputationEntry {
  visibility: number;
  standing: number;
  summary: string;
}

export type ReputationByCircle = Record<ReputationCircle, ReputationEntry>;

export interface PlayerReputationLogEntry {
  logId: string;
  gameTime: GameTime;
  turnId?: TurnId;
  kind: 'overall' | 'circle';
  circle?: ReputationCircle;
  notorietyDelta?: number;
  overallReputationDelta?: number;
  visibilityDelta?: number;
  standingDelta?: number;
  summary: string;
  reason: string;
}

export interface PlayerReputationState {
  notoriety: number;
  overallReputation: number;
  summary: string;
  circles: ReputationByCircle;
  logs: PlayerReputationLogEntry[];
}

export interface PlayerEconomy {
  cashOnHand: number;
  bankBalance: number;
  monthlyPressure: number;
  financeSummary: string;
}

export interface PlayerProgression {
  level: number;
  experience: number;
  unspentAttributePoints: number;
}

export type FinanceCashflowKind =
  | 'salary'
  | 'rent'
  | 'family_support'
  | 'asset_income'
  | 'asset_expense'
  | 'debt_payment'
  | 'living_cost'
  | 'other';

export type FinanceCashflowDirection = 'income' | 'expense';
export type FinanceAccount = 'cash' | 'bank';

export interface FinanceCashflowItem {
  itemId: string;
  direction: FinanceCashflowDirection;
  kind: FinanceCashflowKind;
  title: string;
  amount: number;
  account: FinanceAccount;
  summary: string;
  activeFromMonth: string;
  activeToMonth?: string;
  relatedAssetItemIds: AssetItemId[];
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  source: 'opening' | 'writeback' | 'monthly_settlement' | 'manual';
  status: 'active' | 'paused' | 'ended';
  visibility: Visibility;
}

export interface FinanceLedgerEntry {
  entryId: string;
  gameTime: GameTime;
  direction: 'income' | 'expense' | 'adjustment';
  amount: number;
  account: FinanceAccount;
  title: string;
  summary: string;
  relatedCashflowItemId?: string;
  relatedAssetItemIds: AssetItemId[];
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  source: 'writeback' | 'monthly_settlement' | 'manual' | 'legacy_economy_patch';
  visibility: Visibility;
}

export interface MonthlyFinanceReport {
  reportId: string;
  monthKey: string;
  generatedAt: GameTime;
  income: number;
  expense: number;
  net: number;
  startingCashOnHand: number;
  startingBankBalance: number;
  endingCashOnHand: number;
  endingBankBalance: number;
  itemSummaries: string[];
  read: boolean;
  archived: boolean;
}

export interface RuntimeFinanceState {
  cashOnHand: number;
  bankBalance: number;
  cashflows: Record<string, FinanceCashflowItem>;
  ledger: FinanceLedgerEntry[];
  reports: MonthlyFinanceReport[];
  lastSettledMonthKey: string;
  summary: string;
}

export interface HomeBase {
  placeId?: PlaceId;
  placeName?: string;
  housingType: string;
  summary: string;
  householdSummary: string;
}

export interface GrayLedgerEntry {
  ledgerId: string;
  gameTime: GameTime;
  kind: 'cash' | 'gift' | 'favor' | 'service' | 'other';
  amount?: number;
  itemSummary?: string;
  fromActorId?: ActorId;
  fromSummary: string;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  summary: string;
  playerExplanation?: string;
  exposureRisk: number;
  status: 'hidden' | 'suspected' | 'exposed' | 'settled';
  visibility: Visibility;
}

export type AssetItemId = string;
export type AssetCategory = 'equipment' | 'general' | 'document' | 'valuable' | 'fixedAsset' | 'vehicle';

export interface AssetEvidenceLink {
  caseId: CaseId;
  caseTitle?: string;
  summary: string;
  disputed: boolean;
  disputeSummary?: string;
}

export type ClothingMode = 'duty_uniform' | 'off_duty_plain' | 'formal' | 'disguise' | 'special' | 'sleepwear' | 'other';

export interface PlayerClothingState {
  currentSummary: string;
  mode?: ClothingMode;
  sourceItemId?: AssetItemId;
  sourceItemSignificance?: string;
  lastChangedReason?: string;
  lastChangedAt?: GameTime;
}

export interface AssetWearableProfile {
  wearSummary: string;
  significance?: string;
}

export interface AssetItemBase {
  itemId: AssetItemId;
  category: AssetCategory;
  name: string;
  summary: string;
  detail?: string;
  acquiredAt?: GameTime;
  relatedActorIds: ActorId[];
  relatedCaseIds: CaseId[];
  relatedPlaceIds: PlaceId[];
  evidence?: AssetEvidenceLink;
  wearable?: AssetWearableProfile;
  visibility: Visibility;
  importance: number;
  worldpackAssetData?: Record<string, unknown>;
}

export type StandardAssetCategory = 'equipment' | 'general' | 'document' | 'valuable';

export interface StandardAssetItem extends AssetItemBase {
  category: StandardAssetCategory;
}

export interface FixedAsset extends AssetItemBase {
  category: 'fixedAsset';
  fixedAssetType: 'residence' | 'rentalProperty' | 'businessPremise' | 'storage' | 'parkingSpace' | 'investment' | 'other';
  holdingRelation: 'owned' | 'rented' | 'assigned' | 'familyOwned' | 'managed' | 'mortgaged' | 'unknown';
  primaryUse: 'home' | 'rentalIncome' | 'business' | 'storage' | 'parking' | 'investment' | 'other';
  locationSummary: string;
  placeId?: PlaceId;
  ownershipSummary: string;
  accessSummary: string;
  valueAmount?: number;
  incomeSettlementItemIds: string[];
  expenseSettlementItemIds: string[];
}

export interface VehicleAsset extends AssetItemBase {
  category: 'vehicle';
  vehicleType: 'privateCar' | 'motorcycle' | 'taxi' | 'policeVehicle' | 'boat' | 'publicTransportPass' | 'other';
  holdingRelation: 'owned' | 'rented' | 'assigned' | 'borrowed' | 'keptForOther' | 'seized' | 'unknown';
  condition: 'good' | 'usable' | 'poor' | 'broken' | 'unknown';
  locationSummary: string;
  accessSummary: string;
  valueAmount?: number;
  mobilityProfile?: {
    mode: 'walk' | 'publicTransit' | 'taxi' | 'car' | 'motorcycle' | 'boat' | 'policeVehicle';
    timeMultiplier: number;
    availabilitySummary: string;
  };
  incomeSettlementItemIds: string[];
  expenseSettlementItemIds: string[];
}

export type AssetItem = StandardAssetItem | FixedAsset | VehicleAsset;

export interface RuntimeAssetsState {
  items: Record<AssetItemId, AssetItem>;
  equippedItemIds: AssetItemId[];
}

export interface Trait {
  traitId: TraitId;
  name: string;
  source: 'opening' | 'worldpack' | 'fixed_actor' | 'llm_generated' | 'story_earned' | 'training_earned';
  description: string;
  effectSummary: string;
  scopes: string[];
  status: 'active' | 'dormant' | 'weakened' | 'removed';
  evidenceMemoryId?: MemoryId;
  visibility: Visibility;
}

export interface TraitProgress {
  traitId: TraitId;
  name: string;
  progress: number;
  maxProgress: number;
  reason: string;
  updatedTurnId?: TurnId;
}

export interface OriginBackground {
  originBackgroundId: string;
  name: string;
  definition: string;
  backgroundSummary: string;
}

export interface ActorMemory {
  memoryId: MemoryId;
  text: string;
  gameTime: GameTime;
  importance: number;
  source: 'scene' | 'writeback' | 'opening' | 'manual';
  visibility: Visibility;
}

export type RoleProfileStatus = 'active' | 'hidden' | 'suspended' | 'retired' | 'cover' | 'none';

export interface PoliceRoleProfile {
  status: RoleProfileStatus;
  agencyId?: OrganizationId;
  stationOrPost?: string;
  department?: string;
  rank?: string;
  assignmentSummary?: string;
  postRole?: string;
  supervisorActorIds: ActorId[];
  peerActorIds: ActorId[];
  authoritySummary: string;
  accessSummary: string;
  dutySummary: string;
  institutionalReputation: string;
  disciplinePressureSummary: string;
  covertStatus?: string;
}

export interface TriadRoleProfile {
  status: RoleProfileStatus;
  organizationId?: OrganizationId;
  societyName?: string;
  roleTitle?: string;
  rankSummary?: string;
  territorySummary?: string;
  patronActorIds: ActorId[];
  peerActorIds: ActorId[];
  rivalActorIds: ActorId[];
  coverIdentitySummary?: string;
  obligationSummary: string;
  riskSummary: string;
}

export interface CivilianRoleProfile {
  status: RoleProfileStatus;
  publicOccupation?: string;
  workplacePlaceId?: PlaceId;
  communitySummary: string;
  familyEconomicSummary: string;
  legalStatusSummary: string;
}

export interface ActorRoleProfiles {
  police?: PoliceRoleProfile;
  triad?: TriadRoleProfile;
  civilian?: CivilianRoleProfile;
  [profileKey: string]: PoliceRoleProfile | TriadRoleProfile | CivilianRoleProfile | undefined;
}

export type AdultPrivateProfilePartKey = '胸部' | '小穴' | '屁穴';

export interface ActorAdultPrivateProfilePart {
  description?: string;
  imagePromptAnchor?: string;
  updatedAt?: GameTime;
}

export interface ActorAdultPrivateWombRecord {
  date?: string;
  description: string;
  pregnancyCheckDate?: string;
}

export type PregnancyRiskType = 'unprotected' | 'tryingToConceive' | 'reducedRisk';

export type PregnancyLifecycleStatus = 'pending_check' | 'suspected' | 'confirmed' | 'delivery_due' | 'postpartum';

export type PregnancyCheckResult = 'positive' | 'negative';

export interface ActorPregnancyPaternityCandidate {
  actorId?: ActorId;
  name?: string;
  visibility: Visibility;
}

export interface ActorPregnancyState {
  pregnancyId: string;
  status: PregnancyLifecycleStatus;
  registeredAt: GameTime;
  checkDueAt: GameTime;
  confirmationDueAt: GameTime;
  deliveryWindowAt: GameTime;
  dueAt: GameTime;
  deliveryDeadlineAt: GameTime;
  suspectedAt?: GameTime;
  confirmedAt?: GameTime;
  deliveredAt?: GameTime;
  postpartumUntil?: GameTime;
  chancePercent: number;
  rollPercent: number;
  riskTypes: PregnancyRiskType[];
  riskSummaries: string[];
  paternityCandidates: ActorPregnancyPaternityCandidate[];
  childActorId?: ActorId;
  childName?: string;
}

export interface ActorPregnancyCheckRecord {
  checkedAt: GameTime;
  result: PregnancyCheckResult;
  cooldownUntil: GameTime;
}

export interface ActorPregnancyHistoryRecord {
  pregnancyId: string;
  startedAt: GameTime;
  endedAt: GameTime;
  outcome: 'live_birth' | 'pregnancy_ended';
  summary: string;
  childActorId?: ActorId;
  fatherActorId?: ActorId;
}

export interface ActorAdultPrivateWombProfile {
  status: string;
  cervixStatus: string;
  records: ActorAdultPrivateWombRecord[];
  pregnancy?: ActorPregnancyState;
  lastPregnancyCheck?: ActorPregnancyCheckRecord;
  pregnancyHistory?: ActorPregnancyHistoryRecord[];
}

export interface ActorAdultPrivateProfile {
  enabled: boolean;
  ageConfirmedAdult: boolean;
  profileStatus?: string;
  womb?: ActorAdultPrivateWombProfile;
  partProfiles?: Partial<Record<AdultPrivateProfilePartKey, ActorAdultPrivateProfilePart>>;
  fetishNotes?: string;
  sensitivePoints?: string;
  summary?: string;
  preferenceNotes?: string;
  boundaryNotes?: string;
  sensitiveNotes?: string;
  relationshipRiskNotes?: string;
  updatedAt?: GameTime;
  source?: 'opening' | 'writeback' | 'manual' | 'imported';
}

export interface ActorFemaleRelationshipEdge {
  targetName: string;
  relation: string;
  note?: string;
}

export interface ActorFemaleProfile {
  birthday?: string;
  addressToPlayer?: string;
  relationshipNotes?: string;
  publicIntimacyNotes?: string;
  appearanceDescription?: string;
  bodyDescription?: string;
  clothingStyle?: string;
  appearanceExtension?: string;
  personalityCore?: string;
  affectionProgressionCondition?: string;
  relationshipProgressionCondition?: string;
  relationshipNetwork?: string[];
  relationshipNetworkEdges?: ActorFemaleRelationshipEdge[];
  emotionalBoundary?: string;
  adultPrivateProfile?: ActorAdultPrivateProfile;
  updatedAt?: GameTime;
  source?: 'opening' | 'writeback' | 'manual' | 'imported';
}

export interface Actor {
  actorId: ActorId;
  name: string;
  englishName?: string;
  aliases: string[];
  callName?: string;
  gender: 'male' | 'female' | 'nonbinary' | 'unknown';
  policeNumber?: string;
  birthDate?: string;
  computedAge?: number;
  visualAgeAnchor?: string;
  currentIdentity: CurrentIdentity;
  publicIdentity?: string;
  actualIdentitySummary?: string;
  roleProfiles: ActorRoleProfiles;
  organizationIds: OrganizationId[];
  organizationRelations: ActorOrganizationRelation[];
  positionSummary: string;
  currentPlaceId?: PlaceId;
  currentSceneId?: SceneId;
  presence: ActorPresence;
  lastSeenAt?: GameTime;
  lastSeenPlaceId?: PlaceId;
  profileSummary: string;
  appearance: string;
  clothing: string;
  equipment: string[];
  personality: string;
  speechStyle: string;
  motivation: string;
  longTermGoal: string;
  values: string;
  vitals?: Vitals;
  attributes: AttributeBlock;
  activeTraits: Trait[];
  traitProgress: TraitProgress[];
  statusSummary: string;
  bodyConditionSummary?: string;
  relationshipSummary: string;
  attitudeTowardPlayer: string;
  interactionScore: number;
  trustTendency: string;
  entanglementSummary: string;
  longTermMemorySummary: string;
  recentInteractionMemory: string;
  keyMemories: ActorMemory[];
  femaleProfile?: ActorFemaleProfile;
  parentActorIds?: ActorId[];
  childActorIds?: ActorId[];
  visibility: Visibility;
  importance: number;
  worldpackActorData?: Record<string, unknown>;
}

export interface ActorOrganizationRelation {
  organizationId: OrganizationId;
  relationType: ActorOrganizationRelationType | string;
  roleTitle?: string;
  departmentOrUnit?: string;
  summary: string;
  visibility: 'public' | 'player_known' | 'hidden';
  isPrimary?: boolean;
}

export type SecretFactOwnerType = 'actor' | 'player' | 'organization' | 'case' | 'place';
export type SecretFactKind = 'identity' | 'loyalty' | 'relationship' | 'risk' | 'control' | 'other';
export type SecretFactRevealState =
  | 'hidden'
  | 'known_to_player_character'
  | 'known_to_some_actors'
  | 'publicly_revealed';

export interface SecretFact {
  secretId: SecretFactId;
  ownerType: SecretFactOwnerType;
  ownerId: string;
  kind: SecretFactKind;
  summary: string;
  playerCharacterKnown: boolean;
  publicKnown: boolean;
  knownByActorIds: ActorId[];
  revealState: SecretFactRevealState;
  revealConditions: string[];
  visibility: 'hidden' | 'player_known' | 'public';
  importance: number;
  createdAt: GameTime;
  updatedAt: GameTime;
}

export type PlayerIdentityTransitionKind =
  | 'join'
  | 'leave'
  | 'cover_enter'
  | 'cover_exit'
  | 'exposure'
  | 'correction';

export interface PlayerIdentityTransitionRecord {
  transitionId: string;
  kind: PlayerIdentityTransitionKind;
  fromIdentity: CurrentIdentity;
  toIdentity: CurrentIdentity;
  publicIdentity: string;
  reason: string;
  occurredAt: GameTime;
  secretFactIds: SecretFactId[];
}

export interface PlayerProfile {
  actorId: ActorId;
  name: string;
  englishName?: string;
  gender: Actor['gender'];
  policeNumber?: string;
  birthDate?: string;
  currentIdentity: CurrentIdentity;
  originIdentity: CurrentIdentity;
  identityHistory: PlayerIdentityTransitionRecord[];
  originBackground: OriginBackground;
  personality: string;
  appearance: string;
  clothing: string;
  clothingState?: PlayerClothingState;
  equipment: string[];
  economy: PlayerEconomy;
  progression: PlayerProgression;
  reputation: PlayerReputationState;
  homeBase: HomeBase;
  vitals: Vitals;
  cantoneseFlavor: CantoneseFlavorLevel;
  attributes: AttributeBlock;
  activeTraits: Trait[];
  traitProgress: TraitProgress[];
}

export interface LawIdentityRuntime {
  status: 'none' | 'active' | 'hidden' | 'suspended' | 'disconnected';
  agencyId?: OrganizationId;
  stationOrPost?: string;
  department?: string;
  rank?: string;
  assignmentSummary?: string;
  supervisorActorIds: ActorId[];
  peerActorIds: ActorId[];
  authoritySummary: string;
  accessSummary: string;
  dutySummary: string;
  institutionalReputation: string;
  disciplinePressureSummary: string;
  covertStatus?: string;
}

export type PoliceClimateKey =
  | 'discipline_pressure'
  | 'integrity_pressure'
  | 'media_attention'
  | 'triad_activity'
  | 'public_trust'
  | 'internal_morale'
  | 'supervisor_attitude'
  | 'district_pressure'
  | 'other';

export interface PoliceCareerPathState {
  currentRank: string;
  targetRank?: string;
  routeSummary: string;
  knownRequirements: string[];
  dynamicAssessment: Record<string, string>;
  opportunities: string[];
  obstacles: string[];
  suggestedActions: string[];
  updatedAt?: GameTime;
}

export interface PoliceClimateEntry {
  key: PoliceClimateKey;
  label: string;
  level: string;
  summary: string;
  updatedAt?: GameTime;
}

export interface PolicePanelState {
  institutionName: string;
  institutionNameEn: string;
  eraSummary: string;
  localChain: string[];
  unitName: string;
  unitSummary: string;
  rankBoundary: {
    can: string[];
    cannot: string[];
    contacts: string[];
  };
  careerPath: PoliceCareerPathState;
  climate: PoliceClimateEntry[];
  relatedActorIds: ActorId[];
  actionHints: string[];
  updatedAt?: GameTime;
  worldpackPoliceData?: Record<string, unknown>;
}

export type CaseStatus =
  | 'intake'
  | 'investigating'
  | 'submitted_to_prosecutions'
  | 'prosecution_review'
  | 'charged'
  | 'court_scheduled'
  | 'tried'
  | 'sentenced'
  | 'returned'
  | 'archived'
  | 'cold';

export type CasePlayerRole = 'lead' | 'assist' | 'execute' | 'involved' | 'aware';

export type CaseEvidenceType =
  | 'physical'
  | 'document'
  | 'statement'
  | 'photo'
  | 'recording'
  | 'scene_record'
  | 'report'
  | 'other';

export type CaseActivityKind =
  | 'created'
  | 'evidence_added'
  | 'status_changed'
  | 'lead_changed'
  | 'actor_added'
  | 'place_added'
  | 'instruction'
  | 'prosecution_update'
  | 'court_update'
  | 'archived'
  | 'note';

export type DynamicVisibility = 'known' | 'hidden';
export type CurrentMatterStatus = 'active' | 'dormant' | 'resolved' | 'archived';
export type CurrentMatterKind =
  | 'personal'
  | 'police_work'
  | 'relationship'
  | 'family'
  | 'social'
  | 'risk'
  | 'opportunity'
  | 'case'
  | 'world';
export type CurrentMatterPressureLevel = 0 | 1 | 2 | 3;
export type CurrentMatterResponseWindow = 'now' | 'today' | 'soon' | 'open';
export type SignalType = 'rumor' | 'street' | 'police' | 'media' | 'organization' | 'family' | 'other';
export type SignalReliability = 'unknown' | 'low' | 'medium' | 'high';
export type SignalStatus = 'active' | 'stale' | 'resolved' | 'archived';
export type NewsArticleSection =
  | 'front_page'
  | 'local'
  | 'crime'
  | 'entertainment'
  | 'business'
  | 'politics'
  | 'world'
  | 'society'
  | 'gossip'
  | 'other';

export type CurrentMatterId = string;
export type SignalId = string;
export type NewsIssueId = string;
export type NewsArticleId = string;
export type CitySituationTrackId = string;

export type CitySituationTrackType =
  | 'film_production'
  | 'triad_expansion'
  | 'leadership_transition'
  | 'police_operation'
  | 'icac_investigation'
  | 'government_policy'
  | 'media_campaign'
  | 'market_pressure'
  | 'public_safety'
  | 'labor_dispute';

export type EvolutionVisibility = 'hidden' | 'rumor' | 'public' | 'player_known';

export interface EvolutionSourceRefs {
  actorIds: ActorId[];
  caseIds: CaseId[];
  placeIds: PlaceId[];
  organizationIds: OrganizationId[];
  relationshipThreadIds: string[];
  cityTrackIds: CitySituationTrackId[];
  deferredEventIds: DeferredEventId[];
  outcomeIds: string[];
}

export type NpcEvolutionTrackStatus = 'planned' | 'active' | 'blocked' | 'settled' | 'cancelled';

export type NpcEvolutionOutcomeKind =
  | 'progress'
  | 'no_result'
  | 'blocked'
  | 'failed'
  | 'handoff'
  | 'abandoned';

export type NpcEvolutionActionKind =
  | 'work'
  | 'relationship'
  | 'case'
  | 'organization'
  | 'movement'
  | 'personal'
  | 'risk'
  | 'other';

export interface NpcEvolutionTrack {
  trackId: string;
  actorId: ActorId;
  status: NpcEvolutionTrackStatus;
  actionKind: NpcEvolutionActionKind;
  objective: string;
  currentAction: string;
  currentStatus: string;
  currentPlaceId?: PlaceId;
  startedAt?: GameTime;
  expectedEndAt?: GameTime;
  nextReviewAt: GameTime;
  relatedActorIds: ActorId[];
  relatedOrganizationIds: OrganizationId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedRelationshipThreadIds: string[];
  relatedCityTrackIds: CitySituationTrackId[];
  relatedDeferredEventIds: DeferredEventId[];
  latestOutcomeKind?: NpcEvolutionOutcomeKind;
  latestOutcome?: string;
  lastEvolvedAt?: GameTime;
  lastAppliedReviewKey?: string;
  sourceRefs?: EvolutionSourceRefs;
  foregroundInterruption?: {
    interruptedAt: GameTime;
    foregroundTurnId: string;
    reason: 'present' | 'foreground_writeback';
  };
  visibility: EvolutionVisibility;
}

export type OrganizationEvolutionTrackStatus = 'quiet' | 'planned' | 'active' | 'blocked';

export interface OrganizationEvolutionTrack {
  trackId: string;
  organizationId: OrganizationId;
  status: OrganizationEvolutionTrackStatus;
  objective?: string;
  currentAction?: string;
  currentStatus?: string;
  startedAt?: GameTime;
  expectedEndAt?: GameTime;
  nextReviewAt: GameTime;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedCityTrackIds: CitySituationTrackId[];
  latestOutcomeKind?: NpcEvolutionOutcomeKind;
  latestOutcome?: string;
  lastEvolvedAt?: GameTime;
  lastAppliedReviewKey?: string;
  sourceRefs?: EvolutionSourceRefs;
  visibility: EvolutionVisibility;
}

export interface EvolutionOutcomeRecord {
  outcomeId: string;
  sourceReviewKey: string;
  occurredAt: GameTime;
  sourceKind: 'npc' | 'organization' | 'city' | 'case' | 'relationship' | 'deferred_event';
  sourceId: string;
  title: string;
  summary: string;
  consequence?: string;
  relatedActorIds: ActorId[];
  relatedOrganizationIds: OrganizationId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedRelationshipThreadIds: string[];
  sourceRefs?: EvolutionSourceRefs;
  visibility: EvolutionVisibility;
  significance: 'routine' | 'notable' | 'historic';
}

export interface EvolutionChronicleEntry {
  entryId: string;
  occurredAt: GameTime;
  title: string;
  summary: string;
  longTermImpact: string;
  sourceOutcomeIds: string[];
  relatedActorIds: ActorId[];
  relatedOrganizationIds: OrganizationId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  sourceRefs?: EvolutionSourceRefs;
  visibility: EvolutionVisibility;
}

export interface BackgroundEvolutionRunRecord {
  runId: string;
  reason: 'due' | 'foreground-impact' | 'time-jump' | 'manual';
  status: 'running' | 'succeeded' | 'failed' | 'aborted' | 'skipped';
  requestedAt: GameTime;
  finishedAt?: GameTime;
  selectedReviewKeys: string[];
  appliedPatchCount: number;
  droppedPatchCount: number;
  errorReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationMs?: number;
}

export interface BackgroundEvolutionState {
  npcTracks: Record<string, NpcEvolutionTrack>;
  organizationTracks: Record<string, OrganizationEvolutionTrack>;
  recentOutcomes: EvolutionOutcomeRecord[];
  chronicle: EvolutionChronicleEntry[];
  lastAppliedAt?: GameTime;
  lastOrganizationReviewAt?: GameTime;
  lastRun?: BackgroundEvolutionRunRecord;
}

export interface CurrentMatter {
  id: CurrentMatterId;
  title: string;
  summary: string;
  status: CurrentMatterStatus;
  priority: number;
  visibility: DynamicVisibility;
  source: string;
  matterKind?: CurrentMatterKind;
  pressureLevel?: CurrentMatterPressureLevel;
  responseWindow?: CurrentMatterResponseWindow;
  consequenceHint?: string;
  dueAt?: GameTime;
  currentHook?: string;
  unread?: boolean;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedOrganizationIds: OrganizationId[];
  createdAt: GameTime;
  updatedAt: GameTime;
  lastSeenAt?: GameTime;
}

export interface Signal {
  id: SignalId;
  title: string;
  summary: string;
  signalType: SignalType;
  reliability: SignalReliability;
  status: SignalStatus;
  visibility: DynamicVisibility;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedOrganizationIds: OrganizationId[];
  createdAt: GameTime;
  updatedAt: GameTime;
}

export interface NewsArticle {
  id: NewsArticleId;
  section: NewsArticleSection;
  headline: string;
  body: string;
  tone?: string;
  playerRelated: boolean;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  relatedOrganizationIds: OrganizationId[];
}

export interface NewsIssue {
  id: NewsIssueId;
  date: GameTime;
  outletName: string;
  headline: string;
  summary: string;
  articles: NewsArticle[];
  createdAt: GameTime;
  updatedAt: GameTime;
  read: boolean;
  important?: boolean;
  archivedAt?: GameTime;
}

export interface CitySituationTrack {
  trackId: CitySituationTrackId;
  title: string;
  trackType: CitySituationTrackType;
  status: 'latent' | 'active' | 'escalating' | 'cooling' | 'resolved';
  pressureLevel: number;
  visibility: 'hidden' | 'rumor' | 'public' | 'player_known';
  startedAt: GameTime;
  nextReviewAt?: GameTime;
  cadenceDays?: number;
  relatedOrganizationIds: OrganizationId[];
  relatedPowerFigureIds: string[];
  relatedPlaceIds: PlaceId[];
  relatedActorIds: ActorId[];
  summary: string;
  currentBeat: string;
  possibleDevelopments: string[];
  lastOutputTurnId?: TurnId;
}

export type CitySituationTrackPatchOperation = 'upsert' | 'update' | 'resolve';

export interface CitySituationTrackPatch {
  operation: CitySituationTrackPatchOperation;
  trackId: CitySituationTrackId;
  title?: string;
  trackType?: CitySituationTrackType;
  status?: CitySituationTrack['status'];
  pressureLevel?: number;
  visibility?: CitySituationTrack['visibility'];
  startedAt?: GameTime;
  nextReviewAt?: GameTime;
  cadenceDays?: number;
  relatedOrganizationIds?: OrganizationId[];
  relatedPowerFigureIds?: string[];
  relatedPlaceIds?: PlaceId[];
  relatedActorIds?: ActorId[];
  summary?: string;
  currentBeat?: string;
  possibleDevelopments?: string[];
}

export interface DynamicEventsState {
  currentMatters: Record<CurrentMatterId, CurrentMatter>;
  signals: Record<SignalId, Signal>;
  newsIssues: Record<NewsIssueId, NewsIssue>;
}

export type RelationshipThreadKind = 'network' | 'fate';

export type RelationshipThreadStatus = 'active' | 'dormant' | 'strained' | 'ended';

export type RelationshipThreadHeartbeatType = 'encounter' | 'message' | 'rumor' | 'obligation' | 'risk' | 'memory';

export type RelationshipCreationBasis =
  | 'family'
  | 'formal_partner'
  | 'formal_informant'
  | 'debt_or_promise'
  | 'protection'
  | 'ongoing_joint_matter'
  | 'repeated_contact'
  | 'sustained_conflict';

export interface RelationshipEvidenceRef {
  kind: 'current_turn' | 'memory' | 'case' | 'deferred_event';
  refId: string;
  summary: string;
}

export interface RelationshipThreadMilestone {
  milestoneId: string;
  gameTime: GameTime;
  summary: string;
  importance: number;
  relatedActorIds: ActorId[];
  visibility: Visibility;
}

export interface RelationshipThread {
  threadId: string;
  kind: RelationshipThreadKind;
  title: string;
  summary: string;
  relatedActorIds: ActorId[];
  primaryActorId?: ActorId;
  relationshipRole: string;
  creationBasis?: RelationshipCreationBasis;
  evidenceRefs?: RelationshipEvidenceRef[];
  status: RelationshipThreadStatus;
  intimacySummary?: string;
  trustSummary?: string;
  conflictSummary?: string;
  promiseSummary?: string;
  riskSummary?: string;
  currentPull?: string;
  nextNaturalBeatHint?: string;
  lastHeartbeatAt?: GameTime;
  heartbeatCooldownUntil?: GameTime;
  milestones: RelationshipThreadMilestone[];
  visibility: Visibility;
  importance: number;
  createdAt: GameTime;
  updatedAt: GameTime;
}

export interface RelationshipHeartbeatCandidate {
  threadId: string;
  kind: RelationshipThreadKind;
  title: string;
  relatedActorIds: ActorId[];
  beatType: RelationshipThreadHeartbeatType;
  summary: string;
  reason: string;
  importance: number;
}

export type DeferredEventSourceModule =
  | 'case'
  | 'npc'
  | 'news'
  | 'finance'
  | 'faction'
  | 'police'
  | 'world'
  | 'organization'
  | 'grayNetwork'
  | 'reputation'
  | 'storypack'
  | 'dynamic'
  | 'relationship';

export interface CaseEvidence {
  evidenceId: CaseEvidenceId;
  caseId: CaseId;
  title: string;
  evidenceType: CaseEvidenceType;
  sourceSummary: string;
  summary: string;
  submittedByActorId?: ActorId;
  submittedAt?: GameTime;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedAssetItemId?: AssetItemId;
  disputeSummary?: string;
  visibility: Visibility;
  createdAt: GameTime;
  updatedAt: GameTime;
}

export interface CaseActivityEntry {
  activityId: string;
  kind: CaseActivityKind;
  gameTime: GameTime;
  summary: string;
  actorId?: ActorId;
  relatedEvidenceIds: CaseEvidenceId[];
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  visibleToPlayer: boolean;
}

export interface CaseFile {
  caseId: CaseId;
  title: string;
  caseType: string;
  status: CaseStatus;
  playerRole: CasePlayerRole;
  leadActorId?: ActorId;
  leadActorName?: string;
  summary: string;
  currentFocus: string;
  playerVisibleProgress: string;
  internalProgressSummary: string;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedOrganizationIds: OrganizationId[];
  evidenceIds: CaseEvidenceId[];
  activityLog: CaseActivityEntry[];
  unreadActivityCount: number;
  lastActivityAt?: GameTime;
  lastSeenActivityAt?: GameTime;
  visibility: Visibility;
  createdAt: GameTime;
  updatedAt: GameTime;
  archivedAt?: GameTime;
}

export interface DeferredEvent {
  eventId: DeferredEventId;
  sourceModule: DeferredEventSourceModule;
  relatedIds: {
    caseId?: CaseId;
    actorId?: ActorId;
    placeId?: PlaceId;
    organizationId?: OrganizationId;
  };
  title: string;
  summary: string;
  triggerAt: GameTime;
  visibility: 'hidden' | 'player_visible' | 'dev_only';
  promptInstruction: string;
  status: 'pending' | 'resolved' | 'cancelled';
  createdAt: GameTime;
  resolvedAt?: GameTime;
}

export interface PressureHook {
  pressureId: PressureId;
  kind: string;
  summary: string;
  status: 'dormant' | 'hinted' | 'active' | 'escalated' | 'resolved';
  severity: number;
  exposureLikelihood: number;
  visibility: Visibility;
  knownByActorIds: ActorId[];
  sourceSummary: string;
  relatedActorIds: ActorId[];
  relatedCaseIds: CaseId[];
  relatedOrganizationIds: OrganizationId[];
  relatedPlaceIds: PlaceId[];
  allowedUses: string[];
  forbiddenUses: string[];
  escalationConditions: string[];
  lastMentionedTurnId?: TurnId;
  cooldownTurns: number;
}

export interface Organization {
  organizationId: OrganizationId;
  name: string;
  type: OrganizationType | string;
  summary: string;
  publicKnowledge: string;
  currentState: string;
  stanceTowardPlayer: string;
  pressureSummary: string;
  structureTree?: OrganizationStructureNode[];
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  visibility: Visibility;
  importance: number;
}

export interface OrganizationStructureNode {
  nodeId: string;
  label: string;
  role: string;
  personName?: string;
  actorId?: ActorId;
  status?: string;
  confidence?: GrayNetworkConfidence | 'unknown';
  summary?: string;
  children?: OrganizationStructureNode[];
}

export interface Place {
  placeId: PlaceId;
  name: string;
  nameZh?: string;
  nameEn?: string;
  aliases?: string[];
  regionId: string;
  districtId?: string;
  type: string;
  category?: string;
  summary: string;
  publicKnowledge: string;
  currentState: string;
  streetAddressText?: string;
  roadAnchors?: string[];
  playerKnownSummary?: string;
  canonical?: boolean;
  source?: 'worldpack_canonical' | 'runtime_generated';
  confidence?: 'high' | 'medium' | 'low';
  historicalNote?: string;
  researchNote?: string;
  owningOrganizationId?: OrganizationId;
  relatedActorIds: ActorId[];
  relatedCaseIds: CaseId[];
  relatedPressureIds: PressureId[];
  visualAnchor?: {
    mapId: string;
    x: number;
    y: number;
    precision: 'exact' | 'approximate' | 'district_only';
    source?: 'worldpack_canonical' | 'manual_calibration' | 'runtime_inferred';
    basisPlaceIds?: PlaceId[];
    note?: string;
  };
}

export interface Scene {
  sceneId: SceneId;
  placeId: PlaceId;
  name: string;
  summary: string;
  temporaryState: string;
  presentActorIds: ActorId[];
}

export interface MemoryItem {
  memoryId: MemoryId;
  text: string;
  kind: 'turn' | 'actor' | 'case' | 'place' | 'world' | 'player';
  tier?: 'short_term' | 'mid_term' | 'long_term';
  relatedActorIds: ActorId[];
  relatedCaseIds: CaseId[];
  relatedPlaceIds: PlaceId[];
  relatedOrganizationIds: OrganizationId[];
  relatedTurnId?: TurnId;
  gameTime: GameTime;
  importance: number;
  visibility: Visibility;
  certainty: 'fact' | 'claim' | 'rumor' | 'disputed' | 'unknown';
  embeddingText?: string;
  embeddingVector?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: string;
  compressedIntoMemoryId?: MemoryId;
  compressedAtTurnId?: TurnId;
  periodStart?: GameTime;
  periodEnd?: GameTime;
}

export interface StoryDiagnosticIssue {
  path: Array<string | number>;
  message: string;
  code?: string;
}

export type JudgementCategory =
  | 'observation'
  | 'chase'
  | 'melee'
  | 'armed'
  | 'firearm'
  | 'crowd'
  | 'negotiation'
  | 'endurance'
  | 'will'
  | 'thinking'
  | 'other';

export type JudgementOutcome =
  | 'critical_success'
  | 'success'
  | 'partial_success'
  | 'failure'
  | 'critical_failure';

export interface JudgementFactor {
  label: string;
  value: number;
  reason: string;
}

export interface JudgementCheck {
  checkId: JudgementCheckId;
  turnId: TurnId;
  gameTime: GameTime;
  title: string;
  category: JudgementCategory;
  targetSummary?: string;
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  difficulty: number;
  score: number;
  margin: number;
  outcome: JudgementOutcome;
  shortSummary: string;
  consequenceSummary?: string;
  factors: JudgementFactor[];
  relatedCombatEventId?: CombatEventId;
  visibility: Visibility;
}

export type CombatEventType = 'chase' | 'melee' | 'armed' | 'firearm' | 'crowd' | 'arrest' | 'escape' | 'other';

export type CombatEventOutcome =
  | 'player_advantage'
  | 'player_wounded'
  | 'opponent_subdued'
  | 'opponent_escaped'
  | 'stalemate'
  | 'interrupted'
  | 'escalated'
  | 'other';

export interface CombatParticipant {
  actorId?: ActorId;
  name: string;
  side: 'player' | 'ally' | 'opponent' | 'third_party' | 'unknown';
  roleSummary: string;
  conditionAfter?: string;
}

export interface CombatEvent {
  combatId: CombatEventId;
  turnId: TurnId;
  gameTime: GameTime;
  title: string;
  type: CombatEventType;
  locationId?: PlaceId;
  locationSummary: string;
  participants: CombatParticipant[];
  outcome: CombatEventOutcome;
  intensity: number;
  animationKey?: string;
  combatText: string;
  resultSummary: string;
  consequenceSummary: string;
  judgementCheckIds: JudgementCheckId[];
  relatedActorIds: ActorId[];
  relatedPlaceIds: PlaceId[];
  relatedCaseIds: CaseId[];
  visibility: Visibility;
  unread: boolean;
  createdAt: GameTime;
}

export type TurnApiRoute =
  | 'mainNarrator'
  | 'npcSimulation'
  | 'backgroundEvolution'
  | 'writebackRepair'
  | 'auxiliaryGeneration'
  | 'memorySummary'
  | 'memoryEmbedding';

export interface TurnApiUsage {
  route: TurnApiRoute;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  responseMs: number;
}

export interface StoryTurnMetrics {
  inputTokens?: number;
  outputTokens?: number;
  responseMs?: number;
  apiUsage?: TurnApiUsage[];
}

export interface StoryEntry {
  turnId: TurnId;
  speaker: 'player' | 'narrator';
  text: string;
  gameTime: GameTime;
  summaryText?: string;
  embeddingText?: string;
  embeddingVector?: number[];
  embeddingModel?: string;
  embeddingUpdatedAt?: string;
  suggestedActions?: string[];
  rawNarratorResponse?: string;
  writebackDiagnostics?: StoryDiagnosticIssue[];
  turnMetrics?: StoryTurnMetrics;
  judgementCheckIds?: JudgementCheckId[];
  combatEventIds?: CombatEventId[];
}

export interface PendingActorWritebackRecovery {
  recoveryId: string;
  sourceTurnId: TurnId;
  sourceGameTime: GameTime;
  actorId: ActorId;
  writebackJson: string;
  attemptCount: number;
}

export interface RuntimeState {
  runtimeVersion: 1;
  world: {
    worldpackId: string;
    storypackInfluence: 'off' | 'low' | 'medium' | 'high';
    openingPressure: 'relaxed' | 'routine' | 'standard' | 'tense' | 'high';
  };
  time: GameTime;
  environment: RuntimeEnvironmentState;
  map: RuntimeMapState;
  player: PlayerProfile;
  lawIdentity: LawIdentityRuntime;
  policePanel: PolicePanelState;
  grayNetworks: GrayNetworksState;
  location: {
    currentPlaceId: PlaceId;
    currentSceneId?: SceneId;
  };
  actors: Record<ActorId, Actor>;
  secretFacts: Record<SecretFactId, SecretFact>;
  pendingActorWritebackRecoveries: PendingActorWritebackRecovery[];
  organizations: Record<OrganizationId, Organization>;
  dynamicEvents: DynamicEventsState;
  citySituationTracks: Record<CitySituationTrackId, CitySituationTrack>;
  backgroundEvolution: BackgroundEvolutionState;
  relationshipThreads: Record<string, RelationshipThread>;
  judgementChecks: Record<JudgementCheckId, JudgementCheck>;
  combatEvents: Record<CombatEventId, CombatEvent>;
  cases: Record<CaseId, CaseFile>;
  caseEvidence: Record<CaseEvidenceId, CaseEvidence>;
  deferredEvents: Record<DeferredEventId, DeferredEvent>;
  pressures: Record<PressureId, PressureHook>;
  finance: RuntimeFinanceState;
  grayLedger: GrayLedgerEntry[];
  assets: RuntimeAssetsState;
  places: Record<PlaceId, Place>;
  scenes: Record<SceneId, Scene>;
  memories: Record<MemoryId, MemoryItem>;
  storyLog: StoryEntry[];
  turnCounter: number;
}

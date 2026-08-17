import type { GameTime } from '../runtime/types';
import type {
  CustomCharacterRevision,
  CustomContentAssetKind,
  CustomContentProjectRevision,
  CustomEventGroupRevision,
  ImportedFactState
} from './assetTypes';
import type {
  CustomEventProgressDecision,
  DramaWritebackRef
} from '../drama/types';
import type { CustomContentAdaptationStatus } from './worldAdaptation';

export interface BoundCustomRevisionSnapshot<T> {
  bindingId: string;
  assetKind: CustomContentAssetKind;
  assetId: string;
  revision: number;
  checksum: string;
  payload: T;
}

export interface CustomProjectSaveAdaptation {
  adaptationId: string;
  projectId: string;
  projectRevision: number;
  worldpackId: string;
  worldpackDescriptorVersion: number;
  scenarioId?: string;
  anchorTime: GameTime;
  chronologyMapping: string[];
  characterAgeRelations: string[];
  placeMappings: Record<string, string>;
  organizationMappings: Record<string, string>;
  technologyMappings: Record<string, string>;
  culturalAndLegalAdaptation: string[];
  hardWorldConstraints: string[];
  status: CustomContentAdaptationStatus;
}

export interface CustomCharacterSaveAdaptation {
  adaptationId: string;
  characterAssetId: string;
  sourceRevision: number;
  projectAdaptationId?: string;
  worldpackId: string;
  anchorTime: GameTime;
  runtimeActorId: string;
  adaptedBirthDate?: string;
  adaptedAgeAtAnchor?: number;
  adaptedPublicIdentity: string;
  adaptedOccupation: string;
  adaptedSocialPosition: string;
  adaptedOrganizationRefs: string[];
  adaptedPlaceRefs: string[];
  adaptedBackgroundSummary: string;
  adaptedContactRoutes: string[];
  status: CustomContentAdaptationStatus;
}

export interface CustomCharacterAdaptationIntent {
  intentId: string;
  bindingId: string;
  instanceId: string;
  reason: 'current_stage' | 'manual';
  status: 'pending' | CustomContentAdaptationStatus;
  requestedStageId?: string;
  requestedTurn: number;
  adaptationId?: string;
}

export interface CustomEventGroupSaveAdaptation {
  adaptationId: string;
  eventGroupId: string;
  sourceRevision: number;
  projectAdaptationId: string;
  worldpackId: string;
  adaptedSummary: string;
  adaptedInvariantCore: string[];
  adaptedMutableElements: string[];
  adaptedRoleBindings: string[];
  adaptedEntryRoutes: string[];
  technologySubstitutions: string[];
  institutionSubstitutions: string[];
  placeSubstitutions: string[];
  unresolvedConflicts: string[];
  status: CustomContentAdaptationStatus;
}

export type CustomCharacterEntryIntentMode =
  | 'manual'
  | 'natural'
  | 'priority'
  | 'asap_contact';

export type CustomCharacterEntryIntentStatus =
  | 'queued'
  | 'seeking_anchor'
  | 'known_of'
  | 'contactable'
  | 'met'
  | 'established'
  | 'paused'
  | 'cancelled';

export interface CustomCharacterEntryIntent {
  intentId: string;
  bindingId: string;
  mode: CustomCharacterEntryIntentMode;
  status: CustomCharacterEntryIntentStatus;
  statusBeforePause?: Exclude<CustomCharacterEntryIntentStatus, 'paused'>;
  targetOutcome: 'contactable' | 'met';
  priorityOrder?: number;
  lastPlannedTurn?: number;
  lastConfirmedExposureTurn?: number;
}

export type CustomEventEntryIntentMode =
  | 'manual'
  | 'natural'
  | 'priority'
  | 'asap';

export type CustomEventEntryIntentStatus =
  | 'queued'
  | 'seeking_anchor'
  | 'anchored'
  | 'engaged'
  | 'paused'
  | 'cancelled';

export interface CustomEventEntryIntent {
  intentId: string;
  instanceId: string;
  mode: CustomEventEntryIntentMode;
  status: CustomEventEntryIntentStatus;
  statusBeforePause?: Exclude<CustomEventEntryIntentStatus, 'paused'>;
  priorityOrder?: number;
  lastPlannedTurn?: number;
  lastConfirmedExposureTurn?: number;
}

export interface CustomCharacterRuntimeBinding {
  characterAssetId: string;
  sourceRevision: number;
  adaptationId: string;
  actorId: string;
}

export type CustomEventGroupInstanceStatus =
  | 'latent'
  | 'seeking_anchor'
  | 'anchored'
  | 'active'
  | 'paused'
  | 'diverged'
  | 'completed'
  | 'abandoned';

export interface CustomEventProgressRecord {
  turnCounter: number;
  stageId: string;
  usedNodeIds: string[];
  decision: CustomEventProgressDecision;
  nextStageId?: string;
  supportingWritebackRefs: DramaWritebackRef[];
  factStateChanges: Array<{
    factId: string;
    state: Exclude<ImportedFactState, 'source_only'>;
    supportingWritebackRefs: DramaWritebackRef[];
  }>;
}

export interface CustomEventGroupInstance {
  instanceId: string;
  eventGroupId: string;
  eventGroupRevision: number;
  projectId: string;
  projectRevision: number;
  adaptationId: string;
  status: CustomEventGroupInstanceStatus;
  statusBeforePause?: Exclude<CustomEventGroupInstanceStatus, 'paused'>;
  currentStageId?: string;
  projectCharacterBindings: Record<string, string>;
  roleBindings: Record<string, string>;
  usedStageIds: string[];
  usedNodeIds: string[];
  /**
   * Per-save interpretation of immutable source facts. Missing entries retain
   * the fact state stored in the bound revision.
   */
  factStateOverrides?: Record<string, ImportedFactState>;
  progressHistory?: CustomEventProgressRecord[];
  resultingWritebackRefs: Array<{
    kind: string;
    id: string;
  }>;
  primaryRuntimeArcRef?: {
    kind: string;
    id: string;
  };
}

export type CustomContentPriorityTargetKind = 'character' | 'event_group';

export interface CustomContentPriorityItem {
  priorityItemId: string;
  targetKind: CustomContentPriorityTargetKind;
  targetId: string;
  projectId?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  statusBeforePause?: 'active' | 'completed' | 'cancelled';
  createdAt: string;
  updatedAt: string;
}

export interface CustomContentDiagnostic {
  diagnosticId: string;
  code: string;
  severity: 'info' | 'warning' | 'blocking';
  summary: string;
  relatedAssetId?: string;
  createdAt: string;
}

export interface RuntimeCustomContentState {
  schemaVersion: 1;
  projectBindings: Array<
    BoundCustomRevisionSnapshot<CustomContentProjectRevision>
  >;
  characterBindings: Array<
    BoundCustomRevisionSnapshot<CustomCharacterRevision>
  >;
  eventGroupBindings: Array<
    BoundCustomRevisionSnapshot<CustomEventGroupRevision>
  >;
  projectAdaptations: Record<string, CustomProjectSaveAdaptation>;
  characterAdaptations: Record<string, CustomCharacterSaveAdaptation>;
  characterAdaptationIntents: CustomCharacterAdaptationIntent[];
  eventGroupAdaptations: Record<string, CustomEventGroupSaveAdaptation>;
  characterEntryIntents: CustomCharacterEntryIntent[];
  eventEntryIntents: CustomEventEntryIntent[];
  characterRuntimeBindings: CustomCharacterRuntimeBinding[];
  eventInstances: CustomEventGroupInstance[];
  priorityItems: CustomContentPriorityItem[];
  recentDiagnostics: CustomContentDiagnostic[];
}

export interface CustomSaveAdaptationBundle {
  project?: CustomProjectSaveAdaptation;
  characters: CustomCharacterSaveAdaptation[];
  eventGroup?: CustomEventGroupSaveAdaptation;
  diagnostics: CustomContentDiagnostic[];
}

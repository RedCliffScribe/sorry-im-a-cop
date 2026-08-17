import type { RuntimeSaveRecord } from '../../domain/persistence/SaveRepository';
import type {
  CustomCharacterAdaptationIntent,
  CustomCharacterEntryIntent,
  CustomCharacterSaveAdaptation,
  CustomContentPriorityItem,
  CustomEventEntryIntent,
  CustomEventGroupInstance,
  CustomEventGroupSaveAdaptation,
  CustomProjectSaveAdaptation
} from '../../domain/customContent/saveTypes';
import {
  collectCustomEventStageCharacterAssetIds,
  resolveCustomEventCurrentStage
} from '../../domain/customContent/lazyCharacterAdaptation';
import type { CustomContentAdaptationStatus } from '../../domain/customContent/worldAdaptation';
import type { RuntimeState } from '../../domain/runtime/types';
import type {
  CustomCharacterRevision,
  CustomContentProjectRevision,
  CustomEventGroupRevision
} from '../../domain/customContent/assetTypes';

export type CurrentSaveContentKind = 'characters' | 'events';

interface CurrentSaveContentEntryBase {
  kind: CurrentSaveContentKind;
  assetId: string;
  bindingId: string;
  revision: number;
  checksum: string;
  title: string;
  summary: string;
  adaptationStatus: CustomContentAdaptationStatus;
  prioritized: boolean;
  priorityStatus?: CustomContentPriorityItem['status'];
  hasWorldFacts: boolean;
}

export interface CurrentSaveCharacterEntry
  extends CurrentSaveContentEntryBase {
  kind: 'characters';
  revisionPayload: CustomCharacterRevision;
  adaptation?: CustomCharacterSaveAdaptation;
  intent?: CustomCharacterEntryIntent;
  projectTitle?: string;
}

export interface CurrentSaveEventEntry extends CurrentSaveContentEntryBase {
  kind: 'events';
  revisionPayload: CustomEventGroupRevision;
  adaptation?: CustomEventGroupSaveAdaptation;
  projectAdaptation?: CustomProjectSaveAdaptation;
  intent?: CustomEventEntryIntent;
  instance?: CustomEventGroupInstance;
  projectTitle?: string;
  lazyCharacters?: Array<{
    characterAssetId: string;
    displayName: string;
    currentStageReferenced: boolean;
    adaptationStatus?: CustomCharacterSaveAdaptation['status'];
    intentStatus?: CustomCharacterAdaptationIntent['status'];
  }>;
}

export type CurrentSaveContentEntry =
  | CurrentSaveCharacterEntry
  | CurrentSaveEventEntry;

export interface CurrentSaveContentLibrary {
  save: Pick<
    RuntimeSaveRecord,
    | 'saveId'
    | 'saveName'
    | 'playerName'
    | 'worldpackId'
    | 'gameDateLabel'
    | 'turnCounter'
    | 'updatedAt'
  >;
  characters: CurrentSaveCharacterEntry[];
  events: CurrentSaveEventEntry[];
  priorityCount: number;
  diagnosticCount: number;
}

export type RuntimeCustomContentLibrary = Omit<
  CurrentSaveContentLibrary,
  'save'
>;

function findProjectTitle(
  projects: Array<{
    assetId: string;
    payload: CustomContentProjectRevision;
  }>,
  projectId: string | undefined
): string | undefined {
  return projects.find((project) => project.assetId === projectId)?.payload
    .title;
}

function priorityForTarget(
  priorityItems: CustomContentPriorityItem[],
  targetId: string
): CustomContentPriorityItem | undefined {
  return priorityItems.find((item) => item.targetId === targetId);
}

export function projectRuntimeCustomContentLibrary(
  runtimeState: RuntimeState
): RuntimeCustomContentLibrary {
  const customContent = runtimeState.customContent;
  if (!customContent) {
    return {
      characters: [],
      events: [],
      priorityCount: 0,
      diagnosticCount: 0
    };
  }

  const projects = customContent.projectBindings.map((binding) => ({
    assetId: binding.assetId,
    payload: binding.payload
  }));
  const characters = customContent.characterBindings.map(
    (binding): CurrentSaveCharacterEntry => {
      const adaptation = Object.values(
        customContent.characterAdaptations
      ).find(
        (item) =>
          item.characterAssetId === binding.assetId &&
          item.sourceRevision === binding.revision
      );
      const intent = customContent.characterEntryIntents.find(
        (item) => item.bindingId === binding.bindingId
      );
      const priority = priorityForTarget(
        customContent.priorityItems,
        binding.bindingId
      );
      const projectId = projects.find((project) =>
        project.payload.characterAssetIds.includes(binding.assetId)
      )?.assetId;
      return {
        kind: 'characters',
        assetId: binding.assetId,
        bindingId: binding.bindingId,
        revision: binding.revision,
        checksum: binding.checksum,
        title: binding.payload.displayName,
        summary: binding.payload.profileSummary,
        adaptationStatus: adaptation?.status ?? 'needs_review',
        prioritized: priority?.status === 'active',
        priorityStatus: priority?.status,
        hasWorldFacts: customContent.characterRuntimeBindings.some(
          (item) =>
            item.characterAssetId === binding.assetId &&
            item.sourceRevision === binding.revision
        ),
        revisionPayload: binding.payload,
        adaptation,
        intent,
        projectTitle: findProjectTitle(projects, projectId)
      };
    }
  );

  const events = customContent.eventGroupBindings.map(
    (binding): CurrentSaveEventEntry => {
      const adaptation = Object.values(
        customContent.eventGroupAdaptations
      ).find(
        (item) =>
          item.eventGroupId === binding.assetId &&
          item.sourceRevision === binding.revision
      );
      const instance = customContent.eventInstances.find(
        (item) =>
          item.eventGroupId === binding.assetId &&
          item.eventGroupRevision === binding.revision
      );
      const intent = instance
        ? customContent.eventEntryIntents.find(
            (item) => item.instanceId === instance.instanceId
          )
        : undefined;
      const priority = instance
        ? priorityForTarget(customContent.priorityItems, instance.instanceId)
        : undefined;
      const projectAdaptation = adaptation
        ? customContent.projectAdaptations[
            adaptation.projectAdaptationId
          ]
        : undefined;
      const currentStage = instance
        ? resolveCustomEventCurrentStage(binding.payload, {
            currentStageId: instance.currentStageId,
            usedStageIds: instance.usedStageIds
          })
        : undefined;
      const currentStageCharacterIds = new Set(
        collectCustomEventStageCharacterAssetIds(
          binding.payload,
          currentStage
        )
      );
      const lazyCharacters = binding.payload.characterRefs.flatMap((ref) => {
        const characterBinding = customContent.characterBindings.find(
          (candidate) =>
            candidate.assetId === ref.assetId &&
            candidate.revision === ref.revision
        );
        if (!characterBinding) return [];
        const characterAdaptation = Object.values(
          customContent.characterAdaptations
        ).find(
          (candidate) =>
            candidate.characterAssetId === ref.assetId &&
            candidate.sourceRevision === ref.revision
        );
        const adaptationIntent = instance
          ? (customContent.characterAdaptationIntents ?? []).find(
              (candidate) =>
                candidate.instanceId === instance.instanceId &&
                candidate.bindingId === characterBinding.bindingId
            )
          : undefined;
        return [
          {
            characterAssetId: ref.assetId,
            displayName: characterBinding.payload.displayName,
            currentStageReferenced: currentStageCharacterIds.has(ref.assetId),
            adaptationStatus: characterAdaptation?.status,
            intentStatus: adaptationIntent?.status
          }
        ];
      });
      const requiredCharacterStatuses = lazyCharacters
        .filter((character) => character.currentStageReferenced)
        .map((character) => character.adaptationStatus);
      const combinedAdaptationStatus =
        requiredCharacterStatuses.includes('incompatible')
          ? 'incompatible'
          : requiredCharacterStatuses.some(
                (status) => status === undefined || status === 'needs_review'
              )
            ? 'needs_review'
            : (adaptation?.status ?? 'needs_review');
      return {
        kind: 'events',
        assetId: binding.assetId,
        bindingId: binding.bindingId,
        revision: binding.revision,
        checksum: binding.checksum,
        title: binding.payload.title,
        summary: binding.payload.summary,
        adaptationStatus: combinedAdaptationStatus,
        prioritized: priority?.status === 'active',
        priorityStatus: priority?.status,
        hasWorldFacts: Boolean(
          instance &&
            (instance.resultingWritebackRefs.length > 0 ||
              instance.primaryRuntimeArcRef)
        ),
        revisionPayload: binding.payload,
        adaptation,
        projectAdaptation,
        intent,
        instance,
        lazyCharacters,
        projectTitle: findProjectTitle(
          projects,
          instance?.projectId ?? binding.payload.projectId
        )
      };
    }
  );

  return {
    characters,
    events,
    priorityCount: customContent.priorityItems.filter(
      (item) => item.status === 'active'
    ).length,
    diagnosticCount: customContent.recentDiagnostics.length
  };
}

export function projectCurrentSaveContentLibrary(
  record: RuntimeSaveRecord
): CurrentSaveContentLibrary {
  return {
    save: {
      saveId: record.saveId,
      saveName: record.saveName,
      playerName: record.playerName,
      worldpackId: record.worldpackId,
      gameDateLabel: record.gameDateLabel,
      turnCounter: record.turnCounter,
      updatedAt: record.updatedAt
    },
    ...projectRuntimeCustomContentLibrary(record.runtimeState)
  };
}

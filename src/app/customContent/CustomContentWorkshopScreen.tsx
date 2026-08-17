import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CustomCharacterConsistencyIssue,
  CustomCharacterDraft,
  CustomCharacterGenerationProgress,
  CustomCharacterGenerationResult
} from '../../domain/customContent/characterCreation';
import {
  filterCustomCharacterGenerationModels
} from '../../domain/customContent/customCharacterModelCatalog';
import {
  createCustomEventProjectDraftFromRevisions,
  createReusableCustomEventCharacterCandidate,
  type CustomEventProjectConsistencyIssue,
  type CustomEventProjectDraft
} from '../../domain/customContent/eventProjectCreation';
import type {
  SaveCustomEventProjectInput
} from '../../domain/customContent/eventProjectManagement';
import type { RuntimeSaveRecord } from '../../domain/persistence/SaveRepository';
import {
  requiresApiKey,
  supportsAuxiliaryRouting
} from '../../domain/settings/apiCapabilities';
import {
  hasPublishableWorldDeployment,
  resolveCustomContentWorldDeployment
} from '../../domain/customContent/worldAdaptation';
import type { AiSettings, ApiProfile } from '../../domain/settings/types';
import type { ImportCustomSourceFileResult } from '../../domain/customContent/sourceImport';
import type {
  CreateCustomLocalExtractionTaskOptions,
  ReauthorizeCustomLocalExtractionTaskOptions
} from '../../domain/customContent/sourceExtractionTasks';
import type {
  CreateCustomSourceAggregationTaskOptions,
  ReauthorizeCustomSourceAggregationTaskOptions
} from '../../domain/customContent/sourceAggregationTasks';
import type {
  CreateCustomSourceProjectBuildTaskOptions,
  ReauthorizeCustomSourceProjectBuildTaskOptions
} from '../../domain/customContent/sourceProjectBuildTasks';
import type { CustomSourceProjectDraftResult } from '../../domain/customContent/sourceProjectBuildSchemas';
import {
  listWorldpackAdaptationDescriptors
} from '../../domain/worldpack/adaptationRegistry';
import {
  CustomCharacterEditor,
  type CustomCharacterEditorSaveRequest
} from './CustomCharacterEditor';
import {
  CustomEventProjectEditor,
  type CustomEventProjectEditorInitialState
} from './CustomEventProjectEditor';
import { CurrentSaveInspector } from './CurrentSaveInspector';
import { CurrentSaveLibraryPanel } from './CurrentSaveLibraryPanel';
import { LongTextSourcePanel } from './LongTextSourcePanel';
import { WorldDeploymentMatrix } from './WorldDeploymentMatrix';
import {
  projectCurrentSaveContentLibrary,
  type CurrentSaveContentEntry
} from './currentSaveLibrary';
import type {
  CustomContentWorkshopEntry,
  CustomContentWorkshopKind,
  CustomContentWorkshopLibrary
} from './workshopLibrary';
import type { LongTextSourceLibraryEntry } from './longTextSourceLibrary';

type WorkshopScope = 'global' | 'current_save';

export const CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY =
  'sorry-im-a-cop-v2-custom-content-generation-route';

interface CustomContentGenerationRoutePreference {
  profileId: string;
  model: string;
}

interface CustomContentWorkshopScreenProps {
  settings: AiSettings;
  library: CustomContentWorkshopLibrary;
  sourceLibrary?: LongTextSourceLibraryEntry[];
  currentSave?: RuntimeSaveRecord;
  currentSaveError?: string;
  isLoading: boolean;
  error?: string;
  onBack: () => void;
  onGenerateCharacter?: (request: {
    profileId: string;
    model: string;
    description: string;
    onProgress: (progress: CustomCharacterGenerationProgress) => void;
  }) => Promise<CustomCharacterGenerationResult>;
  onRefreshCharacterModels?: (profileId: string) => Promise<string[]>;
  onReviewCharacter?: (request: {
    profileId: string;
    model: string;
    draft: CustomCharacterDraft;
  }) => Promise<CustomCharacterConsistencyIssue[]>;
  onSaveCharacter?: (
    request: CustomCharacterEditorSaveRequest
  ) => Promise<void>;
  onSetCharacterAvailability?: (
    entry: CustomContentWorkshopEntry,
    status: 'enabled' | 'disabled' | 'archived'
  ) => Promise<void>;
  onDeleteCharacter?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onSetManyCharacterAvailability?: (
    entries: CustomContentWorkshopEntry[],
    status: 'enabled' | 'disabled' | 'archived'
  ) => Promise<void>;
  onPromoteCharacter?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onExportCharacter?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onImportCharacter?: (input: string) => Promise<'imported' | 'already_present'>;
  onImportContentPackage?: (file: File) => Promise<{
    importedRevisionCount: number;
    skippedRevisionCount: number;
    remapped: boolean;
    packageKind: 'character' | 'event_group' | 'project' | 'author_backup';
  }>;
  onImportSource?: (file: File) => Promise<ImportCustomSourceFileResult>;
  onRunSourceTask?: (taskId: string) => Promise<void>;
  onBuildSourceStructure?: (parseTaskId: string) => Promise<void>;
  onPauseSourceTask?: (taskId: string) => Promise<void>;
  onResumeSourceTask?: (taskId: string) => Promise<void>;
  onCancelSourceTask?: (taskId: string) => Promise<void>;
  onRetrySourceTask?: (taskId: string) => Promise<void>;
  onCreateSourceExtractionTask?: (
    options: CreateCustomLocalExtractionTaskOptions
  ) => Promise<void>;
  onRunSourceExtractionTask?: (taskId: string) => Promise<void>;
  onPauseSourceExtractionTask?: (taskId: string) => Promise<void>;
  onResumeSourceExtractionTask?: (taskId: string) => Promise<void>;
  onCancelSourceExtractionTask?: (taskId: string) => Promise<void>;
  onRetrySourceExtractionTask?: (taskId: string) => Promise<void>;
  onReauthorizeSourceExtractionTask?: (
    taskId: string,
    options: ReauthorizeCustomLocalExtractionTaskOptions
  ) => Promise<void>;
  onCreateSourceAggregationTask?: (
    options: CreateCustomSourceAggregationTaskOptions
  ) => Promise<void>;
  onRunSourceAggregationTask?: (taskId: string) => Promise<void>;
  onPauseSourceAggregationTask?: (taskId: string) => Promise<void>;
  onResumeSourceAggregationTask?: (taskId: string) => Promise<void>;
  onCancelSourceAggregationTask?: (taskId: string) => Promise<void>;
  onRetrySourceAggregationTask?: (taskId: string) => Promise<void>;
  onReauthorizeSourceAggregationTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceAggregationTaskOptions
  ) => Promise<void>;
  onCreateSourceProjectBuildTask?: (
    options: CreateCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onRunSourceProjectBuildTask?: (taskId: string) => Promise<void>;
  onPauseSourceProjectBuildTask?: (taskId: string) => Promise<void>;
  onResumeSourceProjectBuildTask?: (taskId: string) => Promise<void>;
  onCancelSourceProjectBuildTask?: (taskId: string) => Promise<void>;
  onRetrySourceProjectBuildTask?: (taskId: string) => Promise<void>;
  onReauthorizeSourceProjectBuildTask?: (
    taskId: string,
    options: ReauthorizeCustomSourceProjectBuildTaskOptions
  ) => Promise<void>;
  onExportEventGroup?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onExportProjectShare?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onExportAuthorBackup?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onGenerateEventProject?: (request: {
    profileId: string;
    model: string;
    description: string;
  }) => Promise<CustomEventProjectDraft>;
  onReviewEventProject?: (request: {
    profileId: string;
    model: string;
    draft: CustomEventProjectDraft;
  }) => Promise<CustomEventProjectConsistencyIssue[]>;
  onSaveEventProject?: (
    request: SaveCustomEventProjectInput
  ) => Promise<void>;
  onSetEventAvailability?: (
    entry: CustomContentWorkshopEntry,
    status: 'enabled' | 'disabled' | 'archived'
  ) => Promise<void>;
  onDeleteEvent?: (
    entry: CustomContentWorkshopEntry
  ) => Promise<void>;
  onBindCharacterToSave?: (request: {
    entry: CustomContentWorkshopEntry;
    profileId: string;
    model: string;
  }) => Promise<void>;
  onBindEventToSave?: (request: {
    entry: CustomContentWorkshopEntry;
    profileId: string;
    model: string;
  }) => Promise<void>;
  onApproveSaveAdaptation?: (
    entry: CurrentSaveContentEntry
  ) => Promise<void>;
  onSetSavePriority?: (
    entry: CurrentSaveContentEntry,
    prioritized: boolean
  ) => Promise<void>;
  onSetSavePaused?: (
    entry: CurrentSaveContentEntry,
    paused: boolean
  ) => Promise<void>;
  onAbandonSaveEvent?: (
    entry: CurrentSaveContentEntry
  ) => Promise<void>;
}

function loadGenerationRoutePreference():
  | CustomContentGenerationRoutePreference
  | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(
      CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY
    );
    if (!raw) return undefined;
    const parsed = JSON.parse(
      raw
    ) as Partial<CustomContentGenerationRoutePreference>;
    if (
      typeof parsed.profileId !== 'string' ||
      !parsed.profileId.trim() ||
      typeof parsed.model !== 'string' ||
      !parsed.model.trim()
    ) {
      return undefined;
    }
    return {
      profileId: parsed.profileId.trim(),
      model: parsed.model.trim()
    };
  } catch {
    return undefined;
  }
}

function saveGenerationRoutePreference(
  preference: CustomContentGenerationRoutePreference
): void {
  if (
    typeof window === 'undefined' ||
    !preference.profileId.trim() ||
    !preference.model.trim()
  ) {
    return;
  }
  try {
    window.localStorage.setItem(
      CUSTOM_CONTENT_GENERATION_ROUTE_STORAGE_KEY,
      JSON.stringify(preference)
    );
  } catch {
    // A blocked localStorage should not prevent the workshop from operating.
  }
}

function preferredProfile(
  settings: AiSettings,
  preferredProfileId?: string
): ApiProfile | undefined {
  return (
    settings.apiProfiles.find(
      (profile) => profile.id === preferredProfileId
    ) ??
    settings.apiProfiles.find(
      (profile) => profile.id === settings.mainNarrator?.apiProfileId
    ) ?? settings.apiProfiles[0]
  );
}

function preferredModel(
  settings: AiSettings,
  profile: ApiProfile | undefined,
  preferredModelId?: string
): string {
  const preferredModels = filterCustomCharacterGenerationModels(
    profile?.models ?? [],
    false
  );
  if (preferredModelId && preferredModels.includes(preferredModelId)) {
    return preferredModelId;
  }
  if (
    profile &&
    settings.mainNarrator?.apiProfileId === profile.id &&
    preferredModels.includes(settings.mainNarrator.model)
  ) {
    return settings.mainNarrator.model;
  }
  return preferredModels[0] ?? profile?.models[0] ?? '';
}

function resolveGenerationRoute(
  settings: AiSettings,
  preference?: CustomContentGenerationRoutePreference
): CustomContentGenerationRoutePreference {
  const profile = preferredProfile(settings, preference?.profileId);
  return {
    profileId: profile?.id ?? '',
    model: preferredModel(settings, profile, preference?.model)
  };
}

function lifecycleLabel(entry: CustomContentWorkshopEntry): string {
  if (entry.lifecycle.availabilityStatus === 'archived') return '已归档';
  if (entry.lifecycle.generationStatus === 'failed') return '生成失败';
  if (entry.lifecycle.reviewStatus === 'needs_review') return '待审核';
  if (entry.lifecycle.reviewStatus === 'draft') return '草稿';
  return entry.lifecycle.availabilityStatus === 'enabled' ? '已启用' : '已停用';
}

function lifecycleTone(entry: CustomContentWorkshopEntry): string {
  if (entry.lifecycle.availabilityStatus === 'archived') return 'archived';
  if (entry.lifecycle.generationStatus === 'failed') return 'failed';
  if (
    entry.lifecycle.reviewStatus === 'needs_review' ||
    entry.lifecycle.reviewStatus === 'draft'
  ) {
    return 'needs-review';
  }
  return entry.lifecycle.availabilityStatus;
}

function scopeLabel(entry: CustomContentWorkshopEntry): string {
  if (entry.kind === 'characters') {
    return entry.global ? '全局人物' : '项目人物';
  }
  return '事件组';
}

function eventProjectInitialState(
  entry: CustomContentWorkshopEntry,
  library: CustomContentWorkshopLibrary
): CustomEventProjectEditorInitialState | undefined {
  const projectId = entry.projectIds[0];
  if (!projectId) return undefined;
  if (!entry.projectAsset || !entry.projectRevision) return undefined;
  const characterEntries = library.characters.filter(
    (item) =>
      entry.projectRevision!.characterAssetIds.includes(item.id) &&
      item.characterAsset &&
      item.characterRevision
  );
  const eventEntries = library.events.filter(
    (item) =>
      entry.projectRevision!.eventGroupIds.includes(item.id) &&
      item.eventGroupAsset &&
      item.eventGroupRevision
  );
  const characterRevisions = characterEntries.flatMap((item) =>
    item.characterRevision ? [item.characterRevision] : []
  );
  const eventGroupRevisions = eventEntries.flatMap((item) =>
    item.eventGroupRevision ? [item.eventGroupRevision] : []
  );
  if (eventGroupRevisions.length === 0) return undefined;
  const draft = createCustomEventProjectDraftFromRevisions({
    project: entry.projectRevision,
    characters: characterRevisions,
    eventGroups: eventGroupRevisions
  });
  for (const candidate of draft.characterCandidates) {
    const characterEntry = characterEntries.find(
      (item) => item.id === candidate.candidateKey
    );
    if (!characterEntry?.global) continue;
    const preservedRef = eventGroupRevisions
      .flatMap((revision) => revision.characterRefs)
      .find((ref) => ref.assetId === candidate.candidateKey);
    if (preservedRef) {
      candidate.revisionRef = { ...preservedRef };
    } else if (characterEntry.characterRevision) {
      candidate.revisionRef =
        createReusableCustomEventCharacterCandidate(
          characterEntry.characterRevision
        ).revisionRef;
    }
  }
  return {
    draft,
    projectDeployments: entry.projectRevision.deployments.map((item) => ({
      ...item
    })),
    eventDeploymentOverrides: Object.fromEntries(
      eventGroupRevisions
        .filter((revision) => !revision.inheritProjectDeployments)
        .map((revision) => [
          revision.eventGroupId,
          revision.deployments?.map((item) => ({ ...item })) ?? []
        ])
    ),
    existing: {
      projectAsset: entry.projectAsset,
      projectRevision: entry.projectRevision,
      characterAssets: Object.fromEntries(
        characterEntries.flatMap((item) =>
          item.characterAsset
            ? [[item.characterAsset.characterAssetId, item.characterAsset]]
            : []
        )
      ),
      eventGroupAssets: Object.fromEntries(
        eventEntries.flatMap((item) =>
          item.eventGroupAsset
            ? [[item.eventGroupAsset.eventGroupId, item.eventGroupAsset]]
            : []
        )
      )
    }
  };
}

export function CustomContentWorkshopScreen({
  settings,
  library,
  sourceLibrary = [],
  currentSave,
  currentSaveError,
  isLoading,
  error,
  onBack,
  onGenerateCharacter,
  onRefreshCharacterModels,
  onReviewCharacter,
  onSaveCharacter,
  onSetCharacterAvailability,
  onDeleteCharacter,
  onSetManyCharacterAvailability,
  onPromoteCharacter,
  onExportCharacter,
  onImportCharacter,
  onImportContentPackage,
  onImportSource,
  onRunSourceTask,
  onBuildSourceStructure,
  onPauseSourceTask,
  onResumeSourceTask,
  onCancelSourceTask,
  onRetrySourceTask,
  onCreateSourceExtractionTask,
  onRunSourceExtractionTask,
  onPauseSourceExtractionTask,
  onResumeSourceExtractionTask,
  onCancelSourceExtractionTask,
  onRetrySourceExtractionTask,
  onReauthorizeSourceExtractionTask,
  onCreateSourceAggregationTask,
  onRunSourceAggregationTask,
  onPauseSourceAggregationTask,
  onResumeSourceAggregationTask,
  onCancelSourceAggregationTask,
  onRetrySourceAggregationTask,
  onReauthorizeSourceAggregationTask,
  onCreateSourceProjectBuildTask,
  onRunSourceProjectBuildTask,
  onPauseSourceProjectBuildTask,
  onResumeSourceProjectBuildTask,
  onCancelSourceProjectBuildTask,
  onRetrySourceProjectBuildTask,
  onReauthorizeSourceProjectBuildTask,
  onExportEventGroup,
  onExportProjectShare,
  onExportAuthorBackup,
  onGenerateEventProject,
  onReviewEventProject,
  onSaveEventProject,
  onSetEventAvailability,
  onDeleteEvent,
  onBindCharacterToSave,
  onBindEventToSave,
  onApproveSaveAdaptation,
  onSetSavePriority,
  onSetSavePaused,
  onAbandonSaveEvent
}: CustomContentWorkshopScreenProps) {
  const generationRoutePreferenceRef = useRef(
    loadGenerationRoutePreference()
  );
  const initialGenerationRoute = resolveGenerationRoute(
    settings,
    generationRoutePreferenceRef.current
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const contentPackageInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CustomContentWorkshopKind>('characters');
  const [scope, setScope] = useState<WorkshopScope>('global');
  const [profileId, setProfileId] = useState(
    initialGenerationRoute.profileId
  );
  const [model, setModel] = useState(initialGenerationRoute.model);
  const [showAllCharacterModels, setShowAllCharacterModels] = useState(false);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [isSourcePanelOpen, setIsSourcePanelOpen] = useState(false);
  const [isCharacterEditorOpen, setIsCharacterEditorOpen] = useState(false);
  const [editingEntry, setEditingEntry] =
    useState<CustomContentWorkshopEntry>();
  const [isEventEditorOpen, setIsEventEditorOpen] = useState(false);
  const [editingEventProject, setEditingEventProject] =
    useState<CustomEventProjectEditorInitialState>();
  const [operationMessage, setOperationMessage] = useState<string>();
  const [operationError, setOperationError] = useState<string>();
  const [isOperationBusy, setIsOperationBusy] = useState(false);
  const [authorBackupConsent, setAuthorBackupConsent] = useState(false);

  const profile = settings.apiProfiles.find((item) => item.id === profileId);
  const selectableModels = useMemo(
    () =>
      kind === 'characters'
        ? filterCustomCharacterGenerationModels(
            profile?.models ?? [],
            showAllCharacterModels
          )
        : profile?.models ?? [],
    [kind, profile?.models, showAllCharacterModels]
  );
  const profileReady = Boolean(
    profile &&
      profile.baseUrl.trim() &&
      model.trim() &&
      (kind !== 'characters' || selectableModels.includes(model)) &&
      supportsAuxiliaryRouting(profile.interfaceType) &&
      (!requiresApiKey(profile.interfaceType) || profile.apiKey.trim())
  );
  const reusableEventCharacters = useMemo(
    () =>
      library.characters.flatMap((entry) =>
        entry.global &&
        entry.characterRevision &&
        entry.characterRevision.lifecycle.generationStatus === 'ready' &&
        entry.characterRevision.lifecycle.reviewStatus === 'approved' &&
        entry.characterRevision.lifecycle.availabilityStatus === 'enabled'
          ? [
              {
                candidate: createReusableCustomEventCharacterCandidate(
                  entry.characterRevision
                )
              }
            ]
          : []
      ),
    [library.characters]
  );
  const entries = kind === 'characters' ? library.characters : library.events;
  const currentSaveLibrary = useMemo(
    () =>
      currentSave
        ? projectCurrentSaveContentLibrary(currentSave)
        : undefined,
    [currentSave]
  );
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) =>
        !normalizedQuery ||
        `${entry.title}\n${entry.summary}`.toLocaleLowerCase().includes(normalizedQuery)
      ),
    [entries, normalizedQuery]
  );
  const selectedEntry =
    filteredEntries.find((entry) => entry.id === selectedId) ?? filteredEntries[0];
  const currentSaveEntries =
    kind === 'characters'
      ? currentSaveLibrary?.characters ?? []
      : currentSaveLibrary?.events ?? [];
  const selectedCurrentSaveEntry =
    currentSaveEntries.find((entry) => entry.assetId === selectedId) ??
    currentSaveEntries[0];
  const selectedDeploymentMode =
    currentSave && selectedEntry
      ? resolveCustomContentWorldDeployment(
          selectedEntry.deployments,
          currentSave.worldpackId
        ).mode
      : 'disabled';
  const selectedAlreadyBound = Boolean(
    currentSaveLibrary &&
      selectedEntry &&
      (selectedEntry.kind === 'characters'
        ? currentSaveLibrary.characters
        : currentSaveLibrary.events
      ).some((entry) => entry.assetId === selectedEntry.id)
  );
  const selectedRequiresAiAdaptation =
    selectedDeploymentMode === 'ai_adapted';
  const selectedCanBind = Boolean(
    currentSave &&
      selectedEntry &&
      selectedEntry.lifecycle.generationStatus === 'ready' &&
      selectedEntry.lifecycle.reviewStatus === 'approved' &&
      selectedEntry.lifecycle.availabilityStatus === 'enabled' &&
      selectedDeploymentMode !== 'disabled' &&
      !selectedAlreadyBound &&
      (selectedEntry.kind === 'events' || selectedEntry.global) &&
      (!selectedRequiresAiAdaptation || profileReady)
  );
  const checkedEntries = library.characters.filter(
    (entry) =>
      !entry.characterWorkingDraft && checkedIds.includes(entry.id)
  );

  useEffect(() => {
    const nextRoute = resolveGenerationRoute(
      settings,
      generationRoutePreferenceRef.current
    );
    setProfileId(nextRoute.profileId);
    setModel(nextRoute.model);
    if (nextRoute.profileId && nextRoute.model) {
      generationRoutePreferenceRef.current = nextRoute;
      saveGenerationRoutePreference(nextRoute);
    }
  }, [settings]);

  useEffect(() => {
    if (
      kind === 'characters' &&
      selectableModels.length > 0 &&
      !selectableModels.includes(model)
    ) {
      const nextModel = selectableModels[0];
      setModel(nextModel);
      if (profileId) {
        const nextRoute = { profileId, model: nextModel };
        generationRoutePreferenceRef.current = nextRoute;
        saveGenerationRoutePreference(nextRoute);
      }
    }
  }, [kind, model, profileId, selectableModels]);

  useEffect(() => {
    setSelectedId(null);
    setQuery('');
    setCheckedIds([]);
    setOperationMessage(undefined);
    setOperationError(undefined);
    setAuthorBackupConsent(false);
  }, [kind, scope]);

  useEffect(() => {
    setAuthorBackupConsent(false);
  }, [selectedId]);

  function changeProfile(nextProfileId: string) {
    const nextProfile = settings.apiProfiles.find(
      (item) => item.id === nextProfileId
    );
    const nextRoute = {
      profileId: nextProfileId,
      model: preferredModel(settings, nextProfile)
    };
    setProfileId(nextRoute.profileId);
    setModel(nextRoute.model);
    if (nextRoute.profileId && nextRoute.model) {
      generationRoutePreferenceRef.current = nextRoute;
      saveGenerationRoutePreference(nextRoute);
    }
  }

  function changeModel(nextModel: string) {
    setModel(nextModel);
    if (profileId && nextModel) {
      const nextRoute = { profileId, model: nextModel };
      generationRoutePreferenceRef.current = nextRoute;
      saveGenerationRoutePreference(nextRoute);
    }
  }

  async function refreshCharacterModels() {
    if (!profileId || !onRefreshCharacterModels) return;
    setOperationError(undefined);
    setIsRefreshingModels(true);
    try {
      const refreshed = await onRefreshCharacterModels(profileId);
      const visible = filterCustomCharacterGenerationModels(
        refreshed,
        showAllCharacterModels
      );
      if (!visible.includes(model)) {
        changeModel(visible[0] ?? '');
      }
      setOperationMessage(`人物生成模型列表已刷新，共 ${visible.length} 个可选文本模型。`);
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '模型列表刷新失败。'
      );
    } finally {
      setIsRefreshingModels(false);
    }
  }

  function openNewCharacter() {
    setEditingEntry(undefined);
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsCharacterEditorOpen(true);
  }

  function openCharacterRevision(entry: CustomContentWorkshopEntry) {
    setEditingEntry(entry);
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsCharacterEditorOpen(true);
  }

  function openNewEventProject() {
    setEditingEventProject(undefined);
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsEventEditorOpen(true);
  }

  function openEventProjectRevision(entry: CustomContentWorkshopEntry) {
    const initialState = eventProjectInitialState(entry, library);
    if (!initialState) {
      setOperationError('找不到事件组所属项目的完整最新 revision。');
      return;
    }
    setEditingEventProject(initialState);
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsEventEditorOpen(true);
  }

  function openGeneratedProjectDraft(result: CustomSourceProjectDraftResult) {
    setEditingEventProject({
      draft: result.draft,
      projectDeployments: [],
      eventDeploymentOverrides: {}
    });
    setOperationError(undefined);
    setOperationMessage(
      '已载入长篇项目草稿；只有在项目编辑器中明确保存后才会建立本地资产。'
    );
    setIsSourcePanelOpen(false);
    setIsEventEditorOpen(true);
  }

  async function runCharacterOperation(
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsOperationBusy(true);
    try {
      await operation();
      setOperationMessage(successMessage);
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '人物管理操作失败。'
      );
    } finally {
      setIsOperationBusy(false);
    }
  }

  async function runEventOperation(
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsOperationBusy(true);
    try {
      await operation();
      setOperationMessage(successMessage);
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '事件管理操作失败。'
      );
    } finally {
      setIsOperationBusy(false);
    }
  }

  async function runSaveOperation(
    operation: () => Promise<void>,
    successMessage: string
  ) {
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsOperationBusy(true);
    try {
      await operation();
      setOperationMessage(successMessage);
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '当前存档操作失败。'
      );
    } finally {
      setIsOperationBusy(false);
    }
  }

  async function importCharacterFile(file: File | undefined) {
    if (!file || !onImportCharacter) return;
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsOperationBusy(true);
    try {
      const result = await onImportCharacter(await file.text());
      setOperationMessage(
        result === 'already_present'
          ? '相同人物 revision 已在本地，无需重复导入。'
          : '人物已导入为待审核、停用状态。'
      );
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '人物导入失败。'
      );
    } finally {
      setIsOperationBusy(false);
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  async function importContentPackageFile(file: File | undefined) {
    if (!file || !onImportContentPackage) return;
    setOperationError(undefined);
    setOperationMessage(undefined);
    setIsOperationBusy(true);
    try {
      const result = await onImportContentPackage(file);
      const kindLabel =
        result.packageKind === 'author_backup'
          ? '作者备份'
          : result.packageKind === 'event_group'
            ? '事件包'
            : result.packageKind === 'project'
              ? '项目包'
              : '人物包';
      setOperationMessage(
        result.importedRevisionCount === 0
          ? `${kindLabel}中的相同 revision 已在本地，无需重复导入。`
          : `${kindLabel}已导入 ${result.importedRevisionCount} 个 revision${
              result.remapped ? '，冲突谱系已复制并统一重映射 ID' : ''
            }；全部保持待审核、停用状态。`
      );
    } catch (caught) {
      setOperationError(
        caught instanceof Error ? caught.message : '内容包导入失败。'
      );
    } finally {
      setIsOperationBusy(false);
      if (contentPackageInputRef.current) {
        contentPackageInputRef.current.value = '';
      }
    }
  }

  function toggleChecked(entryId: string) {
    setCheckedIds((current) =>
      current.includes(entryId)
        ? current.filter((item) => item !== entryId)
        : [...current, entryId]
    );
  }

  return (
    <main className="custom-content-workshop">
      <header className="ccw-header">
        <button type="button" className="ccw-back" onClick={onBack}>
          <span aria-hidden="true">←</span>
          返回首页
        </button>
        <div className="ccw-title-block">
          <p>CUSTOM CONTENT STUDIO</p>
          <h1>自定义内容工坊</h1>
          <span>人物、事件与长篇项目的本地创作空间</span>
        </div>
        <div className="ccw-header-actions">
          <button
            type="button"
            className="ccw-long-text-trigger"
            onClick={() => setIsSourcePanelOpen(true)}
          >
            <span aria-hidden="true">文</span>
            导入长篇
          </button>
          <div className="ccw-local-badge">
            <span aria-hidden="true" />
            本地资产库
          </div>
        </div>
      </header>

      <section className="ccw-generation-route" aria-label="生成线路">
        <div className="ccw-route-intro">
          <strong>生成线路</strong>
          <span>复用当前 API 配置；密钥不会写入内容资产</span>
        </div>
        <label>
          <span>API Profile</span>
          <select
            aria-label="生成接口"
            value={profileId}
            disabled={settings.apiProfiles.length === 0}
            onChange={(event) => changeProfile(event.target.value)}
          >
            {settings.apiProfiles.length === 0 ? (
              <option value="">尚未配置</option>
            ) : null}
            {settings.apiProfiles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.providerLabel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>生成模型</span>
          <select
            aria-label="生成模型"
            value={model}
            disabled={!profile || selectableModels.length === 0}
            onChange={(event) => changeModel(event.target.value)}
          >
            {!profile || selectableModels.length === 0 ? (
              <option value="">没有可用模型</option>
            ) : null}
            {selectableModels.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        {kind === 'characters' ? (
          <div className="ccw-character-model-tools">
            <button
              type="button"
              disabled={!profile || !onRefreshCharacterModels || isRefreshingModels}
              onClick={() => void refreshCharacterModels()}
            >
              {isRefreshingModels ? '刷新中…' : '刷新人物模型'}
            </button>
            <label>
              <input
                type="checkbox"
                checked={showAllCharacterModels}
                onChange={(event) =>
                  setShowAllCharacterModels(event.target.checked)
                }
              />
              显示全部模型
            </label>
          </div>
        ) : null}
      </section>

      <div className="ccw-layout">
        <aside className="ccw-kind-nav" aria-label="内容类型">
          <p>内容类型</p>
          <button
            type="button"
            className={kind === 'characters' ? 'active' : undefined}
            aria-pressed={kind === 'characters'}
            onClick={() => setKind('characters')}
          >
            <span className="ccw-kind-icon" aria-hidden="true">人</span>
            <span><strong>人物</strong><small>{library.characters.length} 项</small></span>
          </button>
          <button
            type="button"
            className={kind === 'events' ? 'active' : undefined}
            aria-pressed={kind === 'events'}
            onClick={() => setKind('events')}
          >
            <span className="ccw-kind-icon" aria-hidden="true">事</span>
            <span><strong>事件</strong><small>{library.events.length} 个事件组</small></span>
          </button>
          <div className="ccw-project-summary">
            <span>内容项目</span>
            <strong>{library.projectCount}</strong>
            <small>所有事件均归属于项目</small>
          </div>
        </aside>

        <section className="ccw-library" aria-label="内容库">
          <div className="ccw-scope-tabs" role="tablist" aria-label="资产范围">
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'global'}
              className={scope === 'global' ? 'active' : undefined}
              onClick={() => setScope('global')}
            >
              全局内容库
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={scope === 'current_save'}
              className={scope === 'current_save' ? 'active' : undefined}
              onClick={() => setScope('current_save')}
            >
              当前存档
            </button>
          </div>

          {scope === 'current_save' ? (
            currentSaveLibrary ? (
              <CurrentSaveLibraryPanel
                library={currentSaveLibrary}
                kind={kind}
                selectedId={selectedCurrentSaveEntry?.assetId ?? null}
                onSelect={(entry) => setSelectedId(entry.assetId)}
                operationMessage={operationMessage}
                operationError={operationError}
              />
            ) : (
              <div className="ccw-empty-state" data-empty-kind="current-save">
                <span className="ccw-empty-glyph" aria-hidden="true">◇</span>
                <h2>{currentSaveError ? '无法加载指定存档' : '尚未加载存档'}</h2>
                <p>{currentSaveError ?? '从首页进入工坊时不会暗中修改任何存档。请从已保存的游戏内打开工坊，才能管理版本绑定、世界适配与呈现意图。'}</p>
              </div>
            )
          ) : (
            <>
              <div className="ccw-library-toolbar">
                <div>
                  <h2>{kind === 'characters' ? '人物资产' : '事件资产'}</h2>
                  <p>{kind === 'characters'
                    ? '全局人物与项目人物使用同一稳定身份。'
                    : '事件组通过所属项目共享人物与世界适配。'}</p>
                </div>
                <div className="ccw-toolbar-controls">
                  <label className="ccw-search">
                    <span className="visually-hidden">搜索内容</span>
                    <span aria-hidden="true">⌕</span>
                    <input
                      type="search"
                      placeholder={kind === 'characters' ? '搜索人物' : '搜索事件'}
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    />
                  </label>
                  {kind === 'characters' ? (
                    <div className="ccw-character-create-actions">
                      <button
                        type="button"
                        disabled={!onImportCharacter || isOperationBusy}
                        onClick={() => importInputRef.current?.click()}
                      >
                        导入人物
                      </button>
                      <input
                        ref={importInputRef}
                        className="visually-hidden"
                        type="file"
                        accept=".json,.cop-character.json,application/json"
                        aria-label="选择人物包"
                        onChange={(event) =>
                          void importCharacterFile(event.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        className="primary"
                        disabled={!onSaveCharacter || isOperationBusy}
                        onClick={openNewCharacter}
                      >
                        新建人物
                      </button>
                    </div>
                  ) : (
                    <div className="ccw-character-create-actions">
                      <button
                        type="button"
                        disabled={!onImportContentPackage || isOperationBusy}
                        onClick={() => contentPackageInputRef.current?.click()}
                      >
                        导入内容包
                      </button>
                      <input
                        ref={contentPackageInputRef}
                        className="visually-hidden"
                        type="file"
                        accept=".cop-event-group.json,.cop-content.zip,.json,.zip,application/json,application/zip"
                        aria-label="选择事件或项目内容包"
                        onChange={(event) =>
                          void importContentPackageFile(event.target.files?.[0])
                        }
                      />
                      <button
                        type="button"
                        className="primary"
                        disabled={!onSaveEventProject || isOperationBusy}
                        onClick={openNewEventProject}
                      >
                        快速创建事件
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {kind === 'characters' && library.characters.length > 0 ? (
                <div className="ccw-bulk-toolbar">
                  <span>已选 {checkedEntries.length} 项</span>
                  <button
                    type="button"
                    disabled={
                      checkedEntries.length === 0 ||
                      !onSetManyCharacterAvailability ||
                      isOperationBusy
                    }
                    onClick={() =>
                      void runCharacterOperation(
                        () =>
                          onSetManyCharacterAvailability!(
                            checkedEntries,
                            'enabled'
                          ),
                        `已启用 ${checkedEntries.length} 个人物。`
                      )
                    }
                  >
                    批量启用
                  </button>
                  <button
                    type="button"
                    disabled={
                      checkedEntries.length === 0 ||
                      !onSetManyCharacterAvailability ||
                      isOperationBusy
                    }
                    onClick={() =>
                      void runCharacterOperation(
                        () =>
                          onSetManyCharacterAvailability!(
                            checkedEntries,
                            'disabled'
                          ),
                        `已停用 ${checkedEntries.length} 个人物。`
                      )
                    }
                  >
                    批量停用
                  </button>
                </div>
              ) : null}

              {operationMessage ? (
                <div className="ccw-operation-message" role="status">
                  {operationMessage}
                </div>
              ) : null}
              {operationError ? (
                <div className="ccw-operation-error" role="alert">
                  {operationError}
                </div>
              ) : null}

              {isLoading ? (
                <div className="ccw-loading" role="status">正在读取本地内容库…</div>
              ) : error ? (
                <div className="ccw-error" role="alert">{error}</div>
              ) : filteredEntries.length === 0 ? (
                <div className="ccw-empty-state" data-empty-kind={kind}>
                  <span className="ccw-empty-glyph" aria-hidden="true">
                    {kind === 'characters' ? '人' : '事'}
                  </span>
                  <h2>{query ? '没有匹配内容' : kind === 'characters' ? '人物库还是空的' : '事件库还是空的'}</h2>
                  <p>{query
                    ? '换一个标题或摘要关键词再试。'
                    : kind === 'characters'
                      ? '使用“新建人物”通过 AI 生成或手动填写第一份人物资产。'
                      : '使用“快速创建事件”通过 AI 生成或手动建立第一个轻量项目。'}</p>
                </div>
              ) : (
                <div className="ccw-entry-list">
                  {filteredEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`ccw-entry-row${selectedEntry?.id === entry.id ? ' active' : ''}`}
                    >
                      {entry.kind === 'characters' ? (
                        <label className="ccw-entry-check">
                          <input
                            type="checkbox"
                            aria-label={`批量选择${entry.title}`}
                            checked={checkedIds.includes(entry.id)}
                            disabled={Boolean(entry.characterWorkingDraft)}
                            onChange={() => toggleChecked(entry.id)}
                          />
                        </label>
                      ) : null}
                      <button
                        type="button"
                        aria-pressed={selectedEntry?.id === entry.id}
                        onClick={() => setSelectedId(entry.id)}
                      >
                        <span className="ccw-entry-monogram" aria-hidden="true">
                          {entry.title.slice(0, 1)}
                        </span>
                        <span className="ccw-entry-copy">
                          <span>
                            <strong>{entry.title}</strong>
                            <small>
                              {entry.characterWorkingDraft
                                ? `${scopeLabel(entry)} · 工作草稿`
                                : `${scopeLabel(entry)} · revision ${entry.revision}`}
                            </small>
                          </span>
                          <p>{entry.summary}</p>
                        </span>
                        <span
                          className={`ccw-lifecycle ccw-lifecycle-${lifecycleTone(entry)}`}
                          data-availability={entry.lifecycle.availabilityStatus}
                        >
                          {lifecycleLabel(entry)}
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </section>

        <aside className="ccw-inspector" aria-label="资产详情">
          <div className="ccw-inspector-heading">
            <p>{scope === 'current_save' ? 'SAVE BINDING' : 'WORLD DEPLOYMENT'}</p>
            <h2>{scope === 'current_save' ? '当前存档绑定' : '世界包投放'}</h2>
          </div>
          {scope === 'current_save' && currentSaveLibrary ? (
            <CurrentSaveInspector
              entry={selectedCurrentSaveEntry}
              library={currentSaveLibrary}
              busy={isOperationBusy}
              onApprove={(entry) =>
                void runSaveOperation(
                  async () => {
                    if (!onApproveSaveAdaptation) {
                      throw new Error('存档适配审核服务尚未连接。');
                    }
                    await onApproveSaveAdaptation(entry);
                  },
                  '存档适配已审核确认，并恢复默认重点意图。'
                )
              }
              onSetPriority={(entry, prioritized) =>
                void runSaveOperation(
                  async () => {
                    if (!onSetSavePriority) {
                      throw new Error('本局重点管理服务尚未连接。');
                    }
                    await onSetSavePriority(entry, prioritized);
                  },
                  prioritized
                    ? '已设为本局重点内容。'
                    : '已取消本局重点，绑定 revision 保持不变。'
                )
              }
              onSetPaused={(entry, paused) =>
                void runSaveOperation(
                  async () => {
                    if (!onSetSavePaused) {
                      throw new Error('存档暂停管理服务尚未连接。');
                    }
                    await onSetSavePaused(entry, paused);
                  },
                  paused ? '已暂停主动推进。' : '已恢复主动推进。'
                )
              }
              onAbandonEvent={(entry) =>
                void runSaveOperation(
                  async () => {
                    if (!onAbandonSaveEvent) {
                      throw new Error('事件放弃服务尚未连接。');
                    }
                    await onAbandonSaveEvent(entry);
                  },
                  '已放弃事件后续主动推进；已经成立的世界事实不会删除。'
                )
              }
            />
          ) : scope === 'global' && selectedEntry ? (
            <>
              <div className="ccw-selected-summary">
                <span>{scopeLabel(selectedEntry)}</span>
                <strong>{selectedEntry.title}</strong>
                <small>
                  {selectedEntry.characterWorkingDraft
                    ? '本地工作草稿，尚未进入正式 revision'
                    : `当前显示不可变 revision ${selectedEntry.revision}`}
                </small>
              </div>
              {currentSave ? (
                <div className="ccw-save-bind-card">
                  <span>当前存档：{currentSave.saveName}</span>
                  <strong>
                    {selectedAlreadyBound
                      ? '该资产已绑定'
                      : selectedDeploymentMode === 'disabled'
                        ? '当前世界包未启用'
                        : selectedEntry.kind === 'characters' &&
                            !selectedEntry.global
                          ? '项目人物随事件组绑定'
                          : selectedRequiresAiAdaptation
                            ? '加入时生成 AI 适配'
                            : '加入时固化原生适配'}
                  </strong>
                  <button
                    type="button"
                    disabled={
                      !selectedCanBind ||
                      isOperationBusy ||
                      (selectedEntry.kind === 'characters'
                        ? !onBindCharacterToSave
                        : !onBindEventToSave)
                    }
                    onClick={() =>
                      void runSaveOperation(
                        async () => {
                          if (selectedEntry.kind === 'characters') {
                            if (!onBindCharacterToSave) {
                              throw new Error('人物存档绑定服务尚未连接。');
                            }
                            await onBindCharacterToSave({
                              entry: selectedEntry,
                              profileId,
                              model
                            });
                            return;
                          }
                          if (!onBindEventToSave) {
                            throw new Error('事件存档绑定服务尚未连接。');
                          }
                          await onBindEventToSave({
                            entry: selectedEntry,
                            profileId,
                            model
                          });
                        },
                        selectedEntry.kind === 'characters'
                          ? '人物 revision 与适配快照已加入当前存档。'
                          : '事件项目 revision、依赖与适配快照已加入当前存档。'
                      )
                    }
                  >
                    {selectedAlreadyBound ? '已加入当前存档' : '加入当前存档'}
                  </button>
                </div>
              ) : null}
              {selectedEntry.kind === 'characters' ? (
                <>
                  <div className="ccw-character-actions">
                    <button
                      type="button"
                      disabled={
                        !onSaveCharacter ||
                        (!selectedEntry.characterWorkingDraft &&
                          (!selectedEntry.characterAsset ||
                            !selectedEntry.characterRevision)) ||
                        isOperationBusy
                      }
                      onClick={() => openCharacterRevision(selectedEntry)}
                    >
                      {selectedEntry.characterWorkingDraft
                        ? '继续编辑工作草稿'
                        : '编辑为新 revision'}
                    </button>
                    <button
                      type="button"
                      disabled={
                        !onExportCharacter ||
                        Boolean(selectedEntry.characterWorkingDraft) ||
                        isOperationBusy
                      }
                      onClick={() =>
                        void runCharacterOperation(
                          () => onExportCharacter!(selectedEntry),
                          '人物包已导出。'
                        )
                      }
                    >
                      导出人物
                    </button>
                    {selectedEntry.global || selectedEntry.characterWorkingDraft ? null : (
                      <button
                        type="button"
                        disabled={!onPromoteCharacter || isOperationBusy}
                        onClick={() =>
                          void runCharacterOperation(
                            () => onPromoteCharacter!(selectedEntry),
                            '已加入全局人物库，人物身份未复制。'
                          )
                        }
                      >
                        加入全局人物库
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        selectedEntry.lifecycle.availabilityStatus === 'enabled'
                          ? 'ccw-action-disable'
                          : 'ccw-action-enable'
                      }
                      disabled={
                        !onSetCharacterAvailability ||
                        Boolean(selectedEntry.characterWorkingDraft) ||
                        isOperationBusy ||
                        (selectedEntry.lifecycle.availabilityStatus !==
                          'enabled' &&
                          (selectedEntry.lifecycle.generationStatus !==
                            'ready' ||
                            selectedEntry.lifecycle.reviewStatus !==
                              'approved' ||
                            !hasPublishableWorldDeployment(
                              selectedEntry.deployments
                            )))
                      }
                      onClick={() =>
                        void runCharacterOperation(
                          () =>
                            onSetCharacterAvailability!(
                              selectedEntry,
                              selectedEntry.lifecycle.availabilityStatus ===
                                'enabled'
                                ? 'disabled'
                                : 'enabled'
                            ),
                          selectedEntry.lifecycle.availabilityStatus ===
                            'enabled'
                            ? '人物已停用并生成新 revision。'
                            : '人物已启用并生成新 revision。'
                        )
                      }
                    >
                      {selectedEntry.lifecycle.availabilityStatus === 'enabled'
                        ? '停用'
                        : selectedEntry.lifecycle.reviewStatus === 'approved'
                          ? '启用'
                          : '需审核后启用'}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={!onDeleteCharacter || isOperationBusy}
                      title="永久删除人物及全部 revision；被任何存档引用时会拒绝删除"
                      onClick={() => {
                        const revisionCount =
                          selectedEntry.characterAsset?.revisionCount ?? 1;
                        if (
                          !window.confirm(
                            selectedEntry.characterWorkingDraft
                              ? `确定删除工作草稿“${selectedEntry.title}”？此操作无法撤销。`
                              : `确定永久删除人物“${selectedEntry.title}”及其 ${revisionCount} 个 revision？此操作无法撤销；如有存档仍在引用，系统会拒绝删除。`
                          )
                        ) {
                          return;
                        }
                        void runCharacterOperation(
                          () => onDeleteCharacter!(selectedEntry),
                          `人物“${selectedEntry.title}”已永久删除。`
                        );
                      }}
                    >
                      {selectedEntry.characterWorkingDraft
                        ? '删除草稿'
                        : '删除人物'}
                    </button>
                  </div>
                  <div className="ccw-character-references">
                    <h3>引用与作用域</h3>
                    <dl>
                      <div>
                        <dt>
                          {selectedEntry.characterWorkingDraft
                            ? '工作草稿 ID'
                            : '稳定资产 ID'}
                        </dt>
                        <dd>{selectedEntry.id}</dd>
                      </div>
                      <div>
                        <dt>所属项目</dt>
                        <dd>
                          {selectedEntry.projectIds.length === 0
                            ? '无'
                            : selectedEntry.projectIds
                                .map(
                                  (projectId) =>
                                    library.projects.find(
                                      (project) => project.id === projectId
                                    )?.title ?? projectId
                                )
                                .join('、')}
                        </dd>
                      </div>
                      <div>
                        <dt>revision 反向引用</dt>
                        <dd>{selectedEntry.incomingReferences.length} 项</dd>
                      </div>
                    </dl>
                  </div>
                </>
              ) : (
                <>
                  <div className="ccw-character-actions">
                    <button
                      type="button"
                      disabled={
                        !onSaveEventProject ||
                        !selectedEntry.eventGroupAsset ||
                        !selectedEntry.eventGroupRevision ||
                        !selectedEntry.projectAsset ||
                        !selectedEntry.projectRevision ||
                        isOperationBusy
                      }
                      onClick={() => openEventProjectRevision(selectedEntry)}
                    >
                      编辑所属项目为新 revision
                    </button>
                    <button
                      type="button"
                      disabled={
                        !onExportEventGroup ||
                        !selectedEntry.eventGroupRevision ||
                        isOperationBusy
                      }
                      onClick={() =>
                        void runEventOperation(
                          () => onExportEventGroup!(selectedEntry),
                          '单事件 JSON 已导出；原始全文未包含。'
                        )
                      }
                    >
                      导出单事件
                    </button>
                    <button
                      type="button"
                      disabled={
                        !onExportProjectShare ||
                        !selectedEntry.projectRevision ||
                        isOperationBusy
                      }
                      onClick={() =>
                        void runEventOperation(
                          () => onExportProjectShare!(selectedEntry),
                          '项目分享包已导出；原始全文未包含。'
                        )
                      }
                    >
                      导出项目分享包
                    </button>
                    {selectedEntry.projectRevision?.sourceDocumentIds.length ? (
                      <label className="ccw-author-backup-consent">
                        <input
                          type="checkbox"
                          checked={authorBackupConsent}
                          onChange={(event) =>
                            setAuthorBackupConsent(event.target.checked)
                          }
                        />
                        我确认备份含原始全文、AI 中间结果和失败信息，并了解版权、隐私及敏感内容风险。
                      </label>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        !onExportAuthorBackup ||
                        !selectedEntry.projectRevision ||
                        selectedEntry.projectRevision.sourceDocumentIds
                          .length === 0 ||
                        !authorBackupConsent ||
                        isOperationBusy
                      }
                      title="包含原始全文、处理中间结果与失败信息，仅供作者本人备份"
                      onClick={() => {
                        void runEventOperation(
                          () => onExportAuthorBackup!(selectedEntry),
                          '作者备份已导出。'
                        ).finally(() => setAuthorBackupConsent(false));
                      }}
                    >
                      作者备份（含原文）
                    </button>
                    <button
                      type="button"
                      className={
                        selectedEntry.lifecycle.availabilityStatus === 'enabled'
                          ? 'ccw-action-disable'
                          : 'ccw-action-enable'
                      }
                      disabled={
                        !onSetEventAvailability ||
                        isOperationBusy ||
                        (selectedEntry.lifecycle.availabilityStatus !==
                          'enabled' &&
                          (selectedEntry.lifecycle.generationStatus !==
                            'ready' ||
                            selectedEntry.lifecycle.reviewStatus !==
                              'approved' ||
                            !hasPublishableWorldDeployment(
                              selectedEntry.deployments
                            )))
                      }
                      onClick={() =>
                        void runEventOperation(
                          () =>
                            onSetEventAvailability!(
                              selectedEntry,
                              selectedEntry.lifecycle.availabilityStatus ===
                                'enabled'
                                ? 'disabled'
                                : 'enabled'
                            ),
                          selectedEntry.lifecycle.availabilityStatus ===
                            'enabled'
                            ? '事件组已停用并生成新 revision。'
                            : '事件组已启用并生成新 revision。'
                        )
                      }
                    >
                      {selectedEntry.lifecycle.availabilityStatus === 'enabled'
                        ? '停用'
                        : selectedEntry.lifecycle.reviewStatus === 'approved'
                          ? '启用'
                          : '需审核后启用'}
                    </button>
                    <button
                      type="button"
                      className="danger"
                      disabled={!onDeleteEvent || isOperationBusy}
                      title="永久删除事件组及全部 revision；被任何存档引用时会拒绝删除"
                      onClick={() => {
                        const revisionCount =
                          selectedEntry.eventGroupAsset?.revisionCount ?? 1;
                        if (
                          !window.confirm(
                            `确定永久删除事件“${selectedEntry.title}”及其 ${revisionCount} 个 revision？所属项目、来源和项目人物会保留；如有存档仍在引用，系统会拒绝删除。`
                          )
                        ) {
                          return;
                        }
                        void runEventOperation(
                          () => onDeleteEvent!(selectedEntry),
                          `事件“${selectedEntry.title}”已永久删除。`
                        );
                      }}
                    >
                      删除事件
                    </button>
                  </div>
                  <div className="ccw-character-references">
                    <h3>项目、结构与引用</h3>
                    <dl>
                      <div>
                        <dt>稳定事件组 ID</dt>
                        <dd>{selectedEntry.id}</dd>
                      </div>
                      <div>
                        <dt>所属轻量项目</dt>
                        <dd>
                          {selectedEntry.projectRevision?.title ??
                            selectedEntry.projectIds[0] ??
                            '未知'}
                        </dd>
                      </div>
                      <div>
                        <dt>阶段 / 节点</dt>
                        <dd>
                          {selectedEntry.eventGroupRevision?.stages.length ?? 0}
                          {' / '}
                          {selectedEntry.eventGroupRevision?.stages.reduce(
                            (total, stage) => total + stage.eventNodes.length,
                            0
                          ) ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt>角色槽</dt>
                        <dd>
                          {selectedEntry.eventGroupRevision?.roleSlots.length ??
                            0} 项
                        </dd>
                      </div>
                      <div>
                        <dt>投放来源</dt>
                        <dd>
                          {selectedEntry.eventGroupRevision
                            ?.inheritProjectDeployments
                            ? '继承项目'
                            : '事件组覆盖'}
                        </dd>
                      </div>
                      <div>
                        <dt>revision 反向引用</dt>
                        <dd>{selectedEntry.incomingReferences.length} 项</dd>
                      </div>
                    </dl>
                  </div>
                </>
              )}
              <WorldDeploymentMatrix
                descriptors={listWorldpackAdaptationDescriptors()}
                deployments={selectedEntry.deployments}
                readOnly
              />
              <p className="ccw-inspector-note">
                {selectedEntry.characterWorkingDraft
                  ? '工作草稿仅保存在本机；补充完整并确认发布后才会创建正式 revision。'
                  : '当前 revision 只读。编辑人物、项目、事件或投放策略始终生成新 revision。'}
              </p>
            </>
          ) : (
            <>
              <div className="ccw-selected-summary is-empty">
                <span>投放矩阵</span>
                <strong>{scope === 'current_save' ? '当前没有存档绑定' : '请选择一个资产'}</strong>
                <small>新世界包对旧内容始终默认不启用</small>
              </div>
              <WorldDeploymentMatrix
                descriptors={listWorldpackAdaptationDescriptors()}
                deployments={[]}
                readOnly
              />
              <p className="ccw-inspector-note">
                内容至少启用一个世界包后才能发布；AI 适配内容必须在加入存档前生成并审核适配快照。
              </p>
            </>
          )}
        </aside>
      </div>
      {isSourcePanelOpen ? (
        <LongTextSourcePanel
          entries={sourceLibrary}
          profiles={settings.apiProfiles}
          defaultProfileId={profileId}
          defaultModel={model}
          isLoading={isLoading}
          onClose={() => setIsSourcePanelOpen(false)}
          onImportSource={onImportSource}
          onRunTask={onRunSourceTask}
          onBuildStructure={onBuildSourceStructure}
          onPauseTask={onPauseSourceTask}
          onResumeTask={onResumeSourceTask}
          onCancelTask={onCancelSourceTask}
          onRetryTask={onRetrySourceTask}
          onCreateExtractionTask={onCreateSourceExtractionTask}
          onRunExtractionTask={onRunSourceExtractionTask}
          onPauseExtractionTask={onPauseSourceExtractionTask}
          onResumeExtractionTask={onResumeSourceExtractionTask}
          onCancelExtractionTask={onCancelSourceExtractionTask}
          onRetryExtractionTask={onRetrySourceExtractionTask}
          onReauthorizeExtractionTask={
            onReauthorizeSourceExtractionTask
          }
          onCreateAggregationTask={onCreateSourceAggregationTask}
          onRunAggregationTask={onRunSourceAggregationTask}
          onPauseAggregationTask={onPauseSourceAggregationTask}
          onResumeAggregationTask={onResumeSourceAggregationTask}
          onCancelAggregationTask={onCancelSourceAggregationTask}
          onRetryAggregationTask={onRetrySourceAggregationTask}
          onReauthorizeAggregationTask={
            onReauthorizeSourceAggregationTask
          }
          onCreateProjectBuildTask={onCreateSourceProjectBuildTask}
          onRunProjectBuildTask={onRunSourceProjectBuildTask}
          onPauseProjectBuildTask={onPauseSourceProjectBuildTask}
          onResumeProjectBuildTask={onResumeSourceProjectBuildTask}
          onCancelProjectBuildTask={onCancelSourceProjectBuildTask}
          onRetryProjectBuildTask={onRetrySourceProjectBuildTask}
          onReauthorizeProjectBuildTask={
            onReauthorizeSourceProjectBuildTask
          }
          onReviewProjectDraft={openGeneratedProjectDraft}
        />
      ) : null}
      {isCharacterEditorOpen ? (
        <CustomCharacterEditor
          projects={library.projects}
          profileReady={profileReady}
          generationRouteLabel={
            profile ? `${profile.name} · ${model}` : model
          }
          initialAsset={editingEntry?.characterAsset}
          initialRevision={editingEntry?.characterRevision}
          initialWorkingDraft={editingEntry?.characterWorkingDraft}
          onGenerate={(description, onProgress) => {
            if (!onGenerateCharacter) {
              return Promise.reject(new Error('人物生成服务尚未连接。'));
            }
            return onGenerateCharacter({
              profileId,
              model,
              description,
              onProgress
            });
          }}
          onConsistencyReview={(draft) => {
            if (!onReviewCharacter) {
              return Promise.reject(new Error('人物复核服务尚未连接。'));
            }
            return onReviewCharacter({ profileId, model, draft });
          }}
          onSave={async (request) => {
            if (!onSaveCharacter) {
              throw new Error('人物保存服务尚未连接。');
            }
            await onSaveCharacter(request);
            setIsCharacterEditorOpen(false);
            setEditingEntry(undefined);
            setOperationMessage(
              request.mode === 'publish'
                ? '人物已审核发布并写入新 revision。'
                : '人物已保存为本地工作草稿，补充完整后才能发布。'
            );
          }}
          onClose={() => {
            setIsCharacterEditorOpen(false);
            setEditingEntry(undefined);
          }}
        />
      ) : null}
      {isEventEditorOpen ? (
        <CustomEventProjectEditor
          profileReady={profileReady}
          reusableCharacters={reusableEventCharacters}
          generationRouteLabel={
            profile ? `${profile.name} · ${model}` : model
          }
          initialState={editingEventProject}
          onGenerate={(description) => {
            if (!onGenerateEventProject) {
              return Promise.reject(new Error('短事件生成服务尚未连接。'));
            }
            return onGenerateEventProject({ profileId, model, description });
          }}
          onConsistencyReview={(draft) => {
            if (!onReviewEventProject) {
              return Promise.reject(new Error('短事件复核服务尚未连接。'));
            }
            return onReviewEventProject({ profileId, model, draft });
          }}
          onSave={async (request) => {
            if (!onSaveEventProject) {
              throw new Error('短事件保存服务尚未连接。');
            }
            await onSaveEventProject(request);
            setIsEventEditorOpen(false);
            setEditingEventProject(undefined);
            setOperationMessage(
              request.mode === 'publish'
                ? `轻量项目已审核发布，共 ${request.draft.eventGroups.length} 个事件组。`
                : `轻量项目已保存为待审核，共 ${request.draft.eventGroups.length} 个事件组。`
            );
          }}
          onClose={() => {
            setIsEventEditorOpen(false);
            setEditingEventProject(undefined);
          }}
        />
      ) : null}
    </main>
  );
}

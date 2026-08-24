import { lazy, Suspense, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createMemoryEmbeddingClientFromSettings } from '../domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../domain/memory/createMemorySummaryClientFromSettings';
import type {
  NarratorAttemptRecord,
  NarratorClient
} from '../domain/narrator/NarratorClient';
import { createNarratorClientFromSettings } from '../domain/narrator/createNarratorClientFromSettings';
import { createAuxiliaryGenerationClientFromSettings } from '../domain/news/createAuxiliaryGenerationClientFromSettings';
import { createNpcSimulationClientFromSettings } from '../domain/npc/createNpcSimulationClientFromSettings';
import { createBackgroundEvolutionClientFromSettings } from '../domain/backgroundEvolution/createBackgroundEvolutionClientFromSettings';
import { IndexedDbSaveRepository } from '../domain/persistence/IndexedDbSaveRepository';
import { IndexedDbTurnSnapshotRepository } from '../domain/persistence/IndexedDbTurnSnapshotRepository';
import type { RuntimeSaveKind, RuntimeSaveRecord, RuntimeSaveSummary } from '../domain/persistence/SaveRepository';
import {
  createPortableSaveRecord,
  stripRuntimeEmbeddingCache
} from '../domain/persistence/portableSaveArchive';
import { createPortableSaveZip } from '../domain/persistence/portableSaveZipArchive';
import type { PortableSaveBundle } from '../domain/persistence/portableSaveZipArchive';
import {
  createPortableVisualArchive,
  IndexedDbVisualRepository,
  parsePortableVisualArchive,
  rebaseVisualArchiveSaveId
} from '../domain/imageGeneration/visualRepository';
import { IndexedDbImageAutomationRuntimeRepository } from '../domain/imageGeneration/automationRuntime';
import { IndexedDbAvgGenericPortraitBindingRepository } from '../domain/avgPresentation';
import {
  createPortableAvgOverrideArchive,
  IndexedDbAvgVisualOverrideRepository,
  parsePortableAvgOverrideArchive,
  rebaseAvgOverrideArchive
} from '../domain/avgVisualOverride';
import {
  AvgResourcePackManager,
  createDefaultAvgResourcePackStorage
} from '../domain/avgResourcePack';
import type { OpeningSetup } from '../domain/runtime/initialState';
import { officialDlcManifests } from '../domain/dlc/manifest';
import { updateSaveDlcStatus, updateSaveDlcVersion } from '../domain/dlc/saveDlc';
import {
  createExistingSaveDlcCandidate,
  prepareExistingSaveDlcAttachment,
  type ExistingSaveDlcCandidate
} from '../domain/dlc/existingSave';
import type { SaveDlcStatus } from '../domain/dlc/types';
import type {
  CantoneseFlavorLevel,
  GameDifficultyLevel,
  RuntimeState
} from '../domain/runtime/types';
import type { OpeningExecutionStage } from '../domain/opening/openingExecutionStage';
import { IndexedDbOpeningSessionRepository } from '../domain/opening/IndexedDbOpeningSessionRepository';
import { createDefaultAiSettings } from '../domain/settings/defaultSettings';
import { LocalStorageSettingsRepository } from '../domain/settings/LocalStorageSettingsRepository';
import type { AiSettings } from '../domain/settings/types';
import type { DramaticContentSettings } from '../domain/drama/types';
import type {
  NewGameCustomContentReviewItem,
  NewGameCustomContentSelection
} from '../domain/customContent/newGameSelection';
import {
  adaptCustomEventCharactersInState,
  setCustomContentBindingPausedInState,
  setCustomContentPriorityInState
} from '../domain/customContent/saveBinding';
import { formatGameTimeWithWeekday } from '../domain/time/gameTime';
import { createWritebackRepairClientFromSettings } from '../domain/writeback/createWritebackRepairClientFromSettings';
import { SaveManagerModal } from './components/SaveManagerModal';
import { startOperationalAnalytics } from './analytics/operationalAnalytics';
import { getDisplayFontStack } from './displayFonts';
import { HomeScreen } from './screens/HomeScreen';
import { DefaultAvgPresentationResourceRuntime } from './components/avg/avgPresentationResourceRuntime';
import {
  changesSettings,
  clearImageGenerationManagedSettings,
  clearProjectStorageRecords,
  clearsGameData,
  createSettingsAfterDataClear,
  type DataClearTarget
} from './settings/dataManagement';
import type { SettingsDestination } from './settings/settingsNavigation';
import type {
  CurrentSaveCustomContentAdaptationRequest,
  CurrentSaveCustomContentPausedChange,
  CurrentSaveCustomContentPriorityChange
} from './settings/CurrentSaveCustomContentSettingsPanel';
import { resolveAppLocale, type AppLocale } from '../domain/localization/appLocale';
import { useLocalizedUi } from './localization/useLocalizedUi';

const GameScreen = lazy(() => import('./screens/GameScreen').then((module) => ({ default: module.GameScreen })));
const OpeningScreen = lazy(() => import('./screens/OpeningScreen').then((module) => ({ default: module.OpeningScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const AdminAnalyticsScreen = lazy(() => import('./admin/AdminAnalyticsScreen').then((module) => ({ default: module.AdminAnalyticsScreen })));
const WorldpackSelectionScreen = lazy(() =>
  import('./screens/WorldpackSelectionScreen').then((module) => ({
    default: module.WorldpackSelectionScreen
  }))
);
const DlcSelectionScreen = lazy(() =>
  import('./screens/DlcSelectionScreen').then((module) => ({
    default: module.DlcSelectionScreen
  }))
);
const OfficialDlcScreen = lazy(() =>
  import('./screens/OfficialDlcScreen').then((module) => ({
    default: module.OfficialDlcScreen
  }))
);

type AppScreen = 'home' | 'worldpack' | 'dlc-selection' | 'opening' | 'game' | 'dlc';
type SaveModalMode = 'save' | 'load';

function formatGameDateLabel(state: RuntimeState) {
  return formatGameTimeWithWeekday(state.time);
}

function createSaveId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `save_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function resolveGameVisualPartitionId(input: {
  openingPreviewActive: boolean;
  openingRollbackChainId?: string | null;
  currentRollbackChainId?: string | null;
}): string | undefined {
  if (input.openingPreviewActive && input.openingRollbackChainId) {
    return input.openingRollbackChainId;
  }

  return input.currentRollbackChainId ?? undefined;
}

function createSaveRecord(
  runtimeState: RuntimeState,
  saveId: string,
  rollbackChainId: string | undefined,
  saveName: string,
  saveKind: RuntimeSaveKind,
  createdAt?: string
): RuntimeSaveRecord {
  const now = new Date().toISOString();
  return {
    saveId,
    rollbackChainId,
    saveName,
    saveKind,
    createdAt: createdAt ?? now,
    updatedAt: now,
    playerName: runtimeState.player.name,
    worldpackId: runtimeState.world.worldpackId,
    gameDateLabel: formatGameDateLabel(runtimeState),
    turnCounter: runtimeState.turnCounter,
    runtimeState
  };
}

export function App() {
  const settingsRepository = useMemo(() => new LocalStorageSettingsRepository(), []);
  const saveRepository = useMemo(() => new IndexedDbSaveRepository(), []);
  const turnSnapshotRepository = useMemo(() => new IndexedDbTurnSnapshotRepository(), []);
  const visualRepository = useMemo(() => new IndexedDbVisualRepository(), []);
  const avgPortraitBindingRepository = useMemo(
    () => new IndexedDbAvgGenericPortraitBindingRepository(),
    []
  );
  const avgVisualOverrideRepository = useMemo(
    () => new IndexedDbAvgVisualOverrideRepository(),
    []
  );
  const avgResourcePackStorage = useMemo(() => createDefaultAvgResourcePackStorage(), []);
  const avgResourcePackManager = useMemo(
    () => new AvgResourcePackManager(avgResourcePackStorage),
    [avgResourcePackStorage]
  );
  const avgPresentationResourceRuntime = useMemo(
    () => new DefaultAvgPresentationResourceRuntime(
      avgResourcePackManager,
      avgResourcePackStorage
    ),
    [avgResourcePackManager, avgResourcePackStorage]
  );
  const imageAutomationRuntimeRepository = useMemo(() => new IndexedDbImageAutomationRuntimeRepository(), []);
  const openingSessionRepository = useMemo(
    () => new IndexedDbOpeningSessionRepository(),
    []
  );
  const [screen, setScreen] = useState<AppScreen>('home');
  const [state, setState] = useState<RuntimeState | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDestination, setSettingsDestination] = useState<SettingsDestination>('api');
  const [saveModalMode, setSaveModalMode] = useState<SaveModalMode | null>(null);
  const [saves, setSaves] = useState<RuntimeSaveSummary[]>([]);
  const [isSaveLoading, setIsSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [currentSaveId, setCurrentSaveId] = useState<string | null>(null);
  const [currentRollbackChainId, setCurrentRollbackChainId] = useState<string | null>(null);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() => createDefaultAiSettings());
  const [avgResourceRevision, setAvgResourceRevision] = useState(0);
  const [avgPlaybackRevision, setAvgPlaybackRevision] = useState(0);
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isOpeningStarting, setIsOpeningStarting] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingSaveError, setOpeningSaveError] = useState<string | null>(null);
  const [openingStreamText, setOpeningStreamText] = useState('');
  const [openingPreviewState, setOpeningPreviewState] = useState<RuntimeState | null>(null);
  const [openingStage, setOpeningStage] = useState<OpeningExecutionStage | null>(null);
  const [openingStageDetail, setOpeningStageDetail] = useState<string | null>(null);
  const [openingActionPreview, setOpeningActionPreview] = useState<string[]>([]);
  const [openingAttempts, setOpeningAttempts] = useState<NarratorAttemptRecord[]>([]);
  const [openingReasoningText, setOpeningReasoningText] = useState('');
  const [selectedOfficialDlcIds, setSelectedOfficialDlcIds] = useState<string[]>([]);
  const [openingCustomContentReview, setOpeningCustomContentReview] = useState<
    NewGameCustomContentReviewItem[]
  >([]);
  const [lastRawNarratorResponse, setLastRawNarratorResponse] = useState<string | null>(null);
  const currentSaveIdRef = useRef<string | null>(null);
  const currentRollbackChainIdRef = useRef<string | null>(null);
  const aiSettingsRef = useRef<AiSettings>(aiSettings);
  const lastOpeningSetupRef = useRef<OpeningSetup | null>(null);
  const currentOpeningSessionIdRef = useRef<string | null>(null);
  const resumeOpeningAfterSettingsRef = useRef(false);
  const activeOpeningContextRef = useRef<{
    openingSetup: OpeningSetup;
    pendingState: RuntimeState;
    rollbackChainId: string;
    previousRollbackChainId: string | null;
  } | null>(null);
  const pendingOpeningSaveRef = useRef<{
    state: RuntimeState;
    rollbackChainId: string;
    previousRollbackChainId: string | null;
  } | null>(null);
  const pendingOpeningCustomReviewRef = useRef<{
    openingSetup: OpeningSetup;
    state: RuntimeState;
    rollbackChainId: string;
    previousRollbackChainId: string | null;
    selections: NewGameCustomContentSelection[];
  } | null>(null);
  const isOpeningSaveInFlightRef = useRef(false);
  const appRootRef = useRef<HTMLDivElement>(null);
  const appLocale = resolveAppLocale(aiSettings.game.language);
  useLocalizedUi(appRootRef, appLocale);
  const appDisplayStyle = {
    '--font-interface': getDisplayFontStack(aiSettings.display.interfaceFontFamily, 'readable')
  } as CSSProperties;
  const appliedUiTheme = (screen === 'home' || screen === 'worldpack') && !isSettingsOpen && !saveModalMode
    ? 'dark'
    : aiSettings.display.uiTheme;

  useEffect(() => {
    document.documentElement.dataset.uiTheme = appliedUiTheme;
    return () => {
      delete document.documentElement.dataset.uiTheme;
    };
  }, [appliedUiTheme]);

  useEffect(() => startOperationalAnalytics(), []);

  useEffect(
    () => () => avgPresentationResourceRuntime.dispose(),
    [avgPresentationResourceRuntime]
  );

  useEffect(() => {
    let isMounted = true;
    void settingsRepository.load().then((loadedSettings) => {
      if (isMounted) {
        aiSettingsRef.current = loadedSettings;
        setAiSettings(loadedSettings);
        setIsSettingsLoaded(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [settingsRepository]);

  async function refreshSaves() {
    setIsSaveLoading(true);
    setSaveError(null);
    try {
      setSaves(await saveRepository.list());
    } catch {
      setSaveError('读取存档失败。');
    } finally {
      setIsSaveLoading(false);
    }
  }

  function updateAppLocale(locale: AppLocale) {
    const nextSettings: AiSettings = {
      ...aiSettingsRef.current,
      game: {
        ...aiSettingsRef.current.game,
        language: locale
      }
    };
    aiSettingsRef.current = nextSettings;
    setAiSettings(nextSettings);
    void settingsRepository.save(nextSettings);
  }

  async function updateDisplaySettings(display: AiSettings['display']) {
    const nextSettings: AiSettings = {
      ...aiSettingsRef.current,
      display
    };
    aiSettingsRef.current = nextSettings;
    setAiSettings(nextSettings);
    await settingsRepository.save(nextSettings);
  }

  async function updatePromptSettings(prompts: AiSettings['prompts']) {
    const nextSettings: AiSettings = {
      ...aiSettingsRef.current,
      prompts
    };
    aiSettingsRef.current = nextSettings;
    setAiSettings(nextSettings);
    await settingsRepository.save(nextSettings);
  }

  async function saveOpeningCandidate(candidate: {
    state: RuntimeState;
    rollbackChainId: string;
    previousRollbackChainId: string | null;
  }) {
    if (isOpeningSaveInFlightRef.current) return;
    isOpeningSaveInFlightRef.current = true;
    setOpeningStage('saving_opening');
    setOpeningStageDetail(null);
    setOpeningSaveError(null);
    setIsOpeningStarting(true);

    try {
      const saveId = createSaveId();
      const record = createSaveRecord(
        candidate.state,
        saveId,
        candidate.rollbackChainId,
        `新游戏 ${formatGameDateLabel(candidate.state)}`,
        'auto'
      );
      await saveRepository.save(record);
      currentSaveIdRef.current = saveId;
      currentRollbackChainIdRef.current = candidate.rollbackChainId;
      setCurrentSaveId(saveId);
      setCurrentRollbackChainId(candidate.rollbackChainId);
      await pruneAutoSaves(aiSettingsRef.current.game.autoSaveLimit);
      setSaves(await saveRepository.list());

      setState(candidate.state);
      setOpeningPreviewState(null);
      pendingOpeningSaveRef.current = null;
      setScreen('game');
      setIsOpeningStarting(false);
      setOpeningStreamText('');
      setOpeningActionPreview([]);
      setOpeningStage(null);
      setOpeningStageDetail(null);
      const openingSessionId = currentOpeningSessionIdRef.current;
      if (openingSessionId) {
        try {
          await openingSessionRepository.delete(openingSessionId);
        } catch {
          // The committed draft is ignored by resume lookup. Cleanup failure
          // must not turn an already-saved game into a false save failure.
        }
        currentOpeningSessionIdRef.current = null;
      }
      activeOpeningContextRef.current = null;
      void cleanupDisplacedRollbackChain(
        candidate.previousRollbackChainId,
        candidate.rollbackChainId
      );
    } catch (error) {
      setOpeningSaveError(
        `开局数据已经生成，但创建存档失败：${
          error instanceof Error ? error.message : '浏览器存储写入失败'
        }`
      );
      setOpeningStage('saving_opening');
      setIsOpeningStarting(true);
    } finally {
      isOpeningSaveInFlightRef.current = false;
    }
  }

  function retryOpeningSave() {
    const candidate = pendingOpeningSaveRef.current;
    if (!candidate) return;
    void saveOpeningCandidate(candidate);
  }

  async function runPreparedOpening({
    openingSetup,
    pendingState,
    rollbackChainId,
    previousRollbackChainId,
    narrator,
    latestSettings,
    openingModule
  }: {
    openingSetup: OpeningSetup;
    pendingState: RuntimeState;
    rollbackChainId: string;
    previousRollbackChainId: string | null;
    narrator: NarratorClient;
    latestSettings: AiSettings;
    openingModule: typeof import('../domain/opening/runOpening');
  }) {
    activeOpeningContextRef.current = {
      openingSetup,
      pendingState,
      rollbackChainId,
      previousRollbackChainId
    };
    setOpeningPreviewState(pendingState);
    setScreen('game');

    let initialState: RuntimeState;
    try {
      initialState = await openingModule.runOpeningV2({
        setup: openingSetup,
        initialState: pendingState,
        narrator,
        sessionRepository: openingSessionRepository,
        repairNarrator:
          createWritebackRepairClientFromSettings(latestSettings) ?? narrator,
        narrativeLengthLevel: latestSettings.game.narrativeLengthLevel,
        narrativePerspective: latestSettings.game.narrativePerspective,
        playerPortrayalMode: latestSettings.game.playerPortrayalMode,
        locale: resolveAppLocale(latestSettings.game.language),
        promptSettings: latestSettings.prompts,
        tavernSettings: latestSettings.tavern,
        dramaticContentSettings: latestSettings.game.dramaticContent,
        onNarrativeDelta: (delta) =>
          setOpeningStreamText((current) => `${current}${delta}`),
        onNarrativeReset: () => setOpeningStreamText(''),
        onRawText: (rawText) => setLastRawNarratorResponse(rawText),
        onStageChange: setOpeningStage,
        onStageDetail: setOpeningStageDetail,
        onActionPreview: setOpeningActionPreview,
        onAttempt: (attempt) =>
          setOpeningAttempts((current) => [...current, attempt]),
        onReasoningText: latestSettings.tavern.reasoningOutput.showInUi
          ? setOpeningReasoningText
          : undefined,
        onSessionChange: (openingSessionId) => {
          currentOpeningSessionIdRef.current = openingSessionId;
        }
      });
    } catch (error) {
      setOpeningError(
        error instanceof Error
          ? error.message
          : '生成开局失败，请检查主剧情 API 配置。'
      );
      setIsOpeningStarting(false);
      return;
    }

    const candidate = {
      state: initialState,
      rollbackChainId,
      previousRollbackChainId
    };
    pendingOpeningSaveRef.current = candidate;
    setOpeningPreviewState(initialState);
    await saveOpeningCandidate(candidate);
  }

  async function startGame(openingSetup?: OpeningSetup) {
    const resolvedOpeningSetup = openingSetup ?? {};
    lastOpeningSetupRef.current = resolvedOpeningSetup;
    const previousRollbackChainId = currentRollbackChainIdRef.current;
    const rollbackChainId = createSaveId();
    setIsOpeningStarting(true);
    setOpeningError(null);
    setOpeningSaveError(null);
    setOpeningStreamText('');
    setOpeningPreviewState(null);
    setOpeningStage(null);
    setOpeningStageDetail(null);
    setOpeningActionPreview([]);
    setOpeningAttempts([]);
    setOpeningReasoningText('');
    setLastRawNarratorResponse(null);
    setOpeningCustomContentReview([]);
    pendingOpeningSaveRef.current = null;
    pendingOpeningCustomReviewRef.current = null;

    let narrator: NarratorClient;
    let latestSettings: AiSettings;
    try {
      latestSettings = await settingsRepository.load();
      aiSettingsRef.current = latestSettings;
      setAiSettings(latestSettings);
      narrator = createNarratorClientFromSettings(latestSettings);
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : '生成开局失败，请检查主剧情 API 配置。');
      setIsOpeningStarting(false);
      return;
    }

    let openingModule: typeof import('../domain/opening/runOpening');
    let initialStateModule: typeof import('../domain/runtime/initialState');
    try {
      [openingModule, initialStateModule] = await Promise.all([
        import('../domain/opening/runOpening'),
        import('../domain/runtime/initialState')
      ]);
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : '载入开局模块失败，请刷新后重试。');
      setIsOpeningStarting(false);
      return;
    }

    const pendingState: RuntimeState = {
      ...initialStateModule.createInitialRuntimeState(resolvedOpeningSetup),
      storyLog: []
    };
    let preparedState = pendingState;
    const customContentSelections =
      resolvedOpeningSetup.customContentSelections ?? [];
    if (customContentSelections.length > 0) {
      try {
        const [newGameSelectionModule, contentRepositoryModule] =
          await Promise.all([
            import('../domain/customContent/newGameSelection'),
            import('../domain/customContent/IndexedDbCustomContentRepository')
          ]);
        const prepared =
          await newGameSelectionModule.prepareNewGameCustomContent({
            repository:
              new contentRepositoryModule.IndexedDbCustomContentRepository(),
            state: pendingState,
            selections: customContentSelections,
            openingSupportSelectionKey:
              resolvedOpeningSetup.openingCustomSupportSelectionKey,
            client: narrator,
            now: new Date().toISOString()
          });
        preparedState = prepared.state;
        if (prepared.reviewItems.length > 0) {
          pendingOpeningCustomReviewRef.current = {
            openingSetup: resolvedOpeningSetup,
            state: preparedState,
            rollbackChainId,
            previousRollbackChainId,
            selections: customContentSelections
          };
          setOpeningCustomContentReview(prepared.reviewItems);
          setIsOpeningStarting(false);
          return;
        }
      } catch (error) {
        setOpeningError(
          error instanceof Error
            ? error.message
            : '准备本局自定义内容失败。'
        );
        setIsOpeningStarting(false);
        return;
      }
    }

    await runPreparedOpening({
      openingSetup: resolvedOpeningSetup,
      pendingState: preparedState,
      rollbackChainId,
      previousRollbackChainId,
      narrator,
      latestSettings,
      openingModule
    });
  }

  function cancelOpeningCustomContentReview() {
    pendingOpeningCustomReviewRef.current = null;
    setOpeningCustomContentReview([]);
    setIsOpeningStarting(false);
  }

  async function approveOpeningCustomContentReview() {
    const pending = pendingOpeningCustomReviewRef.current;
    if (!pending) return;
    setIsOpeningStarting(true);
    setOpeningError(null);

    try {
      const [newGameSelectionModule, openingModule, latestSettings] =
        await Promise.all([
          import('../domain/customContent/newGameSelection'),
          import('../domain/opening/runOpening'),
          settingsRepository.load()
        ]);
      aiSettingsRef.current = latestSettings;
      setAiSettings(latestSettings);
      const narrator = createNarratorClientFromSettings(latestSettings);
      const approvedState =
        newGameSelectionModule.approvePreparedNewGameCustomContent({
          state: pending.state,
          selections: pending.selections,
          now: new Date().toISOString()
        });
      pendingOpeningCustomReviewRef.current = null;
      setOpeningCustomContentReview([]);
      await runPreparedOpening({
        openingSetup: pending.openingSetup,
        pendingState: approvedState,
        rollbackChainId: pending.rollbackChainId,
        previousRollbackChainId: pending.previousRollbackChainId,
        narrator,
        latestSettings,
        openingModule
      });
    } catch (error) {
      pendingOpeningCustomReviewRef.current = null;
      setOpeningCustomContentReview([]);
      setOpeningError(
        error instanceof Error
          ? error.message
          : '确认本局自定义内容适配失败。'
      );
      setIsOpeningStarting(false);
    }
  }

  function updateCurrentSaveDramaticContent(nextSettings: DramaticContentSettings) {
    setState((currentState) => {
      if (!currentState) return currentState;
      const nextState: RuntimeState = {
        ...currentState,
        dramaticContent: {
          ...(currentState.dramaticContent ?? {
            instances: [],
            recentDiagnostics: []
          }),
          settings: nextSettings
        }
      };
      const saveId = currentSaveIdRef.current;
      if (saveId) {
        void (async () => {
          try {
            const record = await saveRepository.load(saveId);
            if (!record) return;
            await saveRepository.save({
              ...record,
              updatedAt: new Date().toISOString(),
              runtimeState: nextState
            });
            setSaves(await saveRepository.list());
          } catch {
            setSaveError('当前存档的戏剧化内容设置保存失败。');
          }
        })();
      }
      return nextState;
    });
  }

  async function retryOpeningCurrentStage() {
    const context = activeOpeningContextRef.current;
    if (!context || isOpeningStarting) return;
    setIsOpeningStarting(true);
    setOpeningError(null);
    setOpeningSaveError(null);
    setOpeningStreamText('');
    setOpeningActionPreview([]);
    setOpeningAttempts([]);
    setOpeningReasoningText('');
    setLastRawNarratorResponse(null);
    try {
      const [openingModule, latestSettings] = await Promise.all([
        import('../domain/opening/runOpening'),
        Promise.resolve(aiSettingsRef.current)
      ]);
      const narrator = createNarratorClientFromSettings(latestSettings);
      await runPreparedOpening({
        ...context,
        narrator,
        latestSettings,
        openingModule
      });
    } catch (error) {
      setOpeningError(
        error instanceof Error
          ? error.message
          : '继续开局失败，请检查当前主剧情 API。'
      );
      setIsOpeningStarting(false);
    }
  }

  function changeOpeningModelAndContinue() {
    resumeOpeningAfterSettingsRef.current = true;
    openSettings('api');
  }

  async function abandonOpening() {
    const openingSessionId = currentOpeningSessionIdRef.current;
    if (openingSessionId) {
      try {
        await openingSessionRepository.delete(openingSessionId);
      } catch {
        // Abandoning the in-memory flow must remain possible even if
        // best-effort IndexedDB cleanup is temporarily unavailable.
      }
    }
    currentOpeningSessionIdRef.current = null;
    activeOpeningContextRef.current = null;
    pendingOpeningSaveRef.current = null;
    pendingOpeningCustomReviewRef.current = null;
    resumeOpeningAfterSettingsRef.current = false;
    setIsOpeningStarting(false);
    setOpeningError(null);
    setOpeningSaveError(null);
    setOpeningStreamText('');
    setOpeningPreviewState(null);
    setOpeningStage(null);
    setOpeningStageDetail(null);
    setOpeningActionPreview([]);
    setOpeningAttempts([]);
    setOpeningReasoningText('');
    setLastRawNarratorResponse(null);
    setOpeningCustomContentReview([]);
    setScreen('opening');
  }

  function updateCurrentSaveCantoneseFlavor(nextFlavor: CantoneseFlavorLevel) {
    setState((currentState) => {
      if (!currentState) return currentState;
      const nextState: RuntimeState = {
        ...currentState,
        player: {
          ...currentState.player,
          cantoneseFlavor: nextFlavor
        }
      };
      const saveId = currentSaveIdRef.current;
      if (saveId) {
        void (async () => {
          try {
            const record = await saveRepository.load(saveId);
            if (!record) return;
            await saveRepository.save({
              ...record,
              updatedAt: new Date().toISOString(),
              runtimeState: nextState
            });
            setSaves(await saveRepository.list());
          } catch {
            setSaveError('当前存档的粤语风味保存失败。');
          }
        })();
      }
      return nextState;
    });
  }

  function updateCurrentSaveGameDifficulty(nextDifficulty: GameDifficultyLevel) {
    setState((currentState) => {
      if (!currentState) return currentState;
      const nextState: RuntimeState = {
        ...currentState,
        world: {
          ...currentState.world,
          gameDifficulty: nextDifficulty
        }
      };
      const saveId = currentSaveIdRef.current;
      if (saveId) {
        void (async () => {
          try {
            const record = await saveRepository.load(saveId);
            if (!record) return;
            await saveRepository.save({
              ...record,
              updatedAt: new Date().toISOString(),
              runtimeState: nextState
            });
            setSaves(await saveRepository.list());
          } catch {
            setSaveError('当前存档的游戏难度保存失败。');
          }
        })();
      }
      return nextState;
    });
  }

  function updateCurrentSaveOfficialDlcStatus(
    dlcId: string,
    status: SaveDlcStatus
  ) {
    setState((currentState) => {
      if (!currentState) return currentState;
      const nextState: RuntimeState = {
        ...currentState,
        world: {
          ...currentState.world,
          officialDlcBindings: updateSaveDlcStatus(
            currentState.world.officialDlcBindings,
            dlcId,
            status
          )
        }
      };
      const saveId = currentSaveIdRef.current;
      if (saveId) {
        void (async () => {
          try {
            const record = await saveRepository.load(saveId);
            if (!record) return;
            await saveRepository.save({
              ...record,
              updatedAt: new Date().toISOString(),
              runtimeState: nextState
            });
            setSaves(await saveRepository.list());
          } catch {
            setSaveError('当前存档的 DLC 状态保存失败。');
          }
        })();
      }
      return nextState;
    });
  }

  function updateCurrentSaveOfficialDlcVersion(
    dlcId: string,
    targetVersion: string
  ) {
    setState((currentState) => {
      if (!currentState) return currentState;
      const nextState: RuntimeState = {
        ...currentState,
        world: {
          ...currentState.world,
          officialDlcBindings: updateSaveDlcVersion(
            currentState.world.officialDlcBindings,
            dlcId,
            targetVersion
          )
        }
      };
      const saveId = currentSaveIdRef.current;
      if (saveId) {
        void (async () => {
          try {
            const record = await saveRepository.load(saveId);
            if (!record) return;
            await saveRepository.save({
              ...record,
              updatedAt: new Date().toISOString(),
              runtimeState: nextState
            });
            setSaves(await saveRepository.list());
          } catch {
            setSaveError('当前存档的 DLC 版本升级保存失败。');
          }
        })();
      }
      return nextState;
    });
  }

  async function persistCurrentCustomContentState(
    nextState: RuntimeState
  ): Promise<void> {
    const saveId = currentSaveIdRef.current;
    if (saveId) {
      const record = await saveRepository.load(saveId);
      if (!record) throw new Error('找不到当前存档，未保存本局自定义内容设置。');
      await saveRepository.save({
        ...record,
        updatedAt: new Date().toISOString(),
        runtimeState: nextState
      });
      setSaves(await saveRepository.list());
    }
    setState(nextState);
  }

  async function updateCurrentSaveCustomContentPriority(
    change: CurrentSaveCustomContentPriorityChange
  ): Promise<void> {
    if (!state) throw new Error('当前没有正在运行的游戏。');
    const nextState = setCustomContentPriorityInState({
      state,
      ...change,
      now: new Date().toISOString()
    });
    try {
      await persistCurrentCustomContentState(nextState);
    } catch (error) {
      setSaveError('当前存档的自定义内容重点设置保存失败。');
      throw error;
    }
  }

  async function updateCurrentSaveCustomContentPaused(
    change: CurrentSaveCustomContentPausedChange
  ): Promise<void> {
    if (!state) throw new Error('当前没有正在运行的游戏。');
    const nextState = setCustomContentBindingPausedInState({
      state,
      ...change,
      now: new Date().toISOString()
    });
    try {
      await persistCurrentCustomContentState(nextState);
    } catch (error) {
      setSaveError('当前存档的自定义内容推进状态保存失败。');
      throw error;
    }
  }

  async function updateCurrentSaveCustomContentAdaptation(
    request: CurrentSaveCustomContentAdaptationRequest
  ): Promise<void> {
    if (!state) throw new Error('当前没有正在运行的游戏。');
    let client: NarratorClient | undefined;
    try {
      client = createNarratorClientFromSettings(aiSettingsRef.current);
    } catch {
      client = undefined;
    }
    const nextState = await adaptCustomEventCharactersInState({
      state,
      eventGroupId: request.eventGroupId,
      characterAssetIds: [request.characterAssetId],
      client,
      now: new Date().toISOString()
    });
    try {
      await persistCurrentCustomContentState(nextState);
    } catch (error) {
      setSaveError('当前存档的人物适配保存失败。');
      throw error;
    }
  }

  async function openSaveManager(mode: SaveModalMode) {
    setIsSettingsOpen(false);
    setSaveModalMode(mode);
    await refreshSaves();
  }

  function closeSaveManager() {
    setSaveModalMode(null);
  }

  function openSettings(destination: SettingsDestination = 'api') {
    setSettingsDestination(destination);
    setIsSettingsOpen(true);
    void refreshSaves();
  }

  function closeSettings() {
    setIsSettingsOpen(false);
    if (resumeOpeningAfterSettingsRef.current) {
      resumeOpeningAfterSettingsRef.current = false;
      void retryOpeningCurrentStage();
    }
  }

  function openCurrentSaveCustomContentLibrary() {
    if (!currentSaveId) return;
    window.location.assign(
      `/custom-content?saveId=${encodeURIComponent(currentSaveId)}`
    );
  }

  async function loadSave(saveId: string): Promise<boolean> {
    setSaveError(null);
    try {
      const record = await saveRepository.load(saveId);
      if (!record) {
        setSaveError('没有找到这个存档。');
        return false;
      }

      const previousRollbackChainId = currentRollbackChainIdRef.current;
      const nextRollbackChainId = record.rollbackChainId ?? record.saveId;
      const { withRuntimeDefaults } = await import('../domain/runtime/initialState');
      setState(withRuntimeDefaults(record.runtimeState));
      setOpeningPreviewState(null);
      pendingOpeningSaveRef.current = null;
      setIsOpeningStarting(false);
      setOpeningError(null);
      setOpeningSaveError(null);
      setOpeningStreamText('');
      setOpeningStage(null);
      setOpeningStageDetail(null);
      setOpeningActionPreview([]);
      setOpeningAttempts([]);
      setOpeningReasoningText('');
      setLastRawNarratorResponse(null);
      currentSaveIdRef.current = record.saveId;
      currentRollbackChainIdRef.current = nextRollbackChainId;
      lastOpeningSetupRef.current = null;
      setCurrentSaveId(record.saveId);
      setCurrentRollbackChainId(nextRollbackChainId);
      setAvgPlaybackRevision((value) => value + 1);
      setScreen('game');
      setSaveModalMode(null);
      void cleanupDisplacedRollbackChain(previousRollbackChainId, nextRollbackChainId);
      return true;
    } catch {
      setSaveError('读取存档失败。');
      return false;
    }
  }

  function resolveCurrentRuntimeStateRecord(record: RuntimeSaveRecord): RuntimeSaveRecord {
    if (currentSaveIdRef.current !== record.saveId || !state) return record;
    return {
      ...record,
      playerName: state.player.name,
      worldpackId: state.world.worldpackId,
      gameDateLabel: formatGameDateLabel(state),
      turnCounter: state.turnCounter,
      runtimeState: state
    };
  }

  async function listExistingSaveDlcCandidates(
    dlcId: string
  ): Promise<ExistingSaveDlcCandidate[]> {
    const manifest = officialDlcManifests.find((candidate) => candidate.dlcId === dlcId);
    if (!manifest) throw new Error('这项 DLC 当前不提供给已有存档。');

    const summaries = await saveRepository.list();
    return Promise.all(
      summaries.map(async (summary): Promise<ExistingSaveDlcCandidate> => {
        const loadedRecord = await saveRepository.load(summary.saveId);
        if (!loadedRecord) {
          return {
            ...summary,
            eligibility: {
              eligible: false,
              code: 'save_unavailable',
              reason: '这份存档的内容不完整，未进行任何改动。'
            }
          };
        }
        return createExistingSaveDlcCandidate(
          resolveCurrentRuntimeStateRecord(loadedRecord),
          manifest
        );
      })
    );
  }

  async function attachOfficialDlcToExistingSave(
    saveId: string,
    dlcId: string
  ): Promise<void> {
    const manifest = officialDlcManifests.find((candidate) => candidate.dlcId === dlcId);
    if (!manifest) throw new Error('这项 DLC 当前不提供给已有存档。');

    const storedRecord = await saveRepository.load(saveId);
    if (!storedRecord) throw new Error('没有找到这个存档，未进行任何改动。');
    const sourceRecord = resolveCurrentRuntimeStateRecord(storedRecord);
    const now = new Date().toISOString();
    const prepared = prepareExistingSaveDlcAttachment({
      record: sourceRecord,
      manifest,
      backupSaveId: createSaveId(),
      activatedAt: now
    });

    try {
      await saveRepository.saveMany([prepared.backupRecord, prepared.updatedRecord]);
    } catch (error) {
      setSaveError('加入 DLC 时保存失败，原存档未被改动。');
      throw new Error(
        `加入 DLC 时保存失败，原存档未被改动：${
          error instanceof Error ? error.message : '浏览器存储写入失败'
        }`,
        { cause: error }
      );
    }

    setSaves(await saveRepository.list());
    if (!(await loadSave(saveId))) {
      throw new Error('DLC 已安全加入并建立备份，但自动读取失败；请从“读取游戏”手动打开该存档。');
    }
  }

  async function repairSave(saveId: string): Promise<string> {
    const record = await saveRepository.load(saveId);
    if (!record) {
      throw new Error('没有找到这个存档，原存档未被覆盖。');
    }

    const { withRuntimeDefaults } = await import('../domain/runtime/initialState');
    const auditedState = withRuntimeDefaults(record.runtimeState);
    const { repairFixedActorIdentityIntegrity } = await import(
      '../domain/identity/fixedActorIdentityGuard'
    );
    const identityRepair = repairFixedActorIdentityIntegrity(auditedState);
    const pendingCount = auditedState.pendingActorWritebackRecoveries?.length ?? 0;
    const identityRepairCount = identityRepair.repairedActorCount + identityRepair.repairedMemoryCount;
    if (pendingCount === 0 && identityRepairCount === 0) {
      return '本地审计未发现当前版本可安全自动修复的人物建档或固定身份错绑；未调用主剧情 API，也没有改动存档。';
    }

    let repairedState = identityRepair.state;
    let repairedCount = 0;
    let pendingAfter = pendingCount;
    if (pendingCount > 0) {
      const narrator = createNarratorClientFromSettings(aiSettingsRef.current);
      const { repairPendingActorWritebacksInSave } = await import('../domain/turn/TurnEngine');
      const result = await repairPendingActorWritebacksInSave({
        state: identityRepair.state,
        narrator,
        promptSettings: aiSettingsRef.current.prompts
      });
      repairedState = result.state;
      repairedCount = result.repairedCount;
      pendingAfter = result.pendingAfter;
    }
    if (repairedCount === 0 && identityRepairCount === 0) {
      return `已审计 ${pendingCount} 项人物建档缺口，但主 LLM 本次没有返回可通过严格校验的修复；原存档未被覆盖。`;
    }

    const now = new Date().toISOString();
    const backup: RuntimeSaveRecord = {
      ...record,
      saveId: createSaveId(),
      saveName: `${record.saveName}（修复前备份）`,
      saveKind: 'manual',
      createdAt: now,
      updatedAt: now
    };
    const repairedRecord: RuntimeSaveRecord = {
      ...record,
      updatedAt: now,
      playerName: repairedState.player.name,
      gameDateLabel: formatGameDateLabel(repairedState),
      turnCounter: repairedState.turnCounter,
      runtimeState: repairedState
    };
    await saveRepository.saveMany([backup, repairedRecord]);
    if (currentSaveIdRef.current === saveId) {
      setState(repairedState);
    }
    setSaves(await saveRepository.list());
    const identitySummary = identityRepairCount > 0
      ? `校正 ${identityRepair.repairedActorCount} 名人物固定身份、${identityRepair.repairedMemoryCount} 条确定性错投记忆`
      : '未发现固定身份错绑';
    return `存档修复完成：${identitySummary}；补齐 ${repairedCount} 名人物，剩余 ${pendingAfter} 项待处理；原存档已另存为“修复前备份”。`;
  }

  async function deleteSave(saveId: string) {
    setSaveError(null);
    try {
      const existingSaves = await saveRepository.list();
      const deletedSave = existingSaves.find((save) => save.saveId === saveId);
      await saveRepository.delete(saveId);
      if (currentSaveIdRef.current === saveId) {
        currentSaveIdRef.current = null;
        setCurrentSaveId(null);
        if (!state) {
          currentRollbackChainIdRef.current = null;
          setCurrentRollbackChainId(null);
        }
      }
      const remainingSaves = await saveRepository.list();
      const deletedVisualPartitionId = deletedSave?.rollbackChainId ?? deletedSave?.saveId;
      if (
        deletedVisualPartitionId &&
        deletedVisualPartitionId !== currentRollbackChainIdRef.current &&
        !remainingSaves.some((save) => (save.rollbackChainId ?? save.saveId) === deletedVisualPartitionId)
      ) {
        await Promise.all([
          visualRepository.clearSave(deletedVisualPartitionId),
          imageAutomationRuntimeRepository.clearSave(deletedVisualPartitionId),
          avgPortraitBindingRepository.clearSave(deletedVisualPartitionId),
          avgVisualOverrideRepository.clearPartition(deletedVisualPartitionId)
        ]);
      }
      await cleanupOrphanRollbackChains(deletedSave ? [deletedSave.rollbackChainId ?? deletedSave.saveId] : [], remainingSaves);
      setSaves(remainingSaves);
    } catch {
      setSaveError('删除存档失败。');
    }
  }

  async function cleanupOrphanRollbackChains(
    candidateChainIds: string[],
    remainingSaves: RuntimeSaveSummary[],
    protectedChainId = currentRollbackChainIdRef.current
  ): Promise<void> {
    const referencedChainIds = new Set(
      remainingSaves.map((save) => save.rollbackChainId ?? save.saveId)
    );
    const orphanChainIds = Array.from(new Set(candidateChainIds)).filter(
      (chainId) => chainId && !referencedChainIds.has(chainId) && protectedChainId !== chainId
    );
    await Promise.all(orphanChainIds.map((chainId) => turnSnapshotRepository.clearTurnSnapshotsForChain(chainId)));
  }

  async function cleanupDisplacedRollbackChain(
    previousChainId: string | null,
    nextChainId: string | null
  ): Promise<void> {
    if (!previousChainId || previousChainId === nextChainId) return;

    try {
      const remainingSaves = await saveRepository.list();
      await cleanupOrphanRollbackChains([previousChainId], remainingSaves, nextChainId);
      const stillReferenced = remainingSaves.some(
        (save) => (save.rollbackChainId ?? save.saveId) === previousChainId
      );
      if (!stillReferenced) {
        await avgVisualOverrideRepository.clearPartition(previousChainId);
      }
    } catch {
      // Chain cleanup must not prevent starting or loading a game.
    }
  }

  async function saveManualGame(stateToSave = state) {
    if (!stateToSave) return;

    const saveId = createSaveId();
    const record = createSaveRecord(
      stateToSave,
      saveId,
      currentRollbackChainIdRef.current ?? currentSaveIdRef.current ?? saveId,
      `手动保存 ${formatGameDateLabel(stateToSave)}`,
      'manual'
    );

    await saveRepository.save(record);
    currentSaveIdRef.current = saveId;
    currentRollbackChainIdRef.current = record.rollbackChainId ?? saveId;
    setCurrentSaveId(saveId);
    setCurrentRollbackChainId(record.rollbackChainId ?? saveId);
    setSaves(await saveRepository.list());
  }

  async function pruneAutoSaves(limit: number) {
    const normalizedLimit = Math.max(1, Math.floor(limit || 20));
    const latestSaves = await saveRepository.list();
    const autoSaves = latestSaves.filter((save) => save.saveKind === 'auto');
    const expiredAutoSaves = autoSaves.slice(normalizedLimit);

    await Promise.all(expiredAutoSaves.map((save) => saveRepository.delete(save.saveId)));
    const remainingSaves = await saveRepository.list();
    const remainingPartitions = new Set(remainingSaves.map((save) => save.rollbackChainId ?? save.saveId));
    await Promise.all(Array.from(new Set(expiredAutoSaves.map((save) => save.rollbackChainId ?? save.saveId)))
      .filter((partitionId) => partitionId !== currentRollbackChainIdRef.current && !remainingPartitions.has(partitionId))
      .map((partitionId) => Promise.all([
        visualRepository.clearSave(partitionId),
        imageAutomationRuntimeRepository.clearSave(partitionId),
        avgPortraitBindingRepository.clearSave(partitionId),
        avgVisualOverrideRepository.clearPartition(partitionId)
      ])));
    await cleanupOrphanRollbackChains(
      expiredAutoSaves.map((save) => save.rollbackChainId ?? save.saveId),
      remainingSaves
    );
  }

  async function saveAutoGame(stateToSave: RuntimeState, force = false, saveName?: string) {
    const intervalTurns = Math.max(1, Math.floor(aiSettingsRef.current.game.autoSaveIntervalTurns || 1));
    if (!force && stateToSave.turnCounter % intervalTurns !== 0) {
      return;
    }

    const saveId = createSaveId();
    const record = createSaveRecord(
      stateToSave,
      saveId,
      currentRollbackChainIdRef.current ?? currentSaveIdRef.current ?? saveId,
      saveName ?? `自动存档 ${formatGameDateLabel(stateToSave)}`,
      'auto'
    );

    await saveRepository.save(record);
    currentSaveIdRef.current = saveId;
    currentRollbackChainIdRef.current = record.rollbackChainId ?? saveId;
    setCurrentSaveId(saveId);
    setCurrentRollbackChainId(record.rollbackChainId ?? saveId);
    await pruneAutoSaves(aiSettingsRef.current.game.autoSaveLimit);
    setSaves(await saveRepository.list());
  }

  async function clearSaves() {
    setSaveError(null);
    try {
      const existingSaves = await saveRepository.list();
      await Promise.all(existingSaves.map((save) => saveRepository.delete(save.saveId)));
      const protectedPartitionId = state ? currentRollbackChainIdRef.current : null;
      await Promise.all(Array.from(new Set(existingSaves.map((save) => save.rollbackChainId ?? save.saveId)))
        .filter((partitionId) => partitionId !== protectedPartitionId)
        .map((partitionId) => Promise.all([
          visualRepository.clearSave(partitionId),
          imageAutomationRuntimeRepository.clearSave(partitionId),
          avgPortraitBindingRepository.clearSave(partitionId),
          avgVisualOverrideRepository.clearPartition(partitionId)
        ])));
      currentSaveIdRef.current = null;
      setCurrentSaveId(null);
      if (!state) {
        currentRollbackChainIdRef.current = null;
        setCurrentRollbackChainId(null);
      }
      await cleanupOrphanRollbackChains(
        existingSaves.map((save) => save.rollbackChainId ?? save.saveId),
        []
      );
      setSaves([]);
    } catch {
      setSaveError('清空存档失败。');
      throw new Error('Failed to clear saves');
    }
  }

  async function clearManagedData(target: DataClearTarget): Promise<void> {
    const shouldClearGameData = clearsGameData(target);
    const shouldChangeSettings = changesSettings(target);
    const nextSettings = createSettingsAfterDataClear(aiSettingsRef.current, target);

    if (shouldClearGameData) {
      await Promise.all([
        saveRepository.clearAll(),
        turnSnapshotRepository.clearAll(),
        visualRepository.clearAll(),
        imageAutomationRuntimeRepository.clearAll(),
        openingSessionRepository.clearAll(),
        avgVisualOverrideRepository.clearAll()
      ]);
    }

    await clearImageGenerationManagedSettings(target);
    clearProjectStorageRecords(target);

    if (shouldChangeSettings) {
      if (target === 'allData') {
        await settingsRepository.clear();
      } else {
        await settingsRepository.save(nextSettings);
      }
      aiSettingsRef.current = nextSettings;
      setAiSettings(nextSettings);
    }

    if (shouldClearGameData) {
      currentSaveIdRef.current = null;
      currentRollbackChainIdRef.current = null;
      lastOpeningSetupRef.current = null;
      setCurrentSaveId(null);
      setCurrentRollbackChainId(null);
      setSaves([]);
      setState(null);
      setScreen('home');
      setIsOpeningStarting(false);
      setOpeningError(null);
      setOpeningSaveError(null);
      setOpeningStreamText('');
      setOpeningPreviewState(null);
      setOpeningStage(null);
      setOpeningStageDetail(null);
      setOpeningActionPreview([]);
      setOpeningAttempts([]);
      setOpeningReasoningText('');
      pendingOpeningSaveRef.current = null;
      setLastRawNarratorResponse(null);
      setSaveError(null);
      setSaveModalMode(null);
    }
  }

  async function importSaves(bundle: PortableSaveBundle) {
    setSaveError(null);
    const importedSaveIds: string[] = [];
    const importedVisualPartitionIds: string[] = [];
    try {
      const { withRuntimeDefaults } = await import('../domain/runtime/initialState');
      const now = new Date().toISOString();
      const partitionIdMap = new Map<string, string>();
      const importedRecords: RuntimeSaveRecord[] = bundle.records.map((record, index) => {
        const sourcePartitionId = record.rollbackChainId ?? record.saveId;
        const rollbackChainId = partitionIdMap.get(sourcePartitionId) ?? createSaveId();
        partitionIdMap.set(sourcePartitionId, rollbackChainId);
        const saveId = createSaveId();
        importedSaveIds.push(saveId);
        return {
          ...record,
          saveId,
          rollbackChainId,
          saveName: record.saveName || `导入存档 ${index + 1}`,
          saveKind: record.saveKind === 'auto' ? 'auto' : 'manual',
          createdAt: now,
          updatedAt: now,
          runtimeState: withRuntimeDefaults(stripRuntimeEmbeddingCache(record.runtimeState))
        };
      });
      const visualRestorations = await Promise.all(Object.entries(bundle.visualArchives).map(async ([sourcePartitionId, archive]) => {
        const targetPartitionId = partitionIdMap.get(sourcePartitionId);
        if (!targetPartitionId) throw new Error(`视觉资料没有对应的导入存档链：${sourcePartitionId}`);
        const parsed = await parsePortableVisualArchive(archive);
        if (parsed.snapshot.saveId !== sourcePartitionId) throw new Error('视觉资料分区与存档清单不一致。');
        importedVisualPartitionIds.push(targetPartitionId);
        return rebaseVisualArchiveSaveId(parsed, targetPartitionId);
      }));
      const avgOverrideRestorations = await Promise.all(
        Object.entries(bundle.avgOverrideArchives ?? {}).map(async ([sourcePartitionId, archive]) => {
          const targetPartitionId = partitionIdMap.get(sourcePartitionId);
          if (!targetPartitionId) {
            throw new Error(`AVG 自定义视觉资料没有对应的导入存档链：${sourcePartitionId}`);
          }
          const parsed = await parsePortableAvgOverrideArchive(archive);
          if (parsed.snapshot.visualPartitionId !== sourcePartitionId) {
            throw new Error('AVG 自定义视觉资料分区与存档清单不一致。');
          }
          importedVisualPartitionIds.push(targetPartitionId);
          return rebaseAvgOverrideArchive(parsed, targetPartitionId);
        })
      );
      await saveRepository.saveMany(importedRecords);
      for (const visual of visualRestorations) {
        await visualRepository.replaceSaveFromArchive(visual.snapshot, visual.blobs);
      }
      for (const visual of avgOverrideRestorations) {
        await avgVisualOverrideRepository.replacePartitionFromArchive(
          visual.snapshot,
          visual.blobs
        );
      }
      setSaves(await saveRepository.list());
    } catch (error) {
      await Promise.all([
        ...importedSaveIds.map((saveId) => saveRepository.delete(saveId).catch(() => undefined)),
        ...importedVisualPartitionIds.flatMap((partitionId) => [
          visualRepository.clearSave(partitionId).catch(() => undefined),
          imageAutomationRuntimeRepository.clearSave(partitionId).catch(() => undefined),
          avgPortraitBindingRepository.clearSave(partitionId).catch(() => undefined),
          avgVisualOverrideRepository.clearPartition(partitionId).catch(() => undefined)
        ])
      ]);
      setSaveError('导入存档失败。');
      throw error instanceof Error ? error : new Error('Failed to import saves');
    }
  }

  async function exportSaves(includeImages: boolean) {
    setSaveError(null);
    try {
      const summaries = await saveRepository.list();
      const exportedAt = new Date().toISOString();
      const portableRecords: RuntimeSaveRecord[] = [];
      for (const summary of summaries) {
        const record = await saveRepository.load(summary.saveId);
        if (!record) {
          throw new Error(`Save payload is missing: ${summary.saveId}`);
        }
        portableRecords.push(createPortableSaveRecord(record));
      }
      const visualArchives: Record<string, Uint8Array> = {};
      const avgOverrideArchives: Record<string, Uint8Array> = {};
      const partitionIds = Array.from(new Set(portableRecords.map((record) => record.rollbackChainId ?? record.saveId)));
      for (const partitionId of partitionIds) {
        visualArchives[partitionId] = await createPortableVisualArchive(
          await visualRepository.exportSave(partitionId),
          includeImages,
          exportedAt
        );
        if (includeImages) {
          const snapshot = await avgVisualOverrideRepository.exportPartition(partitionId);
          if (snapshot.actorOverrides.length || snapshot.sceneOverrides.length) {
            avgOverrideArchives[partitionId] = await createPortableAvgOverrideArchive(
              snapshot,
              (assetId) => avgVisualOverrideRepository.getAssetBlob(assetId),
              exportedAt
            );
          }
        }
      }
      const zipBytes = await createPortableSaveZip(portableRecords, exportedAt, {
        visualArchives,
        avgOverrideArchives
      });
      const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
      new Uint8Array(zipBuffer).set(zipBytes);
      const blob = new Blob([zipBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cop-v2-saves-${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setSaveError('导出存档失败。');
      throw new Error('Failed to export saves');
    }
  }

  function renderActiveScreen() {
    const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
    if (pathname === '/admin/analytics') {
      return <AdminAnalyticsScreen />;
    }

    if (screen === 'home') {
      return (
        <HomeScreen
          settings={aiSettings}
          isSettingsLoaded={isSettingsLoaded}
          onStart={() => {
            setSelectedOfficialDlcIds([]);
            setScreen('worldpack');
          }}
          onLoad={() => void openSaveManager('load')}
          onSettings={openSettings}
          onLanguageChange={updateAppLocale}
          onOfficialDlc={() => setScreen('dlc')}
        />
      );
    }

    if (screen === 'worldpack') {
      return (
        <WorldpackSelectionScreen
          onBack={() => setScreen('home')}
          onSelectHongKong={() =>
            setScreen(officialDlcManifests.length > 0 ? 'dlc-selection' : 'opening')
          }
        />
      );
    }

    if (screen === 'dlc-selection') {
      return (
        <DlcSelectionScreen
          worldpackId="hk_1988"
          initialSelectedDlcIds={selectedOfficialDlcIds}
          onBack={() => setScreen('worldpack')}
          onContinue={(selectedDlcIds) => {
            setSelectedOfficialDlcIds(selectedDlcIds);
            setScreen('opening');
          }}
        />
      );
    }

    if (screen === 'opening') {
      return (
        <OpeningScreen
          onStartGame={(openingSetup) => void startGame(openingSetup)}
          onBack={() => setScreen('home')}
          isStarting={isOpeningStarting}
          error={openingError}
          streamText={openingStreamText}
          officialDlcIds={selectedOfficialDlcIds}
          customContentReview={openingCustomContentReview}
          onApproveCustomContentReview={() =>
            void approveOpeningCustomContentReview()
          }
          onCancelCustomContentReview={cancelOpeningCustomContentReview}
        />
      );
    }

    if (screen === 'dlc') {
      return (
        <OfficialDlcScreen
          currentState={state}
          onBack={() => setScreen('home')}
          onStatusChange={updateCurrentSaveOfficialDlcStatus}
          onVersionUpgrade={updateCurrentSaveOfficialDlcVersion}
          onListExistingSaveCandidates={listExistingSaveDlcCandidates}
          onAttachToExistingSave={attachOfficialDlcToExistingSave}
        />
      );
    }

    const gameState = openingPreviewState ?? state;
    if (!gameState) {
      return (
        <HomeScreen
          settings={aiSettings}
          isSettingsLoaded={isSettingsLoaded}
          onStart={() => setScreen('worldpack')}
          onLoad={() => void openSaveManager('load')}
          onSettings={openSettings}
          onLanguageChange={updateAppLocale}
          onOfficialDlc={() => setScreen('dlc')}
        />
      );
    }

    const gameVisualPartitionId = resolveGameVisualPartitionId({
      openingPreviewActive: Boolean(openingPreviewState),
      openingRollbackChainId: activeOpeningContextRef.current?.rollbackChainId,
      currentRollbackChainId
    });

    return (
      <GameScreen
        state={gameState}
        onStateChange={isOpeningStarting ? () => undefined : setState}
        createNarrator={() => createNarratorClientFromSettings(aiSettingsRef.current)}
        createMemoryEmbedding={() => createMemoryEmbeddingClientFromSettings(aiSettingsRef.current)}
        createMemorySummary={() => createMemorySummaryClientFromSettings(aiSettingsRef.current)}
        createWritebackRepair={() => createWritebackRepairClientFromSettings(aiSettingsRef.current)}
        writebackRepairMode={aiSettings.featureRoutes.writebackRepair.mode}
        createNpcSimulation={() => createNpcSimulationClientFromSettings(aiSettingsRef.current)}
        createBackgroundEvolution={() => createBackgroundEvolutionClientFromSettings(aiSettingsRef.current)}
        createAuxiliaryGeneration={() => createAuxiliaryGenerationClientFromSettings(aiSettingsRef.current)}
        auxiliaryGenerationMode={aiSettings.featureRoutes.auxiliaryGeneration.mode}
        memoryCompression={aiSettings.memory}
        gameSettings={aiSettings.game}
        promptSettings={aiSettings.prompts}
        onPromptSettingsChange={updatePromptSettings}
        tavernSettings={aiSettings.tavern}
        displaySettings={aiSettings.display}
        onDisplaySettingsChange={updateDisplaySettings}
        avgPresentationResourceRuntime={avgPresentationResourceRuntime}
        avgResourceRevision={avgResourceRevision}
        avgPlaybackRevision={avgPlaybackRevision}
        onSave={() => void openSaveManager('save')}
        onAutoSave={saveAutoGame}
        onLoad={() => void openSaveManager('load')}
        onSettings={openSettings}
        onHome={() => setScreen('home')}
        isOpeningStarting={isOpeningStarting}
        openingStreamText={openingStreamText}
        openingError={openingError}
        openingSaveError={openingSaveError}
        openingStage={openingStage}
        openingStageDetail={openingStageDetail}
        openingActionPreview={openingActionPreview}
        openingAttempts={openingAttempts}
        openingReasoningText={openingReasoningText}
        lastRawNarratorResponse={lastRawNarratorResponse}
        onRawNarratorResponse={setLastRawNarratorResponse}
        onRetryOpening={
          openingSaveError
            ? undefined
            : activeOpeningContextRef.current
              ? () => void retryOpeningCurrentStage()
              : undefined
        }
        onChangeOpeningModel={
          openingError ? changeOpeningModelAndContinue : undefined
        }
        onAbandonOpening={openingError ? () => void abandonOpening() : undefined}
        onRetryOpeningSave={openingSaveError ? retryOpeningSave : undefined}
        saveId={currentSaveId ?? undefined}
        storyRenderLimit={aiSettings.game.storyRenderLimit}
        rollbackChainId={gameVisualPartitionId}
        turnSnapshotRepository={turnSnapshotRepository}
        visualRepository={visualRepository}
        avgVisualOverrideRepository={avgVisualOverrideRepository}
      />
    );
  }

  return (
    <div
      ref={appRootRef}
      className="app-font-root"
      data-ui-theme={appliedUiTheme}
      data-app-locale={appLocale}
      lang={appLocale}
      style={appDisplayStyle}
    >
      <Suspense fallback={<div className="app-loading" role="status">正在载入...</div>}>
        <div aria-hidden={isSettingsOpen || saveModalMode ? true : undefined}>{renderActiveScreen()}</div>
      </Suspense>
      {isSettingsOpen ? (
        <div className="settings-overlay">
          <Suspense fallback={<div className="app-loading" role="status">正在打开设置...</div>}>
            <SettingsScreen
              initialDestination={settingsDestination}
              settings={aiSettings}
              runtimeState={state}
              saves={saves}
              onSettingsChange={(nextSettings) => {
                aiSettingsRef.current = nextSettings;
                setAiSettings(nextSettings);
                void settingsRepository.save(nextSettings);
              }}
              onRuntimeDramaticContentChange={updateCurrentSaveDramaticContent}
              onRuntimeCantoneseFlavorChange={updateCurrentSaveCantoneseFlavor}
              onRuntimeGameDifficultyChange={updateCurrentSaveGameDifficulty}
              onOpenCurrentSaveCustomContentLibrary={
                currentSaveId
                  ? openCurrentSaveCustomContentLibrary
                  : undefined
              }
              onRuntimeCustomContentPriorityChange={
                updateCurrentSaveCustomContentPriority
              }
              onRuntimeCustomContentPausedChange={
                updateCurrentSaveCustomContentPaused
              }
              onRuntimeCustomContentAdaptationRequest={
                updateCurrentSaveCustomContentAdaptation
              }
              onClearData={clearManagedData}
              avgResourcePackManager={avgResourcePackManager}
              onAvgResourceChange={() => {
                avgPresentationResourceRuntime.reset();
                setAvgResourceRevision((revision) => revision + 1);
              }}
              onBack={closeSettings}
            />
          </Suspense>
        </div>
      ) : null}
      {saveModalMode ? (
        <SaveManagerModal
          mode={saveModalMode}
          saves={saves}
          isLoading={isSaveLoading}
          error={saveError}
          canSave={saveModalMode === 'save' && Boolean(state)}
          onSaveCurrent={() => saveManualGame()}
          onLoadSave={(saveId) => void loadSave(saveId)}
          onRepairSave={repairSave}
          onDeleteSave={deleteSave}
          onClearSaves={clearSaves}
          onImportSaves={importSaves}
          onExportSaves={exportSaves}
          onClose={closeSaveManager}
        />
      ) : null}
    </div>
  );
}

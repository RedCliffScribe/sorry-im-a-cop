import { lazy, Suspense, type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { createMemoryEmbeddingClientFromSettings } from '../domain/memory/createMemoryEmbeddingClientFromSettings';
import { createMemorySummaryClientFromSettings } from '../domain/memory/createMemorySummaryClientFromSettings';
import type { NarratorClient } from '../domain/narrator/NarratorClient';
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
import type { OpeningSetup } from '../domain/runtime/initialState';
import type { RuntimeState } from '../domain/runtime/types';
import { createDefaultAiSettings } from '../domain/settings/defaultSettings';
import { LocalStorageSettingsRepository } from '../domain/settings/LocalStorageSettingsRepository';
import type { AiSettings } from '../domain/settings/types';
import { formatGameTimeWithWeekday } from '../domain/time/gameTime';
import { createWritebackRepairClientFromSettings } from '../domain/writeback/createWritebackRepairClientFromSettings';
import { SaveManagerModal } from './components/SaveManagerModal';
import { startOperationalAnalytics } from './analytics/operationalAnalytics';
import { getDisplayFontStack } from './displayFonts';
import { HomeScreen } from './screens/HomeScreen';
import type { SettingsDestination } from './settings/settingsNavigation';

const GameScreen = lazy(() => import('./screens/GameScreen').then((module) => ({ default: module.GameScreen })));
const OpeningScreen = lazy(() => import('./screens/OpeningScreen').then((module) => ({ default: module.OpeningScreen })));
const SettingsScreen = lazy(() => import('./screens/SettingsScreen').then((module) => ({ default: module.SettingsScreen })));
const AdminAnalyticsScreen = lazy(() => import('./admin/AdminAnalyticsScreen').then((module) => ({ default: module.AdminAnalyticsScreen })));

type AppScreen = 'home' | 'opening' | 'game';
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
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);
  const [isOpeningStarting, setIsOpeningStarting] = useState(false);
  const [openingError, setOpeningError] = useState<string | null>(null);
  const [openingStreamText, setOpeningStreamText] = useState('');
  const [lastRawNarratorResponse, setLastRawNarratorResponse] = useState<string | null>(null);
  const currentSaveIdRef = useRef<string | null>(null);
  const currentRollbackChainIdRef = useRef<string | null>(null);
  const aiSettingsRef = useRef<AiSettings>(aiSettings);
  const lastOpeningSetupRef = useRef<OpeningSetup | null>(null);
  const appDisplayStyle = {
    '--font-interface': getDisplayFontStack(aiSettings.display.interfaceFontFamily, 'readable')
  } as CSSProperties;
  const appliedUiTheme = screen === 'home' && !isSettingsOpen && !saveModalMode
    ? 'dark'
    : aiSettings.display.uiTheme;

  useEffect(() => {
    document.documentElement.dataset.uiTheme = appliedUiTheme;
    return () => {
      delete document.documentElement.dataset.uiTheme;
    };
  }, [appliedUiTheme]);

  useEffect(() => startOperationalAnalytics(), []);

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

  async function startGame(openingSetup?: OpeningSetup) {
    lastOpeningSetupRef.current = openingSetup ?? {};
    const previousRollbackChainId = currentRollbackChainIdRef.current;
    const rollbackChainId = createSaveId();
    setIsOpeningStarting(true);
    setOpeningError(null);
    setOpeningStreamText('');
    setLastRawNarratorResponse(null);

    let initialState: RuntimeState;
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
      ...initialStateModule.createInitialRuntimeState(openingSetup),
      storyLog: []
    };
    currentSaveIdRef.current = null;
    currentRollbackChainIdRef.current = rollbackChainId;
    setCurrentSaveId(null);
    setCurrentRollbackChainId(rollbackChainId);
    setState(pendingState);
    setScreen('game');
    void cleanupDisplacedRollbackChain(previousRollbackChainId, rollbackChainId);

    try {
      initialState = await openingModule.runOpening({
        setup: openingSetup,
        initialState: pendingState,
        narrator,
        narrativeLengthLevel: latestSettings.game.narrativeLengthLevel,
        narrativePerspective: latestSettings.game.narrativePerspective,
        promptSettings: latestSettings.prompts,
        onNarrativeDelta: (delta) => setOpeningStreamText((current) => `${current}${delta}`),
        onRawText: (rawText) => setLastRawNarratorResponse(rawText)
      });
    } catch (error) {
      setOpeningError(error instanceof Error ? error.message : '生成开局失败，请检查主剧情 API 配置。');
      setIsOpeningStarting(false);
      return;
    }

    try {
      await saveAutoGame(initialState, true, `新游戏 ${formatGameDateLabel(initialState)}`);
    } catch {
      setSaveError('创建存档失败，但仍可进入当前游戏。');
      currentSaveIdRef.current = null;
      setCurrentSaveId(null);
    }

    setState(initialState);
    setScreen('game');
    setIsOpeningStarting(false);
    setOpeningStreamText('');
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
  }

  function closeSettings() {
    setIsSettingsOpen(false);
  }

  async function loadSave(saveId: string) {
    setSaveError(null);
    try {
      const record = await saveRepository.load(saveId);
      if (!record) {
        setSaveError('没有找到这个存档。');
        return;
      }

      const previousRollbackChainId = currentRollbackChainIdRef.current;
      const nextRollbackChainId = record.rollbackChainId ?? record.saveId;
      const { withRuntimeDefaults } = await import('../domain/runtime/initialState');
      setState(withRuntimeDefaults(record.runtimeState));
      setLastRawNarratorResponse(null);
      currentSaveIdRef.current = record.saveId;
      currentRollbackChainIdRef.current = nextRollbackChainId;
      lastOpeningSetupRef.current = null;
      setCurrentSaveId(record.saveId);
      setCurrentRollbackChainId(nextRollbackChainId);
      setScreen('game');
      setSaveModalMode(null);
      void cleanupDisplacedRollbackChain(previousRollbackChainId, nextRollbackChainId);
    } catch {
      setSaveError('读取存档失败。');
    }
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
      await cleanupOrphanRollbackChains([previousChainId], await saveRepository.list(), nextChainId);
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

  async function importSaves(records: RuntimeSaveRecord[]) {
    setSaveError(null);
    try {
      const { withRuntimeDefaults } = await import('../domain/runtime/initialState');
      const now = new Date().toISOString();
      const importedRecords: RuntimeSaveRecord[] = records.map((record, index) => ({
        ...record,
        saveId: createSaveId(),
        rollbackChainId: createSaveId(),
        saveName: record.saveName || `导入存档 ${index + 1}`,
        saveKind: record.saveKind === 'auto' ? 'auto' : 'manual',
        createdAt: now,
        updatedAt: now,
        runtimeState: withRuntimeDefaults(stripRuntimeEmbeddingCache(record.runtimeState))
      }));
      await saveRepository.saveMany(importedRecords);
      setSaves(await saveRepository.list());
    } catch {
      setSaveError('导入存档失败。');
      throw new Error('Failed to import saves');
    }
  }

  async function exportSaves() {
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
      const zipBytes = await createPortableSaveZip(portableRecords, exportedAt);
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
    if (window.location.pathname === '/admin/analytics') {
      return <AdminAnalyticsScreen />;
    }

    if (screen === 'home') {
      return (
        <HomeScreen
          settings={aiSettings}
          isSettingsLoaded={isSettingsLoaded}
          onStart={() => setScreen('opening')}
          onLoad={() => void openSaveManager('load')}
          onSettings={openSettings}
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
        />
      );
    }

    if (!state) {
      return (
        <HomeScreen
          settings={aiSettings}
          isSettingsLoaded={isSettingsLoaded}
          onStart={() => setScreen('opening')}
          onLoad={() => void openSaveManager('load')}
          onSettings={openSettings}
        />
      );
    }

    return (
      <GameScreen
        state={state}
        onStateChange={setState}
        createNarrator={() => createNarratorClientFromSettings(aiSettingsRef.current)}
        createMemoryEmbedding={() => createMemoryEmbeddingClientFromSettings(aiSettingsRef.current)}
        createMemorySummary={() => createMemorySummaryClientFromSettings(aiSettingsRef.current)}
        createWritebackRepair={() => createWritebackRepairClientFromSettings(aiSettingsRef.current)}
        createNpcSimulation={() => createNpcSimulationClientFromSettings(aiSettingsRef.current)}
        createBackgroundEvolution={() => createBackgroundEvolutionClientFromSettings(aiSettingsRef.current)}
        createAuxiliaryGeneration={() => createAuxiliaryGenerationClientFromSettings(aiSettingsRef.current)}
        memoryCompression={aiSettings.memory}
        gameSettings={aiSettings.game}
        promptSettings={aiSettings.prompts}
        displaySettings={aiSettings.display}
        onSave={() => void openSaveManager('save')}
        onAutoSave={saveAutoGame}
        onLoad={() => void openSaveManager('load')}
        onSettings={openSettings}
        onHome={() => setScreen('home')}
        isOpeningStarting={isOpeningStarting}
        openingStreamText={openingStreamText}
        openingError={openingError}
        lastRawNarratorResponse={lastRawNarratorResponse}
        onRawNarratorResponse={setLastRawNarratorResponse}
        onRetryOpening={
          lastOpeningSetupRef.current ? () => void startGame(lastOpeningSetupRef.current ?? undefined) : undefined
        }
        saveId={currentSaveId ?? undefined}
        storyRenderLimit={aiSettings.game.storyRenderLimit}
        rollbackChainId={currentRollbackChainId ?? undefined}
        turnSnapshotRepository={turnSnapshotRepository}
      />
    );
  }

  return (
    <div className="app-font-root" data-ui-theme={appliedUiTheme} style={appDisplayStyle}>
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

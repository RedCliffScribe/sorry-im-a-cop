import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import gameTitleMark from '../../assets/ui/game-title-hk-retro-compact.webp';
import type { AssetArchiveView } from '../components/AssetArchiveModal';
import { CommandBar } from '../components/CommandBar';
import { DiagnosticExportModal } from '../components/DiagnosticExportModal';
import { DynamicMattersPanelModal } from '../components/DynamicMattersPanelModal';
import { FatePanelModal } from '../components/FatePanelModal';
import { FinanceArchiveModal } from '../components/FinanceArchiveModal';
import { GrayNetworkPanelModal } from '../components/GrayNetworkPanelModal';
import { NewsPaperModal } from '../components/NewsPaperModal';
import { PlayerDossierModal } from '../components/PlayerDossierModal';
import { PlayerPanel } from '../components/PlayerPanel';
import { PolicePanelModal } from '../components/PolicePanelModal';
import { RelationshipNetworkPanelModal } from '../components/RelationshipNetworkPanelModal';
import { ReputationArchiveModal } from '../components/ReputationArchiveModal';
import { SocialInstitutionPanelModal } from '../components/SocialInstitutionPanelModal';
import { StoryLog, type PendingPlayerAction } from '../components/StoryLog';
import { WeatherAmbience } from '../components/WeatherAmbience';
import { createNarrativeDiagnostic } from '../diagnostics/createNarrativeDiagnostic';
import type { MemoryEmbeddingClient } from '../../domain/memory/MemoryEmbeddingClient';
import type { NarratorClient } from '../../domain/narrator/NarratorClient';
import { runBackgroundEvolution } from '../../domain/backgroundEvolution/runBackgroundEvolution';
import { selectBackgroundEvolutionCandidates } from '../../domain/backgroundEvolution/selection';
import { getNewsIssueCategory } from '../../domain/news/newsIssueLifecycle';
import { IndexedDbTurnSnapshotRepository } from '../../domain/persistence/IndexedDbTurnSnapshotRepository';
import type { TurnSnapshotRepository } from '../../domain/persistence/TurnSnapshotRepository';
import {
  spendPlayerAttributePoint,
  type PlayerAttributeKey
} from '../../domain/progression/playerProgression';
import type { CombatEventId, GameTime, RuntimeState, WeatherCondition } from '../../domain/runtime/types';
import type { DisplaySettings, GameSettings, MemoryCompressionSettings, PromptSettings } from '../../domain/settings/types';
import { formatChineseGameTimeWithWeekday } from '../../domain/time/gameTime';
import { runPlayerTurn, type TurnExecutionStage } from '../../domain/turn/TurnEngine';
import { createTurnRollbackSnapshot, restoreTurnRollbackSnapshot } from '../../domain/turn/TurnRollback';

const AssetArchiveModal = lazy(() =>
  import('../components/AssetArchiveModal').then((module) => ({ default: module.AssetArchiveModal }))
);
const CaseArchiveModal = lazy(() =>
  import('../components/CaseArchiveModal').then((module) => ({ default: module.CaseArchiveModal }))
);
const CharacterArchiveModal = lazy(() =>
  import('../components/CharacterArchiveModal').then((module) => ({ default: module.CharacterArchiveModal }))
);
const CombatArchiveModal = lazy(() =>
  import('../components/CombatArchiveModal').then((module) => ({ default: module.CombatArchiveModal }))
);
const MapArchiveModal = lazy(() =>
  import('../components/MapArchiveModal').then((module) => ({ default: module.MapArchiveModal }))
);
const MemoryArchiveModal = lazy(() =>
  import('../components/MemoryArchiveModal').then((module) => ({ default: module.MemoryArchiveModal }))
);

interface GameScreenProps {
  state: RuntimeState;
  onStateChange: (state: RuntimeState) => void;
  createNarrator: () => NarratorClient;
  createMemoryEmbedding?: () => MemoryEmbeddingClient | null;
  createMemorySummary?: () => NarratorClient | null;
  createWritebackRepair?: () => NarratorClient | null;
  createNpcSimulation?: () => NarratorClient | null;
  createBackgroundEvolution?: () => NarratorClient | null;
  createAuxiliaryGeneration?: () => NarratorClient | null;
  memoryCompression?: MemoryCompressionSettings;
  gameSettings?: GameSettings;
  promptSettings?: PromptSettings;
  displaySettings?: DisplaySettings;
  onSave: () => void;
  onAutoSave: (state: RuntimeState, force?: boolean) => Promise<void>;
  onLoad: () => void | Promise<void>;
  onSettings: () => void;
  onHome: () => void;
  isOpeningStarting?: boolean;
  openingStreamText?: string;
  openingError?: string | null;
  lastRawNarratorResponse?: string | null;
  onRawNarratorResponse?: (rawText: string | null) => void;
  onRetryOpening?: () => void;
  saveId?: string;
  rollbackChainId?: string;
  turnSnapshotRepository?: TurnSnapshotRepository;
  storyRenderLimit?: number;
}

type GameTurnExecutionStage = TurnExecutionStage | 'preparing_turn' | 'saving_progress' | 'stopping_turn';

const turnExecutionStageLabels: Record<GameTurnExecutionStage, string> = {
  preparing_turn: '整理回合上下文',
  recalling_memory: '检索相关记忆',
  simulating_npcs: '模拟相关 NPC',
  generating_narrative: '生成剧情正文',
  validating_writeback: '校验剧情与状态写回',
  applying_turn_results: '结算本回合状态',
  evolving_background: '推演远场人物与城市动态',
  updating_city_news: '检查报章与城市动态',
  compressing_memory: '整理阶段记忆',
  embedding_memory: '建立记忆索引',
  finalizing_turn: '完成本回合记录',
  saving_progress: '保存本回合进度',
  stopping_turn: '中止本回合请求'
};

function formatGameTime(time: GameTime) {
  return formatChineseGameTimeWithWeekday(time);
}

function formatLocation(state: RuntimeState) {
  const place = state.places[state.location.currentPlaceId];
  const scene = state.location.currentSceneId ? state.scenes[state.location.currentSceneId] : undefined;
  if (!place && !scene) return '未知地点';
  return [place?.name, scene?.name].filter(Boolean).join(' · ');
}

function formatWeather(state: RuntimeState) {
  const weather = state.environment?.weather;
  if (!weather) return '天气未定';
  return weather.impactSummary ? `${weather.label} · ${weather.impactSummary}` : weather.label;
}

export type MobileGameRegion = 'profile' | 'narrative' | 'systems';

export function MobileGameRegionSwitcher({
  activeRegion,
  onSelect
}: {
  activeRegion: MobileGameRegion;
  onSelect: (region: MobileGameRegion) => void;
}) {
  const regions: Array<{ key: MobileGameRegion; label: string; controls: string }> = [
    { key: 'profile', label: '身份', controls: 'game-mobile-region-profile' },
    { key: 'narrative', label: '正文', controls: 'game-mobile-region-narrative' },
    { key: 'systems', label: '功能', controls: 'game-mobile-region-systems' }
  ];

  return (
    <nav className="game-mobile-region-switcher" aria-label="移动端主界面区域">
      {regions.map((region) => (
        <button
          key={region.key}
          type="button"
          className={activeRegion === region.key ? 'active' : ''}
          aria-controls={region.controls}
          aria-pressed={activeRegion === region.key}
          onClick={() => onSelect(region.key)}
        >
          {region.label}
        </button>
      ))}
    </nav>
  );
}

function WeatherIcon({ condition }: { condition: WeatherCondition }) {
  const iconClassName = `game-weather-icon game-weather-icon--${condition}`;

  if (condition === 'clear') {
    return (
      <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="16" cy="16" r="5.5" />
        <path d="M16 3.5v4M16 24.5v4M3.5 16h4M24.5 16h4M7.2 7.2l2.8 2.8M22 22l2.8 2.8M24.8 7.2 22 10M10 22l-2.8 2.8" />
      </svg>
    );
  }

  if (condition === 'typhoon_signal') {
    return (
      <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M25.8 8.1c-2.2-2.5-5.8-3.8-9.2-3.2-3.6.6-6.4 3.3-7.1 6.7-.8 3.8 1.3 7.6 5 9.1 3.3 1.3 7.2.2 9.3-2.7" />
        <path d="M6.2 23.9c2.2 2.5 5.8 3.8 9.2 3.2 3.6-.6 6.4-3.3 7.1-6.7.8-3.8-1.3-7.6-5-9.1-3.3-1.3-7.2-.2-9.3 2.7" />
        <circle cx="16" cy="16" r="2.4" />
      </svg>
    );
  }

  if (condition === 'humid_hot') {
    return (
      <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="10.5" cy="11" r="4.2" />
        <path d="M10.5 3.2v2.2M10.5 16.6v2.2M2.7 11h2.2M16.1 11h2.2M5 5.5l1.6 1.6M14.4 14.9l1.6 1.6M16 5.5l-1.6 1.6M6.6 14.9 5 16.5M21 7.5c-3 3.1 3.1 5.1 0 8.3s3.1 5.2 0 8.5M27 7.5c-3 3.1 3.1 5.1 0 8.3s3.1 5.2 0 8.5" />
      </svg>
    );
  }

  if (condition === 'cool_dry') {
    return (
      <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M4 10h15.5c3.8 0 3.8-5.2.4-5.2-1.7 0-2.7.9-3.1 2M4 16h21c4.2 0 4.2 5.6.5 5.6-1.8 0-2.9-1-3.3-2.2M4 22h11.5" />
      </svg>
    );
  }

  if (condition === 'foggy') {
    return (
      <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path d="M7 15.5h18M4 20h20M8 24.5h20M10.5 11.5c1.1-3.2 4.1-5.3 7.5-5.3 3.6 0 6.7 2.4 7.7 5.7" />
      </svg>
    );
  }

  const rainDrops = condition === 'light_rain'
    ? <path d="M12 23.5 10.7 27M21 23.5 19.7 27" />
    : <path d="M10 23.5 8.5 27.5M16.5 23.5 15 27.5M23 23.5l-1.5 4" />;

  return (
    <svg className={iconClassName} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7.5 20.5h16.2a4.2 4.2 0 0 0 .5-8.4 7.1 7.1 0 0 0-13.3 2A3.7 3.7 0 0 0 7.5 20.5Z" />
      {condition === 'thunderstorm' ? <path className="game-weather-icon-bolt" d="m17.4 21.7-4.1 5.2h3.4l-1.1 3.6 4.7-5.7h-3.5Z" /> : null}
      {condition === 'light_rain' || condition === 'heavy_rain' ? rainDrops : null}
    </svg>
  );
}

const grayNetworkPanelEntry = '社团';
const institutionPanelEntry = '机构';
const dynamicPanelEntry = '动态';
const newsPanelEntry = '新闻';
const combatPanelEntry = '战斗';
const memoryPanelEntry = '回忆';
const relationshipNetworkPanelEntry = '人脉';
const fatePanelEntry = '缘份';
const policeOnlyPanelEntries = new Set(['案件', '警队']);
const rightPanelGroupDefinitions = [
  {
    groupId: 'location',
    title: '城市位置',
    tone: 'location',
    entries: ['地图']
  },
  {
    groupId: 'risk',
    title: '风险冲突',
    tone: 'risk',
    entries: [combatPanelEntry]
  },
  {
    groupId: 'resources',
    title: '个人资源',
    tone: 'resources',
    entries: ['物品与资产', '金钱与收支']
  },
  {
    groupId: 'current',
    title: '当前事务',
    tone: 'current',
    entries: [dynamicPanelEntry, '案件', newsPanelEntry]
  },
  {
    groupId: 'relations',
    title: '人物关系',
    tone: 'relations',
    entries: ['人物志', relationshipNetworkPanelEntry, fatePanelEntry, '口碑']
  },
  {
    groupId: 'organizations',
    title: '组织网络',
    tone: 'organizations',
    entries: ['警队', grayNetworkPanelEntry, institutionPanelEntry]
  },
  {
    groupId: 'memory',
    title: '回忆',
    tone: 'memory',
    entries: [memoryPanelEntry]
  }
];

function hasPoliceSystemAccess(state: RuntimeState) {
  return state.player.currentIdentity === 'police';
}

function getRightPanelGroups(state: RuntimeState) {
  const canUsePoliceSystems = hasPoliceSystemAccess(state);
  return rightPanelGroupDefinitions
    .map((group) => ({
      ...group,
      entries: group.entries.filter((entry) => canUsePoliceSystems || !policeOnlyPanelEntries.has(entry))
    }))
    .filter((group) => group.entries.length > 0);
}

function getLatestSuggestedActions(state: RuntimeState): string[] {
  return [...state.storyLog]
    .reverse()
    .find((entry) => entry.speaker === 'narrator' && entry.suggestedActions?.length)?.suggestedActions ?? [];
}

function getFooterTickerItems(state: RuntimeState): string[] {
  const currentMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.visibility !== 'hidden' && matter.status !== 'archived')
    .sort((left, right) => {
      const leftTime = Date.UTC(left.updatedAt.year, left.updatedAt.month - 1, left.updatedAt.day, left.updatedAt.hour, left.updatedAt.minute);
      const rightTime = Date.UTC(right.updatedAt.year, right.updatedAt.month - 1, right.updatedAt.day, right.updatedAt.hour, right.updatedAt.minute);
      return rightTime - leftTime;
    })
    .slice(0, 4)
    .map((matter) => `动态：${matter.title}`);
  const signals = Object.values(state.dynamicEvents.signals)
    .filter((signal) => signal.status !== 'archived')
    .slice(0, 3)
    .map((signal) => `风声：${signal.title}`);
  const news = Object.values(state.dynamicEvents.newsIssues)
    .filter((issue) => getNewsIssueCategory(issue, state.time) === 'latest')
    .sort((left, right) => {
      const leftTime = Date.UTC(left.date.year, left.date.month - 1, left.date.day, left.date.hour, left.date.minute);
      const rightTime = Date.UTC(right.date.year, right.date.month - 1, right.date.day, right.date.hour, right.date.minute);
      return rightTime - leftTime;
    })
    .slice(0, 4)
    .map((issue) => `新闻：${issue.outletName} - ${issue.headline}`);
  return [...currentMatters, ...signals, ...news].filter(Boolean);
}

function getRollbackSnapshotLimit(gameSettings: GameSettings | undefined): number {
  const value = gameSettings?.rollbackSnapshotLimit ?? 20;
  if (!Number.isFinite(value)) return 20;
  return Math.max(0, Math.min(50, Math.trunc(value)));
}

export function getPlayerFacingTurnFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message.trim()) return '系统处理异常';

  if (/timeout|timed out|超时/i.test(message)) return '接口响应超时';
  if (/insufficient[_ -]?quota|quota|insufficient credits?|余额不足|额度不足/i.test(message)) {
    return '接口额度不足';
  }
  if (/rate[_ -]?limit|too many requests|\b429\b|限流|请求过于频繁/i.test(message)) {
    return '接口请求受限';
  }
  if (
    /\b(?:401|403)\b|unauthorized|forbidden|(?:invalid|incorrect) api key|api key.*(?:invalid|incorrect|无效|错误)|鉴权|认证失败/i.test(
      message
    )
  ) {
    return 'API 鉴权失败';
  }
  if (/暂不支持.*(?:调用|接口)|接口类型.*不支持/i.test(message)) return '当前接口类型不支持此操作';
  if (
    /未配置|请先.*配置|配置(?:不完整|不存在)|未选择.*(?:API|模型)|(?:API|模型).*未选择|必须选择模型|缺少.*(?:Base URL|API Key)|no (?:api|model)/i.test(
      message
    )
  ) {
    return 'API 配置不完整';
  }
  if (
    /failed to fetch|fetch failed|network ?error|network request failed|econn|enotfound|网络连接|连接失败/i.test(
      message
    )
  ) {
    return '网络连接失败';
  }
  if (/\b5\d\d\b|service unavailable|bad gateway|服务暂时不可用/i.test(message)) {
    return '接口服务暂时不可用';
  }
  if (/json|schema|parse|解析|格式|校验|验证|writeback|事实摘要/i.test(message)) {
    return '接口返回格式无效';
  }
  if (/\b4\d\d\b|bad request|请求被拒绝/i.test(message)) return '接口拒绝了请求';

  return '系统处理异常';
}

export function findNewVisibleCombatEventId(previous: RuntimeState, next: RuntimeState): CombatEventId | null {
  const previousIds = new Set(Object.keys(previous.combatEvents));
  const candidates = Object.values(next.combatEvents)
    .filter((combat) => combat.visibility !== 'hidden' && !previousIds.has(combat.combatId))
    .sort(
      (left, right) =>
        right.gameTime.year - left.gameTime.year ||
        right.gameTime.month - left.gameTime.month ||
        right.gameTime.day - left.gameTime.day ||
        right.gameTime.hour - left.gameTime.hour ||
        right.gameTime.minute - left.gameTime.minute ||
        right.intensity - left.intensity
    );

  return candidates[0]?.combatId ?? null;
}

export function GameScreen({
  state,
  onStateChange,
  createNarrator,
  createMemoryEmbedding,
  createMemorySummary,
  createWritebackRepair,
  createNpcSimulation,
  createBackgroundEvolution,
  createAuxiliaryGeneration,
  memoryCompression,
  gameSettings,
  promptSettings,
  displaySettings,
  onSave,
  onAutoSave,
  onLoad,
  onSettings,
  onHome,
  isOpeningStarting = false,
  openingStreamText = '',
  openingError = null,
  lastRawNarratorResponse = null,
  onRawNarratorResponse,
  onRetryOpening,
  saveId,
  rollbackChainId,
  turnSnapshotRepository,
  storyRenderLimit = 30
}: GameScreenProps) {
  const [mobileGameRegion, setMobileGameRegion] = useState<MobileGameRegion>('narrative');
  const [isRunning, setIsRunning] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [lastTurnErrorDetail, setLastTurnErrorDetail] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [streamingGameTime, setStreamingGameTime] = useState<GameTime | null>(null);
  const [pendingPlayerAction, setPendingPlayerAction] = useState<PendingPlayerAction | null>(null);
  const [turnExecutionStage, setTurnExecutionStage] = useState<GameTurnExecutionStage | null>(null);
  const [canAbortTurn, setCanAbortTurn] = useState(false);
  const [isAbortingTurn, setIsAbortingTurn] = useState(false);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [diagnosticText, setDiagnosticText] = useState('');
  const [isAssetArchiveOpen, setIsAssetArchiveOpen] = useState(false);
  const [assetArchiveInitialView, setAssetArchiveInitialView] = useState<AssetArchiveView>('allItems');
  const [isCaseArchiveOpen, setIsCaseArchiveOpen] = useState(false);
  const [isCharacterArchiveOpen, setIsCharacterArchiveOpen] = useState(false);
  const [isFinanceArchiveOpen, setIsFinanceArchiveOpen] = useState(false);
  const [isMapArchiveOpen, setIsMapArchiveOpen] = useState(false);
  const [isPolicePanelOpen, setIsPolicePanelOpen] = useState(false);
  const [isReputationArchiveOpen, setIsReputationArchiveOpen] = useState(false);
  const [isRelationshipNetworkPanelOpen, setIsRelationshipNetworkPanelOpen] = useState(false);
  const [isFatePanelOpen, setIsFatePanelOpen] = useState(false);
  const [isSocialInstitutionPanelOpen, setIsSocialInstitutionPanelOpen] = useState(false);
  const [isGrayNetworkPanelOpen, setIsGrayNetworkPanelOpen] = useState(false);
  const [isDynamicPanelOpen, setIsDynamicPanelOpen] = useState(false);
  const [isNewsPaperOpen, setIsNewsPaperOpen] = useState(false);
  const [isCombatArchiveOpen, setIsCombatArchiveOpen] = useState(false);
  const [isMemoryArchiveOpen, setIsMemoryArchiveOpen] = useState(false);
  const [isPlayerDossierOpen, setIsPlayerDossierOpen] = useState(false);
  const [isManualEvolutionRunning, setIsManualEvolutionRunning] = useState(false);
  const [manualEvolutionStatus, setManualEvolutionStatus] = useState<string | null>(null);
  const [combatInitialDetailId, setCombatInitialDetailId] = useState<CombatEventId | null>(null);
  const [lastDiagnosticPlayerInput, setLastDiagnosticPlayerInput] = useState('');
  const [draftAction, setDraftAction] = useState<{ text: string; version: number } | null>(null);
  const [rollbackAvailableTurnNumbers, setRollbackAvailableTurnNumbers] = useState<number[]>([]);
  const isRunningRef = useRef(false);
  const manualEvolutionRunningRef = useRef(false);
  const activeTurnAbortControllerRef = useRef<AbortController | null>(null);
  const manualEvolutionAbortControllerRef = useRef<AbortController | null>(null);
  const snapshotRepository = useMemo(
    () => turnSnapshotRepository ?? new IndexedDbTurnSnapshotRepository(),
    [turnSnapshotRepository]
  );
  const effectiveRollbackChainId = rollbackChainId ?? saveId;
  const rollbackSnapshotLimit = getRollbackSnapshotLimit(gameSettings);
  const isCommandDisabled = isRunning || isManualEvolutionRunning || isOpeningStarting || Boolean(openingError);
  const activeStreamingText = openingStreamText || streamingText;
  const activeStreamingGameTime = openingStreamText ? state.time : streamingGameTime;
  const latestErrorDetail = openingError ?? lastTurnErrorDetail;
  const suggestedActions = isCommandDisabled ? [] : getLatestSuggestedActions(state);
  const canRetryOpening =
    Boolean(onRetryOpening) &&
    !isRunning &&
    !isOpeningStarting &&
    (Boolean(openingError) || (state.turnCounter === 0 && state.storyLog.some((entry) => entry.speaker === 'narrator')));
  const canUsePoliceSystems = hasPoliceSystemAccess(state);
  const rightPanelGroups = getRightPanelGroups(state);
  const canUseRollback = Boolean(effectiveRollbackChainId) && rollbackSnapshotLimit > 0 && !isCommandDisabled;
  const canRollbackLatestTurn = canUseRollback && rollbackAvailableTurnNumbers.includes(state.turnCounter);
  const hasUnreadCases =
    canUsePoliceSystems && Object.values(state.cases).some((caseFile) => caseFile.unreadActivityCount > 0);
  const footerTickerItems = getFooterTickerItems(state);

  useEffect(() => {
    return () => {
      activeTurnAbortControllerRef.current?.abort(
        new DOMException('游戏界面已关闭。', 'AbortError')
      );
      manualEvolutionAbortControllerRef.current?.abort(
        new DOMException('游戏界面已关闭。', 'AbortError')
      );
    };
  }, []);

  function handleOpenDiagnostic() {
    setDiagnosticText(
      createNarrativeDiagnostic({
        state,
        saveId,
        streamingText: activeStreamingText,
        lastError: latestErrorDetail,
        lastRawNarratorResponse,
        lastPlayerInput: lastDiagnosticPlayerInput
      })
    );
    setIsDiagnosticOpen(true);
  }

  function handleCloseDiagnostic() {
    setIsDiagnosticOpen(false);
    setDiagnosticText('');
  }

  function handleSpendPlayerAttributePoint(attribute: PlayerAttributeKey) {
    const result = spendPlayerAttributePoint(state.player, attribute);
    if (!result.applied) {
      return;
    }

    const actor = state.actors[state.player.actorId];
    onStateChange({
      ...state,
      player: result.player,
      actors: actor
        ? {
            ...state.actors,
            [state.player.actorId]: {
              ...actor,
              attributes: result.player.attributes
            }
          }
        : state.actors
    });
  }

  useEffect(() => {
    let isMounted = true;

    async function refreshSnapshotTurns() {
      if (!effectiveRollbackChainId) {
        setRollbackAvailableTurnNumbers([]);
        return;
      }

      if (rollbackSnapshotLimit <= 0) {
        setRollbackAvailableTurnNumbers([]);
        try {
          await snapshotRepository.clearTurnSnapshotsForChain(effectiveRollbackChainId);
        } catch {
          // Disabling rollback should not interrupt the current game screen.
        }
        return;
      }

      try {
        const snapshots = await snapshotRepository.listTurnSnapshots(effectiveRollbackChainId);
        if (isMounted) {
          setRollbackAvailableTurnNumbers(
            snapshots
              .map((snapshot) => snapshot.turnNumber)
              .filter((turnNumber) => turnNumber > 0 && turnNumber <= state.turnCounter)
          );
        }
      } catch {
        if (isMounted) {
          setRollbackAvailableTurnNumbers([]);
        }
      }
    }

    void refreshSnapshotTurns();

    return () => {
      isMounted = false;
    };
  }, [effectiveRollbackChainId, rollbackSnapshotLimit, snapshotRepository, state.turnCounter]);

  async function executeActionFromState(
    stateBeforeTurn: RuntimeState,
    playerInput: string,
    failureState: RuntimeState,
    signal: AbortSignal
  ): Promise<boolean> {
    try {
      const snapshotTurnNumber = stateBeforeTurn.turnCounter + 1;
      const rollbackSnapshot = createTurnRollbackSnapshot({
        beforeState: stateBeforeTurn,
        actionText: playerInput
      });
      const narrator = createNarrator();
      const memoryEmbedding = createMemoryEmbedding?.() ?? undefined;
      const memorySummary = createMemorySummary?.() ?? undefined;
      const writebackRepair = createWritebackRepair?.() ?? undefined;
      const npcSimulation = createNpcSimulation?.() ?? undefined;
      const backgroundEvolution = createBackgroundEvolution?.() ?? undefined;
      const auxiliaryGeneration = createAuxiliaryGeneration?.() ?? undefined;

      const next = await runPlayerTurn({
        state: stateBeforeTurn,
        playerInput,
        narrator,
        memoryEmbedding,
        memorySummary,
        writebackRepair,
        npcSimulation,
        backgroundEvolution,
        auxiliaryGeneration,
        memoryCompression,
        gameSettings,
        promptSettings,
        onNarrativeDelta: (delta) => setStreamingText((current) => `${current}${delta}`),
        onRawText: (rawText) => onRawNarratorResponse?.(rawText),
        signal,
        onStageChange: setTurnExecutionStage
      });
      if (activeTurnAbortControllerRef.current?.signal === signal) {
        activeTurnAbortControllerRef.current = null;
      }
      setCanAbortTurn(false);
      setTurnExecutionStage('saving_progress');
      const newCombatId = findNewVisibleCombatEventId(stateBeforeTurn, next);
      setStreamingText('');
      setStreamingGameTime(null);
      onStateChange(next);
      if (effectiveRollbackChainId && rollbackSnapshotLimit > 0) {
        try {
          await snapshotRepository.saveTurnSnapshot({
            chainId: effectiveRollbackChainId,
            turnNumber: snapshotTurnNumber,
            snapshot: rollbackSnapshot,
            maxDepth: rollbackSnapshotLimit
          });
          const snapshots = await snapshotRepository.listTurnSnapshots(effectiveRollbackChainId);
          setRollbackAvailableTurnNumbers(
            snapshots
              .map((snapshot) => snapshot.turnNumber)
              .filter((turnNumber) => turnNumber > 0 && turnNumber <= next.turnCounter)
          );
        } catch {
          setSaveStatus('回溯快照保存失败，本回合仍已完成。');
        }
      }
      if (newCombatId) {
        setCombatInitialDetailId(newCombatId);
        setIsCombatArchiveOpen(true);
      }
      try {
        await onAutoSave(next);
      } catch {
        setSaveStatus('自动保存失败，请手动保存。');
      }
      const backgroundRun = next.backgroundEvolution.lastRun;
      if (backgroundRun?.status === 'failed' || backgroundRun?.status === 'aborted') {
        setTurnError(
          `主回合已完成，但后台演化${backgroundRun.status === 'aborted' ? '已中止' : '失败'}：${backgroundRun.errorReason ?? '未返回具体原因'}。`
        );
      }
      return true;
    } catch (error) {
      const wasAborted = signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
      setStreamingText('');
      setStreamingGameTime(null);
      onStateChange(failureState);
      setLastTurnErrorDetail(wasAborted ? null : error instanceof Error ? error.message : String(error));
      setDraftAction((current) => ({ text: playerInput, version: (current?.version ?? 0) + 1 }));
      setTurnError(
        wasAborted
          ? '本回合已中止，行动内容已放回输入框。'
          : `行动未完成：${getPlayerFacingTurnFailureReason(error)}。行动内容已放回输入框。`
      );
      return false;
    }
  }

  async function runActionFromState(
    stateBeforeTurn: RuntimeState,
    playerInput: string,
    failureState = stateBeforeTurn
  ): Promise<boolean> {
    if (isCommandDisabled || isRunningRef.current || manualEvolutionRunningRef.current) return false;

    isRunningRef.current = true;
    setManualEvolutionStatus(null);
    const abortController = new AbortController();
    activeTurnAbortControllerRef.current = abortController;
    setIsRunning(true);
    setCanAbortTurn(true);
    setIsAbortingTurn(false);
    setTurnExecutionStage('preparing_turn');
    setPendingPlayerAction({
      text: playerInput,
      gameTime: stateBeforeTurn.time,
      turnNumber: stateBeforeTurn.turnCounter + 1
    });
    setTurnError(null);
    setLastTurnErrorDetail(null);
    setSaveStatus(null);
    setStreamingText('');
    onRawNarratorResponse?.(null);
    setLastDiagnosticPlayerInput(playerInput);
    setStreamingGameTime(stateBeforeTurn.time);

    try {
      return await executeActionFromState(stateBeforeTurn, playerInput, failureState, abortController.signal);
    } finally {
      if (activeTurnAbortControllerRef.current === abortController) {
        activeTurnAbortControllerRef.current = null;
      }
      isRunningRef.current = false;
      setIsRunning(false);
      setCanAbortTurn(false);
      setIsAbortingTurn(false);
      setTurnExecutionStage(null);
      setPendingPlayerAction(null);
    }
  }

  function handleAbortTurn() {
    const controller = activeTurnAbortControllerRef.current;
    if (!controller || controller.signal.aborted) return;

    setIsAbortingTurn(true);
    setTurnExecutionStage('stopping_turn');
    controller.abort(new DOMException('玩家已中止本回合生成。', 'AbortError'));
  }

  async function handleRunManualEvolution() {
    if (isRunningRef.current || manualEvolutionRunningRef.current || isOpeningStarting) return;

    const foregroundTurnId = `manual_${state.turnCounter}_${state.backgroundEvolution.lastRun?.runId ?? 'first'}`;
    const selection = selectBackgroundEvolutionCandidates({
      state,
      foregroundTurnId,
      manual: true
    });
    const abortController = new AbortController();
    manualEvolutionAbortControllerRef.current = abortController;
    manualEvolutionRunningRef.current = true;
    setIsManualEvolutionRunning(true);
    setManualEvolutionStatus(null);

    try {
      const result = await runBackgroundEvolution({
        state,
        selection,
        client: createBackgroundEvolution?.() ?? null,
        foregroundTurnId,
        signal: abortController.signal
      });
      onStateChange(result.state);
      const run = result.state.backgroundEvolution.lastRun;
      if (result.status === 'succeeded') {
        setManualEvolutionStatus(
          `本次推演完成：写入 ${run?.appliedPatchCount ?? 0} 项，舍弃 ${run?.droppedPatchCount ?? 0} 项无效写回。`
        );
      } else if (result.status === 'skipped') {
        setManualEvolutionStatus(run?.errorReason === 'route_disabled' ? '远场演化路由未启用。' : '当前没有可推演的远场候选。');
      } else if (result.status === 'aborted') {
        setManualEvolutionStatus(`本次推演已中止：${run?.errorReason ?? '玩家主动中止。'}`);
      } else {
        setManualEvolutionStatus(`本次推演失败：${run?.errorReason ?? '未返回具体原因。'}`);
      }
      try {
        await onAutoSave(result.state, true);
      } catch {
        setSaveStatus('后台推演后自动保存失败，请手动保存。');
      }
    } catch (error) {
      setManualEvolutionStatus(`本次推演失败：${error instanceof Error ? error.message : '系统处理异常。'}`);
    } finally {
      if (manualEvolutionAbortControllerRef.current === abortController) {
        manualEvolutionAbortControllerRef.current = null;
      }
      manualEvolutionRunningRef.current = false;
      setIsManualEvolutionRunning(false);
    }
  }

  function handleAbortManualEvolution() {
    const controller = manualEvolutionAbortControllerRef.current;
    if (!controller || controller.signal.aborted) return;
    setManualEvolutionStatus('正在中止本次后台推演……');
    controller.abort(new DOMException('玩家已中止后台推演。', 'AbortError'));
  }

  async function handleSubmit(playerInput: string) {
    await runActionFromState(state, playerInput);
  }

  async function handleRollbackLatestTurn() {
    if (!effectiveRollbackChainId || !canRollbackLatestTurn || isRunningRef.current) return;

    try {
      const snapshot = await snapshotRepository.loadTurnSnapshot(effectiveRollbackChainId, state.turnCounter);
      if (!snapshot) {
        setRollbackAvailableTurnNumbers((current) => current.filter((turnNumber) => turnNumber !== state.turnCounter));
        setTurnError('这个回合没有可用的回溯快照。');
        return;
      }

      const restored = restoreTurnRollbackSnapshot(snapshot);
      await snapshotRepository.deleteTurnSnapshotsAfter(effectiveRollbackChainId, restored.state.turnCounter);
      onStateChange(restored.state);
      setDraftAction((current) => ({ text: restored.actionText, version: (current?.version ?? 0) + 1 }));
      setRollbackAvailableTurnNumbers((current) =>
        current.filter((turnNumber) => turnNumber <= restored.state.turnCounter)
      );
      setTurnError(null);
      setLastTurnErrorDetail(null);
      setStreamingText('');
      setStreamingGameTime(null);
      try {
        await onAutoSave(restored.state, true);
      } catch {
        setSaveStatus('回溯后自动保存失败，请手动保存。');
      }
    } catch (error) {
      setLastTurnErrorDetail(error instanceof Error ? error.message : String(error));
      setTurnError('读取回溯快照失败。');
    }
  }

  async function handleRegeneratePlayerAction(turnNumber: number, actionText: string) {
    if (!effectiveRollbackChainId || rollbackSnapshotLimit <= 0 || isRunningRef.current) return;

    try {
      const snapshot = await snapshotRepository.loadTurnSnapshot(effectiveRollbackChainId, turnNumber);
      if (!snapshot) {
        setRollbackAvailableTurnNumbers((current) => current.filter((availableTurn) => availableTurn !== turnNumber));
        setTurnError('这个行动没有可用的回溯快照。');
        return;
      }

      const restored = restoreTurnRollbackSnapshot(snapshot);
      const succeeded = await runActionFromState(restored.state, actionText, state);
      if (!succeeded) return;

      try {
        const completedTurnNumber = restored.state.turnCounter + 1;
        await snapshotRepository.deleteTurnSnapshotsAfter(effectiveRollbackChainId, completedTurnNumber);
        setRollbackAvailableTurnNumbers((current) =>
          current.filter((availableTurn) => availableTurn <= completedTurnNumber)
        );
      } catch {
        setSaveStatus('旧回溯分支清理失败，新行动仍已完成。');
      }
    } catch (error) {
      setLastTurnErrorDetail(error instanceof Error ? error.message : String(error));
      setDraftAction((current) => ({ text: actionText, version: (current?.version ?? 0) + 1 }));
      setTurnError('编辑旧行动重发失败。');
    }
  }

  function handleSave() {
    onSave();
  }

  function openAssetArchive(view: AssetArchiveView = 'allItems') {
    setAssetArchiveInitialView(view);
    setIsAssetArchiveOpen(true);
  }

  function handleDraftPlayerAction(actionText: string) {
    setDraftAction((current) => ({ text: actionText, version: (current?.version ?? 0) + 1 }));
  }

  function getPanelEntryAction(entry: string) {
    return entry === '物品与资产'
      ? () => openAssetArchive('allItems')
      : entry === '案件'
      ? () => setIsCaseArchiveOpen(true)
      : entry === '金钱与收支'
      ? () => setIsFinanceArchiveOpen(true)
      : entry === '警队'
      ? () => setIsPolicePanelOpen(true)
      : entry === dynamicPanelEntry
      ? () => setIsDynamicPanelOpen(true)
      : entry === newsPanelEntry
      ? () => setIsNewsPaperOpen(true)
      : entry === combatPanelEntry
      ? () => {
          setCombatInitialDetailId(null);
          setIsCombatArchiveOpen(true);
        }
      : entry === memoryPanelEntry
      ? () => setIsMemoryArchiveOpen(true)
      : entry === '口碑'
      ? () => setIsReputationArchiveOpen(true)
      : entry === relationshipNetworkPanelEntry
      ? () => setIsRelationshipNetworkPanelOpen(true)
      : entry === fatePanelEntry
      ? () => setIsFatePanelOpen(true)
      : entry === '人物志'
      ? () => setIsCharacterArchiveOpen(true)
      : entry === institutionPanelEntry
      ? () => setIsSocialInstitutionPanelOpen(true)
      : entry === grayNetworkPanelEntry
      ? () => setIsGrayNetworkPanelOpen(true)
      : entry === '地图'
        ? () => setIsMapArchiveOpen(true)
        : undefined;
  }

  const currentWeather = state.environment?.weather;
  const weatherLabel = currentWeather?.label ?? '天气未定';

  return (
    <main className="game-shell game-shell--play">
      <section className="game-frame" aria-label="游戏界面">
        <header className="game-topbar">
          <WeatherAmbience
            condition={currentWeather?.condition ?? 'cloudy'}
            intensity={currentWeather?.intensity ?? 35}
            hour={state.time.hour}
          />
          <button
            className="game-back-button"
            type="button"
            disabled={isRunning}
            onClick={onHome}
          >
            ← 返回首页
          </button>
          <div className="game-topbar-left">
            <div className="game-title-block">
              <h1 className="game-title-heading">
                <span className="visually-hidden">对唔住，我系差人</span>
                <img className="game-title-mark" src={gameTitleMark} alt="" aria-hidden="true" />
              </h1>
              <span className="game-title-english">Sorry, I'm a Cop</span>
            </div>
            <div className="game-weather-widget">
              <span
                className="game-weather-trigger"
                tabIndex={0}
                aria-label={`天气：${weatherLabel}`}
                aria-describedby="game-weather-detail"
              >
                <WeatherIcon condition={currentWeather?.condition ?? 'cloudy'} />
                <span className="game-weather-label">天气：{weatherLabel}</span>
              </span>
              <span className="game-weather-tooltip" id="game-weather-detail" role="tooltip">
                {formatWeather(state)}
              </span>
            </div>
          </div>
          <div className="game-time-block" aria-label="当前时间地点">
            <strong>{formatGameTime(state.time)}</strong>
            <span>{formatLocation(state)}</span>
          </div>
          <div className="game-topbar-actions" role="group" aria-label="游戏操作">
            <button className="diagnostic-export-button" type="button" onClick={handleOpenDiagnostic}>
              导出原文
            </button>
            {isOpeningStarting ? <span className="game-status-pill">开局生成中</span> : null}
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="保存进度"
              title="保存进度"
              disabled={isRunning}
              onClick={handleSave}
            >
              保存
            </button>
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="读取进度"
              title="读取进度"
              disabled={isRunning}
              onClick={() => void onLoad()}
            >
              读取
            </button>
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="设置"
              title="设置"
              disabled={isRunning}
              onClick={onSettings}
            >
              设置
            </button>
          </div>
        </header>

        <MobileGameRegionSwitcher activeRegion={mobileGameRegion} onSelect={setMobileGameRegion} />

        <section className="game-play-layout">
          <aside
            id="game-mobile-region-profile"
            className="game-left-rail"
            data-mobile-active={mobileGameRegion === 'profile'}
          >
            <PlayerPanel
              state={state}
              onOpenEquipment={() => openAssetArchive('equipment')}
              onOpenDossier={() => setIsPlayerDossierOpen(true)}
              onSpendAttributePoint={handleSpendPlayerAttributePoint}
            />
          </aside>

          <section
            id="game-mobile-region-narrative"
            className="game-story-column"
            data-mobile-active={mobileGameRegion === 'narrative'}
          >
            <StoryLog
              entries={state.storyLog}
              streamingText={activeStreamingText || undefined}
              streamingGameTime={activeStreamingGameTime ?? undefined}
              pendingPlayerAction={pendingPlayerAction}
              judgementChecks={state.judgementChecks}
              isWaitingForNarrative={isRunning || isOpeningStarting}
              renderLimit={storyRenderLimit}
              displaySettings={displaySettings}
              rollbackAvailableTurnNumbers={rollbackAvailableTurnNumbers}
              onRegeneratePlayerAction={handleRegeneratePlayerAction}
            />
            <div className="game-command-dock">
              {openingError ? (
                <p className="command-error" role="status">
                  开局生成失败，请打开“导出原文”复制诊断信息给我排查。
                </p>
              ) : null}
              {turnError ? (
                <p className="command-error" role="status">
                  {turnError}
                </p>
              ) : null}
              {saveStatus ? (
                <p className="save-status" role="status">
                  {saveStatus}
                </p>
              ) : null}
              {isRunning && turnExecutionStage ? (
                <div className="turn-execution-status" role="status" aria-live="polite">
                  <span>系统正在：</span>
                  <strong>{turnExecutionStageLabels[turnExecutionStage]}</strong>
                </div>
              ) : null}
              {canRetryOpening ? (
                <button className="opening-retry-button" type="button" onClick={onRetryOpening}>
                  {openingError ? '重试开局' : '重掷开局'}
                </button>
              ) : null}
              <CommandBar
                disabled={isCommandDisabled}
                isTurnRunning={isRunning && canAbortTurn}
                isAborting={isAbortingTurn}
                onAbort={isRunning && canAbortTurn ? handleAbortTurn : undefined}
                suggestedActions={suggestedActions}
                onSubmit={handleSubmit}
                draftActionText={draftAction?.text ?? null}
                draftActionVersion={draftAction?.version}
                canRollbackLatestTurn={canRollbackLatestTurn}
                rollbackUnavailableReason={
                  canUseRollback ? '当前回合没有可用的回溯快照。' : '回溯链未启用或回溯快照数量为 0。'
                }
                onRollbackLatestTurn={canUseRollback ? handleRollbackLatestTurn : undefined}
              />
            </div>
          </section>

          <aside
            id="game-mobile-region-systems"
            className="game-right-rail"
            data-mobile-active={mobileGameRegion === 'systems'}
            aria-label="功能入口"
          >
            <nav className="game-panel-nav" aria-label="功能面板">
              {rightPanelGroups.map((group) => (
                <section
                  key={group.groupId}
                  className={`game-panel-group game-panel-group--${group.tone}`}
                  role="group"
                  aria-label={group.title}
                >
                  <div className="game-panel-group-buttons">
                    {group.entries.map((entry) => (
                      <button key={entry} type="button" onClick={getPanelEntryAction(entry)}>
                        {entry}
                        {entry === '案件' && hasUnreadCases ? <span className="game-panel-red-dot" aria-hidden="true" /> : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
            <div className="game-right-placeholder" aria-hidden="true" />
          </aside>
        </section>

        <footer className="game-footer">
          <span className="game-footer-turn">回合：{state.turnCounter}</span>
          {footerTickerItems.length ? (
            <span className="game-footer-ticker" aria-label="城市滚动信息">
              <span className="game-footer-ticker-track">
                {[...footerTickerItems, ...footerTickerItems].map((item, index) => (
                  <span key={`${item}-${index}`} className="game-footer-ticker-item">
                    {item}
                  </span>
                ))}
              </span>
            </span>
          ) : null}
        </footer>
      </section>
      {isDiagnosticOpen ? (
        <DiagnosticExportModal text={diagnosticText} onClose={handleCloseDiagnostic} />
      ) : null}
      <Suspense fallback={<div className="modal-loading" role="status">正在打开...</div>}>
        {isCharacterArchiveOpen ? (
          <CharacterArchiveModal
            state={state}
            onClose={() => setIsCharacterArchiveOpen(false)}
            onStateChange={onStateChange}
          />
        ) : null}
      {isPlayerDossierOpen ? (
        <PlayerDossierModal
          state={state}
          onStateChange={onStateChange}
          onClose={() => setIsPlayerDossierOpen(false)}
        />
      ) : null}
      {isAssetArchiveOpen ? (
        <AssetArchiveModal
          state={state}
          initialView={assetArchiveInitialView}
          onStateChange={onStateChange}
          onClose={() => setIsAssetArchiveOpen(false)}
        />
      ) : null}
      {isCaseArchiveOpen && canUsePoliceSystems ? (
        <CaseArchiveModal
          state={state}
          onStateChange={onStateChange}
          onDraftPlayerAction={handleDraftPlayerAction}
          onClose={() => setIsCaseArchiveOpen(false)}
        />
      ) : null}
      {isFinanceArchiveOpen ? (
        <FinanceArchiveModal state={state} onStateChange={onStateChange} onClose={() => setIsFinanceArchiveOpen(false)} />
      ) : null}
      {isPolicePanelOpen && canUsePoliceSystems ? (
        <PolicePanelModal
          state={state}
          onClose={() => setIsPolicePanelOpen(false)}
          onDraftPlayerAction={handleDraftPlayerAction}
        />
      ) : null}
      {isReputationArchiveOpen ? (
        <ReputationArchiveModal state={state} onClose={() => setIsReputationArchiveOpen(false)} />
      ) : null}
      {isRelationshipNetworkPanelOpen ? (
        <RelationshipNetworkPanelModal state={state} onClose={() => setIsRelationshipNetworkPanelOpen(false)} />
      ) : null}
      {isFatePanelOpen ? <FatePanelModal state={state} onClose={() => setIsFatePanelOpen(false)} /> : null}
      {isSocialInstitutionPanelOpen ? (
        <SocialInstitutionPanelModal state={state} onClose={() => setIsSocialInstitutionPanelOpen(false)} />
      ) : null}
      {isGrayNetworkPanelOpen ? (
        <GrayNetworkPanelModal
          state={state}
          onClose={() => setIsGrayNetworkPanelOpen(false)}
          onDraftPlayerAction={handleDraftPlayerAction}
        />
      ) : null}
        {isDynamicPanelOpen ? (
          <DynamicMattersPanelModal
            state={state}
            onClose={() => setIsDynamicPanelOpen(false)}
            onRunEvolution={createBackgroundEvolution ? handleRunManualEvolution : undefined}
            onAbortEvolution={isManualEvolutionRunning ? handleAbortManualEvolution : undefined}
            isEvolutionRunning={isManualEvolutionRunning}
            evolutionStatus={manualEvolutionStatus}
          />
        ) : null}
      {isNewsPaperOpen ? (
        <NewsPaperModal state={state} onStateChange={onStateChange} onClose={() => setIsNewsPaperOpen(false)} />
      ) : null}
      {isCombatArchiveOpen ? (
        <CombatArchiveModal
          state={state}
          initialCombatId={combatInitialDetailId}
          onClose={() => {
            setIsCombatArchiveOpen(false);
            setCombatInitialDetailId(null);
          }}
        />
      ) : null}
      {isMemoryArchiveOpen ? (
        <MemoryArchiveModal
          state={state}
          recentRawTurnLimit={memoryCompression?.recentRawTurnLimit ?? 12}
          onClose={() => setIsMemoryArchiveOpen(false)}
        />
      ) : null}
        {isMapArchiveOpen ? (
          <MapArchiveModal
            state={state}
            onClose={() => setIsMapArchiveOpen(false)}
            onDraftPlayerAction={handleDraftPlayerAction}
          />
        ) : null}
      </Suspense>
    </main>
  );
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import gameTitleMark from '../../assets/ui/game-title-hk-retro-compact.webp';
import type { AssetArchiveView } from '../components/AssetArchiveModal';
import { AiProcessTraceButton, AiProcessTracePanel } from '../components/AiProcessTracePanel';
import { CommandBar } from '../components/CommandBar';
import { DiagnosticExportModal } from '../components/DiagnosticExportModal';
import { DynamicMattersPanelModal } from '../components/DynamicMattersPanelModal';
import { FatePanelModal } from '../components/FatePanelModal';
import { FinanceArchiveModal } from '../components/FinanceArchiveModal';
import { GrayNetworkPanelModal } from '../components/GrayNetworkPanelModal';
import { LivelihoodPanelModal } from '../components/LivelihoodPanelModal';
import { NewsPaperModal } from '../components/NewsPaperModal';
import { PlayerDossierModal } from '../components/PlayerDossierModal';
import { PlayerPanel } from '../components/PlayerPanel';
import { PolicePanelModal } from '../components/PolicePanelModal';
import { RelationshipNetworkPanelModal } from '../components/RelationshipNetworkPanelModal';
import { ReputationArchiveModal } from '../components/ReputationArchiveModal';
import { SocialInstitutionPanelModal } from '../components/SocialInstitutionPanelModal';
import { StoryLog, type PendingPlayerAction } from '../components/StoryLog';
import {
  StoryPresentationPane,
  type StoryPresentationPaneHandle
} from '../components/avg/StoryPresentationPane';
import type { AvgPresentationResourceRuntime } from '../components/avg/avgPresentationResourceRuntime';
import { StoryExportModal } from '../components/StoryExportModal';
import { WeatherAmbience } from '../components/WeatherAmbience';
import {
  createNarrativeDiagnostic,
  type TurnExecutionDiagnostic
} from '../diagnostics/createNarrativeDiagnostic';
import type { SettingsDestination } from '../settings/settingsNavigation';
import { IndexedDbVisualRepository, type VisualRepository } from '../../domain/imageGeneration/visualRepository';
import { ImagePromptConversionProbe } from '../../domain/imageGeneration/promptConversion';
import { IndexedDbImagePromptTemplateRepository } from '../../domain/imageGeneration/promptConversion';
import { IndexedDbImageAutomationSettingsRepository } from '../../domain/imageGeneration/automationSettings';
import { IndexedDbImageAutomationRuntimeRepository } from '../../domain/imageGeneration/automationRuntime';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import { IndexedDbImageCredentialRepository, IndexedDbImageProfileRepository } from '../../domain/imageGeneration/profile';
import { ImageAutomationCoordinator } from '../../domain/imageGeneration/ImageAutomationCoordinator';
import { formatImageAutomationDiagnostics } from '../../domain/imageGeneration/automationDiagnostics';
import type { MemoryEmbeddingClient } from '../../domain/memory/MemoryEmbeddingClient';
import type {
  NarratorAttemptRecord,
  NarratorAttemptStartRecord,
  NarratorClient
} from '../../domain/narrator/NarratorClient';
import {
  openingExecutionStageLabels,
  type OpeningExecutionStage
} from '../../domain/opening/openingExecutionStage';
import { runBackgroundEvolution } from '../../domain/backgroundEvolution/runBackgroundEvolution';
import { createBalancedLocalD100Roll } from '../../domain/conflict/localJudgement';
import type { JudgementRecoveryTrace } from '../../domain/conflict/judgementRecoveryTrace';
import { selectBackgroundEvolutionCandidates } from '../../domain/backgroundEvolution/selection';
import { getNewsIssueCategory } from '../../domain/news/newsIssueLifecycle';
import { isArchivedCurrentMatter } from '../../domain/dynamic/currentMatterStatus';
import { archiveDynamicEntry, isCurrentSignal } from '../../domain/dynamic/signalLifecycle';
import type { CaseActionIntent } from '../../domain/cases/caseActionIntent';
import { removeRelationshipThreadFromState } from '../../domain/relationship/relationshipThread';
import { IndexedDbTurnSnapshotRepository } from '../../domain/persistence/IndexedDbTurnSnapshotRepository';
import type { TurnSnapshotRepository } from '../../domain/persistence/TurnSnapshotRepository';
import {
  spendPlayerAttributePoint,
  type PlayerAttributeKey
} from '../../domain/progression/playerProgression';
import type { CombatEventId, GameTime, RuntimeState, WeatherCondition } from '../../domain/runtime/types';
import {
  applyManualActorProfileEdit,
  type ManualActorProfileDraft
} from '../../domain/runtime/manualActorProfile';
import { deriveHistoricalActorIdAliases } from '../../domain/runtime/storyDialogueActors';
import type {
  DisplaySettings,
  FeatureModelRoute,
  GameSettings,
  MemoryCompressionSettings,
  PromptSettings,
  TavernManagementSettings
} from '../../domain/settings/types';
import { formatChineseGameTimeWithWeekday } from '../../domain/time/gameTime';
import { runPlayerTurn, type TurnExecutionStage } from '../../domain/turn/TurnEngine';
import { createTurnRollbackSnapshot, restoreTurnRollbackSnapshot } from '../../domain/turn/TurnRollback';
import { collectUnresolvedPartialWritebackDiagnostics } from '../../domain/writeback/writebackDiagnostics';
import type { OfficialDlcDramaAuditRecord } from '../../domain/dlc/dramaAudit';
import type { AvgVisualOverrideRepository } from '../../domain/avgVisualOverride';
import { AvgImageGenerationService } from '../../domain/avgImageGeneration';
import { CharacterImageRuntimeExecutor } from '../../domain/imageGeneration/characterImageRuntimeExecutor';
import { IndexedDbImageGenerationPresetRepository } from '../../domain/imageGeneration/generationPresets';
import { IndexedDbPngStyleRepository } from '../../domain/imageGeneration/pngStyle';

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
const ImageGalleryModal = lazy(() =>
  import('../components/ImageGalleryModal').then((module) => ({ default: module.ImageGalleryModal }))
);

const visualRepositoryMethodSet = {
  loadSnapshot: true,
  getStorageSummary: true,
  inspectStorageIntegrity: true,
  cleanupStorageIssues: true,
  restoreAssetBlob: true,
  saveCharacterAnchor: true,
  saveScenePlan: true,
  saveScenePlanWithTasks: true,
  saveTask: true,
  saveCharacterBatch: true,
  saveCharacterBatchWithTasks: true,
  saveStorySceneDisplayState: true,
  bindAsset: true,
  unbindAsset: true,
  restoreSceneAssetToStory: true,
  completeTaskWithImages: true,
  persistLateTaskImages: true,
  importUserImage: true,
  getBlob: true,
  getAssetDeletionImpact: true,
  deleteAsset: true,
  exportSave: true,
  replaceSaveFromArchive: true,
  clearSave: true
} satisfies Record<keyof VisualRepository, true>;

const visualRepositoryMethods = Object.keys(visualRepositoryMethodSet) as (keyof VisualRepository)[];

function supportsVisualWrites(repository: Pick<VisualRepository, 'loadSnapshot'>): repository is VisualRepository {
  const candidate = repository as Partial<VisualRepository>;
  return visualRepositoryMethods.every((method) => typeof candidate[method] === 'function');
}

interface GameScreenProps {
  state: RuntimeState;
  onStateChange: (state: RuntimeState) => void;
  createNarrator: () => NarratorClient;
  createMemoryEmbedding?: () => MemoryEmbeddingClient | null;
  createMemorySummary?: () => NarratorClient | null;
  createWritebackRepair?: () => NarratorClient | null;
  writebackRepairMode?: FeatureModelRoute['mode'];
  createNpcSimulation?: () => NarratorClient | null;
  createBackgroundEvolution?: () => NarratorClient | null;
  createAuxiliaryGeneration?: () => NarratorClient | null;
  auxiliaryGenerationMode?: FeatureModelRoute['mode'];
  memoryCompression?: MemoryCompressionSettings;
  gameSettings?: GameSettings;
  promptSettings?: PromptSettings;
  onPromptSettingsChange?: (settings: PromptSettings) => void | Promise<void>;
  tavernSettings?: TavernManagementSettings;
  displaySettings?: DisplaySettings;
  onDisplaySettingsChange?: (settings: DisplaySettings) => void | Promise<void>;
  avgPresentationResourceRuntime?: AvgPresentationResourceRuntime;
  avgResourceRevision?: number;
  avgPlaybackRevision?: number;
  onSave: () => void;
  onAutoSave: (state: RuntimeState, force?: boolean) => Promise<void>;
  onLoad: () => void | Promise<void>;
  onSettings: (destination?: SettingsDestination) => void;
  onHome: () => void;
  isOpeningStarting?: boolean;
  openingStreamText?: string;
  openingError?: string | null;
  openingSaveError?: string | null;
  openingStage?: OpeningExecutionStage | null;
  openingStageDetail?: string | null;
  openingActionPreview?: string[];
  openingAttempts?: NarratorAttemptRecord[];
  openingReasoningText?: string;
  lastRawNarratorResponse?: string | null;
  onRawNarratorResponse?: (rawText: string | null) => void;
  onRetryOpening?: () => void;
  onChangeOpeningModel?: () => void;
  onAbandonOpening?: () => void;
  onRetryOpeningSave?: () => void;
  saveId?: string;
  rollbackChainId?: string;
  turnSnapshotRepository?: TurnSnapshotRepository;
  visualRepository?: Pick<VisualRepository, 'loadSnapshot'>;
  avgVisualOverrideRepository?: AvgVisualOverrideRepository;
  storyRenderLimit?: number;
}

type GameTurnExecutionStage = TurnExecutionStage | 'preparing_turn' | 'saving_progress' | 'stopping_turn';

const turnExecutionStageLabels: Record<GameTurnExecutionStage, string> = {
  preparing_turn: '整理回合上下文',
  recalling_memory: '检索相关记忆',
  simulating_npcs: '模拟相关 NPC',
  preflighting_judgement: '判断本回合是否需要判定',
  repairing_judgement_preflight: '补齐判定预检的必要信息',
  generating_narrative: '生成剧情正文',
  regenerating_narrative: '正文篇幅不足，重新生成正文',
  normalizing_judgement: '正在按本地规则校正判定记录',
  repairing_judgement_structure: '正在补齐判定意图的必要信息',
  regenerating_judgement: '判定结果与本地结算不一致，正在校正相关正文',
  repairing_judgement_narrative: '判定结果与本地结算不一致，正在校正相关正文',
  repairing_judgement_response: '正在校验判定正文校正结果',
  validating_writeback: '校验剧情与状态写回',
  applying_turn_results: '结算本回合状态',
  evolving_background: '推演远场人物与城市动态',
  updating_city_news: '检查报章与城市动态',
  planning_drama: '整理本回合戏剧素材',
  compressing_memory: '整理阶段记忆',
  embedding_memory: '建立记忆索引',
  finalizing_turn: '完成本回合记录',
  saving_progress: '保存本回合进度',
  stopping_turn: '中止本回合请求'
};

const aiProcessStageLabels: Readonly<Record<string, string>> = {
  ...turnExecutionStageLabels,
  ...openingExecutionStageLabels
};

function advanceTurnExecutionDiagnostic(
  current: TurnExecutionDiagnostic | null,
  stage: GameTurnExecutionStage,
  occurredAt = new Date().toISOString()
): TurnExecutionDiagnostic | null {
  if (!current || current.status !== 'running') return current;
  const stages = current.stages?.length
    ? current.stages.map((item) => ({ ...item }))
    : [{ stage: current.stage, startedAt: current.startedAt }];
  const latest = stages.at(-1);
  if (latest?.stage === stage) return { ...current, stage, stages };
  if (latest && !latest.finishedAt) latest.finishedAt = occurredAt;
  stages.push({ stage, startedAt: occurredAt });
  return { ...current, stage, stages };
}

function finishTurnExecutionDiagnostic(
  current: TurnExecutionDiagnostic | null,
  status: 'succeeded' | 'failed' | 'aborted',
  finishedAt: string,
  errorMessage?: string
): TurnExecutionDiagnostic | null {
  if (!current) return current;
  const stages = current.stages?.length
    ? current.stages.map((item) => ({ ...item }))
    : [{ stage: current.stage, startedAt: current.startedAt }];
  const latest = stages.at(-1);
  if (latest && !latest.finishedAt) latest.finishedAt = finishedAt;
  return {
    ...current,
    status,
    stage: status === 'succeeded' ? 'completed' : current.stage,
    finishedAt,
    ...(errorMessage ? { errorMessage } : {}),
    stages
  };
}

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

interface RightPanelEntryDefinition {
  entryId: string;
  label: string;
}

const panelEntry = (entryId: string, label: string): RightPanelEntryDefinition => ({ entryId, label });
const mapPanelEntry = panelEntry('map', '地图');
const combatPanelEntry = panelEntry('combat', '战斗');
const assetPanelEntry = panelEntry('assets', '物品与资产');
const financePanelEntry = panelEntry('finance', '金钱与收支');
const galleryPanelEntry = panelEntry('gallery', '图册');
const dynamicPanelEntry = panelEntry('dynamic', '动态');
const casePanelEntry = panelEntry('cases', '案件');
const newsPanelEntry = panelEntry('news', '新闻');
const characterPanelEntry = panelEntry('characters', '人物志');
const relationshipNetworkPanelEntry = panelEntry('relationships', '人脉');
const fatePanelEntry = panelEntry('fate', '缘份');
const reputationPanelEntry = panelEntry('reputation', '口碑');
const policePanelEntry = panelEntry('police', '警队');
const livelihoodPanelEntry = panelEntry('livelihood', '营生');
const grayNetworkPanelEntry = panelEntry('gray-network', '社团');
const institutionPanelEntry = panelEntry('institutions', '机构');
const memoryPanelEntry = panelEntry('memory', '回忆');
const policeOnlyPanelEntryIds = new Set([casePanelEntry.entryId, policePanelEntry.entryId]);
const civilianOnlyPanelEntryIds = new Set([livelihoodPanelEntry.entryId]);
const rightPanelGroupDefinitions = [
  {
    groupId: 'location',
    title: '城市位置',
    tone: 'location',
    entries: [mapPanelEntry]
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
    entries: [assetPanelEntry, financePanelEntry]
  },
  {
    groupId: 'visuals',
    title: '视觉资料',
    tone: 'visuals',
    entries: [galleryPanelEntry]
  },
  {
    groupId: 'current',
    title: '当前事务',
    tone: 'current',
    entries: [dynamicPanelEntry, casePanelEntry, newsPanelEntry]
  },
  {
    groupId: 'relations',
    title: '人物关系',
    tone: 'relations',
    entries: [characterPanelEntry, relationshipNetworkPanelEntry, fatePanelEntry, reputationPanelEntry]
  },
  {
    groupId: 'organizations',
    title: '组织网络',
    tone: 'organizations',
    entries: [policePanelEntry, livelihoodPanelEntry, grayNetworkPanelEntry, institutionPanelEntry]
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
  const canUseCivilianSystems = state.player.currentIdentity === 'civilian';
  return rightPanelGroupDefinitions
    .map((group) => ({
      ...group,
      entries: group.entries.filter(
        (entry) =>
          (canUsePoliceSystems || !policeOnlyPanelEntryIds.has(entry.entryId)) &&
          (canUseCivilianSystems || !civilianOnlyPanelEntryIds.has(entry.entryId))
      )
    }))
    .filter((group) => group.entries.length > 0);
}

function getLatestSuggestedActions(state: RuntimeState): string[] {
  return [...state.storyLog]
    .reverse()
    .find((entry) => entry.speaker === 'narrator')?.suggestedActions ?? [];
}

function getFooterTickerItems(state: RuntimeState): string[] {
  const currentMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => matter.visibility !== 'hidden' && !isArchivedCurrentMatter(matter))
    .sort((left, right) => {
      const leftTime = Date.UTC(left.updatedAt.year, left.updatedAt.month - 1, left.updatedAt.day, left.updatedAt.hour, left.updatedAt.minute);
      const rightTime = Date.UTC(right.updatedAt.year, right.updatedAt.month - 1, right.updatedAt.day, right.updatedAt.hour, right.updatedAt.minute);
      return rightTime - leftTime;
    })
    .slice(0, 4)
    .map((matter) => `动态：${matter.title}`);
  const signals = Object.values(state.dynamicEvents.signals)
    .filter((signal) => signal.visibility !== 'hidden' && isCurrentSignal(signal, state.time))
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
  if (/本地判定叙事校正.*(?:json|schema|parse|解析|格式|校验|验证)/i.test(message)) {
    return '判定叙事校正未返回有效格式';
  }
  if (/judgement_intent_failed/i.test(message)) {
    return '判定预检未返回必要信息';
  }
  if (/judgement_resolution_failed/i.test(message)) {
    return '本地判定结算未能完成';
  }
  if (/judgement_narrative_conflict/i.test(message)) {
    return '判定预检与正文中的对抗记录不一致';
  }
  if (/判定结构修复失败/i.test(message)) {
    const paths = [...message.matchAll(/writeback\.judgementCheckPatches\.\d+\.([A-Za-z]+)/g)]
      .map((match) => match[1]);
    return paths.length > 0
      ? `判定记录仍缺少必要字段：${[...new Set(paths)].join('、')}`
      : '判定结构修复未返回有效格式';
  }
  if (/本地判定缺少可安全结算的结构/i.test(message)) {
    return '判定记录缺少必要信息';
  }
  if (/本地判定|判定.*(?:json|schema|parse|解析|格式|校验|验证)/i.test(message)) {
    return '判定结果重写仍未返回有效格式';
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
  writebackRepairMode,
  createNpcSimulation,
  createBackgroundEvolution,
  createAuxiliaryGeneration,
  auxiliaryGenerationMode,
  memoryCompression,
  gameSettings,
  promptSettings,
  onPromptSettingsChange,
  tavernSettings,
  displaySettings,
  onDisplaySettingsChange,
  avgPresentationResourceRuntime,
  avgResourceRevision = 0,
  avgPlaybackRevision = 0,
  onSave,
  onAutoSave,
  onLoad,
  onSettings,
  onHome,
  isOpeningStarting = false,
  openingStreamText = '',
  openingError = null,
  openingSaveError = null,
  openingStage = null,
  openingStageDetail = null,
  openingActionPreview = [],
  openingAttempts = [],
  openingReasoningText = '',
  lastRawNarratorResponse = null,
  onRawNarratorResponse,
  onRetryOpening,
  onChangeOpeningModel,
  onAbandonOpening,
  onRetryOpeningSave,
  saveId,
  rollbackChainId,
  turnSnapshotRepository,
  visualRepository,
  avgVisualOverrideRepository,
  storyRenderLimit = 30
}: GameScreenProps) {
  const [mobileGameRegion, setMobileGameRegion] = useState<MobileGameRegion>('narrative');
  const [isMobileToolbarOpen, setIsMobileToolbarOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [lastTurnErrorDetail, setLastTurnErrorDetail] = useState<string | null>(null);
  const [lastJudgementRecoveryTrace, setLastJudgementRecoveryTrace] =
    useState<JudgementRecoveryTrace | null>(null);
  const [lastTurnExecution, setLastTurnExecution] =
    useState<TurnExecutionDiagnostic | null>(null);
  const [lastOfficialDlcDramaAudit, setLastOfficialDlcDramaAudit] =
    useState<OfficialDlcDramaAuditRecord[]>([]);
  const [lastTurnNarratorAttemptStarts, setLastTurnNarratorAttemptStarts] =
    useState<NarratorAttemptStartRecord[]>([]);
  const [lastTurnNarratorAttempts, setLastTurnNarratorAttempts] =
    useState<NarratorAttemptRecord[]>([]);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [turnReasoningText, setTurnReasoningText] = useState('');
  const [streamingGameTime, setStreamingGameTime] = useState<GameTime | null>(null);
  const [pendingPlayerAction, setPendingPlayerAction] = useState<PendingPlayerAction | null>(null);
  const [historicalRegenerationPreview, setHistoricalRegenerationPreview] = useState<RuntimeState | null>(null);
  const [turnExecutionStage, setTurnExecutionStage] = useState<GameTurnExecutionStage | null>(null);
  const [canAbortTurn, setCanAbortTurn] = useState(false);
  const [isAbortingTurn, setIsAbortingTurn] = useState(false);
  const [isStoryExportOpen, setIsStoryExportOpen] = useState(false);
  const [isImmersiveMode, setIsImmersiveMode] = useState(false);
  const [isImmersiveDialogOpen, setIsImmersiveDialogOpen] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [immersiveRailOpen, setImmersiveRailOpen] = useState<'left' | 'right' | null>(null);
  const [immersiveStatus, setImmersiveStatus] = useState<string | null>(null);
  const [isDiagnosticOpen, setIsDiagnosticOpen] = useState(false);
  const [isAiProcessTraceOpen, setIsAiProcessTraceOpen] = useState(false);
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
  const [isLivelihoodPanelOpen, setIsLivelihoodPanelOpen] = useState(false);
  const [isSocialInstitutionPanelOpen, setIsSocialInstitutionPanelOpen] = useState(false);
  const [institutionInitialOrganizationId, setInstitutionInitialOrganizationId] = useState<string | null>(null);
  const [isGrayNetworkPanelOpen, setIsGrayNetworkPanelOpen] = useState(false);
  const [isDynamicPanelOpen, setIsDynamicPanelOpen] = useState(false);
  const [isNewsPaperOpen, setIsNewsPaperOpen] = useState(false);
  const [isCombatArchiveOpen, setIsCombatArchiveOpen] = useState(false);
  const [isMemoryArchiveOpen, setIsMemoryArchiveOpen] = useState(false);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [visualRepositoryRevision, setVisualRepositoryRevision] = useState(0);
  const [avgVisualOverrideRevision, setAvgVisualOverrideRevision] = useState(0);
  const [imageConversionSupportsImages, setImageConversionSupportsImages] = useState(false);
  const [isPlayerDossierOpen, setIsPlayerDossierOpen] = useState(false);
  const [playerDossierInitialSection, setPlayerDossierInitialSection] = useState<'overview' | 'visuals'>('overview');
  const [isManualEvolutionRunning, setIsManualEvolutionRunning] = useState(false);
  const [manualEvolutionStatus, setManualEvolutionStatus] = useState<string | null>(null);
  const [combatInitialDetailId, setCombatInitialDetailId] = useState<CombatEventId | null>(null);
  const [lastDiagnosticPlayerInput, setLastDiagnosticPlayerInput] = useState('');
  const [draftAction, setDraftAction] = useState<{
    text: string;
    version: number;
    caseActionIntent?: CaseActionIntent;
  } | null>(null);
  const [rollbackAvailableTurnNumbers, setRollbackAvailableTurnNumbers] = useState<number[]>([]);
  const gameShellRef = useRef<HTMLElement>(null);
  const storyPresentationRef = useRef<StoryPresentationPaneHandle>(null);
  const isRunningRef = useRef(false);
  const manualEvolutionRunningRef = useRef(false);
  const pendingJudgementRollRef = useRef<{ key: string; roll: number } | null>(null);
  const activeTurnAbortControllerRef = useRef<AbortController | null>(null);
  const manualEvolutionAbortControllerRef = useRef<AbortController | null>(null);
  const createAuxiliaryGenerationRef = useRef(createAuxiliaryGeneration);
  createAuxiliaryGenerationRef.current = createAuxiliaryGeneration;
  const previousAutomationStateRef = useRef(state);
  const automationSaveIdRef = useRef<string | undefined>(undefined);
  const automationWorkRef = useRef<Promise<void>>(Promise.resolve());
  const snapshotRepository = useMemo(
    () => turnSnapshotRepository ?? new IndexedDbTurnSnapshotRepository(),
    [turnSnapshotRepository]
  );
  const imageVisualRepository = useMemo(
    () => visualRepository ?? new IndexedDbVisualRepository(),
    [visualRepository]
  );
  const imageAutomationRuntimeRepository = useMemo(() => new IndexedDbImageAutomationRuntimeRepository(), []);
  const imageAutomationSettingsRepository = useMemo(() => new IndexedDbImageAutomationSettingsRepository(), []);
  const imageProfileRepository = useMemo(() => new IndexedDbImageProfileRepository(), []);
  const imageCredentialRepository = useMemo(() => new IndexedDbImageCredentialRepository(), []);
  const imageVerificationStore = useMemo(() => new IndexedDbImageProbeStore(), []);
  const imagePromptTemplateRepository = useMemo(() => new IndexedDbImagePromptTemplateRepository(), []);
  const imageGenerationPresetRepository = useMemo(() => new IndexedDbImageGenerationPresetRepository(), []);
  const pngStyleRepository = useMemo(() => new IndexedDbPngStyleRepository(), []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsNativeFullscreen(document.fullscreenElement === gameShellRef.current);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!immersiveStatus) return;
    const timeoutId = window.setTimeout(() => setImmersiveStatus(null), 4200);
    return () => window.clearTimeout(timeoutId);
  }, [immersiveStatus]);

  const openImmersiveDialog = () => {
    setIsImmersiveDialogOpen(true);
  };

  const enterImmersiveMode = (requestNativeFullscreen: boolean) => {
    setIsImmersiveDialogOpen(false);
    setIsImmersiveMode(true);
    setImmersiveRailOpen(null);
    setMobileGameRegion('narrative');

    if (!requestNativeFullscreen) return;

    const shell = gameShellRef.current;
    if (!shell || typeof shell.requestFullscreen !== 'function') {
      setImmersiveStatus('当前浏览器不支持网页全屏，已进入页面沉浸模式。');
      return;
    }

    try {
      void shell.requestFullscreen().catch(() => {
        setImmersiveStatus('浏览器未允许全屏，已保留页面沉浸模式。');
      });
    } catch {
      setImmersiveStatus('浏览器未允许全屏，已保留页面沉浸模式。');
    }
  };

  const exitImmersiveMode = () => {
    const shell = gameShellRef.current;
    setIsImmersiveDialogOpen(false);
    setIsImmersiveMode(false);
    setImmersiveRailOpen(null);
    setImmersiveStatus(null);
    if (document.fullscreenElement === shell && typeof document.exitFullscreen === 'function') {
      void document.exitFullscreen().catch(() => undefined);
    }
  };
  useEffect(() => {
    let active = true;
    void imagePromptTemplateRepository.load().then(
      (settings) => active && setImageConversionSupportsImages(settings.conversionCapabilities.imageInputEnabled),
      () => active && setImageConversionSupportsImages(false)
    );
    return () => { active = false; };
  }, [imagePromptTemplateRepository]);
  const effectiveRollbackChainId = rollbackChainId ?? saveId;
  const visualSaveId = rollbackChainId ?? saveId;
  const visualActorIdAliases = useMemo(
    () => deriveHistoricalActorIdAliases(state.storyLog, state.actors, state.actorIdAliases),
    [state.actorIdAliases, state.actors, state.storyLog]
  );
  const imageAutomationCoordinator = useMemo(() => supportsVisualWrites(imageVisualRepository)
    ? new ImageAutomationCoordinator({
      visualRepository: imageVisualRepository,
      runtimeRepository: imageAutomationRuntimeRepository,
      settingsRepository: imageAutomationSettingsRepository,
      profileRepository: imageProfileRepository,
      credentialRepository: imageCredentialRepository,
      verificationStore: imageVerificationStore,
      promptTemplateRepository: imagePromptTemplateRepository,
      createPromptConversion: () => {
        const client = createAuxiliaryGenerationRef.current?.();
        return client ? new ImagePromptConversionProbe(client, {
          inputModalities: imageConversionSupportsImages ? ['text', 'image'] : ['text'],
          loadConversionInstructions: async () => (
            await imagePromptTemplateRepository.load()
          ).conversionInstructions
        }) : null;
      },
      pageUrl: () => typeof window === 'undefined' ? undefined : window.location.href,
      onRepositoryChanged: () => setVisualRepositoryRevision((value) => value + 1)
    })
    : null, [
      imageAutomationRuntimeRepository,
      imageAutomationSettingsRepository,
      imageCredentialRepository,
      imageProfileRepository,
      imagePromptTemplateRepository,
      imageConversionSupportsImages,
      imageVerificationStore,
      imageVisualRepository
    ]);
  const avgImageGenerationService = useMemo(() => {
    if (!supportsVisualWrites(imageVisualRepository)) return undefined;
    return new AvgImageGenerationService({
      visualRepository: imageVisualRepository,
      profileRepository: imageProfileRepository,
      credentialRepository: imageCredentialRepository,
      promptTemplateRepository: imagePromptTemplateRepository,
      generationPresetRepository: imageGenerationPresetRepository,
      pngStyleRepository,
      executor: new CharacterImageRuntimeExecutor({
        profiles: imageProfileRepository,
        credentials: imageCredentialRepository,
        verificationStore: imageVerificationStore,
        visualRepository: imageVisualRepository,
        pageUrl: () => typeof window === 'undefined' ? undefined : window.location.href
      }),
      onRepositoryChanged: () => setVisualRepositoryRevision((value) => value + 1)
    });
  }, [
    imageCredentialRepository,
    imageGenerationPresetRepository,
    imageProfileRepository,
    imagePromptTemplateRepository,
    imageVerificationStore,
    imageVisualRepository,
    pngStyleRepository
  ]);
  const rollbackSnapshotLimit = getRollbackSnapshotLimit(gameSettings);
  const isCommandDisabled = isRunning || isManualEvolutionRunning || isOpeningStarting || Boolean(openingError);
  const activeStreamingText = openingStreamText || streamingText;
  const activeStreamingGameTime = openingStreamText ? state.time : streamingGameTime;
  const latestErrorDetail = openingSaveError ?? openingError ?? lastTurnErrorDetail;
  const latestNarratorEntry = [...state.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
  const unresolvedPartialWritebackDiagnostics = collectUnresolvedPartialWritebackDiagnostics(
    latestNarratorEntry?.writebackDiagnostics
  );
  const hasPartialWritebackWarning = unresolvedPartialWritebackDiagnostics.length > 0;
  const suggestedActions =
    openingActionPreview.length > 0
      ? openingActionPreview
      : isCommandDisabled
        ? []
        : getLatestSuggestedActions(state);
  const canRetryOpening =
    Boolean(onRetryOpening) &&
    !isRunning &&
    !isOpeningStarting &&
    !openingSaveError &&
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
      imageAutomationCoordinator?.dispose();
    };
  }, [imageAutomationCoordinator]);

  useEffect(() => {
    if (!visualSaveId || !imageAutomationCoordinator) {
      previousAutomationStateRef.current = state;
      automationSaveIdRef.current = visualSaveId;
      return;
    }
    if (automationSaveIdRef.current !== visualSaveId) {
      automationSaveIdRef.current = visualSaveId;
      previousAutomationStateRef.current = state;
      automationWorkRef.current = imageAutomationCoordinator.recover(visualSaveId).catch(() => undefined);
      return;
    }
    const previous = previousAutomationStateRef.current;
    previousAutomationStateRef.current = state;
    if (previous === state) return;
    automationWorkRef.current = automationWorkRef.current
      .then(() => imageAutomationCoordinator.processTransition(visualSaveId, previous, state))
      .catch(() => undefined);
  }, [imageAutomationCoordinator, state, visualSaveId]);

  function handleOpenDiagnostic() {
    const narrativeDiagnostic = createNarrativeDiagnostic({
      state,
      saveId,
      streamingText: activeStreamingText,
      lastError: latestErrorDetail,
      lastRawNarratorResponse,
      lastNarratorAttempts: openingAttempts,
      lastTurnNarratorAttemptStarts,
      lastTurnNarratorAttempts,
      lastTurnExecution,
      lastPlayerInput: lastDiagnosticPlayerInput,
      lastJudgementRecoveryTrace,
      lastOfficialDlcDramaAudit
    });
    setDiagnosticText(narrativeDiagnostic);
    setIsDiagnosticOpen(true);
    if (!visualSaveId) return;
    void (async () => {
      try {
        await automationWorkRef.current.catch(() => undefined);
        const [records, snapshot] = await Promise.all([
          imageAutomationRuntimeRepository.listForSave(visualSaveId),
          imageVisualRepository.loadSnapshot(visualSaveId)
        ]);
        setDiagnosticText(`${narrativeDiagnostic}\n\n${formatImageAutomationDiagnostics(records, snapshot)}`);
      } catch {
        setDiagnosticText(`${narrativeDiagnostic}\n\n## Image Automation Diagnostics / 自动图片诊断\n读取失败；未影响正文或已有图片。`);
      }
    })();
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
    signal: AbortSignal,
    requestId: string,
    caseActionIntent?: CaseActionIntent
  ): Promise<boolean> {
    try {
      const judgementRollKey = `${stateBeforeTurn.turnCounter}:${playerInput}`;
      if (pendingJudgementRollRef.current?.key !== judgementRollKey) {
        pendingJudgementRollRef.current = {
          key: judgementRollKey,
          roll: createBalancedLocalD100Roll(stateBeforeTurn)
        };
      }
      const judgementRoll = pendingJudgementRollRef.current.roll;
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
      const reasoningOutput = tavernSettings?.reasoningOutput;
      const shouldShowReasoning = Boolean(
        reasoningOutput?.showInUi && reasoningOutput.mode !== 'off'
      );
      const reasoningCharacterLimit = Math.max(
        0,
        Math.min(8000, reasoningOutput?.maxCharacters ?? 0)
      );

      const next = await runPlayerTurn({
        state: stateBeforeTurn,
        playerInput,
        caseActionIntent,
        requestId,
        narrator,
        memoryEmbedding,
        memorySummary,
        writebackRepair,
        writebackRepairMode,
        npcSimulation,
        backgroundEvolution,
        auxiliaryGeneration,
        auxiliaryGenerationMode,
        memoryCompression,
        gameSettings,
        promptSettings,
        tavernSettings,
        onNarrativeDelta: (delta) => setStreamingText((current) => `${current}${delta}`),
        onNarrativeReset: () => setStreamingText(''),
        onRawText: (rawText) => onRawNarratorResponse?.(rawText),
        onReasoningDelta: shouldShowReasoning && reasoningOutput?.mode === 'provider'
          ? (delta) => setTurnReasoningText((current) =>
              `${current}${delta}`.slice(0, reasoningCharacterLimit)
            )
          : undefined,
        onReasoningText: shouldShowReasoning
          ? setTurnReasoningText
          : undefined,
        onNarratorAttemptStart: (attempt) =>
          setLastTurnNarratorAttemptStarts((current) =>
            current.some((item) => item.attemptId === attempt.attemptId)
              ? current
              : [...current, attempt]
          ),
        onNarratorAttempt: (attempt) =>
          setLastTurnNarratorAttempts((current) => [
            ...current.filter((item) => item.attemptId !== attempt.attemptId),
            attempt
          ]),
        signal,
        onStageChange: (stage) => {
          setTurnExecutionStage(stage);
          setLastTurnExecution((current) => advanceTurnExecutionDiagnostic(current, stage));
        },
        onJudgementRecoveryTrace: setLastJudgementRecoveryTrace,
        onOfficialDlcDramaAudit: setLastOfficialDlcDramaAudit,
        judgementRoll,
        enableJudgementPreflight: true
      });
      if (pendingJudgementRollRef.current?.key === judgementRollKey) {
        pendingJudgementRollRef.current = null;
      }
      if (activeTurnAbortControllerRef.current?.signal === signal) {
        activeTurnAbortControllerRef.current = null;
      }
      setCanAbortTurn(false);
      setTurnExecutionStage('saving_progress');
      setLastTurnExecution((current) => advanceTurnExecutionDiagnostic(current, 'saving_progress'));
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
      setLastTurnExecution((current) =>
        finishTurnExecutionDiagnostic(current, 'succeeded', new Date().toISOString())
      );
      const backgroundRun = next.backgroundEvolution.lastRun;
      if (backgroundRun?.status === 'failed' || backgroundRun?.status === 'aborted') {
        setTurnError(
          `主回合已完成，但后台演化${backgroundRun.status === 'aborted' ? '已中止' : '失败'}：${backgroundRun.errorReason ?? '未返回具体原因'}。`
        );
      } else {
        const latestNarratorEntry = [...next.storyLog].reverse().find((entry) => entry.speaker === 'narrator');
        const actorRecoveryQueued = latestNarratorEntry?.writebackDiagnostics?.some(
          (issue) => issue.code === 'actor_writeback_recovery_queued'
        );
        const pendingActorCount = next.pendingActorWritebackRecoveries?.length ?? 0;
        if (actorRecoveryQueued && pendingActorCount > 0) {
          setTurnError(
            `本回合正文已完成；人物建档修复队列仍有 ${pendingActorCount} 名待处理（包含此前回合积压），系统每轮最多核验 2 名并按失败原因退避重试。`
          );
        }
      }
      return true;
    } catch (error) {
      const wasAborted = signal.aborted || (error instanceof DOMException && error.name === 'AbortError');
      const errorMessage = error instanceof Error ? error.message : String(error);
      const finishedAt = new Date().toISOString();
      setStreamingText('');
      setStreamingGameTime(null);
      onStateChange(failureState);
      setLastTurnErrorDetail(wasAborted ? null : errorMessage);
      setLastTurnExecution((current) =>
        finishTurnExecutionDiagnostic(
          current,
          wasAborted ? 'aborted' : 'failed',
          finishedAt,
          wasAborted ? undefined : errorMessage
        )
      );
      setLastJudgementRecoveryTrace((current) =>
        current
          ? {
              ...current,
              finishedAt,
              terminalStatus: wasAborted ? 'aborted' : 'failed',
              ...(wasAborted ? {} : { terminalError: errorMessage })
            }
          : current
      );
      setDraftAction((current) => ({
        text: playerInput,
        version: (current?.version ?? 0) + 1,
        ...(caseActionIntent ? { caseActionIntent } : {})
      }));
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
    failureState = stateBeforeTurn,
    caseActionIntent?: CaseActionIntent
  ): Promise<boolean> {
    if (isCommandDisabled || isRunningRef.current || manualEvolutionRunningRef.current) return false;

    storyPresentationRef.current?.completeCurrentSequence();

    isRunningRef.current = true;
    setManualEvolutionStatus(null);
    const abortController = new AbortController();
    activeTurnAbortControllerRef.current = abortController;
    setIsRunning(true);
    setTurnReasoningText('');
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
    setLastJudgementRecoveryTrace(null);
    const requestId = `turn_request_${stateBeforeTurn.turnCounter + 1}_${Date.now()}`;
    const startedAt = new Date().toISOString();
    setLastTurnExecution({
      requestId,
      turnId: `turn_${String(stateBeforeTurn.turnCounter + 1).padStart(4, '0')}`,
      status: 'running',
      stage: 'preparing_turn',
      startedAt,
      stages: [{ stage: 'preparing_turn', startedAt }]
    });
    setLastOfficialDlcDramaAudit([]);
    setLastTurnNarratorAttemptStarts([]);
    setLastTurnNarratorAttempts([]);
    setSaveStatus(null);
    setStreamingText('');
    onRawNarratorResponse?.(null);
    setLastDiagnosticPlayerInput(playerInput);
    setStreamingGameTime(stateBeforeTurn.time);

    try {
      return await executeActionFromState(
        stateBeforeTurn,
        playerInput,
        failureState,
        abortController.signal,
        requestId,
        caseActionIntent
      );
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
    setLastTurnExecution((current) => advanceTurnExecutionDiagnostic(current, 'stopping_turn'));
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

  async function handleArchiveDynamicEntry(kind: 'matter' | 'signal', id: string) {
    if (isRunningRef.current || manualEvolutionRunningRef.current) return;
    const next = archiveDynamicEntry(state, { kind, id });
    if (next === state) return;

    onStateChange(next);
    setManualEvolutionStatus(kind === 'signal' ? '该风声已移入归档。' : '该事项已移入归档。');
    try {
      await onAutoSave(next, true);
    } catch {
      setSaveStatus('归档后自动保存失败，请手动保存。');
    }
  }

  async function handleDeleteRelationshipThread(threadId: string) {
    if (isRunningRef.current || manualEvolutionRunningRef.current) {
      throw new Error('回合生成或后台推演期间不能删除关系，请稍后再试。');
    }
    const thread = state.relationshipThreads[threadId];
    const next = removeRelationshipThreadFromState(state, threadId);
    if (next === state) return;

    try {
      await onAutoSave(next, true);
    } catch {
      setSaveStatus('关系删除未能保存，本次删除已取消。');
      throw new Error('自动保存失败，关系没有被删除。请稍后重试。');
    }

    onStateChange(next);
    setSaveStatus(`已永久删除这条${thread?.kind === 'fate' ? '缘份' : '人脉'}；人物、正文和既有记忆均已保留。`);
  }

  async function handleUpdateActorProfile(actorId: string, draft: ManualActorProfileDraft) {
    if (isRunningRef.current || manualEvolutionRunningRef.current) {
      throw new Error('回合生成或后台推演期间不能修改人物资料，请稍后再试。');
    }
    const next = applyManualActorProfileEdit(state, actorId, draft);
    if (next === state) {
      setSaveStatus('人物资料没有变化。');
      return;
    }

    try {
      await onAutoSave(next, true);
    } catch {
      setSaveStatus('人物资料未能保存，本次修改已取消。');
      throw new Error('自动保存失败，人物资料没有被修改。请稍后重试。');
    }

    onStateChange(next);
    setSaveStatus('人物资料已修改并保存；玩家修正的稳定字段将优先于后续AI写回。');
  }

  async function handleSubmit(playerInput: string) {
    const succeeded = await runActionFromState(state, playerInput, state, draftAction?.caseActionIntent);
    if (succeeded) setDraftAction(null);
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
      setHistoricalRegenerationPreview(restored.state);
      try {
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
      } finally {
        setHistoricalRegenerationPreview(null);
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

  function handleDraftPlayerAction(actionText: string, caseActionIntent?: CaseActionIntent) {
    setDraftAction((current) => ({
      text: actionText,
      version: (current?.version ?? 0) + 1,
      ...(caseActionIntent ? { caseActionIntent } : {})
    }));
  }

  function getPanelEntryAction(entryId: string) {
    return entryId === assetPanelEntry.entryId
      ? () => openAssetArchive('allItems')
      : entryId === casePanelEntry.entryId
      ? () => setIsCaseArchiveOpen(true)
      : entryId === financePanelEntry.entryId
      ? () => setIsFinanceArchiveOpen(true)
      : entryId === policePanelEntry.entryId
      ? () => setIsPolicePanelOpen(true)
      : entryId === galleryPanelEntry.entryId
      ? () => setIsImageGalleryOpen(true)
      : entryId === dynamicPanelEntry.entryId
      ? () => setIsDynamicPanelOpen(true)
      : entryId === newsPanelEntry.entryId
      ? () => setIsNewsPaperOpen(true)
      : entryId === combatPanelEntry.entryId
      ? () => {
          setCombatInitialDetailId(null);
          setIsCombatArchiveOpen(true);
        }
      : entryId === memoryPanelEntry.entryId
      ? () => setIsMemoryArchiveOpen(true)
      : entryId === reputationPanelEntry.entryId
      ? () => setIsReputationArchiveOpen(true)
      : entryId === relationshipNetworkPanelEntry.entryId
      ? () => setIsRelationshipNetworkPanelOpen(true)
      : entryId === fatePanelEntry.entryId
      ? () => setIsFatePanelOpen(true)
      : entryId === characterPanelEntry.entryId
      ? () => setIsCharacterArchiveOpen(true)
      : entryId === livelihoodPanelEntry.entryId
      ? () => setIsLivelihoodPanelOpen(true)
      : entryId === institutionPanelEntry.entryId
      ? () => {
          setInstitutionInitialOrganizationId(null);
          setIsSocialInstitutionPanelOpen(true);
        }
      : entryId === grayNetworkPanelEntry.entryId
      ? () => setIsGrayNetworkPanelOpen(true)
      : entryId === mapPanelEntry.entryId
        ? () => setIsMapArchiveOpen(true)
        : undefined;
  }

  const currentWeather = state.environment?.weather;
  const weatherLabel = currentWeather?.label ?? '天气未定';
  const isOpeningTrace = isOpeningStarting || Boolean(openingError);
  const firstOpeningAttempt = openingAttempts[0];
  const openingTraceExecution: TurnExecutionDiagnostic | null =
    isOpeningTrace && openingStage && firstOpeningAttempt
      ? {
          requestId: firstOpeningAttempt.attemptId,
          turnId: 'opening',
          status: openingError ? 'failed' : 'running',
          stage: openingStage,
          startedAt: firstOpeningAttempt.startedAt,
          ...(openingError ? { finishedAt: firstOpeningAttempt.finishedAt } : {}),
          stages: [{
            stage: openingStage,
            startedAt: firstOpeningAttempt.startedAt,
            ...(openingError ? { finishedAt: firstOpeningAttempt.finishedAt } : {})
          }]
        }
      : null;
  const displayedTraceExecution = isOpeningTrace ? openingTraceExecution : lastTurnExecution;
  const displayedTraceAttempts = isOpeningTrace ? openingAttempts : lastTurnNarratorAttempts;
  const displayedTraceReasoning = isOpeningTrace ? openingReasoningText : turnReasoningText;

  return (
    <main
      ref={gameShellRef}
      className={`game-shell game-shell--play${isImmersiveMode ? ' game-shell--immersive' : ''}${isNativeFullscreen ? ' game-shell--native-fullscreen' : ''}`}
      data-immersive-mode={isImmersiveMode ? (isNativeFullscreen ? 'fullscreen' : 'page') : 'off'}
    >
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
            disabled={isRunning || isOpeningStarting}
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
          <div
            className={`game-topbar-actions${isMobileToolbarOpen ? ' game-topbar-actions--mobile-open' : ''}`}
            role="group"
            aria-label="游戏操作"
          >
            <button
              className="story-export-button"
              type="button"
              disabled={isRunning || isOpeningStarting}
              onClick={() => setIsStoryExportOpen(true)}
            >
              导出剧情
            </button>
            <button className="diagnostic-export-button" type="button" onClick={handleOpenDiagnostic}>
              诊断导出
            </button>
            {isOpeningStarting ? (
              <span className="game-status-pill">
                {openingStage ? openingExecutionStageLabels[openingStage] : '开局生成中'}
              </span>
            ) : null}
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="保存进度"
              title="保存进度"
              disabled={isRunning || isOpeningStarting}
              onClick={handleSave}
            >
              保存
            </button>
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="读取进度"
              title="读取进度"
              disabled={isRunning || isOpeningStarting}
              onClick={() => void onLoad()}
            >
              读取
            </button>
            <button
              className="game-topbar-action-button"
              type="button"
              aria-label="设置"
              title="设置"
              disabled={isRunning || isOpeningStarting}
              onClick={() => onSettings()}
            >
              设置
            </button>
          </div>
          <button
            className="game-mobile-toolbar-toggle"
            type="button"
            aria-label={isMobileToolbarOpen ? '收起游戏操作' : '展开游戏操作'}
            aria-expanded={isMobileToolbarOpen}
            onClick={() => setIsMobileToolbarOpen((open) => !open)}
          >
            <span aria-hidden="true">{isMobileToolbarOpen ? '▴' : '▾'}</span>
          </button>
        </header>

        <MobileGameRegionSwitcher activeRegion={mobileGameRegion} onSelect={setMobileGameRegion} />

        <section className="game-play-layout">
          {isImmersiveMode ? (
            <>
              <button
                className="game-immersive-edge game-immersive-edge--left"
                type="button"
                aria-label={immersiveRailOpen === 'left' ? '收起人物状态' : '展开人物状态'}
                aria-controls="game-mobile-region-profile"
                aria-expanded={immersiveRailOpen === 'left'}
                onClick={() => setImmersiveRailOpen((open) => open === 'left' ? null : 'left')}
              >
                <span aria-hidden="true">›</span>
              </button>
              <button
                className="game-immersive-exit-handle"
                type="button"
                aria-label="退出沉浸式模式"
                onClick={exitImmersiveMode}
              >
                <span aria-hidden="true" className="game-immersive-exit-grip" />
                <span className="game-immersive-exit-label">退出沉浸</span>
              </button>
              <button
                className="game-immersive-edge game-immersive-edge--right"
                type="button"
                aria-label={immersiveRailOpen === 'right' ? '收起功能面板' : '展开功能面板'}
                aria-controls="game-mobile-region-systems"
                aria-expanded={immersiveRailOpen === 'right'}
                onClick={() => setImmersiveRailOpen((open) => open === 'right' ? null : 'right')}
              >
                <span aria-hidden="true">‹</span>
              </button>
            </>
          ) : null}
          <aside
            id="game-mobile-region-profile"
            className={`game-left-rail${immersiveRailOpen === 'left' ? ' game-immersive-rail--open' : ''}`}
            data-mobile-active={mobileGameRegion === 'profile'}
          >
            <PlayerPanel
              state={state}
              onOpenEquipment={() => openAssetArchive('equipment')}
              onOpenDossier={() => {
                setPlayerDossierInitialSection('overview');
                setIsPlayerDossierOpen(true);
              }}
              onOpenVisualEditor={() => {
                setPlayerDossierInitialSection('visuals');
                setIsPlayerDossierOpen(true);
              }}
              onSpendAttributePoint={handleSpendPlayerAttributePoint}
              visualSaveId={visualSaveId}
              visualRepository={supportsVisualWrites(imageVisualRepository) ? imageVisualRepository : undefined}
              visualRefreshKey={visualRepositoryRevision}
            />
          </aside>

          <section
            id="game-mobile-region-narrative"
            className="game-story-column"
            data-mobile-active={mobileGameRegion === 'narrative'}
          >
            <StoryPresentationPane
              ref={storyPresentationRef}
              entries={(historicalRegenerationPreview ?? state).storyLog}
              runtimeState={historicalRegenerationPreview ?? state}
              saveId={visualSaveId ?? `avg-session:${state.player.actorId}`}
              playbackRevision={avgPlaybackRevision}
              displaySettings={displaySettings}
              onDisplaySettingsChange={onDisplaySettingsChange}
              resourceRuntime={avgPresentationResourceRuntime}
              resourceRevision={avgResourceRevision}
              overrideRepository={visualSaveId ? avgVisualOverrideRepository : undefined}
              overrideRevision={avgVisualOverrideRevision}
              imageGenerationService={avgImageGenerationService}
              onOpenImageSettings={() => onSettings('imageGeneration')}
              onOverrideChanged={visualSaveId
                ? () => setAvgVisualOverrideRevision((value) => value + 1)
                : undefined}
              immersiveActive={isImmersiveMode}
              onRequestImmersive={openImmersiveDialog}
              textView={(
                <StoryLog
                  entries={(historicalRegenerationPreview ?? state).storyLog}
                  streamingText={activeStreamingText || undefined}
                  streamingGameTime={activeStreamingGameTime ?? undefined}
                  pendingPlayerAction={pendingPlayerAction}
                  judgementChecks={(historicalRegenerationPreview ?? state).judgementChecks}
                  isWaitingForNarrative={isRunning || isOpeningStarting}
                  renderLimit={storyRenderLimit}
                  displaySettings={displaySettings}
                  sceneVisuals={visualSaveId && supportsVisualWrites(imageVisualRepository) ? {
                    saveId: visualSaveId,
                    actors: state.actors,
                    actorIdAliases: visualActorIdAliases,
                    worldYear: state.time.year,
                    repository: imageVisualRepository,
                    revision: visualRepositoryRevision,
                    createPromptConversion: createAuxiliaryGeneration ? () => {
                      const client = createAuxiliaryGeneration();
                      return client ? new ImagePromptConversionProbe(client, {
                        inputModalities: imageConversionSupportsImages ? ['text', 'image'] : ['text'],
                        loadConversionInstructions: async () => (
                          await imagePromptTemplateRepository.load()
                        ).conversionInstructions
                      }) : null;
                    } : undefined,
                    onOpenSettings: () => onSettings('imageGeneration')
                  } : undefined}
                  rollbackAvailableTurnNumbers={rollbackAvailableTurnNumbers}
                  onRegeneratePlayerAction={handleRegeneratePlayerAction}
                />
              )}
            />
            <div className="game-command-dock">
              {openingError ? (
                <>
                  <p className="command-error" role="status">
                    当前开局阶段未完成；已经通过的阶段仍保留，可以从失败阶段继续。
                  </p>
                  <details className="reasoning-output-preview">
                    <summary>查看失败字段</summary>
                    <pre>{openingError}</pre>
                  </details>
                </>
              ) : null}
              {openingSaveError ? (
                <p className="command-error" role="status">
                  {openingSaveError}
                </p>
              ) : null}
              {turnError ? (
                <p className="command-error" role="status">
                  {turnError}
                </p>
              ) : null}
              {!openingError && !turnError && hasPartialWritebackWarning ? (
                <p className="command-warning" role="status">
                  {state.turnCounter === 0 ? '开局' : '本回合'}已生成，但仍有
                  {unresolvedPartialWritebackDiagnostics.length} 项状态未能写入；可打开“诊断导出”查看具体字段。
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
              {(isOpeningStarting || openingError) && openingStage ? (
                <div className="turn-execution-status" role="status" aria-live="polite">
                  <span>{openingError ? '停在阶段：' : '系统正在：'}</span>
                  <strong>{openingExecutionStageLabels[openingStage]}</strong>
                  {openingStageDetail ? <small>{openingStageDetail}</small> : null}
                </div>
              ) : null}
              {openingSaveError && onRetryOpeningSave ? (
                <button className="opening-retry-button" type="button" onClick={onRetryOpeningSave}>
                  重试保存
                </button>
              ) : null}
              {canRetryOpening ? (
                <button className="opening-retry-button" type="button" onClick={onRetryOpening}>
                  {openingError ? '重试当前阶段' : '重掷开局'}
                </button>
              ) : null}
              {openingError && onChangeOpeningModel ? (
                <button
                  className="opening-retry-button"
                  type="button"
                  onClick={onChangeOpeningModel}
                >
                  更换模型并继续
                </button>
              ) : null}
              {openingError && onAbandonOpening ? (
                <button
                  className="opening-retry-button"
                  type="button"
                  onClick={onAbandonOpening}
                >
                  放弃本次开局
                </button>
              ) : null}
              <CommandBar
                disabled={isCommandDisabled}
                isTurnRunning={isRunning && canAbortTurn}
                isAborting={isAbortingTurn}
                onAbort={isRunning && canAbortTurn ? handleAbortTurn : undefined}
                suggestedActions={suggestedActions}
                suggestedActionMode={openingActionPreview.length > 0 ? 'opening-preview' : 'active'}
                onSubmit={handleSubmit}
                draftScopeKey={saveId ?? effectiveRollbackChainId ?? 'unsaved-game'}
                draftActionText={draftAction?.text ?? null}
                draftActionVersion={draftAction?.version}
                canRollbackLatestTurn={canRollbackLatestTurn}
                rollbackUnavailableReason={
                  canUseRollback ? '当前回合没有可用的回溯快照。' : '回溯链未启用或回溯快照数量为 0。'
                }
                onRollbackLatestTurn={handleRollbackLatestTurn}
                persistentPrompts={promptSettings?.persistentPrompts ?? []}
                onPersistentPromptsChange={
                  onPromptSettingsChange
                    ? (persistentPrompts) => onPromptSettingsChange({
                        overrides: promptSettings?.overrides ?? {},
                        persistentPrompts
                      })
                    : undefined
                }
              />
            </div>
          </section>

          <aside
            id="game-mobile-region-systems"
            className={`game-right-rail${immersiveRailOpen === 'right' ? ' game-immersive-rail--open' : ''}`}
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
                      <button key={entry.entryId} type="button" onClick={getPanelEntryAction(entry.entryId)}>
                        {entry.label}
                        {entry.entryId === casePanelEntry.entryId && hasUnreadCases ? (
                          <span className="game-panel-red-dot" aria-hidden="true" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </nav>
            <div className="game-right-placeholder" aria-hidden="true" />
          </aside>
        </section>

        {isAiProcessTraceOpen ? (
          <AiProcessTracePanel
            turnNumber={state.turnCounter}
            scopeLabel={isOpeningTrace ? '开局生成' : undefined}
            execution={displayedTraceExecution}
            stageLabels={aiProcessStageLabels}
            attemptStarts={isOpeningTrace ? [] : lastTurnNarratorAttemptStarts}
            attempts={displayedTraceAttempts}
            streamingCharacterCount={activeStreamingText.length}
            reasoningText={displayedTraceReasoning}
            reasoningEnabled={Boolean(
              tavernSettings?.reasoningOutput.showInUi &&
              tavernSettings.reasoningOutput.mode !== 'off'
            )}
            safeError={isOpeningTrace ? openingError : lastTurnExecution?.status === 'failed' ? turnError : null}
            onClose={() => setIsAiProcessTraceOpen(false)}
          />
        ) : null}
        <footer className="game-footer">
          <span className="game-footer-turn-group">
            <AiProcessTraceButton
              open={isAiProcessTraceOpen}
              active={isRunning || isOpeningStarting}
              onClick={() => setIsAiProcessTraceOpen((open) => !open)}
            />
            <span className="game-footer-turn">回合：{state.turnCounter}</span>
          </span>
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
      {isImmersiveDialogOpen ? (
        <div
          className="game-immersive-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsImmersiveDialogOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setIsImmersiveDialogOpen(false);
          }}
        >
          <section
            className="game-immersive-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="game-immersive-dialog-title"
            aria-describedby="game-immersive-dialog-description"
          >
            <header>
              <div>
                <span>VIEW MODE</span>
                <h2 id="game-immersive-dialog-title">进入沉浸式模式</h2>
              </div>
              <button
                type="button"
                aria-label="关闭沉浸式选择"
                onClick={() => setIsImmersiveDialogOpen(false)}
              >
                ×
              </button>
            </header>
            <p id="game-immersive-dialog-description">
              两种模式都会保留顶部时间与天气，并将左右面板收进屏幕边缘；移动到边缘或轻点细线即可展开。
            </p>
            <div className="game-immersive-dialog-options">
              <button type="button" autoFocus onClick={() => enterImmersiveMode(false)}>
                <strong>页面沉浸</strong>
                <span>保留浏览器界面，适合随时切换标签页。</span>
              </button>
              <button type="button" onClick={() => enterImmersiveMode(true)}>
                <strong>全屏沉浸</strong>
                <span>在页面沉浸基础上请求浏览器全屏；按 Esc 可先退出全屏。</span>
              </button>
            </div>
            <footer>
              <small>全屏请求若被浏览器拦截，会自动保留页面沉浸。</small>
              <button type="button" onClick={() => setIsImmersiveDialogOpen(false)}>取消</button>
            </footer>
          </section>
        </div>
      ) : null}
      {immersiveStatus ? (
        <p className="game-immersive-status" role="status">{immersiveStatus}</p>
      ) : null}
      {isStoryExportOpen ? (
        <StoryExportModal state={state} onClose={() => setIsStoryExportOpen(false)} />
      ) : null}
      {isDiagnosticOpen ? (
        <DiagnosticExportModal text={diagnosticText} onClose={handleCloseDiagnostic} />
      ) : null}
      <Suspense fallback={<div className="modal-loading" role="status">正在打开...</div>}>
        {isCharacterArchiveOpen ? (
          <CharacterArchiveModal
            state={state}
            onClose={() => setIsCharacterArchiveOpen(false)}
            onStateChange={onStateChange}
            onUpdateActorProfile={handleUpdateActorProfile}
            visualSaveId={visualSaveId}
            visualRepository={supportsVisualWrites(imageVisualRepository) ? imageVisualRepository : undefined}
            createPromptConversion={createAuxiliaryGeneration ? () => {
              const client = createAuxiliaryGeneration();
              return client ? new ImagePromptConversionProbe(client, {
                inputModalities: imageConversionSupportsImages ? ['text', 'image'] : ['text'],
                loadConversionInstructions: async () => (
                  await imagePromptTemplateRepository.load()
                ).conversionInstructions
              }) : null;
            } : undefined}
            onOpenImageSettings={() => {
              setIsCharacterArchiveOpen(false);
              onSettings('imageGeneration');
            }}
            onVisualRepositoryChanged={() => setVisualRepositoryRevision((value) => value + 1)}
            avgOverrideRepository={avgVisualOverrideRepository}
            avgOverrideRevision={avgVisualOverrideRevision}
            avgImageGenerationService={avgImageGenerationService}
            avgResourceRuntime={avgPresentationResourceRuntime}
            onAvgOverrideChanged={() => setAvgVisualOverrideRevision((value) => value + 1)}
          />
        ) : null}
      {isPlayerDossierOpen ? (
        <PlayerDossierModal
          state={state}
          onStateChange={onStateChange}
          onClose={() => setIsPlayerDossierOpen(false)}
          visualSaveId={visualSaveId}
          visualRepository={supportsVisualWrites(imageVisualRepository) ? imageVisualRepository : undefined}
          createPromptConversion={createAuxiliaryGeneration ? () => {
            const client = createAuxiliaryGeneration();
            return client ? new ImagePromptConversionProbe(client, {
              inputModalities: imageConversionSupportsImages ? ['text', 'image'] : ['text'],
              loadConversionInstructions: async () => (
                await imagePromptTemplateRepository.load()
              ).conversionInstructions
            }) : null;
          } : undefined}
          onOpenImageSettings={() => {
            setIsPlayerDossierOpen(false);
            onSettings('imageGeneration');
          }}
          onVisualRepositoryChanged={() => setVisualRepositoryRevision((value) => value + 1)}
          avgOverrideRepository={avgVisualOverrideRepository}
          avgOverrideRevision={avgVisualOverrideRevision}
          avgImageGenerationService={avgImageGenerationService}
          avgResourceRuntime={avgPresentationResourceRuntime}
          onAvgOverrideChanged={() => setAvgVisualOverrideRevision((value) => value + 1)}
          initialVisualEditorOpen={playerDossierInitialSection === 'visuals'}
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
        <RelationshipNetworkPanelModal
          state={state}
          onClose={() => setIsRelationshipNetworkPanelOpen(false)}
          onDeleteThread={handleDeleteRelationshipThread}
        />
      ) : null}
      {isFatePanelOpen ? (
        <FatePanelModal
          state={state}
          onClose={() => setIsFatePanelOpen(false)}
          onDeleteThread={handleDeleteRelationshipThread}
        />
      ) : null}
      {isLivelihoodPanelOpen && state.player.currentIdentity === 'civilian' ? (
        <LivelihoodPanelModal
          state={state}
          onClose={() => setIsLivelihoodPanelOpen(false)}
          onDraftPlayerAction={handleDraftPlayerAction}
          onOpenInstitution={(organizationId) => {
            setIsLivelihoodPanelOpen(false);
            setInstitutionInitialOrganizationId(organizationId);
            setIsSocialInstitutionPanelOpen(true);
          }}
        />
      ) : null}
      {isSocialInstitutionPanelOpen ? (
        <SocialInstitutionPanelModal
          state={state}
          initialOrganizationId={institutionInitialOrganizationId ?? undefined}
          onClose={() => setIsSocialInstitutionPanelOpen(false)}
          onOpenLivelihood={
            state.player.currentIdentity === 'civilian'
              ? () => {
                  setIsSocialInstitutionPanelOpen(false);
                  setIsLivelihoodPanelOpen(true);
                }
              : undefined
          }
        />
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
            onArchiveEntry={handleArchiveDynamicEntry}
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
        {isImageGalleryOpen && supportsVisualWrites(imageVisualRepository) ? (
          <ImageGalleryModal
            visualSaveId={visualSaveId}
            repository={imageVisualRepository}
            actors={state.actors}
            actorIdAliases={visualActorIdAliases}
            automationRuntimeRepository={imageAutomationRuntimeRepository}
            onCancelAutomation={(triggerId) => imageAutomationCoordinator?.cancel(triggerId)}
            onRetryAutomation={async (triggerId) => {
              if (!visualSaveId || !imageAutomationCoordinator) return;
              await imageAutomationCoordinator.retry(visualSaveId, state, triggerId);
              setVisualRepositoryRevision((value) => value + 1);
            }}
            onRepositoryChanged={() => setVisualRepositoryRevision((value) => value + 1)}
            onOpenSettings={() => onSettings('imageGeneration')}
            onClose={() => setIsImageGalleryOpen(false)}
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

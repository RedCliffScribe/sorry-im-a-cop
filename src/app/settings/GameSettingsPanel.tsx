import { useState } from 'react';
import {
  getNarrativeLengthProfile,
  narrativeLengthProfiles,
  type NarrativeLengthLevel
} from '../../domain/settings/narrativeLength';
import {
  narrativePerspectiveProfiles,
  resolveNarrativePerspective
} from '../../domain/settings/narrativePerspective';
import {
  getPlayerPortrayalProfile,
  playerPortrayalProfiles,
  resolvePlayerPortrayalMode
} from '../../domain/settings/playerPortrayal';
import { getCantoneseFlavorProfile } from '../../domain/settings/cantoneseFlavor';
import { getGameDifficultyProfile } from '../../domain/settings/gameDifficulty';
import type {
  AiSettings,
  NarrativePerspective,
  PlayerPortrayalMode,
  PregnancyMode
} from '../../domain/settings/types';
import { resolveAppLocale, type AppLocale } from '../../domain/localization/appLocale';
import {
  dramaChannelIds,
  normalizeDramaticContentSettings,
  resolveDramaMaterialBudget
} from '../../domain/drama/settings';
import type {
  DramaChannelId,
  DramaChannelLevel,
  DramaCoincidenceTolerance,
  DramaEscalationLevel,
  DramaMaterialLevel,
  DramaPacingPreset,
  DramaPlanningRouteMode,
  DramaPreferenceLevel,
  DramaQuietSpaceLevel,
  DramaticContentSettings
} from '../../domain/drama/types';
import type {
  CantoneseFlavorLevel,
  GameDifficultyLevel,
  RuntimeState
} from '../../domain/runtime/types';
import { getDramaticOpeningDefinition } from '../../domain/drama/openingRegistry';
import { CantoneseFlavorDialog } from '../components/CantoneseFlavorDialog';
import { GameDifficultyDialog } from '../components/GameDifficultyDialog';
import {
  CurrentSaveCustomContentSettingsPanel,
  type CurrentSaveCustomContentAdaptationRequest,
  type CurrentSaveCustomContentPausedChange,
  type CurrentSaveCustomContentPriorityChange
} from './CurrentSaveCustomContentSettingsPanel';

const dramaPacingOptions: Array<{ value: DramaPacingPreset; label: string; description: string }> = [
  { value: 'original', label: '原版节奏', description: '默认沿用既有链路；仅为本局重点自定义内容执行窄规划。' },
  { value: 'life', label: '生活纪实', description: '更重日常、职业和关系延续，允许安静回合。' },
  { value: 'balanced', label: '长篇均衡', description: '在生活延续与事件推进之间保持中等节奏。' },
  { value: 'dramatic', label: '戏剧推进', description: '更主动地让既有压力、人物和事项进入前台。' },
  { value: 'cinematic', label: '电影化', description: '更强的场面组织和交叉线索，但仍不得制造新事实。' },
  { value: 'custom', label: '自定义', description: '使用下方素材预算和渠道强度自行调节。' }
];

const dramaChannelLabels: Record<DramaChannelId, string> = {
  work_livelihood: '工作与营生',
  relationships: '关系与羁绊',
  cases_law: '案件与法律',
  organizations: '组织与社团',
  city_news: '城市与新闻',
  era_storypack: '时代与 Storypack',
  screen_characters: '影视角色种子',
  custom_characters: '自定义人物',
  custom_events: '自定义事件'
};

const storypackInfluenceLabels = {
  off: '关闭',
  low: '低',
  medium: '中',
  high: '高'
} as const;

const minStoryRenderLimit = 5;
const maxStoryRenderLimit = 200;
const minAutoSaveLimit = 1;
const maxAutoSaveLimit = 100;
const minAutoSaveIntervalTurns = 1;
const maxAutoSaveIntervalTurns = 50;
const minRollbackSnapshotLimit = 0;
const maxRollbackSnapshotLimit = 50;

function clampRenderLimit(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.max(minStoryRenderLimit, Math.min(maxStoryRenderLimit, Math.trunc(value)));
}

function clampAutoSaveLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(minAutoSaveLimit, Math.min(maxAutoSaveLimit, Math.trunc(value)));
}

function clampAutoSaveIntervalTurns(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(minAutoSaveIntervalTurns, Math.min(maxAutoSaveIntervalTurns, Math.trunc(value)));
}

function clampRollbackSnapshotLimit(value: number): number {
  if (!Number.isFinite(value)) return 20;
  return Math.max(minRollbackSnapshotLimit, Math.min(maxRollbackSnapshotLimit, Math.trunc(value)));
}

export function GameSettingsPanel({
  page = 'game',
  settings,
  runtimeState,
  onChange,
  onRuntimeDramaticContentChange = () => undefined,
  onRuntimeCantoneseFlavorChange = () => undefined,
  onRuntimeGameDifficultyChange = () => undefined,
  onOpenCurrentSaveCustomContentLibrary,
  onRuntimeCustomContentPriorityChange = async () => undefined,
  onRuntimeCustomContentPausedChange = async () => undefined,
  onRuntimeCustomContentAdaptationRequest = async () => undefined
}: {
  page?: 'game' | 'gameplay';
  settings: AiSettings;
  runtimeState?: RuntimeState | null;
  onChange: (settings: AiSettings) => void;
  onRuntimeDramaticContentChange?: (settings: DramaticContentSettings) => void;
  onRuntimeCantoneseFlavorChange?: (flavor: CantoneseFlavorLevel) => void;
  onRuntimeGameDifficultyChange?: (difficulty: GameDifficultyLevel) => void;
  onOpenCurrentSaveCustomContentLibrary?: () => void;
  onRuntimeCustomContentPriorityChange?: (
    change: CurrentSaveCustomContentPriorityChange
  ) => Promise<void>;
  onRuntimeCustomContentPausedChange?: (
    change: CurrentSaveCustomContentPausedChange
  ) => Promise<void>;
  onRuntimeCustomContentAdaptationRequest?: (
    request: CurrentSaveCustomContentAdaptationRequest
  ) => Promise<void>;
}) {
  const [isCantoneseFlavorDialogOpen, setIsCantoneseFlavorDialogOpen] = useState(false);
  const [isGameDifficultyDialogOpen, setIsGameDifficultyDialogOpen] = useState(false);
  const storyRenderLimit = settings.game.storyRenderLimit;
  const narrativeLengthLevel = getNarrativeLengthProfile(settings.game.narrativeLengthLevel).level;
  const narrativePerspective = resolveNarrativePerspective(settings.game.narrativePerspective);
  const playerPortrayalMode = resolvePlayerPortrayalMode(settings.game.playerPortrayalMode);
  const playerPortrayalProfile = getPlayerPortrayalProfile(playerPortrayalMode);
  const autoSaveLimit = settings.game.autoSaveLimit;
  const autoSaveIntervalTurns = settings.game.autoSaveIntervalTurns;
  const rollbackSnapshotLimit = settings.game.rollbackSnapshotLimit;
  const pregnancyMode = settings.game.pregnancyMode ?? 'standard';
  const language = resolveAppLocale(settings.game.language);
  const cantoneseFlavorProfile = getCantoneseFlavorProfile(runtimeState?.player.cantoneseFlavor);
  const gameDifficultyProfile = getGameDifficultyProfile(runtimeState?.world.gameDifficulty);
  const dramaticContent = normalizeDramaticContentSettings(
    runtimeState?.dramaticContent?.settings ?? settings.game.dramaticContent
  );
  const dramaticBudget = resolveDramaMaterialBudget(dramaticContent);

  function updateLanguage(value: AppLocale) {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        language: value
      }
    });
  }

  function updateStoryRenderLimit(value: string) {
    const nextLimit = clampRenderLimit(Number(value));
    onChange({
      ...settings,
      game: {
        ...settings.game,
        storyRenderLimit: nextLimit
      }
    });
  }

  function updateNarrativeLengthLevel(level: NarrativeLengthLevel) {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        narrativeLengthLevel: level
      }
    });
  }

  function updateNarrativePerspective(value: NarrativePerspective) {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        narrativePerspective: value
      }
    });
  }

  function updatePlayerPortrayalMode(value: PlayerPortrayalMode) {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        playerPortrayalMode: value
      }
    });
  }

  function updateAutoSaveLimit(value: string) {
    const nextLimit = clampAutoSaveLimit(Number(value));
    onChange({
      ...settings,
      game: {
        ...settings.game,
        autoSaveLimit: nextLimit
      }
    });
  }

  function updateAutoSaveIntervalTurns(value: string) {
    const nextInterval = clampAutoSaveIntervalTurns(Number(value));
    onChange({
      ...settings,
      game: {
        ...settings.game,
        autoSaveIntervalTurns: nextInterval
      }
    });
  }

  function updateRollbackSnapshotLimit(value: string) {
    const nextLimit = clampRollbackSnapshotLimit(Number(value));
    onChange({
      ...settings,
      game: {
        ...settings.game,
        rollbackSnapshotLimit: nextLimit
      }
    });
  }

  function updatePregnancyMode(mode: PregnancyMode) {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        pregnancyMode: mode
      }
    });
  }

  function updateDramaSetting(
    patch: Partial<Pick<typeof dramaticContent, 'pacing' | 'materialLevel' | 'planningRoute'>>
  ) {
    const nextDramaticContent = {
      ...dramaticContent,
      ...patch
    };
    if (runtimeState) {
      onRuntimeDramaticContentChange(nextDramaticContent);
      return;
    }
    onChange({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...nextDramaticContent
        }
      }
    });
  }

  function updateDramaChannel(channelId: DramaChannelId, level: DramaChannelLevel) {
    const nextDramaticContent = {
      ...dramaticContent,
      channels: {
        ...dramaticContent.channels,
        [channelId]: level
      }
    };
    if (runtimeState) {
      onRuntimeDramaticContentChange(nextDramaticContent);
      return;
    }
    onChange({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...nextDramaticContent
        }
      }
    });
  }

  function updateCustomDramaBudget(
    field: 'dynamicLimit' | 'staticLimit' | 'supportLimit' | 'quietWindowTurns',
    rawValue: string
  ) {
    const parsed = Number(rawValue);
    const minimum = field === 'dynamicLimit' || field === 'quietWindowTurns' ? 1 : 0;
    const maximum = field === 'supportLimit' ? 1 : 50;
    const value = Number.isFinite(parsed)
      ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed)))
      : minimum;
    const nextDramaticContent = {
      ...dramaticContent,
      custom: {
        ...dramaticContent.custom,
        [field]: value
      }
    };
    if (runtimeState) {
      onRuntimeDramaticContentChange(nextDramaticContent);
      return;
    }
    onChange({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: {
          ...nextDramaticContent
        }
      }
    });
  }

  function updateCustomDramaPreference(
    field:
      | 'worldInitiative'
      | 'existingDynamicsReturn'
      | 'newSeedExposure'
      | 'quietSpace'
      | 'coincidenceTolerance'
      | 'majorEscalation'
      | 'relationshipInitiative',
    value:
      | DramaPreferenceLevel
      | DramaQuietSpaceLevel
      | DramaCoincidenceTolerance
      | DramaEscalationLevel
  ) {
    const nextDramaticContent = {
      ...dramaticContent,
      custom: {
        ...dramaticContent.custom,
        [field]: value
      }
    };
    if (runtimeState) {
      onRuntimeDramaticContentChange(nextDramaticContent);
      return;
    }
    onChange({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent: nextDramaticContent
      }
    });
  }

  function saveCurrentDramaAsFutureDefault() {
    onChange({
      ...settings,
      game: {
        ...settings.game,
        dramaticContent
      }
    });
  }

  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>{page === 'gameplay' ? '玩法设置' : '游戏设置'}</h2>
          <p className="muted">
            {page === 'gameplay'
              ? '调整戏剧化内容的叙事节奏、素材投喂和前台规划方式。'
              : '调整手测和游玩时的前端表现，不改变存档里的完整剧情记录。'}
          </p>
        </div>
      </div>

      {page === 'game' ? (
        <>
          <section className="settings-section" aria-label="界面与剧情语言">
        <h3>界面与剧情语言</h3>
        <div className="compact-form-grid">
          <label>
            当前语言
            <select
              aria-label="界面与剧情语言"
              value={language}
              onChange={(event) => updateLanguage(event.target.value as AppLocale)}
            >
              <option value="zh-CN" data-locale-preserve="true">简体中文</option>
              <option value="zh-Hant-HK" data-locale-preserve="true">繁體中文（香港）</option>
            </select>
          </label>
          <p className="muted span-2">
            同时控制游戏界面与后续 AI 正文语言。切换不会改写旧存档、内部 ID 或结构化字段。
          </p>
        </div>
        <div className="cantonese-flavor-current-setting">
          <div className="cantonese-flavor-current-copy">
            <span className="settings-field-heading">当前游戏粤语风味</span>
            {runtimeState ? (
              <>
                <strong>{cantoneseFlavorProfile.label}</strong>
                <p>{cantoneseFlavorProfile.summary}</p>
              </>
            ) : (
              <p>载入或开始一局游戏后，可在这里修改该存档之后生成的剧情风味。</p>
            )}
          </div>
          {runtimeState ? (
            <button
              type="button"
              className="cantonese-flavor-change-button"
              aria-haspopup="dialog"
              onClick={() => setIsCantoneseFlavorDialogOpen(true)}
            >
              粤语风味更改
            </button>
          ) : null}
        </div>
        <p className="muted cantonese-flavor-save-scope">
          这是当前游戏的存档设置，不影响其他存档，也不会改变以后新游戏的默认选择。
        </p>
        <div className="cantonese-flavor-current-setting game-difficulty-current-setting">
          <div className="cantonese-flavor-current-copy">
            <span className="settings-field-heading">当前游戏难度</span>
            {runtimeState ? (
              <>
                <strong>
                  {gameDifficultyProfile.label}（判定目标值
                  {gameDifficultyProfile.modifier >= 0 ? '+' : ''}
                  {gameDifficultyProfile.modifier}）
                </strong>
                <p>{gameDifficultyProfile.summary}</p>
              </>
            ) : (
              <p>载入或开始一局游戏后，可在这里修改该存档之后发生的判定难度。</p>
            )}
          </div>
          {runtimeState ? (
            <button
              type="button"
              className="cantonese-flavor-change-button"
              aria-haspopup="dialog"
              onClick={() => setIsGameDifficultyDialogOpen(true)}
            >
              游戏难度更改
            </button>
          ) : null}
        </div>
        <p className="muted cantonese-flavor-save-scope">
          难度只影响当前游戏之后的新判定，不会重算旧判定，也不影响其他存档。
        </p>
          </section>

          {runtimeState ? (
            <CurrentSaveCustomContentSettingsPanel
              runtimeState={runtimeState}
              onOpenContentLibrary={onOpenCurrentSaveCustomContentLibrary}
              onPriorityChange={onRuntimeCustomContentPriorityChange}
              onPausedChange={onRuntimeCustomContentPausedChange}
              onAdaptationRequest={
                onRuntimeCustomContentAdaptationRequest
              }
            />
          ) : null}

          <section className="settings-section" aria-label="剧情显示">
        <h3>剧情显示</h3>
        <div className="compact-form-grid">
          <div className="narrative-length-control">
            <div className="settings-field-heading">正文篇幅</div>
            <div className="narrative-length-grid" role="radiogroup" aria-label="正文篇幅">
              {narrativeLengthProfiles.map((profile) => {
                const active = profile.level === narrativeLengthLevel;
                return (
                  <button
                    key={profile.level}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`narrative-length-card${active ? ' active' : ''}`}
                    onClick={() => updateNarrativeLengthLevel(profile.level)}
                  >
                    <span className="narrative-length-card-title">{profile.label}</span>
                    <span className="narrative-length-card-range">{profile.uiRange}</span>
                    <span className="narrative-length-card-description">{profile.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="muted">
              正文篇幅会写入开局和主回合 Prompt；实际长度仍会随剧情复杂度和模型输出略有浮动。
            </p>
          </div>
          <div className="narrative-perspective-control">
            <div className="settings-field-heading">正文叙事人称</div>
            <div className="narrative-perspective-grid" role="radiogroup" aria-label="正文叙事人称">
              {narrativePerspectiveProfiles.map((profile) => {
                const active = profile.value === narrativePerspective;
                return (
                  <button
                    key={profile.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`narrative-perspective-card${active ? ' active' : ''}`}
                    onClick={() => updateNarrativePerspective(profile.value)}
                  >
                    <span className="narrative-perspective-card-title">{profile.label}</span>
                    <span className="narrative-perspective-card-marker">{profile.marker}</span>
                    <span className="narrative-perspective-card-description">{profile.description}</span>
                  </button>
                );
              })}
            </div>
            <p className="muted">
              只约束【旁白】如何称呼玩家；人物对白仍会按说话关系自然使用“我、你、他/她”。该选择会同时用于开局与后续回合。
            </p>
          </div>
          <div className="player-portrayal-control">
            <label className="player-portrayal-select-field">
              <span className="settings-field-heading">正文演绎风格</span>
              <select
                aria-label="正文演绎风格"
                value={playerPortrayalMode}
                onChange={(event) => updatePlayerPortrayalMode(event.target.value as PlayerPortrayalMode)}
              >
                {playerPortrayalProfiles.map((profile) => (
                  <option key={profile.value} value={profile.value}>
                    {profile.label} · {profile.marker}
                  </option>
                ))}
              </select>
            </label>
            <div className="player-portrayal-summary" aria-live="polite">
              <div className="player-portrayal-summary-copy">
                <div className="player-portrayal-summary-title">
                  <strong>{playerPortrayalProfile.label}</strong>
                  <span>{playerPortrayalProfile.marker}</span>
                </div>
                <p>{playerPortrayalProfile.description}</p>
              </div>
              <span className="player-portrayal-example-wrap">
                <button
                  type="button"
                  className="player-portrayal-example-trigger"
                  aria-describedby="player-portrayal-example"
                >
                  示例
                </button>
                <span id="player-portrayal-example" className="player-portrayal-example-tooltip" role="tooltip">
                  <strong>同一输入：{playerPortrayalProfile.exampleInput}</strong>
                  <span>{playerPortrayalProfile.exampleOutput}</span>
                </span>
              </span>
            </div>
            <p className="muted">
              三种风格都遵守当前“正文篇幅”档位与不足补写规则；只改变写法和主角输入如何进入正文。接受或拒绝、承诺、消费、关系升级、暴露秘密、改变目标等关键选择仍必须由玩家输入。
            </p>
          </div>
          <label>
            剧情正文渲染层数
            <input
              aria-label="剧情正文渲染层数"
              type="number"
              min={minStoryRenderLimit}
              max={maxStoryRenderLimit}
              value={storyRenderLimit}
              onChange={(event) => updateStoryRenderLimit(event.target.value)}
            />
          </label>
          <p className="muted span-2">
            默认 30 层。只限制主界面一次渲染的最近正文层数，旧回合仍保存在存档和诊断导出中。
          </p>
        </div>
          </section>
        </>
      ) : null}

      {page === 'gameplay' ? (
        <section className="settings-section" aria-label="戏剧化内容">
        <h3>戏剧化内容</h3>
        {runtimeState ? (
          <div className="settings-inline-note drama-save-scope">
            <div>
              <strong>当前存档设置</strong>
              <p className="muted">
                下方节奏、素材量、渠道和线路只写入当前存档，不会自动改变以后新游戏。
              </p>
            </div>
            <button type="button" onClick={saveCurrentDramaAsFutureDefault}>
              设为以后新游戏默认值
            </button>
          </div>
        ) : (
          <p className="muted">当前没有载入存档；下方设置将作为以后新游戏的默认值。</p>
        )}
        {runtimeState ? (
          <div className="compact-form-grid drama-locked-settings" aria-label="开局锁定设置">
            <label>
              影视角色种子
              <input
                aria-label="影视角色种子（开局锁定）"
                value={runtimeState.world.screenCharacterSeedsEnabled === false ? '关闭' : '开启'}
                readOnly
              />
            </label>
            <label>
              Storypack 影响
              <input
                aria-label="Storypack 影响（开局锁定）"
                value={storypackInfluenceLabels[runtimeState.world.storypackInfluence]}
                readOnly
              />
            </label>
            <label className="span-2">
              戏剧化开局
              <input
                aria-label="戏剧化开局（开局锁定）"
                value={
                  getDramaticOpeningDefinition(runtimeState.world.dramaticOpeningId)?.title ??
                  '未启用'
                }
                readOnly
              />
            </label>
            <p className="muted span-2">开局锁定，当前存档不可修改。</p>
          </div>
        ) : null}
        <div className="compact-form-grid">
          <label>
            长期叙事节奏
            <select
              aria-label="长期叙事节奏"
              value={dramaticContent.pacing}
              onChange={(event) =>
                updateDramaSetting({ pacing: event.target.value as DramaPacingPreset })
              }
            >
              {dramaPacingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            素材投喂量
            <select
              aria-label="戏剧素材投喂量"
              value={dramaticContent.materialLevel}
              onChange={(event) =>
                updateDramaSetting({ materialLevel: event.target.value as DramaMaterialLevel })
              }
            >
              <option value="minimal">极简</option>
              <option value="restrained">克制</option>
              <option value="standard">标准</option>
              <option value="rich">丰富</option>
              <option value="extended">扩展</option>
            </select>
          </label>
          <label>
            前台规划线路
            <select
              aria-label="前台规划线路"
              value={dramaticContent.planningRoute}
              onChange={(event) =>
                updateDramaSetting({ planningRoute: event.target.value as DramaPlanningRouteMode })
              }
            >
              <option value="auto">自动</option>
              <option value="follow-main">跟随主剧情，同回合规划</option>
              <option value="use-auxiliary">优先使用辅助生成接口</option>
            </select>
          </label>
          <p className="muted span-2">
            {dramaPacingOptions.find((option) => option.value === dramaticContent.pacing)?.description}
            “原版节奏”默认保留旧版投喂方式，仅在有本局重点自定义内容时执行窄规划；其他档位只编排既有事实和候选素材，规划失败不会阻塞剧情。
          </p>
          {dramaticContent.pacing === 'custom' ? (
            <>
              <label>
                动态素材上限
                <input
                  aria-label="戏剧化动态素材上限"
                  type="number"
                  min={1}
                  max={50}
                  value={dramaticContent.custom?.dynamicLimit ?? dramaticBudget.dynamicLimit}
                  onChange={(event) => updateCustomDramaBudget('dynamicLimit', event.target.value)}
                />
              </label>
              <label>
                静态素材上限
                <input
                  aria-label="戏剧化静态素材上限"
                  type="number"
                  min={0}
                  max={50}
                  value={dramaticContent.custom?.staticLimit ?? dramaticBudget.staticLimit}
                  onChange={(event) => updateCustomDramaBudget('staticLimit', event.target.value)}
                />
              </label>
              <label>
                辅助素材上限
                <input
                  aria-label="戏剧化辅助素材上限"
                  type="number"
                  min={0}
                  max={1}
                  value={dramaticContent.custom?.supportLimit ?? dramaticBudget.supportLimit}
                  onChange={(event) => updateCustomDramaBudget('supportLimit', event.target.value)}
                />
              </label>
              <label>
                安静窗口（回合）
                <input
                  aria-label="戏剧化安静窗口回合数"
                  type="number"
                  min={1}
                  max={50}
                  value={dramaticContent.custom?.quietWindowTurns ?? dramaticBudget.quietWindowTurns}
                  onChange={(event) => updateCustomDramaBudget('quietWindowTurns', event.target.value)}
                />
              </label>
              <label>
                世界主动度
                <select
                  aria-label="戏剧化世界主动度"
                  value={dramaticContent.custom?.worldInitiative ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'worldInitiative',
                      event.target.value as DramaPreferenceLevel
                    )
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="very_high">很高</option>
                </select>
              </label>
              <label>
                已有动态回流
                <select
                  aria-label="戏剧化已有动态回流"
                  value={dramaticContent.custom?.existingDynamicsReturn ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'existingDynamicsReturn',
                      event.target.value as DramaPreferenceLevel
                    )
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="very_high">很高</option>
                </select>
              </label>
              <label>
                新种子曝光
                <select
                  aria-label="戏剧化新种子曝光"
                  value={dramaticContent.custom?.newSeedExposure ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'newSeedExposure',
                      event.target.value as DramaPreferenceLevel
                    )
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                  <option value="very_high">很高</option>
                </select>
              </label>
              <label>
                安静留白
                <select
                  aria-label="戏剧化安静留白"
                  value={dramaticContent.custom?.quietSpace ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'quietSpace',
                      event.target.value as DramaQuietSpaceLevel
                    )
                  }
                >
                  <option value="very_low">很低</option>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
              <label>
                偶然交集容忍
                <select
                  aria-label="戏剧化偶然交集容忍"
                  value={dramaticContent.custom?.coincidenceTolerance ?? 'normal'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'coincidenceTolerance',
                      event.target.value as DramaCoincidenceTolerance
                    )
                  }
                >
                  <option value="strict">严格</option>
                  <option value="normal">正常</option>
                  <option value="cinematic">电影化</option>
                </select>
              </label>
              <label>
                重大升级倾向
                <select
                  aria-label="戏剧化重大升级倾向"
                  value={dramaticContent.custom?.majorEscalation ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'majorEscalation',
                      event.target.value as DramaEscalationLevel
                    )
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
              <label>
                关系人物主动程度
                <select
                  aria-label="戏剧化关系人物主动程度"
                  value={dramaticContent.custom?.relationshipInitiative ?? 'medium'}
                  onChange={(event) =>
                    updateCustomDramaPreference(
                      'relationshipInitiative',
                      event.target.value as DramaEscalationLevel
                    )
                  }
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
            </>
          ) : null}
        </div>
        <div className="compact-form-grid">
          {dramaChannelIds.map((channelId) => (
            <label key={channelId}>
              {dramaChannelLabels[channelId]}
              <select
                aria-label={`戏剧素材渠道：${dramaChannelLabels[channelId]}`}
                value={dramaticContent.channels[channelId]}
                onChange={(event) =>
                  updateDramaChannel(channelId, event.target.value as DramaChannelLevel)
                }
              >
                <option value="off">关闭新候选</option>
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </label>
          ))}
          <p className="muted span-2">
            关闭渠道只停止引入新的可选素材；已经发生的事实、到期事项和必然后果仍会正常进入回合。
            本局重点自定义内容属于玩家明确要求，关闭对应渠道也不会取消该意图。
          </p>
        </div>
        </section>
      ) : null}

      {page === 'game' ? (
        <>
          <section className="settings-section" aria-label="怀孕机制">
            <h3>怀孕机制</h3>
            <div className="compact-form-grid">
              <label>
                机制强度
                <select
                  aria-label="怀孕机制强度"
                  value={pregnancyMode}
                  onChange={(event) => updatePregnancyMode(event.target.value as PregnancyMode)}
                >
                  <option value="off">关闭</option>
                  <option value="low">低概率</option>
                  <option value="standard">标准概率</option>
                  <option value="high">高概率</option>
                </select>
              </label>
              <div className="pregnancy-mechanism-guide span-2">
                <p>
                  只有正文明确发生无保护、主动备孕，或采取避孕但仍存在残余风险的成年行为时，模型才会报告风险事件。随后由本地引擎按年龄、风险类型与当前档位计算概率，并立即锁定一次判定；存档、读档或重开页面都不会重新掷骰。
                </p>
                <p>
                  风险会先在人物志的“香闺秘档 → 子宫档案”登记为“待验孕”，并显示预计验孕日期。结果会在游戏时间经过
                  21—30 天后揭晓；没有既有香闺秘档时，只建立必要的妊娠跟踪，不会自动补造其他私密资料。
                </p>
                <details className="pregnancy-mechanism-details">
                  <summary>查看判定流程与具体概率</summary>
                  <div className="pregnancy-mechanism-details-body">
                    <section>
                      <h4>标准档 · 无保护风险的基础概率</h4>
                      <div className="pregnancy-probability-grid" role="table" aria-label="按年龄划分的基础怀孕概率">
                        <span role="rowheader">24 岁及以下</span>
                        <strong role="cell">22%</strong>
                        <span role="rowheader">25—29 岁</span>
                        <strong role="cell">20%</strong>
                        <span role="rowheader">30—34 岁</span>
                        <strong role="cell">16%</strong>
                        <span role="rowheader">35—39 岁</span>
                        <strong role="cell">10%</strong>
                        <span role="rowheader">40—44 岁</span>
                        <strong role="cell">5%</strong>
                        <span role="rowheader">45—49 岁</span>
                        <strong role="cell">1.5%</strong>
                        <span role="rowheader">50 岁及以上</span>
                        <strong role="cell">0.2%</strong>
                      </div>
                    </section>
                    <section>
                      <h4>档位与行为修正</h4>
                      <ul>
                        <li>低概率：基础概率 × 0.45；标准概率：× 1；高概率：× 1.5。</li>
                        <li>主动备孕：再 × 1.25；采取避孕但仍有残余风险：再 × 0.25。</li>
                        <li>任何单次判定最高为 30%。同一游戏日内再次发生风险，会累加该次概率的 35%，总概率仍不超过 30%。</li>
                        <li>
                          同一人物每回合最多登记一条风险；跨游戏日的风险会分别登记，并在各自日期验孕。较早判定成功后，后续待判定自动失效；若失败，则继续等待下一项。
                        </li>
                      </ul>
                    </section>
                    <section>
                      <h4>孕期时间轴</h4>
                      <p>
                        阳性验孕后先进入“疑似怀孕”，第 45 天转为确认；约第 260 天进入待产窗口，第 270
                        天为预产节点，最迟第 280 天完成分娩结算，之后保留 90 天产后恢复期。相关阶段、日期、已知父亲候选、最近验孕和妊娠历史都会按玩家可见范围显示在香闺秘档中。
                      </p>
                    </section>
                    <p className="muted">
                      关闭机制只会阻止新的风险登记；已经建立的待验孕或孕期状态仍按游戏日期继续推进。
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </section>

          <section className="settings-section" aria-label="自动存档">
        <h3>自动存档</h3>
        <div className="compact-form-grid">
          <label>
            自动存档保留数量
            <input
              aria-label="自动存档保留数量"
              type="number"
              min={minAutoSaveLimit}
              max={maxAutoSaveLimit}
              value={autoSaveLimit}
              onChange={(event) => updateAutoSaveLimit(event.target.value)}
            />
          </label>
          <label>
            自动保存间隔回合
            <input
              aria-label="自动保存间隔回合"
              type="number"
              min={minAutoSaveIntervalTurns}
              max={maxAutoSaveIntervalTurns}
              value={autoSaveIntervalTurns}
              onChange={(event) => updateAutoSaveIntervalTurns(event.target.value)}
            />
          </label>
          <p className="muted span-2">
            默认保留 20 个自动存档，每 1 回合自动保存一次。手动存档不受自动存档数量上限影响。
          </p>
        </div>
          </section>

          <section className="settings-section" aria-label="回溯链">
        <h3>回溯链</h3>
        <div className="compact-form-grid">
          <label>
            回溯快照数量
            <input
              aria-label="回溯快照数量"
              type="number"
              min={minRollbackSnapshotLimit}
              max={maxRollbackSnapshotLimit}
              value={rollbackSnapshotLimit}
              onChange={(event) => updateRollbackSnapshotLimit(event.target.value)}
            />
          </label>
          <p className="muted span-2">
            默认保留 20 个行动前快照，用于重ROLL上一回合和编辑旧行动重发。设为 0 会关闭回溯链。
          </p>
        </div>
          </section>
        </>
      ) : null}
      {isCantoneseFlavorDialogOpen && runtimeState ? (
        <CantoneseFlavorDialog
          currentFlavor={cantoneseFlavorProfile.id}
          onSelect={(flavor) => {
            onRuntimeCantoneseFlavorChange(flavor);
            setIsCantoneseFlavorDialogOpen(false);
          }}
          onClose={() => setIsCantoneseFlavorDialogOpen(false)}
        />
      ) : null}
      {isGameDifficultyDialogOpen && runtimeState ? (
        <GameDifficultyDialog
          currentDifficulty={gameDifficultyProfile.id}
          onSelect={(difficulty) => {
            onRuntimeGameDifficultyChange(difficulty);
            setIsGameDifficultyDialogOpen(false);
          }}
          onClose={() => setIsGameDifficultyDialogOpen(false)}
        />
      ) : null}
    </section>
  );
}

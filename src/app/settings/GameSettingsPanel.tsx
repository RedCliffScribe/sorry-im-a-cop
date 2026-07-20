import {
  getNarrativeLengthProfile,
  narrativeLengthProfiles,
  type NarrativeLengthLevel
} from '../../domain/settings/narrativeLength';
import {
  narrativePerspectiveProfiles,
  resolveNarrativePerspective
} from '../../domain/settings/narrativePerspective';
import type { AiSettings, NarrativePerspective, PregnancyMode } from '../../domain/settings/types';

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
  settings,
  onChange
}: {
  settings: AiSettings;
  onChange: (settings: AiSettings) => void;
}) {
  const storyRenderLimit = settings.game.storyRenderLimit;
  const narrativeLengthLevel = getNarrativeLengthProfile(settings.game.narrativeLengthLevel).level;
  const narrativePerspective = resolveNarrativePerspective(settings.game.narrativePerspective);
  const autoSaveLimit = settings.game.autoSaveLimit;
  const autoSaveIntervalTurns = settings.game.autoSaveIntervalTurns;
  const rollbackSnapshotLimit = settings.game.rollbackSnapshotLimit;
  const pregnancyMode = settings.game.pregnancyMode ?? 'standard';

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

  return (
    <section className="settings-panel">
      <div className="settings-topline">
        <div>
          <h2>游戏设置</h2>
          <p className="muted">调整手测和游玩时的前端表现，不改变存档里的完整剧情记录。</p>
        </div>
      </div>

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
          <p className="muted span-2">
            模型只报告风险事件，本地引擎负责稳定随机、延迟验孕、孕期推进与分娩。关闭后不再登记新风险，但已有孕期仍会正常推进。
          </p>
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
    </section>
  );
}

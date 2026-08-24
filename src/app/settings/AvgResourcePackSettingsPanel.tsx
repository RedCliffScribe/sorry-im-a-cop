import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AvgResourcePackManager,
  createDefaultAvgResourcePackStorage,
  type AvgResourcePackInstallProgress,
  type AvgResourcePackManagerApi,
  type AvgResourcePackSelection,
  type InstalledAvgResourcePackRecord
} from '../../domain/avgResourcePack';
import {
  AVG_PORTRAIT_HORIZONTAL_OFFSET_MAX,
  AVG_PORTRAIT_HORIZONTAL_OFFSET_MIN,
  AVG_PORTRAIT_SCALE_MAX,
  AVG_PORTRAIT_SCALE_MIN,
  AVG_PORTRAIT_VERTICAL_OFFSET_MAX,
  AVG_PORTRAIT_VERTICAL_OFFSET_MIN,
  DEFAULT_AVG_PORTRAIT_LAYOUT,
  areAvgPortraitLayoutsEqual,
  normalizeAvgPortraitLayout
} from '../../domain/settings/avgPortraitLayout';
import type {
  AvgPortraitLayoutSettings,
  DisplaySettings
} from '../../domain/settings/types';
import { avgPortraitLayoutStyle } from '../components/avg/avgPortraitLayoutStyle';

const defaultManager = new AvgResourcePackManager(createDefaultAvgResourcePackStorage());

interface AvgResourcePackSettingsPanelProps {
  worldpackId?: string;
  manager?: AvgResourcePackManagerApi;
  onResourceChange?: () => void;
  displaySettings?: DisplaySettings;
  onDisplaySettingsChange?: (settings: DisplaySettings) => void | Promise<void>;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function progressLabel(progress: AvgResourcePackInstallProgress): string {
  if (progress.phase === 'validating') return '正在逐项校验图片、尺寸与哈希……';
  if (progress.phase === 'committing') return '校验通过，正在原子安装……';
  const percent = progress.archiveByteLength > 0
    ? Math.round((progress.archiveBytesRead / progress.archiveByteLength) * 100)
    : 0;
  return `正在读取资源包：${percent}%（已发现 ${progress.entriesRead} 个文件）`;
}

export function AvgResourcePackSettingsPanel({
  worldpackId = 'hk1988',
  manager = defaultManager,
  onResourceChange,
  displaySettings,
  onDisplaySettingsChange
}: AvgResourcePackSettingsPanelProps) {
  const [records, setRecords] = useState<InstalledAvgResourcePackRecord[]>([]);
  const [selection, setSelection] = useState<AvgResourcePackSelection>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AvgResourcePackInstallProgress>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const savedPortraitLayout = useMemo(
    () => normalizeAvgPortraitLayout(displaySettings?.avgPortraitLayout),
    [displaySettings?.avgPortraitLayout]
  );
  const [portraitLayoutDraft, setPortraitLayoutDraft] = useState<AvgPortraitLayoutSettings>(
    savedPortraitLayout
  );
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState<string>();
  const [layoutError, setLayoutError] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortraitLayoutDraft(savedPortraitLayout);
  }, [savedPortraitLayout]);

  const refresh = useCallback(async () => {
    const [nextRecords, nextSelection] = await Promise.all([
      manager.list(worldpackId),
      manager.getSelection(worldpackId)
    ]);
    setRecords(nextRecords);
    setSelection(nextSelection);
  }, [manager, worldpackId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    refresh()
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refresh]);

  const basePacks = useMemo(
    () => records.filter((record) => record.manifest.packType === 'base'),
    [records]
  );
  const current = records.find((record) => record.manifest.packId === selection?.basePackId);
  const extensions = records.filter((record) => record.manifest.packType === 'extension');

  const importArchive = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    setProgress(undefined);
    try {
      const result = await manager.install(file, {
        archiveLabel: file.name,
        onProgress: setProgress
      });
      await refresh();
      onResourceChange?.();
      setMessage(
        result.replacedVersion
          ? `资源包已从 ${result.replacedVersion} 安全升级到 ${result.record.manifest.version}。`
          : `资源包 ${result.record.manifest.displayName} 已安装。`
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  };

  const changeBasePack = async (packId: string) => {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await manager.selectBase(worldpackId, packId || undefined);
      await refresh();
      onResourceChange?.();
      setMessage('资源包选择已保存；当前 AVG 画面已重新载入。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const removeCurrent = async () => {
    if (!current) return;
    if (!window.confirm(`移除“${current.manifest.displayName}”？游戏存档和玩家图片不会被删除。`)) {
      return;
    }
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await manager.uninstall(current.manifest.packId);
      await refresh();
      onResourceChange?.();
      setMessage('AVG 资源包已移除；存档、玩家覆盖图和生成图均已保留。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const updatePortraitLayout = (
    field: keyof AvgPortraitLayoutSettings,
    value: number
  ) => {
    setPortraitLayoutDraft((current) => normalizeAvgPortraitLayout({
      ...current,
      [field]: value
    }));
    setLayoutMessage(undefined);
    setLayoutError(undefined);
  };

  const savePortraitLayout = async () => {
    if (!displaySettings || !onDisplaySettingsChange) return;
    setLayoutSaving(true);
    setLayoutMessage(undefined);
    setLayoutError(undefined);
    try {
      await onDisplaySettingsChange({
        ...displaySettings,
        avgPortraitLayout: portraitLayoutDraft
      });
      setLayoutMessage('立绘大小与位置已保存。');
    } catch (reason) {
      setLayoutError(reason instanceof Error ? reason.message : '立绘布局保存失败。');
    } finally {
      setLayoutSaving(false);
    }
  };

  const portraitLayoutChanged = !areAvgPortraitLayoutsEqual(
    portraitLayoutDraft,
    savedPortraitLayout
  );

  return (
    <section className="settings-panel avg-resource-settings">
      <div>
        <h2>AVG 演出设置</h2>
        <p className="muted">调整演出布局，并管理与存档、玩家图片和剧情 DLC 分开保存的本地资源包。</p>
      </div>

      <div className="avg-resource-summary" aria-live="polite">
        <div><span>当前资源包</span><strong>{loading ? '读取中……' : current?.manifest.displayName ?? '未安装'}</strong></div>
        <div><span>资源版本</span><strong>{current?.manifest.version ?? '—'}</strong></div>
        <div><span>资源校验</span><strong>{current ? '正常' : '—'}</strong></div>
        <div><span>已登记资源</span><strong>{current ? `${current.assetCount} 项 · ${formatBytes(current.expandedByteLength)}` : '—'}</strong></div>
      </div>

      <label className="avg-presentation-toggle">
        <input
          type="checkbox"
          checked={displaySettings?.avgPlayerPortraitMode === 'show'}
          disabled={!displaySettings || !onDisplaySettingsChange}
          onChange={(event) => {
            if (!displaySettings || !onDisplaySettingsChange) return;
            void onDisplaySettingsChange({
              ...displaySettings,
              avgPlayerPortraitMode: event.target.checked ? 'show' : 'hidden'
            });
          }}
        />
        <span>
          <strong>正文演出显示主角立绘</strong>
          <small>
            开启后，玩家对白、内心活动及无人可保持的旁白画面会使用正常人物解析链显示主角；关闭时采用传统第一人称 AVG 表现。
          </small>
        </span>
      </label>

      <section className="avg-portrait-layout-settings" aria-labelledby="avg-portrait-layout-title">
        <header>
          <div>
            <h3 id="avg-portrait-layout-title">人物立绘大小与位置</h3>
            <p>拖动下方滑块实时查看示意；点击保存后应用到所有 AVG 演出。对话框位置不会改变。</p>
          </div>
          <button
            type="button"
            disabled={layoutSaving}
            onClick={() => {
              setPortraitLayoutDraft({ ...DEFAULT_AVG_PORTRAIT_LAYOUT });
              setLayoutMessage(undefined);
              setLayoutError(undefined);
            }}
          >
            恢复默认
          </button>
        </header>

        <div
          className="avg-layout-preview-stage"
          data-testid="avg-layout-preview-stage"
          style={avgPortraitLayoutStyle(portraitLayoutDraft)}
          aria-label="AVG 立绘布局示意"
        >
          <div className="avg-layout-preview-scene" aria-hidden="true" />
          <div className="avg-layout-preview-portrait" aria-hidden="true">
            <span className="avg-layout-preview-portrait-head" />
            <span className="avg-layout-preview-portrait-body" />
            <small>立绘</small>
          </div>
          <div className="avg-layout-preview-dialogue" aria-hidden="true">
            <strong>人物名</strong>
            <span>对话框保持固定，便于判断立绘与台词区域是否遮挡。</span>
          </div>
        </div>

        <div className="avg-portrait-layout-controls">
          <label>
            <span>立绘大小 <output>{portraitLayoutDraft.scalePercent}%</output></span>
            <input
              type="range"
              aria-label="立绘大小"
              min={AVG_PORTRAIT_SCALE_MIN}
              max={AVG_PORTRAIT_SCALE_MAX}
              step="1"
              value={portraitLayoutDraft.scalePercent}
              disabled={!displaySettings || !onDisplaySettingsChange || layoutSaving}
              onChange={(event) => updatePortraitLayout('scalePercent', Number(event.target.value))}
            />
          </label>
          <label>
            <span>左右位置 <output>{portraitLayoutDraft.horizontalOffsetPercent > 0 ? '+' : ''}{portraitLayoutDraft.horizontalOffsetPercent}%</output></span>
            <input
              type="range"
              aria-label="立绘左右位置"
              min={AVG_PORTRAIT_HORIZONTAL_OFFSET_MIN}
              max={AVG_PORTRAIT_HORIZONTAL_OFFSET_MAX}
              step="1"
              value={portraitLayoutDraft.horizontalOffsetPercent}
              disabled={!displaySettings || !onDisplaySettingsChange || layoutSaving}
              onChange={(event) => updatePortraitLayout('horizontalOffsetPercent', Number(event.target.value))}
            />
          </label>
          <label>
            <span>上下位置 <output>{portraitLayoutDraft.verticalOffsetPercent > 0 ? '+' : ''}{portraitLayoutDraft.verticalOffsetPercent}%</output></span>
            <input
              type="range"
              aria-label="立绘上下位置"
              min={AVG_PORTRAIT_VERTICAL_OFFSET_MIN}
              max={AVG_PORTRAIT_VERTICAL_OFFSET_MAX}
              step="1"
              value={portraitLayoutDraft.verticalOffsetPercent}
              disabled={!displaySettings || !onDisplaySettingsChange || layoutSaving}
              onChange={(event) => updatePortraitLayout('verticalOffsetPercent', Number(event.target.value))}
            />
          </label>
        </div>

        <div className="avg-portrait-layout-actions">
          <p className="field-note">左右为负时向左、为正时向右；上下为负时向上、为正时向下。</p>
          <button
            type="button"
            disabled={
              !displaySettings ||
              !onDisplaySettingsChange ||
              layoutSaving ||
              !portraitLayoutChanged
            }
            onClick={() => void savePortraitLayout()}
          >
            {layoutSaving ? '保存中…' : '保存立绘布局'}
          </button>
        </div>
        {layoutMessage ? <p className="avg-resource-message" role="status">{layoutMessage}</p> : null}
        {layoutError ? <p className="avg-resource-error" role="alert">{layoutError}</p> : null}
      </section>

      {basePacks.length > 1 ? (
        <label className="avg-resource-field">
          <span>当前使用的基础风格包</span>
          <select
            value={selection?.basePackId ?? ''}
            disabled={busy}
            onChange={(event) => void changeBasePack(event.target.value)}
          >
            <option value="">不启用 AVG 资源包</option>
            {basePacks.map((record) => (
              <option key={record.manifest.packId} value={record.manifest.packId}>
                {record.manifest.displayName} · {record.manifest.version}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="avg-resource-actions">
        <input
          ref={fileInput}
          className="avg-resource-file-input"
          type="file"
          accept=".zip,application/zip"
          aria-label="选择 AVG 资源包 ZIP"
          disabled={busy}
          onChange={(event) => void importArchive(event)}
        />
        <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          导入本地资源包
        </button>
        <button type="button" className="danger-button" disabled={busy || !current} onClick={() => void removeCurrent()}>
          移除当前资源包
        </button>
      </div>

      {extensions.length ? (
        <p className="field-note">已安装 {extensions.length} 个扩展包；启用顺序由其明确 loadOrder 决定。</p>
      ) : null}
      {progress ? <p className="avg-resource-progress" role="status">{progressLabel(progress)}</p> : null}
      {message ? <p className="avg-resource-message" role="status">{message}</p> : null}
      {error ? <p className="avg-resource-error" role="alert">{error}</p> : null}
      <p className="field-note">导入时会先完整校验到临时区；损坏或缺图的 ZIP 不会覆盖已安装版本。</p>
    </section>
  );
}

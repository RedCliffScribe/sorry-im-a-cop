import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AvgResourcePackManager,
  createDefaultAvgResourcePackStorage,
  type AvgResourcePackInstallProgress,
  type AvgResourcePackManagerApi,
  type AvgResourcePackSelection,
  type InstalledAvgResourcePackRecord
} from '../../domain/avgResourcePack';
import type { DisplaySettings } from '../../domain/settings/types';

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
  const fileInput = useRef<HTMLInputElement>(null);

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

  return (
    <section className="settings-panel avg-resource-settings">
      <div>
        <h2>AVG 演出资源</h2>
        <p className="muted">香港1988 · 本地资源包与存档、玩家图片、剧情 DLC 分开保存。</p>
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

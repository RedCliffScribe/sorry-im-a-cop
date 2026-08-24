import { useId, useRef, useState } from 'react';
import type { RuntimeSaveSummary } from '../../domain/persistence/SaveRepository';
import {
  readPortableSaveBundleFile,
  type PortableSaveBundle
} from '../../domain/persistence/portableSaveZipArchive';

type SaveManagerMode = 'save' | 'load';

const saveRepairHelpText =
  '只审计并修复已识别的结构缺口与固定人物身份错绑；确定性修复在本地完成，必要时才使用主剧情 API 小范围补齐。成功前会自动建立备份，不会让 AI 重写整份存档。';

interface SaveManagerModalProps {
  mode: SaveManagerMode;
  saves: RuntimeSaveSummary[];
  isLoading: boolean;
  error: string | null;
  canSave: boolean;
  onSaveCurrent: () => Promise<void>;
  onLoadSave: (saveId: string) => void | Promise<void>;
  onRepairSave: (saveId: string) => Promise<string>;
  onDeleteSave: (saveId: string) => Promise<void>;
  onClearSaves: () => Promise<void>;
  onImportSaves: (bundle: PortableSaveBundle) => Promise<void>;
  onExportSaves: (includeImages: boolean) => Promise<void>;
  onClose: () => void;
}

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString();
}

function saveKindOf(save: RuntimeSaveSummary): 'manual' | 'auto' {
  return save.saveKind === 'auto' ? 'auto' : 'manual';
}

function SaveList({
  title,
  emptyText,
  saves,
  onLoadSave,
  onRepairSave,
  repairingSaveId,
  onDeleteSave
}: {
  title: string;
  emptyText: string;
  saves: RuntimeSaveSummary[];
  onLoadSave: (saveId: string) => void | Promise<void>;
  onRepairSave: (saveId: string) => Promise<void>;
  repairingSaveId: string | null;
  onDeleteSave: (saveId: string) => Promise<void>;
}) {
  const repairHelpId = useId();

  return (
    <section className="save-manager-column" role="region" aria-label={title}>
      <h3>{title}</h3>
      <span id={repairHelpId} className="visually-hidden">
        {saveRepairHelpText}
      </span>
      {saves.length === 0 ? <p className="empty-state">{emptyText}</p> : null}
      <ul className="save-manager-list">
        {saves.map((save) => (
          <li key={save.saveId} className="save-manager-item">
            <div className="save-manager-item-summary">
              <strong>{save.playerName || '未知玩家'} · 回合 {save.turnCounter}</strong>
              <span>游戏时间：{save.gameDateLabel}</span>
              <small>保存时间：{formatUpdatedAt(save.updatedAt)}</small>
            </div>
            <div className="save-manager-item-actions">
              <button
                type="button"
                title={saveRepairHelpText}
                aria-describedby={repairHelpId}
                disabled={repairingSaveId !== null}
                onClick={() => void onRepairSave(save.saveId)}
              >
                {repairingSaveId === save.saveId ? '正在修复…' : '存档修复'}
              </button>
              <button type="button" onClick={() => void onLoadSave(save.saveId)}>
                读取存档
              </button>
              <button type="button" className="danger-button" onClick={() => void onDeleteSave(save.saveId)}>
                删除存档
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SaveManagerModal({
  mode,
  saves,
  isLoading,
  error,
  canSave,
  onSaveCurrent,
  onLoadSave,
  onRepairSave,
  onDeleteSave,
  onClearSaves,
  onImportSaves,
  onExportSaves,
  onClose
}: SaveManagerModalProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [includeImages, setIncludeImages] = useState(false);
  const [repairingSaveId, setRepairingSaveId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const manualSaves = saves.filter((save) => saveKindOf(save) === 'manual');
  const autoSaves = saves.filter((save) => saveKindOf(save) === 'auto');
  const latestSave = saves[0];

  async function handleSaveCurrent() {
    setStatus(null);
    try {
      await onSaveCurrent();
      setStatus('当前进度已写入手动存档。');
    } catch {
      setStatus('保存失败，请稍后再试。');
    }
  }

  async function handleClearSaves() {
    if (!saves.length) return;
    if (!window.confirm('第一次确认：确定要清空全部存档吗？继续后还需要再次确认。')) return;
    if (!window.confirm('第二次确认：全部手动与自动存档将永久删除，确定继续吗？')) return;

    setStatus(null);
    try {
      await onClearSaves();
      setStatus('存档已清空。');
    } catch {
      setStatus('清空存档失败。');
    }
  }

  async function handleImportFile(file: File | undefined) {
    if (!file) return;

    setStatus(null);
    try {
      const bundle = await readPortableSaveBundleFile(file);
      await onImportSaves(bundle);
      const visualCount = Object.keys(bundle.visualArchives).length;
      setStatus(`已导入 ${bundle.records.length} 个存档${visualCount ? `及 ${visualCount} 个视觉资料分区` : ''}。`);
    } catch {
      setStatus('导入失败，请确认文件是 CopV2 存档。');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleExportSaves() {
    setStatus(null);
    try {
      await onExportSaves(includeImages);
      setStatus(includeImages ? '存档与文生图图片已导出。' : '存档已导出（不含文生图图片）。');
    } catch {
      setStatus('导出失败。');
    }
  }

  async function handleRepairSave(saveId: string) {
    if (
      !window.confirm(
        '存档修复只会审计明确的结构缺口和固定人物身份错绑；确定性项目在本地修复，必要时才用主剧情 API 小范围补齐。成功前会自动建立“修复前备份”。是否继续？'
      )
    ) {
      return;
    }

    setStatus(null);
    setRepairingSaveId(saveId);
    try {
      setStatus(await onRepairSave(saveId));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '存档修复失败，原存档未被覆盖。');
    } finally {
      setRepairingSaveId(null);
    }
  }

  return (
    <div className="save-manager-backdrop">
      <section
        className="save-manager-modal feature-modal-frame feature-modal-frame--utility"
        role="dialog"
        aria-modal="true"
        aria-label="存档管理"
      >
        <header className="save-manager-header">
          <div className="save-manager-heading">
            <div>
              <h2>{mode === 'save' ? '保存进度' : '读取进度'}</h2>
              <p>{mode === 'save' ? '保存当前进度，或读取已有存档。' : '读取已有存档，继续当前故事。'}</p>
            </div>
            <button type="button" className="icon-button" aria-label="关闭存档" onClick={onClose}>
              ×
            </button>
          </div>
          <div className="save-manager-toolbar">
            {canSave ? (
              <button type="button" className="primary-button" onClick={() => void handleSaveCurrent()}>
                保存当前进度
              </button>
            ) : null}
            <button type="button" disabled={!latestSave} onClick={() => latestSave && void onLoadSave(latestSave.saveId)}>
              读取最近存档
            </button>
            <button type="button" disabled={saves.length === 0} onClick={() => void handleExportSaves()}>
              导出存档
            </button>
            <label className="save-manager-export-images">
              <input
                type="checkbox"
                checked={includeImages}
                onChange={(event) => setIncludeImages(event.target.checked)}
              />
              <span>包含文生图图片（文件可能较大）</span>
            </label>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              导入存档
            </button>
            <button type="button" className="danger-button" disabled={saves.length === 0} onClick={() => void handleClearSaves()}>
              清空存档
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/zip,.zip,application/json,.json"
              className="visually-hidden"
              onChange={(event) => void handleImportFile(event.target.files?.[0])}
            />
          </div>
        </header>

        {isLoading ? <p className="muted">正在读取存档...</p> : null}
        {error ? (
          <p className="command-error" role="status">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="save-status" role="status">
            {status}
          </p>
        ) : null}

        <div className="save-manager-body">
          <SaveList
            title="手动存档"
            emptyText="暂无手动存档。"
            saves={manualSaves}
            onLoadSave={onLoadSave}
            onRepairSave={handleRepairSave}
            repairingSaveId={repairingSaveId}
            onDeleteSave={onDeleteSave}
          />
          <SaveList
            title="自动存档"
            emptyText="暂无自动存档。"
            saves={autoSaves}
            onLoadSave={onLoadSave}
            onRepairSave={handleRepairSave}
            repairingSaveId={repairingSaveId}
            onDeleteSave={onDeleteSave}
          />
        </div>
      </section>
    </div>
  );
}

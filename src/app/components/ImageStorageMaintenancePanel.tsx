import { useEffect, useMemo, useRef, useState } from 'react';
import {
  VisualAssetBlobMismatchError,
  type VisualRepository,
  type VisualRepositorySnapshot,
  type VisualStorageIntegrityProgress,
  type VisualStorageIntegrityReport,
  type VisualStorageIssue,
  type VisualStorageSummary
} from '../../domain/imageGeneration/visualRepository';
import {
  createLocalVisualId,
  readRestorableImageDimensions
} from '../../domain/imageGeneration/userImageImport';

interface ImageStorageMaintenancePanelProps {
  saveId: string;
  repository: VisualRepository;
  snapshot: VisualRepositorySnapshot;
  summary: VisualStorageSummary | null;
  onReport: (report: VisualStorageIntegrityReport) => void;
  onChanged: (preferredImageId?: string) => Promise<void>;
  onSelectAsset: (imageId: string) => void;
  onNotice: (message: string) => void;
  onClose: () => void;
}

type InspectionState =
  | { status: 'idle' }
  | { status: 'running'; progress: VisualStorageIntegrityProgress }
  | { status: 'ready'; report: VisualStorageIntegrityReport }
  | { status: 'cancelled' }
  | { status: 'failed'; message: string };

type StorageEstimateState =
  | { status: 'loading' }
  | { status: 'ready'; usage: number; quota: number }
  | { status: 'unavailable' };

interface PendingAlternativeImport {
  imageId: string;
  file: File;
  width: number;
  height: number;
}

const issueReasonLabels: Record<VisualStorageIssue['reason'], string> = {
  'blob-missing': '本地文件未携带或已经缺失',
  'blob-structure-invalid': '本地文件记录结构无效',
  'image-id-mismatch': '本地文件与图片 ID 不一致',
  'mime-type-mismatch': '本地文件格式与元数据不一致',
  'byte-length-mismatch': '本地文件大小与元数据不一致',
  'content-hash-mismatch': '本地文件内容哈希与元数据不一致',
  'unreferenced-blob': '本地文件没有任何图片资产引用'
};

function formatStoredBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(1) : value.toFixed(2)} ${unit}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function issueBytes(issues: readonly VisualStorageIssue[]): number {
  const bytesByBlobKey = new Map<string, number>();
  issues.forEach((issue) => {
    if (!issue.blobKey) return;
    bytesByBlobKey.set(issue.blobKey, Math.max(bytesByBlobKey.get(issue.blobKey) ?? 0, issue.byteLength));
  });
  return Array.from(bytesByBlobKey.values()).reduce((total, bytes) => total + bytes, 0);
}

export function ImageStorageMaintenancePanel({
  saveId,
  repository,
  snapshot,
  summary,
  onReport,
  onChanged,
  onSelectAsset,
  onNotice,
  onClose
}: ImageStorageMaintenancePanelProps) {
  const [inspection, setInspection] = useState<InspectionState>({ status: 'idle' });
  const [estimate, setEstimate] = useState<StorageEstimateState>({ status: 'loading' });
  const [busyAction, setBusyAction] = useState('');
  const [pendingCleanup, setPendingCleanup] = useState<'orphan' | 'corrupt'>();
  const [pendingAlternative, setPendingAlternative] = useState<PendingAlternativeImport>();
  const inspectionController = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const storageManager = typeof navigator === 'undefined' ? undefined : navigator.storage;
    if (!storageManager?.estimate) {
      setEstimate({ status: 'unavailable' });
      return () => {
        active = false;
        inspectionController.current?.abort();
      };
    }
    void storageManager.estimate().then((value) => {
      if (!active) return;
      if (typeof value.usage === 'number' && typeof value.quota === 'number' && value.quota > 0) {
        setEstimate({ status: 'ready', usage: value.usage, quota: value.quota });
      } else {
        setEstimate({ status: 'unavailable' });
      }
    }, () => {
      if (active) setEstimate({ status: 'unavailable' });
    });
    return () => {
      active = false;
      inspectionController.current?.abort();
    };
  }, []);

  const report = inspection.status === 'ready' ? inspection.report : undefined;
  const recoveryIssues = useMemo(() => {
    const issueByImageId = new Map<string, VisualStorageIssue>();
    report?.issues.forEach((issue) => {
      if (!issue.imageId || issue.kind === 'orphan') return;
      const existing = issueByImageId.get(issue.imageId);
      if (!existing || issue.kind === 'corrupt') issueByImageId.set(issue.imageId, issue);
    });
    return Array.from(issueByImageId.values())
      .sort((left, right) => (left.imageId ?? '').localeCompare(right.imageId ?? ''));
  }, [report]);
  const orphanIssues = useMemo(
    () => report?.issues.filter((issue) => issue.kind === 'orphan' && issue.blobKey) ?? [],
    [report]
  );
  const corruptIssues = useMemo(
    () => report?.issues.filter((issue) => issue.kind === 'corrupt' && issue.blobKey) ?? [],
    [report]
  );

  async function runDeepInspection() {
    if (busyAction || inspection.status === 'running') return;
    const controller = new AbortController();
    inspectionController.current = controller;
    setPendingCleanup(undefined);
    setPendingAlternative(undefined);
    setInspection({
      status: 'running',
      progress: { checkedBlobCount: 0, totalBlobCount: summary?.storedBlobCount ?? 0 }
    });
    try {
      const next = await repository.inspectStorageIntegrity(saveId, {
        signal: controller.signal,
        onProgress: (progress) => setInspection((current) => (
          current.status === 'running' ? { status: 'running', progress } : current
        ))
      });
      setInspection({ status: 'ready', report: next });
      onReport(next);
      onNotice(`深度检查完成：校验 ${next.deepCheckedBlobCount} 个受引用文件；没有自动删除或生成图片。`);
    } catch (error) {
      if (isAbortError(error)) {
        setInspection({ status: 'cancelled' });
        onNotice('已取消深度检查；视觉资料没有被改动。');
      } else {
        const message = error instanceof Error ? error.message : '视觉资料深度检查失败。';
        setInspection({ status: 'failed', message });
        onNotice(`${message} 图片和绑定没有被改动。`);
      }
    } finally {
      if (inspectionController.current === controller) inspectionController.current = undefined;
    }
  }

  async function restoreOriginalFile(issue: VisualStorageIssue, file: File) {
    if (!issue.imageId || busyAction) return;
    setBusyAction(`restore:${issue.imageId}`);
    setPendingAlternative(undefined);
    onNotice('正在核对所选文件的格式、尺寸、大小和哈希。');
    let dimensions: { width: number; height: number } | undefined;
    try {
      dimensions = await readRestorableImageDimensions(file);
      await repository.restoreAssetBlob(saveId, issue.imageId, { blob: file, ...dimensions });
      await onChanged(issue.imageId);
      setInspection({ status: 'idle' });
      onNotice('原图片文件已精确恢复；图片 ID、生成记录和全部绑定保持不变。');
    } catch (error) {
      if (error instanceof VisualAssetBlobMismatchError && dimensions) {
        setPendingAlternative({ imageId: issue.imageId, file, ...dimensions });
        onNotice(error.message);
      } else {
        onNotice(error instanceof Error ? error.message : '原图片文件恢复失败。');
      }
    } finally {
      setBusyAction('');
    }
  }

  async function importAlternative(bindAsCurrent: boolean) {
    if (!pendingAlternative || busyAction) return;
    const sourceAsset = snapshot.assets[pendingAlternative.imageId];
    if (!sourceAsset) {
      onNotice('原图片资产已经变化，请重新检查。');
      setPendingAlternative(undefined);
      return;
    }
    if (bindAsCurrent && (!sourceAsset.originSubject || !sourceAsset.originPurpose)) {
      onNotice('原图片没有可安全复用的主体与用途，只能作为未绑定新图导入。');
      return;
    }
    setBusyAction('import-alternative');
    try {
      const result = await repository.importUserImage({
        saveId,
        imageId: createLocalVisualId('image'),
        blobKey: createLocalVisualId('blob'),
        blob: pendingAlternative.file,
        width: pendingAlternative.width,
        height: pendingAlternative.height,
        createdAt: new Date().toISOString(),
        originSubject: sourceAsset.originSubject,
        originPurpose: sourceAsset.originPurpose,
        bindAsCurrent
      });
      await onChanged(result.asset.imageId);
      setPendingAlternative(undefined);
      setInspection({ status: 'idle' });
      onNotice(bindAsCurrent
        ? '不一致文件已作为新图片导入并明确换绑；原资产元数据仍保留。'
        : '不一致文件已作为未绑定新图片导入；原资产元数据与绑定未改动。');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '新图片导入失败。');
    } finally {
      setBusyAction('');
    }
  }

  async function confirmCleanup(kind: 'orphan' | 'corrupt') {
    if (!report || busyAction) return;
    const issues = kind === 'orphan' ? orphanIssues : corruptIssues;
    if (!issues.length) return;
    setBusyAction(`cleanup:${kind}`);
    try {
      const result = await repository.cleanupStorageIssues(saveId, issues);
      await onChanged();
      setPendingCleanup(undefined);
      setInspection({ status: 'idle' });
      onNotice(kind === 'orphan'
        ? `已清理 ${result.removedBlobCount} 个游离文件，释放 ${formatStoredBytes(result.removedBytes)}；其他存档没有改动。`
        : `已移除 ${result.removedBlobCount} 个损坏文件；${result.affectedImageIds.length} 条资产元数据与绑定继续保留为可恢复缺图。`);
    } catch (error) {
      onNotice(error instanceof Error
        ? `${error.message} 没有产生部分清理。`
        : '存储清理失败；没有产生部分清理。');
    } finally {
      setBusyAction('');
    }
  }

  return (
    <section className="image-storage-maintenance" aria-label="图片存储维护">
      <header>
        <div>
          <p className="image-gallery-eyebrow">STORAGE MAINTENANCE</p>
          <h3>存储检查与恢复</h3>
          <p>只维护当前存档的独立视觉资料；不会触碰游戏本体美术，也不会自动调用图片供应商。</p>
        </div>
        <button type="button" onClick={onClose}>收起维护</button>
      </header>

      <div className="image-storage-maintenance-overview">
        <article>
          <strong>当前图片仓库</strong>
          <span>{summary ? `${summary.storedBlobCount} 个本地文件 · ${formatStoredBytes(summary.storedBytes)}` : '摘要不可用'}</span>
          <small>{summary
            ? `缺失 ${summary.missingBlobCount} / 损坏 ${summary.corruptBlobCount} / 游离 ${summary.orphanBlobCount}`
            : '请关闭图册后重试'}</small>
        </article>
        <article>
          <strong>浏览器站点总存储</strong>
          {estimate.status === 'loading' ? <span>正在估算…</span> : null}
          {estimate.status === 'unavailable' ? <span>当前浏览器未提供配额估算</span> : null}
          {estimate.status === 'ready' ? (
            <>
              <span>{formatStoredBytes(estimate.usage)} / {formatStoredBytes(estimate.quota)}</span>
              <small>{((estimate.usage / estimate.quota) * 100).toFixed(1)}% · 包含整个站点数据，并非文生图库独占配额</small>
            </>
          ) : null}
        </article>
      </div>

      <p className="image-storage-maintenance-note">
        缺失文件可能来自玩家主动导入的 metadata-only 存档，是合法可恢复状态；系统不会把它当作垃圾自动删除。
      </p>

      <div className="image-storage-maintenance-actions">
        {inspection.status === 'running' ? (
          <>
            <span role="status">
              正在逐个校验内容哈希：{inspection.progress.checkedBlobCount} / {inspection.progress.totalBlobCount}
            </span>
            <button type="button" onClick={() => inspectionController.current?.abort()}>取消深度检查</button>
          </>
        ) : (
          <button type="button" disabled={Boolean(busyAction)} onClick={() => void runDeepInspection()}>
            {inspection.status === 'ready' ? '重新深度检查' : '深度检查本地图片'}
          </button>
        )}
        <small>深度检查由玩家手动启动并逐个读取文件，不会在每次打开图册时自动扫描全部大图。</small>
      </div>

      {inspection.status === 'cancelled' ? <p role="status">检查已取消，没有改动任何数据。</p> : null}
      {inspection.status === 'failed' ? <p role="alert">{inspection.message}</p> : null}

      {report ? (
        <div className="image-storage-maintenance-results">
          <div className="image-storage-maintenance-result-summary" role="status">
            <strong>深度检查完成</strong>
            <span>受引用文件校验 {report.deepCheckedBlobCount} 个</span>
            <span>缺失 {report.summary.missingBlobCount} / 损坏 {report.summary.corruptBlobCount} / 游离 {report.summary.orphanBlobCount}</span>
            <small>{new Date(report.checkedAt).toLocaleString()}</small>
          </div>

          {recoveryIssues.length ? (
            <div className="image-storage-recovery-list" aria-label="可恢复图片">
              <h4>缺图与损坏文件恢复</h4>
              {recoveryIssues.map((issue) => {
                const asset = issue.imageId ? snapshot.assets[issue.imageId] : undefined;
                if (!asset || !issue.imageId) return null;
                const actionBusy = busyAction === `restore:${issue.imageId}`;
                return (
                  <article key={issue.imageId}>
                    <div>
                      <strong>{asset.originPurpose ?? '未指定用途'} · {issue.imageId}</strong>
                      <span>{issueReasonLabels[issue.reason]}</span>
                      <small>{asset.width} × {asset.height} · 期望 {formatStoredBytes(asset.byteLength)}</small>
                    </div>
                    <div>
                      <label className="character-visual-file-button">
                        {actionBusy ? '正在核对…' : '选择原文件恢复'}
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          disabled={Boolean(busyAction)}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void restoreOriginalFile(issue, file);
                          }}
                        />
                      </label>
                      <button type="button" disabled={Boolean(busyAction)} onClick={() => onSelectAsset(issue.imageId!)}>
                        查看资产与重新生成
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : <p>所有受引用图片文件均通过深度检查。</p>}

          {pendingAlternative ? (
            <div className="image-storage-alternative-confirm" role="alert">
              <strong>所选文件不是原图片</strong>
              <p>它不会覆盖原 `imageId`。可以明确导入为一张新图片；原资产仍保留为缺图或损坏状态。</p>
              <span>{pendingAlternative.file.name} · {pendingAlternative.width} × {pendingAlternative.height}</span>
              <div>
                {snapshot.assets[pendingAlternative.imageId]?.originSubject &&
                snapshot.assets[pendingAlternative.imageId]?.originPurpose ? (
                  <button type="button" disabled={Boolean(busyAction)} onClick={() => void importAlternative(true)}>
                    作为新图导入并换绑
                  </button>
                ) : null}
                <button type="button" disabled={Boolean(busyAction)} onClick={() => void importAlternative(false)}>
                  仅作为未绑定新图导入
                </button>
                <button type="button" disabled={Boolean(busyAction)} onClick={() => setPendingAlternative(undefined)}>取消</button>
              </div>
            </div>
          ) : null}

          <div className="image-storage-cleanup-grid">
            <article>
              <strong>游离文件</strong>
              <span>{orphanIssues.length} 个 · {formatStoredBytes(issueBytes(orphanIssues))}</span>
              <p>没有任何资产元数据引用，可在确认后从当前存档分区回收。</p>
              {pendingCleanup === 'orphan' ? (
                <div role="alert">
                  <span>确认只删除本次检查列出的游离文件？</span>
                  <button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmCleanup('orphan')}>确认清理游离文件</button>
                  <button type="button" disabled={Boolean(busyAction)} onClick={() => setPendingCleanup(undefined)}>取消</button>
                </div>
              ) : (
                <button type="button" disabled={!orphanIssues.length || Boolean(busyAction)} onClick={() => setPendingCleanup('orphan')}>
                  预览清理游离文件
                </button>
              )}
            </article>
            <article>
              <strong>损坏的本地文件</strong>
              <span>{corruptIssues.length} 个 · {formatStoredBytes(issueBytes(corruptIssues))}</span>
              <p>确认移除后仍保留资产元数据、提示词历史和绑定，并转为可恢复缺图。</p>
              {pendingCleanup === 'corrupt' ? (
                <div role="alert">
                  <span>确认只移除本次检查列出的损坏文件？</span>
                  <button type="button" disabled={Boolean(busyAction)} onClick={() => void confirmCleanup('corrupt')}>确认移除损坏文件</button>
                  <button type="button" disabled={Boolean(busyAction)} onClick={() => setPendingCleanup(undefined)}>取消</button>
                </div>
              ) : (
                <button type="button" disabled={!corruptIssues.length || Boolean(busyAction)} onClick={() => setPendingCleanup('corrupt')}>
                  预览移除损坏文件
                </button>
              )}
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type {
  VisualAsset,
  VisualRepository
} from '../../domain/imageGeneration/visualRepository';
import { VisualAssetImage } from './VisualAssetImage';

function downloadExtension(mimeType: VisualAsset['mimeType']): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/gif') return 'gif';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export function VisualAssetOriginalDialog({
  repository,
  asset,
  alt,
  onClose
}: {
  repository: Pick<VisualRepository, 'getBlob'>;
  asset: VisualAsset;
  alt: string;
  onClose: () => void;
}) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function downloadOriginal() {
    if (busy || typeof URL.createObjectURL !== 'function') return;
    setBusy(true);
    setNotice('');
    try {
      const blob = await repository.getBlob(asset.blobKey);
      if (!blob) throw new Error('原始图片文件不存在。');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${asset.imageId}.${downloadExtension(asset.mimeType)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice('原始图片已开始下载。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '原始图片下载失败。');
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      className="visual-original-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="visual-original-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`原图预览：${alt}`}
      >
        <header>
          <div>
            <strong>原图预览</strong>
            <span>{asset.width} × {asset.height} · {Math.ceil(asset.byteLength / 1024)} KB</span>
          </div>
          <button type="button" autoFocus onClick={onClose}>关闭原图</button>
        </header>
        <div className="visual-original-canvas">
          <VisualAssetImage repository={repository} asset={asset} alt={alt} />
        </div>
        <footer>
          <span>仅查看当前视觉仓库文件，不修改图片或绑定。</span>
          <button type="button" disabled={busy} onClick={() => void downloadOriginal()}>
            {busy ? '准备下载…' : '下载原文件'}
          </button>
        </footer>
        {notice ? <p role="status">{notice}</p> : null}
      </section>
    </div>,
    document.body
  );
}

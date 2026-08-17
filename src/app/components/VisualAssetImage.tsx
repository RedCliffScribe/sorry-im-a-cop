import { useEffect, useState } from 'react';
import type {
  VisualAsset,
  VisualRepository
} from '../../domain/imageGeneration/visualRepository';

export function VisualAssetImage({
  repository,
  asset,
  alt,
  className,
  unavailableReason
}: {
  repository: Pick<VisualRepository, 'getBlob'>;
  asset: VisualAsset;
  alt: string;
  className?: string;
  unavailableReason?: 'missing' | 'corrupt';
}) {
  const [url, setUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let nextUrl: string | undefined;
    if (unavailableReason) {
      return () => {
        active = false;
      };
    }
    setUrl(undefined);
    setFailed(false);
    void repository.getBlob(asset.blobKey).then((blob) => {
      if (!active) return;
      if (!blob) {
        setFailed(true);
        return;
      }
      nextUrl = URL.createObjectURL(blob);
      setUrl(nextUrl);
    }, () => active && setFailed(true));
    return () => {
      active = false;
      if (nextUrl) {
        const obsoleteUrl = nextUrl;
        window.setTimeout(() => URL.revokeObjectURL(obsoleteUrl), 30_000);
      }
    };
  }, [asset.blobKey, repository, unavailableReason]);

  if (unavailableReason) {
    const label = unavailableReason === 'corrupt' ? '图片损坏' : '图片缺失';
    return <span className={`visual-asset-image-missing ${className ?? ''}`} role="img" aria-label={`${alt}（${label}）`}>{label}</span>;
  }
  if (failed) {
    return <span className={`visual-asset-image-missing ${className ?? ''}`} role="img" aria-label={`${alt}（文件缺失）`}>图片缺失</span>;
  }
  if (!url) {
    return <span className={`visual-asset-image-loading ${className ?? ''}`} role="status">读取图片…</span>;
  }
  return (
    <img
      className={className}
      src={url}
      alt={alt}
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

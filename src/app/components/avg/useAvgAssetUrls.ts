import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AvgImageAssetRef } from '../../../domain/avgResourcePack';
import {
  AvgOverrideAssetUrlManager,
  isAvgOverrideImageAssetRef,
  type AvgOverrideImageAssetRef,
  type AvgVisualOverrideRepository
} from '../../../domain/avgVisualOverride';
import type { AvgPresentationSequence } from '../../../domain/avgPresentation';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';

export type AvgRenderableAsset =
  | {
      kind: 'pack';
      key: string;
      packId: string;
      asset: AvgImageAssetRef;
    }
  | {
      kind: 'override';
      key: string;
      asset: AvgOverrideImageAssetRef;
    };

function renderableAsset(
  packId: string | undefined,
  asset: AvgImageAssetRef | AvgOverrideImageAssetRef | undefined,
  fallbackPackId: string | undefined
): AvgRenderableAsset | undefined {
  if (!asset) return undefined;
  if (isAvgOverrideImageAssetRef(asset)) {
    return { kind: 'override', key: `override:${asset.assetId}`, asset };
  }
  const resolvedPackId = packId ?? fallbackPackId;
  if (!resolvedPackId) return undefined;
  return {
    kind: 'pack',
    key: `pack:${resolvedPackId}:${asset.assetId}`,
    packId: resolvedPackId,
    asset
  };
}

export function collectSequenceAssets(
  sequence: AvgPresentationSequence | undefined,
  resourceSession: ActiveAvgResourceSession | undefined
): AvgRenderableAsset[] {
  if (!sequence) return [];
  const assets = new Map<string, AvgRenderableAsset>();
  const fallbackPackId = resourceSession?.activePack.basePackId;
  for (const frame of sequence.frames) {
    const scene = renderableAsset(
      frame.scene?.sourcePackId,
      frame.scene?.asset,
      fallbackPackId
    );
    const portrait = renderableAsset(
      frame.portrait?.sourcePackId,
      frame.portrait?.asset,
      fallbackPackId
    );
    if (scene) assets.set(scene.key, scene);
    if (portrait) assets.set(portrait.key, portrait);
  }
  return [...assets.values()];
}

export function getFrameAssetKey(
  sourcePackId: string | undefined,
  asset: AvgImageAssetRef | AvgOverrideImageAssetRef | undefined,
  resourceSession: ActiveAvgResourceSession | undefined
): string | undefined {
  return renderableAsset(
    sourcePackId,
    asset,
    resourceSession?.activePack.basePackId
  )?.key;
}

export function useAvgAssetUrls(
  sequence: AvgPresentationSequence | undefined,
  resourceSession: ActiveAvgResourceSession | undefined,
  resourceRuntime: AvgPresentationResourceRuntime | undefined,
  overrideRepository?: AvgVisualOverrideRepository,
  overrideRevision = 0
) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [failedKeys, setFailedKeys] = useState<Set<string>>(new Set());
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const selectionToken = resourceSession?.selectionToken;
  const overrideUrlManager = useMemo(
    () => overrideRepository ? new AvgOverrideAssetUrlManager(overrideRepository) : undefined,
    [overrideRepository]
  );
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);
  const requestTokenRef = useRef('');
  const assets = useMemo(
    () => collectSequenceAssets(sequence, resourceSession),
    [resourceSession, sequence]
  );
  const requestToken = `${selectionToken ?? 'none'}:${overrideRevision}`;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => () => overrideUrlManager?.dispose(), [overrideUrlManager]);

  useEffect(() => {
    requestTokenRef.current = requestToken;
    inFlightKeysRef.current.clear();
    overrideUrlManager?.invalidate();
    setUrls(new Map());
    setFailedKeys(new Set());
    setPendingKeys(new Set());
  }, [overrideUrlManager, requestToken, resourceRuntime]);

  useEffect(() => {
    if (!assets.length) return;
    const token = requestToken;
    const missing = assets.filter(
      (asset) =>
        !urls.has(asset.key) &&
        !failedKeys.has(asset.key) &&
        !inFlightKeysRef.current.has(asset.key)
    );
    if (!missing.length) return;
    missing.forEach((asset) => inFlightKeysRef.current.add(asset.key));
    setPendingKeys((current) => {
      const next = new Set(current);
      missing.forEach((asset) => next.add(asset.key));
      return next;
    });
    void Promise.all(
      missing.map(async (item) => ({
        item,
        url: item.kind === 'override'
          ? await overrideUrlManager?.getAssetDisplayUrl(item.asset)
          : await resourceRuntime?.getAssetDisplayUrl(item.packId, item.asset)
      }))
    ).then(
      (results) => {
        if (!mountedRef.current || requestTokenRef.current !== token) return;
        setUrls((current) => {
          const next = new Map(current);
          for (const { item, url } of results) {
            if (url) next.set(item.key, url);
          }
          return next;
        });
        setFailedKeys((current) => {
          const next = new Set(current);
          for (const { item, url } of results) {
            if (!url) next.add(item.key);
          }
          return next;
        });
        setPendingKeys((current) => {
          const next = new Set(current);
          results.forEach(({ item }) => next.delete(item.key));
          return next;
        });
      },
      () => {
        if (!mountedRef.current || requestTokenRef.current !== token) return;
        setFailedKeys((current) => new Set([
          ...current,
          ...missing.map((asset) => asset.key)
        ]));
        setPendingKeys((current) => {
          const next = new Set(current);
          missing.forEach((asset) => next.delete(asset.key));
          return next;
        });
      }
    ).finally(() => {
      missing.forEach((asset) => inFlightKeysRef.current.delete(asset.key));
    });
  }, [assets, failedKeys, overrideUrlManager, requestToken, resourceRuntime, urls]);

  const markFailed = useCallback((key: string | undefined) => {
    if (!key) return;
    setFailedKeys((current) => new Set(current).add(key));
  }, []);

  return { urls, failedKeys, pendingKeys, assets, markFailed };
}

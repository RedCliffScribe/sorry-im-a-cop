import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Actor } from '../../../domain/runtime/types';
import { AvgImageGenerationControl, type AvgImageGenerationControlRuntime } from './AvgImageGenerationControl';
import {
  AvgOverrideAssetUrlManager,
  formatAvgOverrideByteLength,
  validateAvgOverrideImage,
  type AvgActorVisualOverrideKey,
  type AvgActorOutfitVisualOverrideLookup,
  type AvgActorOutfitVisualOverrideKey,
  type AvgOutfitSelection,
  type AvgActorVisualOverrideLookup,
  type AvgSceneVisualOverrideKey,
  type AvgSceneVisualOverrideLookup,
  type AvgValidatedOverrideImage,
  type AvgVisualOverrideRepository
} from '../../../domain/avgVisualOverride';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';

type OverrideLookup =
  | AvgActorVisualOverrideLookup
  | AvgActorOutfitVisualOverrideLookup
  | AvgSceneVisualOverrideLookup
  | undefined;

interface OverrideImageControlProps {
  kind: 'portrait' | 'scene';
  title: string;
  description: string;
  recommended: string;
  defaultSourceLabel?: string;
  repository: AvgVisualOverrideRepository;
  load: () => Promise<OverrideLookup>;
  replace: (image: AvgValidatedOverrideImage) => Promise<unknown>;
  remove: () => Promise<void>;
  revision?: number;
  onChanged: () => void;
  imageGeneration?: AvgImageGenerationControlRuntime;
}

function OverrideImageControl({
  kind,
  title,
  description,
  recommended,
  defaultSourceLabel = '默认资源',
  repository,
  load,
  replace,
  remove,
  revision = 0,
  onChanged,
  imageGeneration
}: OverrideImageControlProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const manager = useMemo(() => new AvgOverrideAssetUrlManager(repository), [repository]);
  const [lookup, setLookup] = useState<OverrideLookup>();
  const [currentUrl, setCurrentUrl] = useState<string>();
  const [candidate, setCandidate] = useState<AvgValidatedOverrideImage>();
  const [candidateUrl, setCandidateUrl] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => () => manager.dispose(), [manager]);

  useEffect(() => {
    let active = true;
    manager.invalidate();
    setCurrentUrl(undefined);
    void load().then(async (next) => {
      if (!active) return;
      setLookup(next);
      if (next?.status === 'ready' && next.asset) {
        const url = await manager.getAssetDisplayUrl({
          kind: 'save_override',
          assetId: next.asset.assetId,
          mediaType: next.asset.mediaType,
          width: next.asset.width,
          height: next.asset.height,
          byteLength: next.asset.byteLength,
          sha256: next.asset.sha256
        });
        if (active) setCurrentUrl(url);
      }
    }, (reason) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, [load, manager, revision]);

  useEffect(() => () => {
    if (candidateUrl) URL.revokeObjectURL(candidateUrl);
  }, [candidateUrl]);

  const clearCandidate = (resetInput = true) => {
    setCandidate(undefined);
    setCandidateUrl(undefined);
    if (resetInput && inputRef.current) inputRef.current.value = '';
  };

  const chooseFile = async (file: File | undefined) => {
    // Keep the input populated while the selected File is being decoded. In
    // Chromium, clearing a file input before an asynchronous read can detach
    // the chooser-backed File and make a valid upload appear to be zero bytes.
    clearCandidate(false);
    setError(undefined);
    if (!file) return;
    setBusy(true);
    try {
      const validated = await validateAvgOverrideImage(file);
      setCandidate(validated);
      setCandidateUrl(URL.createObjectURL(file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      if (inputRef.current) inputRef.current.value = '';
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!candidate) return;
    setBusy(true);
    setError(undefined);
    try {
      await replace(candidate);
      clearCandidate();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存自定义图片失败，原图片保持不变。');
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await remove();
      clearCandidate();
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '恢复默认失败。');
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel = lookup
    ? lookup.status === 'ready' ? '玩家替换' : '玩家替换（图片缺失）'
    : defaultSourceLabel;

  return (
    <section className={`avg-override-control avg-override-control--${kind}`}>
      <header>
        <div>
          <h4>{title}</h4>
          <p>{description}</p>
        </div>
        <span className="avg-override-source">当前来源：{sourceLabel}</span>
      </header>

      {currentUrl ? (
        <div className="avg-override-current-preview" data-kind={kind}>
          <img src={currentUrl} alt={`${title}当前玩家替换预览`} />
        </div>
      ) : lookup?.status === 'asset_missing' ? (
        <p className="avg-override-warning" role="status">
          自定义映射仍保留，但本地图片缺失；演出已安全回退到默认资源。
        </p>
      ) : null}

      <p className="avg-override-recommendation">{recommended}</p>
      <input
        ref={inputRef}
        id={inputId}
        className="avg-override-file-input"
        type="file"
        disabled={busy}
        accept=".png,.webp,.jpg,.jpeg,image/png,image/webp,image/jpeg"
        onChange={(event) => void chooseFile(event.currentTarget.files?.[0])}
      />
      <div className="avg-override-actions">
        <label className="avg-override-file-button" htmlFor={inputId} aria-disabled={busy}>
          选择本地图片
        </label>
        {lookup ? (
          <button type="button" disabled={busy} onClick={() => void restore()}>
            恢复默认
          </button>
        ) : null}
      </div>

      {candidate && candidateUrl ? (
        <section className="avg-override-candidate" aria-label="待确认图片预览">
          <div className="avg-override-candidate-preview" data-kind={kind}>
            <img src={candidateUrl} alt="待确认的本地图片" />
          </div>
          <dl>
            <div><dt>文件</dt><dd>{candidate.originalFileName ?? '本地图片'}</dd></div>
            <div><dt>尺寸</dt><dd>{candidate.width} × {candidate.height}</dd></div>
            <div><dt>大小</dt><dd>{formatAvgOverrideByteLength(candidate.byteLength)}</dd></div>
          </dl>
          <div className="avg-override-actions">
            <button type="button" disabled={busy} onClick={() => void confirm()}>
              {busy ? '正在保存…' : '使用此图'}
            </button>
            <button type="button" disabled={busy} onClick={() => clearCandidate()}>取消</button>
          </div>
        </section>
      ) : null}
      {imageGeneration ? (
        <AvgImageGenerationControl
          runtime={imageGeneration}
          onUse={async (image) => {
            await replace(image);
            onChanged();
          }}
        />
      ) : null}
      {busy && !candidate ? <p role="status">正在校验图片…</p> : null}
      {error ? <p className="avg-override-error" role="alert">{error}</p> : null}
    </section>
  );
}

export function AvgPortraitOverrideControl({
  actor,
  visualPartitionId,
  worldpackId,
  repository,
  revision,
  onChanged,
  imageGeneration,
  resourceSession,
  resourceRuntime
}: {
  actor: Actor;
  visualPartitionId: string;
  worldpackId: string;
  repository: AvgVisualOverrideRepository;
  revision?: number;
  onChanged: () => void;
  imageGeneration?: Extract<AvgImageGenerationControlRuntime, { kind: 'portrait' }>;
  resourceSession?: ActiveAvgResourceSession;
  resourceRuntime?: AvgPresentationResourceRuntime;
}) {
  const key = useMemo<AvgActorVisualOverrideKey>(() => ({
    visualPartitionId,
    worldpackId,
    actorId: actor.actorId
  }), [actor.actorId, visualPartitionId, worldpackId]);
  const [loadedSession, setLoadedSession] = useState<ActiveAvgResourceSession>();
  const [outfits, setOutfits] = useState<Awaited<ReturnType<AvgVisualOverrideRepository['listUserOutfits']>>>([]);
  const [selection, setSelection] = useState<AvgOutfitSelection>({ type: 'resource_default' });
  const [outfitName, setOutfitName] = useState('');
  const [outfitDescription, setOutfitDescription] = useState('');
  const [outfitBusy, setOutfitBusy] = useState(false);
  const [outfitError, setOutfitError] = useState<string>();
  const outfitMutationVersion = useRef(0);
  const activeSession = resourceSession ?? loadedSession;
  const basePackId = activeSession?.activePack.basePackId ?? '__no_active_avg_pack__';
  const fixedEntry = actor.stableIdentityRef && activeSession
    ? activeSession.resolver.resolveFixedCharacter(actor.stableIdentityRef)
    : undefined;
  const resourceOutfits = fixedEntry ? Object.values(fixedEntry.outfits) : [];
  const defaultResourceOutfitId = fixedEntry?.defaultOutfitId ?? 'default';

  useEffect(() => {
    if (resourceSession) {
      setLoadedSession(undefined);
      return;
    }
    let active = true;
    void resourceRuntime?.loadActivePack(worldpackId).then((session) => {
      if (active) setLoadedSession(session);
    }, () => {
      if (active) setLoadedSession(undefined);
    });
    return () => { active = false; };
  }, [resourceRuntime, resourceSession, worldpackId]);

  useEffect(() => {
    let active = true;
    const loadVersion = outfitMutationVersion.current;
    setOutfitError(undefined);
    void Promise.all([
      repository.listUserOutfits(key),
      repository.getActorOutfitSelection(key, basePackId)
    ]).then(([definitions, lookup]) => {
      if (!active || loadVersion !== outfitMutationVersion.current) return;
      setOutfits(definitions);
      setSelection(lookup.selection);
      if (lookup.status === 'user_outfit_missing') {
        setOutfitError('此前选择的自定义服装已缺失，演出已安全回退到资源包默认服装。');
      }
    }, (reason) => {
      if (active) setOutfitError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, [basePackId, key, repository, revision]);

  const selectionValue = selection.type === 'resource_default'
    ? 'resource_default'
    : `${selection.type === 'user_outfit' ? 'user' : 'resource'}:${selection.outfitId}`;
  const selectedUserOutfit = selection.type === 'user_outfit'
    ? outfits.find((outfit) => outfit.outfitId === selection.outfitId)
    : undefined;
  const selectedResourceOutfit = selection.type === 'resource_outfit'
    ? resourceOutfits.find((outfit) => outfit.outfitId === selection.outfitId)
    : resourceOutfits.find((outfit) => outfit.outfitId === defaultResourceOutfitId);
  const selectedOutfitTarget = selection.type === 'user_outfit'
    ? { type: 'user_outfit' as const, outfitId: selection.outfitId }
    : activeSession
      ? {
          type: 'resource_outfit' as const,
          basePackId: activeSession.activePack.basePackId,
          outfitId: selection.type === 'resource_outfit'
            ? selection.outfitId
            : defaultResourceOutfitId
        }
      : undefined;
  const outfitOverrideKey = selectedOutfitTarget
    ? ({ ...key, outfit: selectedOutfitTarget } satisfies AvgActorOutfitVisualOverrideKey)
    : undefined;
  const selectedOutfitLabel = selectedUserOutfit?.displayName ??
    selectedResourceOutfit?.outfitId ??
    (selection.type === 'resource_outfit' ? `${selection.outfitId}（资源包中已缺失）` : '默认服装');
  const outfitGeneration = imageGeneration && selectedOutfitTarget ? {
    ...imageGeneration,
    context: {
      ...imageGeneration.context,
      targetKey: `actor:${actor.actorId}:outfit:${selectedOutfitTarget.outfitId}`,
      generationPurpose: 'outfit' as const,
      outfitId: selectedOutfitTarget.outfitId,
      outfitDisplayName: selectedOutfitLabel,
      outfitDescription: selectedUserOutfit?.visualDescription ?? selectedOutfitLabel
    }
  } : undefined;

  const updateSelection = async (value: string) => {
    setOutfitBusy(true);
    setOutfitError(undefined);
    try {
      const next: AvgOutfitSelection = value === 'resource_default'
        ? { type: 'resource_default' }
        : value.startsWith('user:')
          ? { type: 'user_outfit', outfitId: value.slice('user:'.length) }
          : {
              type: 'resource_outfit',
              basePackId,
              outfitId: value.slice('resource:'.length)
            };
      const lookup = await repository.setActorOutfitSelection(key, next, basePackId);
      outfitMutationVersion.current += 1;
      setSelection(lookup.selection);
      onChanged();
    } catch (reason) {
      setOutfitError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOutfitBusy(false);
    }
  };

  const createOutfit = async () => {
    setOutfitBusy(true);
    setOutfitError(undefined);
    try {
      const definition = await repository.createUserOutfit(key, {
        displayName: outfitName,
        visualDescription: outfitDescription
      });
      outfitMutationVersion.current += 1;
      setOutfits((current) => [...current, definition]);
      setOutfitName('');
      setOutfitDescription('');
    } catch (reason) {
      setOutfitError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOutfitBusy(false);
    }
  };

  const saveSelectedUserOutfit = async () => {
    if (!selectedUserOutfit) return;
    setOutfitBusy(true);
    setOutfitError(undefined);
    try {
      const updated = await repository.updateUserOutfit(key, selectedUserOutfit.outfitId, {
        displayName: outfitName || selectedUserOutfit.displayName,
        visualDescription: outfitDescription || selectedUserOutfit.visualDescription
      });
      outfitMutationVersion.current += 1;
      setOutfits((current) => current.map((item) =>
        item.outfitId === updated.outfitId ? updated : item
      ));
      setOutfitName('');
      setOutfitDescription('');
    } catch (reason) {
      setOutfitError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOutfitBusy(false);
    }
  };

  const deleteSelectedUserOutfit = async () => {
    if (!selectedUserOutfit) return;
    if (!window.confirm(`删除自定义服装“${selectedUserOutfit.displayName}”？`)) return;
    setOutfitBusy(true);
    setOutfitError(undefined);
    try {
      await repository.removeUserOutfit(key, selectedUserOutfit.outfitId, basePackId);
      outfitMutationVersion.current += 1;
      setOutfits((current) => current.filter((item) => item.outfitId !== selectedUserOutfit.outfitId));
      setSelection({ type: 'resource_default' });
      onChanged();
    } catch (reason) {
      setOutfitError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setOutfitBusy(false);
    }
  };

  return (
    <section className="avg-outfit-system" aria-label={`AVG 服装 · ${actor.name}`}>
      <section className="avg-outfit-selector">
        <header>
          <div>
            <h4>AVG 服装 · {actor.name}</h4>
            <p>手动选择当前服装；剧情、情绪和旁白不会自动改衣。</p>
          </div>
        </header>
        <label>
          当前服装
          <select
            value={selectionValue}
            disabled={outfitBusy}
            onChange={(event) => void updateSelection(event.target.value)}
          >
            <option value="resource_default">资源包默认服装</option>
            {resourceOutfits
              .filter((outfit) => outfit.outfitId !== defaultResourceOutfitId)
              .map((outfit) => (
                <option key={`resource:${outfit.outfitId}`} value={`resource:${outfit.outfitId}`}>
                  资源包 · {outfit.outfitId}
                </option>
              ))}
            {selection.type === 'resource_outfit' && !selectedResourceOutfit ? (
              <option value={`resource:${selection.outfitId}`}>
                资源包 · {selection.outfitId}（已缺失）
              </option>
            ) : null}
            {outfits.map((outfit) => (
              <option key={`user:${outfit.outfitId}`} value={`user:${outfit.outfitId}`}>
                自定义 · {outfit.displayName}
              </option>
            ))}
          </select>
        </label>
        {selection.type === 'user_outfit' ? (
          <p className="avg-outfit-fallback-note">
            自定义服装若尚未设置专属图片，会按“全局人物替换 → 资源包默认立绘 → 通用立绘”安全回退；不会自动换脸或改写人物身份。
          </p>
        ) : null}

        <details className="avg-outfit-editor">
          <summary>新建或编辑自定义服装</summary>
          <label>
            名称
            <input
              value={outfitName}
              maxLength={80}
              placeholder={selectedUserOutfit?.displayName ?? '例如：深色便装'}
              onChange={(event) => setOutfitName(event.target.value)}
            />
          </label>
          <label>
            视觉说明
            <textarea
              value={outfitDescription}
              maxLength={1200}
              rows={3}
              placeholder={selectedUserOutfit?.visualDescription ?? '只描述服装、材质与剪裁，不写剧情情绪。'}
              onChange={(event) => setOutfitDescription(event.target.value)}
            />
          </label>
          <div className="avg-override-actions">
            <button type="button" disabled={outfitBusy || !outfitName.trim()} onClick={() => void createOutfit()}>
              新建服装
            </button>
            {selectedUserOutfit ? (
              <>
                <button type="button" disabled={outfitBusy} onClick={() => void saveSelectedUserOutfit()}>
                  保存当前服装资料
                </button>
                <button type="button" disabled={outfitBusy} onClick={() => void deleteSelectedUserOutfit()}>
                  删除此自定义服装
                </button>
              </>
            ) : null}
          </div>
        </details>
        {outfitError ? <p className="avg-override-error" role="alert">{outfitError}</p> : null}
      </section>

      {outfitOverrideKey ? (
        <OverrideImageControl
          kind="portrait"
          title={`当前服装专属立绘 · ${selectedOutfitLabel}`}
          description="只覆盖当前这套服装的全部情绪；切换到其他服装后不会沿用。"
          recommended="建议使用透明背景 PNG / WebP 全身人物图。AI 换装为文字约束，采用前请核对脸、发型与身材。"
          defaultSourceLabel={selection.type === 'user_outfit' ? '尚未设置专属图片' : '资源包服装差分'}
          repository={repository}
          load={() => repository.getActorOutfitOverride(outfitOverrideKey)}
          replace={(image) => repository.replaceActorOutfitOverride(outfitOverrideKey, image)}
          remove={() => repository.removeActorOutfitOverride(outfitOverrideKey)}
          revision={revision}
          onChanged={onChanged}
          imageGeneration={outfitGeneration}
        />
      ) : null}

      <OverrideImageControl
        kind="portrait"
        title={`全局人物立绘替换 · ${actor.name}`}
        description="这一张玩家图片覆盖该角色所有服装与剧情表情；服装专属图片仍具有更高优先级。"
        recommended="建议使用透明背景 PNG / WebP 全身人物图。切换 AVG 资源包不会取消本替换。"
        defaultSourceLabel="未设置全局替换"
        repository={repository}
        load={() => repository.getActorOverride(key)}
        replace={(image) => repository.replaceActorOverride(key, image)}
        remove={() => repository.removeActorOverride(key)}
        revision={revision}
        onChanged={onChanged}
        imageGeneration={imageGeneration}
      />
    </section>
  );
}

export function AvgSceneOverrideControl({
  keyValue,
  locationLabel,
  repository,
  revision,
  onChanged,
  imageGeneration
}: {
  keyValue?: AvgSceneVisualOverrideKey;
  locationLabel: string;
  repository: AvgVisualOverrideRepository;
  revision?: number;
  onChanged: () => void;
  imageGeneration?: Extract<AvgImageGenerationControlRuntime, { kind: 'scene' }>;
}) {
  if (!keyValue) {
    return (
      <section className="avg-override-control avg-override-control--scene">
        <h4>当前场景背景</h4>
        <p className="avg-override-warning">
          当前地点缺少稳定的场景或地点标识，暂不能永久替换背景。
        </p>
      </section>
    );
  }
  return (
    <OverrideImageControl
      kind="scene"
      title="当前场景背景"
      description={`地点：${locationLabel}`}
      recommended="建议使用 16:9 或接近 16:9 的横向背景图；时间、天气及室内外环境表现仍由游戏决定。"
      defaultSourceLabel="资源包场景或无资源"
      repository={repository}
      load={() => repository.getSceneOverride(keyValue)}
      replace={(image) => repository.replaceSceneOverride(keyValue, image)}
      remove={() => repository.removeSceneOverride(keyValue)}
      revision={revision}
      onChanged={onChanged}
      imageGeneration={imageGeneration}
    />
  );
}

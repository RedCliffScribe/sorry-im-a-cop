import { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_VERSION } from '../releaseIdentity';
import {
  IndexedDbImageGenerationPresetRepository,
  type ImageGenerationPreset,
  type ImageGenerationPresetRepository
} from '../../domain/imageGeneration/generationPresets';
import {
  IndexedDbImagePromptTemplateRepository,
  type ImagePromptTemplateRepository,
  type ImagePromptTemplateSettings
} from '../../domain/imageGeneration/promptConversion';
import {
  IndexedDbImageProfileRepository,
  type ComfyWorkflowTemplate,
  type ImageApiProfile,
  type ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import {
  IndexedDbWorkshopImportSourceRepository,
  createImageGenerationWorkshopPackage,
  importImageGenerationWorkshopPackage,
  loadImageGenerationWorkshopPackage,
  previewImageGenerationWorkshopImport,
  type LoadedWorkshopPackage,
  type DownloadedWorkshopPackage,
  type WorkshopImportConflictStrategy,
  type WorkshopImportSourceRepository,
  type WorkshopPackageExportResult,
  type WorkshopVariantImportMapping
} from '../../domain/workshop';

interface WorkshopPresetTransferPanelProps {
  profileRepository?: ImageProfileRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  promptTemplateRepository?: ImagePromptTemplateRepository;
  importSourceRepository?: WorkshopImportSourceRepository;
  appVersion?: string;
  downloadFile?: (fileName: string, contents: string) => void;
  initialRemotePackage?: DownloadedWorkshopPackage;
}

interface CatalogState {
  profiles: ImageApiProfile[];
  workflows: ComfyWorkflowTemplate[];
  presets: ImageGenerationPreset[];
  promptSettings: ImagePromptTemplateSettings;
}

interface MappingDraft {
  profileId: string;
  targetId: string;
}

function defaultDownload(fileName: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function safeFileStem(value: string): string {
  return value.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80)
    || 'image-generation-preset';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function profileModels(profile: ImageApiProfile | undefined): Array<{ modelId: string; displayName?: string }> {
  return profile && 'models' in profile ? profile.models : [];
}

function mappingFromDraft(
  loaded: LoadedWorkshopPackage,
  drafts: Record<string, MappingDraft>
): WorkshopVariantImportMapping[] {
  return loaded.workshopPackage.content.variants.map((variant) => {
    const draft = drafts[variant.variantRef] ?? { profileId: '', targetId: '' };
    return {
      variantRef: variant.variantRef,
      profileId: draft.profileId,
      routingTarget: variant.providerType === 'comfyui-workflow'
        ? { kind: 'comfy-workflow' as const, workflowTemplateId: draft.targetId }
        : { kind: 'model' as const, modelId: draft.targetId }
    };
  });
}

export function WorkshopPresetTransferPanel({
  profileRepository,
  generationPresetRepository,
  promptTemplateRepository,
  importSourceRepository,
  appVersion = APP_VERSION,
  downloadFile = defaultDownload,
  initialRemotePackage
}: WorkshopPresetTransferPanelProps = {}) {
  const profilesRepository = useMemo(
    () => profileRepository ?? new IndexedDbImageProfileRepository(),
    [profileRepository]
  );
  const presetsRepository = useMemo(
    () => generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository(),
    [generationPresetRepository]
  );
  const promptRepository = useMemo(
    () => promptTemplateRepository ?? new IndexedDbImagePromptTemplateRepository(),
    [promptTemplateRepository]
  );
  const sourcesRepository = useMemo(
    () => importSourceRepository ?? new IndexedDbWorkshopImportSourceRepository(),
    [importSourceRepository]
  );
  const [catalog, setCatalog] = useState<CatalogState>();
  const [catalogError, setCatalogError] = useState('');
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [contentRating, setContentRating] = useState<'general' | 'mature'>('general');
  const [language, setLanguage] = useState('zh-CN');
  const [tags, setTags] = useState('');
  const [exportResult, setExportResult] = useState<WorkshopPackageExportResult>();
  const [exportStatus, setExportStatus] = useState('');
  const [loadedPackage, setLoadedPackage] = useState<LoadedWorkshopPackage>();
  const [sourceMetadata, setSourceMetadata] = useState<DownloadedWorkshopPackage['sourceMetadata']>();
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, MappingDraft>>({});
  const [conflictStrategy, setConflictStrategy] = useState<WorkshopImportConflictStrategy>('fail-on-conflict');
  const [importStatus, setImportStatus] = useState('');

  const refreshCatalog = useCallback(async (): Promise<void> => {
    const [profiles, workflows, promptSettings] = await Promise.all([
      profilesRepository.listProfiles(),
      profilesRepository.listWorkflowTemplates(),
      promptRepository.load()
    ]);
    const presetGroups = await Promise.all(profiles.map((profile) => presetsRepository.list(profile.profileId)));
    setCatalog({ profiles, workflows, promptSettings, presets: presetGroups.flat() });
  }, [presetsRepository, profilesRepository, promptRepository]);

  useEffect(() => {
    let active = true;
    void refreshCatalog().catch((error) => {
      if (active) setCatalogError(errorMessage(error));
    });
    return () => {
      active = false;
    };
  }, [refreshCatalog]);

  useEffect(() => {
    if (!initialRemotePackage) return;
    setLoadedPackage(initialRemotePackage.loadedPackage);
    setSourceMetadata(initialRemotePackage.sourceMetadata);
    setMappingDrafts(Object.fromEntries(
      initialRemotePackage.loadedPackage.workshopPackage.content.variants.map((variant) => [
        variant.variantRef,
        { profileId: '', targetId: '' }
      ])
    ));
    setImportStatus(`已下载并校验：${initialRemotePackage.loadedPackage.workshopPackage.manifest.title}`);
  }, [initialRemotePackage]);

  const mappings = useMemo(
    () => loadedPackage ? mappingFromDraft(loadedPackage, mappingDrafts) : [],
    [loadedPackage, mappingDrafts]
  );
  const importPreview = useMemo(() => {
    if (!loadedPackage || !catalog) return undefined;
    return previewImageGenerationWorkshopImport({
      workshopPackage: loadedPackage.workshopPackage,
      environment: {
        profiles: catalog.profiles,
        workflows: catalog.workflows,
        promptTemplateSettings: catalog.promptSettings
      },
      appVersion,
      mappings
    });
  }, [appVersion, catalog, loadedPackage, mappings]);

  const createAndDownload = async (): Promise<void> => {
    if (!catalog) return;
    setExportStatus('正在建立本地分享包……');
    try {
      const selected = catalog.presets.filter((preset) => selectedPresetIds.includes(preset.presetId));
      const result = await createImageGenerationWorkshopPackage({
        presets: selected,
        promptTemplateSettings: catalog.promptSettings,
        manifest: {
          title,
          summary,
          contentRating,
          language,
          tags: tags.split(/[，,\n]/).map((value) => value.trim()).filter(Boolean),
          minAppVersion: appVersion
        }
      });
      setExportResult(result);
      downloadFile(`${safeFileStem(title)}.sicv2-image-preset.json`, result.json);
      setExportStatus(`已导出 ${result.byteLength} bytes；SHA-256：${result.packageSha256}`);
    } catch (error) {
      setExportResult(undefined);
      setExportStatus(`导出失败：${errorMessage(error)}`);
    }
  };

  const loadFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setImportStatus('正在本地校验分享包……');
    try {
      const loaded = await loadImageGenerationWorkshopPackage(await file.text());
      setLoadedPackage(loaded);
      setSourceMetadata(undefined);
      setMappingDrafts(Object.fromEntries(loaded.workshopPackage.content.variants.map((variant) => [
        variant.variantRef,
        { profileId: '', targetId: '' }
      ])));
      setImportStatus(`分享包已校验：${loaded.workshopPackage.manifest.title}`);
    } catch (error) {
      setLoadedPackage(undefined);
      setMappingDrafts({});
      setImportStatus(`导入文件无效：${errorMessage(error)}`);
    }
  };

  const applyImport = async (): Promise<void> => {
    if (!loadedPackage || !catalog || importPreview?.status !== 'compatible') return;
    setImportStatus('正在写入本地预设库……');
    try {
      const result = await importImageGenerationWorkshopPackage({
        loadedPackage,
        environment: {
          profiles: catalog.profiles,
          workflows: catalog.workflows,
          promptTemplateSettings: catalog.promptSettings
        },
        appVersion,
        mappings,
        conflictStrategy,
        sourceMetadata,
        repositories: {
          generationPresets: presetsRepository,
          promptTemplates: promptRepository,
          importSources: sourcesRepository
        }
      });
      await refreshCatalog();
      setImportStatus([
        `已导入 ${result.presets.length} 个生成预设。`,
        '导入风格已加入资料库但未自动启用。',
        ...result.warnings
      ].join(' '));
    } catch (error) {
      setImportStatus(`导入失败：${errorMessage(error)}`);
    }
  };

  if (!catalog) {
    return (
      <div className="settings-panel workshop-transfer-panel">
        <div className="settings-topline">
          <div>
            <h2>文生图预设分享包</h2>
            <p>{catalogError || '正在读取本地文生图资料……'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-panel workshop-transfer-panel">
      <div className="settings-topline">
        <div>
          <h2>文生图预设分享包</h2>
          <p>目前只处理本地 JSON 文件。不会上传云端，也不会导出 API 地址、凭据、工作流 JSON、种子或本机模型文件。</p>
        </div>
      </div>

      <section className="settings-section" aria-label="导出文生图预设分享包">
        <h3>导出本地分享包</h3>
        {catalog.presets.length ? (
          <div className="workshop-preset-list">
            {catalog.presets.map((preset) => (
              <label key={preset.presetId} className="settings-checkbox-line workshop-preset-row">
                <input
                  type="checkbox"
                  checked={selectedPresetIds.includes(preset.presetId)}
                  onChange={(event) => setSelectedPresetIds((current) => event.target.checked
                    ? [...current, preset.presetId]
                    : current.filter((presetId) => presetId !== preset.presetId))}
                />
                <span>
                  <strong>{preset.name}</strong>
                  <small>{preset.providerType} · {preset.variantKey}</small>
                </span>
              </label>
            ))}
          </div>
        ) : <p>当前尚未保存可导出的文生图生成预设。</p>}
        <div className="workshop-manifest-grid">
          <label>
            分享包标题
            <input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            内容分级
            <select value={contentRating} onChange={(event) => setContentRating(event.target.value as 'general' | 'mature')}>
              <option value="general">通用</option>
              <option value="mature">成熟内容</option>
            </select>
          </label>
          <label className="workshop-wide-field">
            摘要
            <textarea value={summary} maxLength={2000} onChange={(event) => setSummary(event.target.value)} />
          </label>
          <label>
            语言
            <input value={language} maxLength={32} onChange={(event) => setLanguage(event.target.value)} />
          </label>
          <label>
            标签（逗号分隔）
            <input value={tags} maxLength={300} onChange={(event) => setTags(event.target.value)} />
          </label>
        </div>
        <div className="settings-action-row">
          <button type="button" onClick={() => void createAndDownload()}>生成并下载分享包</button>
        </div>
        {exportStatus ? <p role="status" className="settings-feedback">{exportStatus}</p> : null}
        {exportResult ? (
          <details>
            <summary>查看明确排除的本地字段</summary>
            <ul>{exportResult.excludedLocalFields.map((field) => <li key={field}>{field}</li>)}</ul>
          </details>
        ) : null}
      </section>

      <section className="settings-section" aria-label="导入文生图预设分享包">
        <h3>导入本地分享包</h3>
        <p>先校验文件，再逐个把包内变体映射到你的本地 API 档案和模型／工作流；默认不覆盖已有槽位。</p>
        <label>
          选择分享包 JSON
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void loadFile(event.target.files?.[0])}
          />
        </label>
        {loadedPackage ? (
          <div className="workshop-import-preview">
            <div>
              <strong>{loadedPackage.workshopPackage.manifest.title}</strong>
              <small>{loadedPackage.workshopPackage.manifest.summary}</small>
            </div>
            {loadedPackage.workshopPackage.content.variants.map((variant) => {
              const draft = mappingDrafts[variant.variantRef] ?? { profileId: '', targetId: '' };
              const matchingProfiles = catalog.profiles.filter(
                (profile) => profile.providerType === variant.providerType
              );
              const selectedProfile = catalog.profiles.find((profile) => profile.profileId === draft.profileId);
              const targets = variant.providerType === 'comfyui-workflow'
                ? catalog.workflows.map((workflow) => ({ id: workflow.workflowTemplateId, name: workflow.name }))
                : profileModels(selectedProfile).map((model) => ({
                  id: model.modelId,
                  name: model.displayName ? `${model.displayName} (${model.modelId})` : model.modelId
                }));
              return (
                <fieldset key={variant.variantRef} className="workshop-variant-mapping">
                  <legend>{variant.name} · {variant.purpose}</legend>
                  <label>
                    本地 API 档案
                    <select
                      aria-label={`${variant.name} 本地 API 档案`}
                      value={draft.profileId}
                      onChange={(event) => setMappingDrafts((current) => ({
                        ...current,
                        [variant.variantRef]: { profileId: event.target.value, targetId: '' }
                      }))}
                    >
                      <option value="">请选择</option>
                      {matchingProfiles.map((profile) => (
                        <option key={profile.profileId} value={profile.profileId}>{profile.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {variant.providerType === 'comfyui-workflow' ? '本地 API 工作流' : '本地模型'}
                    <select
                      aria-label={`${variant.name} 本地执行目标`}
                      value={draft.targetId}
                      disabled={!draft.profileId}
                      onChange={(event) => setMappingDrafts((current) => ({
                        ...current,
                        [variant.variantRef]: { ...draft, targetId: event.target.value }
                      }))}
                    >
                      <option value="">请选择</option>
                      {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                    </select>
                  </label>
                </fieldset>
              );
            })}
            <label>
              已有槽位冲突策略
              <select
                value={conflictStrategy}
                onChange={(event) => setConflictStrategy(event.target.value as WorkshopImportConflictStrategy)}
              >
                <option value="fail-on-conflict">发现占用即停止（推荐）</option>
                <option value="update-same-source">只更新完全同源的导入</option>
                <option value="replace-target">明确替换目标槽位</option>
              </select>
            </label>
            {importPreview ? (
              <div className={`workshop-compatibility workshop-compatibility--${importPreview.status}`}>
                <strong>{importPreview.summary}</strong>
                <ul>{importPreview.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </div>
            ) : null}
            <div className="settings-action-row">
              <button
                type="button"
                disabled={importPreview?.status !== 'compatible'}
                onClick={() => void applyImport()}
              >
                确认导入本地资料库
              </button>
            </div>
          </div>
        ) : null}
        {importStatus ? <p role="status" className="settings-feedback">{importStatus}</p> : null}
      </section>
    </div>
  );
}

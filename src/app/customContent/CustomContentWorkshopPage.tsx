import { useEffect, useMemo, useRef, useState } from 'react';
import { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import {
  createCustomContentGenerationClient,
  generateCustomCharacterDraft,
  reviewCustomCharacterDraftConsistency
} from '../../domain/customContent/characterCreation';
import {
  generateCustomEventProjectDraft,
  reviewCustomEventProjectDraftConsistency
} from '../../domain/customContent/eventProjectCreation';
import {
  saveCustomEventProjectRevision,
  setCustomEventGroupAvailability
} from '../../domain/customContent/eventProjectManagement';
import {
  abandonCustomEventBindingInState,
  approveCustomContentAdaptationInState,
  bindCustomCharacterToSave,
  bindCustomEventGroupToSave,
  setCustomContentBindingPausedInState,
  setCustomContentPriorityInState,
  updateCustomContentSave
} from '../../domain/customContent/saveBinding';
import {
  promoteCustomCharacterToGlobal,
  saveCustomCharacterWorkingDraft,
  saveCustomCharacterRevision,
  setCustomCharacterAvailability,
  setManyCustomCharacterAvailability
} from '../../domain/customContent/characterManagement';
import {
  isModelNotFoundGenerationError
} from '../../domain/customContent/customCharacterModelCatalog';
import {
  createCustomCharacterPackage,
  importCustomCharacterPackage,
  serializeCustomCharacterPackage
} from '../../domain/customContent/characterTransfer';
import { createCustomContentRevisionRef } from '../../domain/customContent/assetFoundation';
import {
  createCustomContentAuthorBackup,
  createCustomContentSharePackage,
  createCustomEventGroupJsonPackage,
  importCustomContentPackage,
  inspectCustomContentPackageImport,
  parseCustomContentPackageZip,
  parseCustomEventGroupJsonPackage,
  serializeCustomEventGroupJsonPackage
} from '../../domain/customContent/contentPackage';
import { importCustomSourceFile } from '../../domain/customContent/sourceImport';
import {
  cancelCustomSourceProcessingTask,
  createCustomSourceChunkTask,
  pauseCustomSourceProcessingTask,
  resumeCustomSourceProcessingTask,
  retryCustomSourceProcessingTask,
  runCustomSourceProcessingTask
} from '../../domain/customContent/sourceProcessingTasks';
import {
  cancelCustomLocalExtractionTask,
  createCustomLocalExtractionTask,
  loadCustomLocalExtractionTask,
  pauseCustomLocalExtractionTask,
  reauthorizeCustomLocalExtractionTask,
  resumeCustomLocalExtractionTask,
  retryCustomLocalExtractionTask,
  runCustomLocalExtractionTask
} from '../../domain/customContent/sourceExtractionTasks';
import {
  cancelCustomSourceAggregationTask,
  createCustomSourceAggregationTask,
  loadCustomSourceAggregationTask,
  pauseCustomSourceAggregationTask,
  reauthorizeCustomSourceAggregationTask,
  resumeCustomSourceAggregationTask,
  retryCustomSourceAggregationTask,
  runCustomSourceAggregationTask
} from '../../domain/customContent/sourceAggregationTasks';
import {
  cancelCustomSourceProjectBuildTask,
  createCustomSourceProjectBuildTask,
  loadCustomSourceProjectBuildTask,
  pauseCustomSourceProjectBuildTask,
  reauthorizeCustomSourceProjectBuildTask,
  resumeCustomSourceProjectBuildTask,
  retryCustomSourceProjectBuildTask,
  runCustomSourceProjectBuildTask
} from '../../domain/customContent/sourceProjectBuildTasks';
import { resolveCustomContentWorldDeployment } from '../../domain/customContent/worldAdaptation';
import { resolveAppLocale } from '../../domain/localization/appLocale';
import { IndexedDbSaveRepository } from '../../domain/persistence/IndexedDbSaveRepository';
import type { RuntimeSaveRecord } from '../../domain/persistence/SaveRepository';
import { createDefaultAiSettings } from '../../domain/settings/defaultSettings';
import { LocalStorageSettingsRepository } from '../../domain/settings/LocalStorageSettingsRepository';
import type { AiSettings } from '../../domain/settings/types';
import { fetchAvailableModels } from '../../domain/settings/modelCatalog';
import { useLocalizedUi } from '../localization/useLocalizedUi';
import { CustomContentWorkshopScreen } from './CustomContentWorkshopScreen';
import {
  loadCustomContentWorkshopLibrary,
  type CustomContentWorkshopEntry,
  type CustomContentWorkshopLibrary
} from './workshopLibrary';
import {
  loadLongTextSourceLibrary,
  type LongTextSourceLibraryEntry
} from './longTextSourceLibrary';
import type { CurrentSaveContentEntry } from './currentSaveLibrary';
import '../../styles/customContentWorkshop.css';

const emptyLibrary: CustomContentWorkshopLibrary = {
  characters: [],
  events: [],
  projects: [],
  projectCount: 0
};

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CustomContentWorkshopPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const extractionAbortControllers = useRef(
    new Map<string, AbortController>()
  );
  const aggregationAbortControllers = useRef(
    new Map<string, AbortController>()
  );
  const projectBuildAbortControllers = useRef(
    new Map<string, AbortController>()
  );
  const settingsRepository = useMemo(
    () => new LocalStorageSettingsRepository(),
    []
  );
  const contentRepository = useMemo(
    () => new IndexedDbCustomContentRepository(),
    []
  );
  const saveRepository = useMemo(() => new IndexedDbSaveRepository(), []);
  const requestedSaveId = useMemo(
    () => new URLSearchParams(window.location.search).get('saveId')?.trim(),
    []
  );
  const [settings, setSettings] = useState<AiSettings>(
    createDefaultAiSettings
  );
  const [library, setLibrary] =
    useState<CustomContentWorkshopLibrary>(emptyLibrary);
  const [sourceLibrary, setSourceLibrary] = useState<
    LongTextSourceLibraryEntry[]
  >([]);
  const [currentSave, setCurrentSave] = useState<RuntimeSaveRecord>();
  const [currentSaveError, setCurrentSaveError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>();
  const locale = resolveAppLocale(settings.game.language);
  useLocalizedUi(rootRef, locale);

  async function reloadLibrary() {
    setLibrary(await loadCustomContentWorkshopLibrary(contentRepository));
  }

  async function reloadSourceLibrary() {
    setSourceLibrary(await loadLongTextSourceLibrary(contentRepository));
  }

  async function refreshCharacterModels(profileId: string): Promise<string[]> {
    const profile = settings.apiProfiles.find((item) => item.id === profileId);
    if (!profile) throw new Error('找不到需要刷新的 API Profile。');
    const models = await fetchAvailableModels({
      interfaceType: profile.interfaceType,
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey
    });
    const updatedAt = new Date().toISOString();
    const nextSettings: AiSettings = {
      ...settings,
      apiProfiles: settings.apiProfiles.map((item) =>
        item.id === profileId ? { ...item, models, updatedAt } : item
      )
    };
    await settingsRepository.save(nextSettings);
    setSettings(nextSettings);
    return models;
  }

  async function findSaveReferences(
    assetKind: 'character' | 'event_group',
    assetId: string
  ): Promise<{
    revisions: number[];
    saveNames: string[];
  }> {
    const summaries = await saveRepository.list();
    const matches: Array<{ revision: number; saveName: string }> = [];
    for (const summary of summaries) {
      const save = await saveRepository.load(summary.saveId);
      if (!save) continue;
      const bindings =
        assetKind === 'character'
          ? save.runtimeState.customContent?.characterBindings ?? []
          : save.runtimeState.customContent?.eventGroupBindings ?? [];
      for (const binding of bindings) {
        if (binding.assetId === assetId) {
          matches.push({
            revision: binding.revision,
            saveName: save.saveName
          });
        }
      }
    }
    return {
      revisions: Array.from(new Set(matches.map((match) => match.revision))),
      saveNames: Array.from(new Set(matches.map((match) => match.saveName)))
    };
  }

  async function findActiveContentReferences(
    entry: CustomContentWorkshopEntry
  ): Promise<string[]> {
    const labels: string[] = [];
    for (const dependency of entry.incomingReferences) {
      if (dependency.owner.assetKind === 'content_project') {
        const asset = await contentRepository.getProjectAsset(
          dependency.owner.assetId
        );
        if (asset?.latestRevision === dependency.owner.revision) {
          const revision = await contentRepository.getProjectRevision(
            asset.projectId,
            asset.latestRevision
          );
          labels.push(revision?.title ?? asset.projectId);
        }
      } else if (dependency.owner.assetKind === 'event_group') {
        const asset = await contentRepository.getEventGroupAsset(
          dependency.owner.assetId
        );
        if (asset?.latestRevision === dependency.owner.revision) {
          const revision = await contentRepository.getEventGroupRevision(
            asset.eventGroupId,
            asset.latestRevision
          );
          labels.push(revision?.title ?? asset.eventGroupId);
        }
      } else {
        const asset = await contentRepository.getCharacterAsset(
          dependency.owner.assetId
        );
        if (asset?.latestRevision === dependency.owner.revision) {
          const revision = await contentRepository.getCharacterRevision(
            asset.characterAssetId,
            asset.latestRevision
          );
          labels.push(revision?.displayName ?? asset.characterAssetId);
        }
      }
    }
    return Array.from(new Set(labels));
  }

  async function runSourceTask(taskId: string) {
    const result = await runCustomSourceProcessingTask(
      contentRepository,
      taskId
    );
    if (
      result.task.taskKind === 'parse_source' &&
      result.task.status === 'completed'
    ) {
      await createCustomSourceChunkTask(contentRepository, result.task.taskId);
    }
    await reloadSourceLibrary();
    if (result.task.status === 'failed') {
      throw new Error(result.task.lastError ?? '来源处理任务失败。');
    }
  }

  async function runSourceExtractionTask(taskId: string) {
    const snapshot = await loadCustomLocalExtractionTask(
      contentRepository,
      taskId
    );
    if (!snapshot) throw new Error('找不到 AI 局部提取任务。');
    const controller = new AbortController();
    extractionAbortControllers.current.get(taskId)?.abort();
    extractionAbortControllers.current.set(taskId, controller);
    const client = createCustomContentGenerationClient({
      settings,
      profileId: snapshot.task.apiProfileId!,
      model: snapshot.task.model!
    });
    try {
      const result = await runCustomLocalExtractionTask(
        contentRepository,
        taskId,
        client,
        {
          signal: controller.signal,
          onCheckpoint: reloadSourceLibrary
        }
      );
      await reloadSourceLibrary();
      if (result.task.status === 'failed') {
        throw new Error(result.task.lastError ?? 'AI 局部提取任务失败。');
      }
    } finally {
      if (extractionAbortControllers.current.get(taskId) === controller) {
        extractionAbortControllers.current.delete(taskId);
      }
    }
  }

  async function runSourceAggregation(taskId: string) {
    const snapshot = await loadCustomSourceAggregationTask(
      contentRepository,
      taskId
    );
    if (!snapshot) throw new Error('找不到来源聚合任务。');
    const controller = new AbortController();
    aggregationAbortControllers.current.get(taskId)?.abort();
    aggregationAbortControllers.current.set(taskId, controller);
    const client = createCustomContentGenerationClient({
      settings,
      profileId: snapshot.task.apiProfileId!,
      model: snapshot.task.model!
    });
    try {
      const result = await runCustomSourceAggregationTask(
        contentRepository,
        taskId,
        client,
        {
          signal: controller.signal,
          onCheckpoint: reloadSourceLibrary
        }
      );
      await reloadSourceLibrary();
      if (result.task.status === 'failed') {
        throw new Error(result.task.lastError ?? '来源聚合任务失败。');
      }
    } finally {
      if (aggregationAbortControllers.current.get(taskId) === controller) {
        aggregationAbortControllers.current.delete(taskId);
      }
    }
  }

  async function runSourceProjectBuild(taskId: string) {
    const snapshot = await loadCustomSourceProjectBuildTask(
      contentRepository,
      taskId
    );
    if (!snapshot) throw new Error('找不到长篇项目草稿任务。');
    const controller = new AbortController();
    projectBuildAbortControllers.current.get(taskId)?.abort();
    projectBuildAbortControllers.current.set(taskId, controller);
    const client = createCustomContentGenerationClient({
      settings,
      profileId: snapshot.task.apiProfileId!,
      model: snapshot.task.model!
    });
    try {
      const result = await runCustomSourceProjectBuildTask(
        contentRepository,
        taskId,
        client,
        {
          signal: controller.signal,
          onCheckpoint: reloadSourceLibrary
        }
      );
      await reloadSourceLibrary();
      if (result.task.status === 'failed') {
        throw new Error(result.task.lastError ?? '长篇项目草稿任务失败。');
      }
    } finally {
      if (projectBuildAbortControllers.current.get(taskId) === controller) {
        projectBuildAbortControllers.current.delete(taskId);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      settingsRepository.load(),
      loadCustomContentWorkshopLibrary(contentRepository),
      loadLongTextSourceLibrary(contentRepository),
      requestedSaveId
        ? saveRepository.load(requestedSaveId)
        : Promise.resolve(null)
    ])
      .then(
        ([loadedSettings, loadedLibrary, loadedSourceLibrary, loadedSave]) => {
          if (cancelled) return;
          setSettings(loadedSettings);
          setLibrary(loadedLibrary);
          setSourceLibrary(loadedSourceLibrary);
          if (requestedSaveId && !loadedSave) {
            setCurrentSaveError(
              '链接中的存档已经不存在，请返回游戏重新打开工坊。'
            );
          } else {
            setCurrentSave(loadedSave ?? undefined);
          }
          setIsLoading(false);
        }
      )
      .catch(() => {
        if (cancelled) return;
        setError('无法读取本地自定义内容库，请刷新页面后重试。');
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    contentRepository,
    requestedSaveId,
    saveRepository,
    settingsRepository
  ]);

  useEffect(
    () => () => {
      extractionAbortControllers.current.forEach((controller) =>
        controller.abort()
      );
      extractionAbortControllers.current.clear();
      aggregationAbortControllers.current.forEach((controller) =>
        controller.abort()
      );
      aggregationAbortControllers.current.clear();
      projectBuildAbortControllers.current.forEach((controller) =>
        controller.abort()
      );
      projectBuildAbortControllers.current.clear();
    },
    []
  );

  return (
    <div
      ref={rootRef}
      className="ccw-root app-font-root"
      data-ui-theme={settings.display.uiTheme}
      data-app-locale={locale}
      lang={locale}
    >
      <CustomContentWorkshopScreen
        settings={settings}
        library={library}
        sourceLibrary={sourceLibrary}
        currentSave={currentSave}
        currentSaveError={currentSaveError}
        isLoading={isLoading}
        error={error}
        onBack={() => window.location.assign('/')}
        onImportSource={async (file) => {
          const result = await importCustomSourceFile({
            repository: contentRepository,
            file
          });
          await reloadSourceLibrary();
          return result;
        }}
        onRunSourceTask={runSourceTask}
        onBuildSourceStructure={async (parseTaskId) => {
          const chunkTask = await createCustomSourceChunkTask(
            contentRepository,
            parseTaskId
          );
          await runSourceTask(chunkTask.task.taskId);
        }}
        onPauseSourceTask={async (taskId) => {
          await pauseCustomSourceProcessingTask(contentRepository, taskId);
          await reloadSourceLibrary();
        }}
        onResumeSourceTask={async (taskId) => {
          await resumeCustomSourceProcessingTask(contentRepository, taskId);
          await runSourceTask(taskId);
        }}
        onCancelSourceTask={async (taskId) => {
          await cancelCustomSourceProcessingTask(contentRepository, taskId);
          await reloadSourceLibrary();
        }}
        onRetrySourceTask={async (taskId) => {
          await retryCustomSourceProcessingTask(contentRepository, taskId);
          await runSourceTask(taskId);
        }}
        onCreateSourceExtractionTask={async (options) => {
          await createCustomLocalExtractionTask(contentRepository, options);
          await reloadSourceLibrary();
        }}
        onRunSourceExtractionTask={runSourceExtractionTask}
        onPauseSourceExtractionTask={async (taskId) => {
          await pauseCustomLocalExtractionTask(contentRepository, taskId);
          extractionAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onResumeSourceExtractionTask={async (taskId) => {
          await resumeCustomLocalExtractionTask(contentRepository, taskId);
          await runSourceExtractionTask(taskId);
        }}
        onCancelSourceExtractionTask={async (taskId) => {
          await cancelCustomLocalExtractionTask(contentRepository, taskId);
          extractionAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onRetrySourceExtractionTask={async (taskId) => {
          await retryCustomLocalExtractionTask(contentRepository, taskId);
          await runSourceExtractionTask(taskId);
        }}
        onReauthorizeSourceExtractionTask={async (taskId, options) => {
          await reauthorizeCustomLocalExtractionTask(
            contentRepository,
            taskId,
            options
          );
          await reloadSourceLibrary();
        }}
        onCreateSourceAggregationTask={async (options) => {
          await createCustomSourceAggregationTask(contentRepository, options);
          await reloadSourceLibrary();
        }}
        onRunSourceAggregationTask={runSourceAggregation}
        onPauseSourceAggregationTask={async (taskId) => {
          await pauseCustomSourceAggregationTask(contentRepository, taskId);
          aggregationAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onResumeSourceAggregationTask={async (taskId) => {
          await resumeCustomSourceAggregationTask(contentRepository, taskId);
          await runSourceAggregation(taskId);
        }}
        onCancelSourceAggregationTask={async (taskId) => {
          await cancelCustomSourceAggregationTask(contentRepository, taskId);
          aggregationAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onRetrySourceAggregationTask={async (taskId) => {
          await retryCustomSourceAggregationTask(contentRepository, taskId);
          await runSourceAggregation(taskId);
        }}
        onReauthorizeSourceAggregationTask={async (taskId, options) => {
          await reauthorizeCustomSourceAggregationTask(
            contentRepository,
            taskId,
            options
          );
          await reloadSourceLibrary();
        }}
        onCreateSourceProjectBuildTask={async (options) => {
          await createCustomSourceProjectBuildTask(
            contentRepository,
            options
          );
          await reloadSourceLibrary();
        }}
        onRunSourceProjectBuildTask={runSourceProjectBuild}
        onPauseSourceProjectBuildTask={async (taskId) => {
          await pauseCustomSourceProjectBuildTask(
            contentRepository,
            taskId
          );
          projectBuildAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onResumeSourceProjectBuildTask={async (taskId) => {
          await resumeCustomSourceProjectBuildTask(
            contentRepository,
            taskId
          );
          await runSourceProjectBuild(taskId);
        }}
        onCancelSourceProjectBuildTask={async (taskId) => {
          await cancelCustomSourceProjectBuildTask(
            contentRepository,
            taskId
          );
          projectBuildAbortControllers.current.get(taskId)?.abort();
          await reloadSourceLibrary();
        }}
        onRetrySourceProjectBuildTask={async (taskId) => {
          await retryCustomSourceProjectBuildTask(
            contentRepository,
            taskId
          );
          await runSourceProjectBuild(taskId);
        }}
        onReauthorizeSourceProjectBuildTask={async (taskId, options) => {
          await reauthorizeCustomSourceProjectBuildTask(
            contentRepository,
            taskId,
            options
          );
          await reloadSourceLibrary();
        }}
        onRefreshCharacterModels={refreshCharacterModels}
        onGenerateCharacter={async ({
          profileId,
          model,
          description,
          onProgress
        }) => {
          const client = createCustomContentGenerationClient({
            settings,
            profileId,
            model
          });
          const profile = settings.apiProfiles.find(
            (item) => item.id === profileId
          );
          try {
            return await generateCustomCharacterDraft({
              client,
              description,
              profileId,
              profileName: profile?.name,
              model,
              onProgress
            });
          } catch (error) {
            if (isModelNotFoundGenerationError(error)) {
              try {
                await refreshCharacterModels(profileId);
              } catch (refreshError) {
                throw new Error(
                  '当前模型已失效，自动刷新模型列表也未成功；请手动刷新后重新选择。',
                  { cause: refreshError }
                );
              }
              throw new Error(
                '当前模型已从供应商列表失效；模型列表已刷新，请重新选择后重试。',
                { cause: error }
              );
            }
            throw error;
          }
        }}
        onReviewCharacter={async ({ profileId, model, draft }) => {
          const client = createCustomContentGenerationClient({
            settings,
            profileId,
            model
          });
          return reviewCustomCharacterDraftConsistency({ client, draft });
        }}
        onSaveCharacter={async (request) => {
          if (request.mode === 'needs_review') {
            await saveCustomCharacterWorkingDraft({
              repository: contentRepository,
              input: {
                workingDraftId: request.existingWorkingDraftId,
                sourceCharacterAssetId:
                  request.existingAsset?.characterAssetId,
                description: request.description,
                draft: request.draft,
                deployments: request.deployments,
                global: request.global,
                projectIds: request.projectIds,
                generationIssues: request.generationIssues,
                generationRecovery: request.generationRecovery,
                generationDiagnostics: request.generationDiagnostics
              }
            });
          } else {
            await saveCustomCharacterRevision({
              repository: contentRepository,
              input: {
                draft: request.draft,
                deployments: request.deployments,
                global: request.global,
                projectIds: request.projectIds,
                mode: 'publish',
                existingAsset: request.existingAsset
              }
            });
            if (request.existingWorkingDraftId) {
              await contentRepository.deleteCharacterWorkingDraft(
                request.existingWorkingDraftId
              );
            }
          }
          await reloadLibrary();
        }}
        onSetCharacterAvailability={async (entry, status) => {
          if (!entry.characterAsset) {
            throw new Error('找不到人物资产目录。');
          }
          await setCustomCharacterAvailability({
            repository: contentRepository,
            asset: entry.characterAsset,
            availabilityStatus: status
          });
          await reloadLibrary();
        }}
        onDeleteCharacter={async (entry) => {
          if (entry.characterWorkingDraft) {
            await contentRepository.deleteCharacterWorkingDraft(entry.id);
            await reloadLibrary();
            return;
          }
          if (!entry.characterAsset) {
            throw new Error('找不到人物资产目录。');
          }
          const activeReferences = await findActiveContentReferences(entry);
          if (activeReferences.length > 0) {
            throw new Error(
              `无法删除人物“${entry.title}”：仍被当前内容引用（${activeReferences.join('、')}）。请先在对应项目或事件中解除引用。`
            );
          }
          const references = await findSaveReferences('character', entry.id);
          if (references.saveNames.length > 0) {
            throw new Error(
              `无法删除人物“${entry.title}”：仍被 ${references.saveNames.length} 个存档引用（${references.saveNames.join('、')}）。请保留该人物或改为停用。`
            );
          }
          await contentRepository.deleteCharacterAsset(
            entry.id,
            references.revisions
          );
          await reloadLibrary();
        }}
        onSetManyCharacterAvailability={async (entries, status) => {
          const assets = entries.flatMap((entry) =>
            entry.characterAsset ? [entry.characterAsset] : []
          );
          if (assets.length !== entries.length) {
            throw new Error('批量操作中存在缺失的人物资产。');
          }
          await setManyCustomCharacterAvailability({
            repository: contentRepository,
            assets,
            availabilityStatus: status
          });
          await reloadLibrary();
        }}
        onPromoteCharacter={async (entry) => {
          if (!entry.characterAsset) {
            throw new Error('找不到人物资产目录。');
          }
          await promoteCustomCharacterToGlobal({
            repository: contentRepository,
            asset: entry.characterAsset
          });
          await reloadLibrary();
        }}
        onExportCharacter={async (entry: CustomContentWorkshopEntry) => {
          if (!entry.characterAsset || !entry.characterRevision) {
            throw new Error('找不到可导出的人物 revision。');
          }
          const packageValue = await createCustomCharacterPackage({
            asset: entry.characterAsset,
            revision: entry.characterRevision
          });
          const blob = new Blob(
            [serializeCustomCharacterPackage(packageValue)],
            { type: 'application/json;charset=utf-8' }
          );
          downloadBlob(blob, `${entry.id}.cop-character.json`);
        }}
        onImportCharacter={async (input) => {
          const result = await importCustomCharacterPackage({
            repository: contentRepository,
            input
          });
          await reloadLibrary();
          return result;
        }}
        onImportContentPackage={async (file) => {
          const packageValue = file.name.toLocaleLowerCase().endsWith('.json')
            ? parseCustomEventGroupJsonPackage(await file.text())
            : await parseCustomContentPackageZip(
                new Uint8Array(await file.arrayBuffer())
              );
          const inspection = await inspectCustomContentPackageImport({
            repository: contentRepository,
            packageValue
          });
          const conflictStrategy = inspection.requiresRemap
            ? window.confirm(
                '检测到资产或作者数据 ID 的不同谱系。继续会将整个内容包复制为新 ID，并统一重映射全部内部引用；取消则不会写入任何数据。是否继续？'
              )
              ? 'remap'
              : 'cancel'
            : 'cancel';
          if (inspection.requiresRemap && conflictStrategy === 'cancel') {
            throw new Error('已取消导入；本地内容未发生变化。');
          }
          const result = await importCustomContentPackage({
            repository: contentRepository,
            packageValue,
            conflictStrategy
          });
          await reloadLibrary();
          return {
            ...result,
            packageKind: packageValue.manifest.packageKind
          };
        }}
        onExportEventGroup={async (entry) => {
          if (!entry.eventGroupRevision) {
            throw new Error('找不到可导出的事件组 revision。');
          }
          const packageValue = await createCustomEventGroupJsonPackage({
            repository: contentRepository,
            rootRevisionRef: createCustomContentRevisionRef(
              entry.eventGroupRevision
            )
          });
          downloadBlob(
            new Blob(
              [serializeCustomEventGroupJsonPackage(packageValue)],
              { type: 'application/json;charset=utf-8' }
            ),
            `${entry.id}.cop-event-group.json`
          );
        }}
        onExportProjectShare={async (entry) => {
          if (!entry.projectRevision) {
            throw new Error('找不到事件所属项目 revision。');
          }
          const bytes = await createCustomContentSharePackage({
            repository: contentRepository,
            rootRevisionRef: createCustomContentRevisionRef(
              entry.projectRevision
            )
          });
          downloadBlob(
            new Blob([Uint8Array.from(bytes).buffer], {
              type: 'application/zip'
            }),
            `${entry.projectRevision.projectId}.cop-content.zip`
          );
        }}
        onExportAuthorBackup={async (entry) => {
          if (!entry.projectRevision) {
            throw new Error('找不到事件所属项目 revision。');
          }
          if (
            !window.confirm(
              '作者备份会包含原始全文、章节/分块材料、AI 中间结果、任务进度与失败信息，可能涉及版权、隐私或敏感内容。仅供你本人备份。确认继续导出吗？'
            )
          ) {
            throw new Error('已取消作者备份。');
          }
          const bytes = await createCustomContentAuthorBackup({
            repository: contentRepository,
            projectRevisionRef: createCustomContentRevisionRef(
              entry.projectRevision
            ),
            includeSourceText: true
          });
          downloadBlob(
            new Blob([Uint8Array.from(bytes).buffer], {
              type: 'application/zip'
            }),
            `${entry.projectRevision.projectId}.author-backup.cop-content.zip`
          );
        }}
        onGenerateEventProject={async ({
          profileId,
          model,
          description
        }) => {
          const client = createCustomContentGenerationClient({
            settings,
            profileId,
            model
          });
          return generateCustomEventProjectDraft({ client, description });
        }}
        onReviewEventProject={async ({ profileId, model, draft }) => {
          const client = createCustomContentGenerationClient({
            settings,
            profileId,
            model
          });
          return reviewCustomEventProjectDraftConsistency({ client, draft });
        }}
        onSaveEventProject={async (request) => {
          await saveCustomEventProjectRevision({
            repository: contentRepository,
            input: request
          });
          await reloadLibrary();
        }}
        onSetEventAvailability={async (entry, status) => {
          if (!entry.eventGroupAsset) {
            throw new Error('找不到事件组资产目录。');
          }
          await setCustomEventGroupAvailability({
            repository: contentRepository,
            asset: entry.eventGroupAsset,
            availabilityStatus: status
          });
          await reloadLibrary();
        }}
        onDeleteEvent={async (entry) => {
          if (!entry.eventGroupAsset) {
            throw new Error('找不到事件组资产目录。');
          }
          const references = await findSaveReferences('event_group', entry.id);
          if (references.saveNames.length > 0) {
            throw new Error(
              `无法删除事件“${entry.title}”：仍被 ${references.saveNames.length} 个存档引用（${references.saveNames.join('、')}）。请保留该事件或改为停用。`
            );
          }
          await contentRepository.deleteEventGroupAsset(
            entry.id,
            references.revisions
          );
          await reloadLibrary();
        }}
        onBindCharacterToSave={async ({ entry, profileId, model }) => {
          if (!requestedSaveId || !currentSave) {
            throw new Error('请从已加载的游戏内打开工坊。');
          }
          const deployment = resolveCustomContentWorldDeployment(
            entry.deployments,
            currentSave.worldpackId
          );
          const client =
            deployment.mode === 'ai_adapted'
              ? createCustomContentGenerationClient({
                  settings,
                  profileId,
                  model
                })
              : undefined;
          const prioritized =
            (currentSave.runtimeState.customContent?.priorityItems.filter(
              (item) => item.status === 'active'
            ).length ?? 0) < 3;
          const updated = await bindCustomCharacterToSave({
            contentRepository,
            saveRepository,
            saveId: requestedSaveId,
            characterAssetId: entry.id,
            revision: entry.revision,
            prioritized,
            client
          });
          setCurrentSave(updated);
        }}
        onBindEventToSave={async ({ entry, profileId, model }) => {
          if (!requestedSaveId || !currentSave) {
            throw new Error('请从已加载的游戏内打开工坊。');
          }
          const deployment = resolveCustomContentWorldDeployment(
            entry.deployments,
            currentSave.worldpackId
          );
          const client =
            deployment.mode === 'ai_adapted'
              ? createCustomContentGenerationClient({
                  settings,
                  profileId,
                  model
                })
              : undefined;
          const prioritized =
            (currentSave.runtimeState.customContent?.priorityItems.filter(
              (item) => item.status === 'active'
            ).length ?? 0) < 3;
          const updated = await bindCustomEventGroupToSave({
            contentRepository,
            saveRepository,
            saveId: requestedSaveId,
            eventGroupId: entry.id,
            eventGroupRevision: entry.revision,
            projectRevision: entry.projectRevision?.revision,
            prioritized,
            client
          });
          setCurrentSave(updated);
        }}
        onApproveSaveAdaptation={async (
          entry: CurrentSaveContentEntry
        ) => {
          if (!requestedSaveId) throw new Error('当前没有存档上下文。');
          const updated = await updateCustomContentSave({
            saveRepository,
            saveId: requestedSaveId,
            updater: (state, now) =>
              approveCustomContentAdaptationInState({
                state,
                kind:
                  entry.kind === 'characters' ? 'character' : 'event_group',
                assetId: entry.assetId,
                now
              })
          });
          setCurrentSave(updated);
        }}
        onSetSavePriority={async (entry, prioritized) => {
          if (!requestedSaveId) throw new Error('当前没有存档上下文。');
          const updated = await updateCustomContentSave({
            saveRepository,
            saveId: requestedSaveId,
            updater: (state, now) =>
              setCustomContentPriorityInState({
                state,
                kind:
                  entry.kind === 'characters' ? 'character' : 'event_group',
                assetId: entry.assetId,
                prioritized,
                now
              })
          });
          setCurrentSave(updated);
        }}
        onSetSavePaused={async (entry, paused) => {
          if (!requestedSaveId) throw new Error('当前没有存档上下文。');
          const updated = await updateCustomContentSave({
            saveRepository,
            saveId: requestedSaveId,
            updater: (state, now) =>
              setCustomContentBindingPausedInState({
                state,
                kind:
                  entry.kind === 'characters' ? 'character' : 'event_group',
                assetId: entry.assetId,
                paused,
                now
              })
          });
          setCurrentSave(updated);
        }}
        onAbandonSaveEvent={async (entry) => {
          if (!requestedSaveId || entry.kind !== 'events') {
            throw new Error('当前没有可放弃的事件绑定。');
          }
          const updated = await updateCustomContentSave({
            saveRepository,
            saveId: requestedSaveId,
            updater: (state, now) =>
              abandonCustomEventBindingInState({
                state,
                eventGroupId: entry.assetId,
                now
              })
          });
          setCurrentSave(updated);
        }}
      />
    </div>
  );
}

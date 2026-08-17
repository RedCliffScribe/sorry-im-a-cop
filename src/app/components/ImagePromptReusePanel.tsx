import { useEffect, useMemo, useState } from 'react';
import {
  confirmManualCharacterBatch,
  createBuiltInCharacterDraftExecutionConfig,
  createCharacterPromptReuseDraft,
  executeConfirmedCharacterBatch,
  type CharacterImageExecutor,
  type ManualCharacterBatchDraft
} from '../../domain/imageGeneration/characterVisualWorkflow';
import { CharacterImageRuntimeExecutor } from '../../domain/imageGeneration/characterImageRuntimeExecutor';
import {
  confirmManualScenePlan,
  createBuiltInSceneDraftExecutionConfig,
  createSceneShotRegenerationDraft,
  executeConfirmedScenePlan,
  type ManualScenePlanDraft
} from '../../domain/imageGeneration/sceneVisualWorkflow';
import {
  getImageProviderLabel,
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  listManualImageRoutingOptions,
  resolveManualImageRouting,
  type ComfyWorkflowTemplate,
  type ImageApiProfile,
  type ImageCredentialRepository,
  type ImageProfileRepository
} from '../../domain/imageGeneration/profile';
import { IndexedDbImageProbeStore } from '../../domain/imageGeneration/probe';
import {
  IndexedDbImageGenerationPresetRepository,
  type ImageGenerationPresetRepository
} from '../../domain/imageGeneration/generationPresets';
import type {
  ImageGenerationTask,
  VisualAsset,
  VisualRepository,
  VisualRepositorySnapshot
} from '../../domain/imageGeneration/visualRepository';
import type { Actor } from '../../domain/runtime/types';

type ReuseDraft =
  | { kind: 'character'; draft: ManualCharacterBatchDraft }
  | { kind: 'scene'; draft: ManualScenePlanDraft };

interface ImagePromptReusePanelProps {
  sourceAsset: VisualAsset;
  sourceTask: ImageGenerationTask;
  snapshot: VisualRepositorySnapshot;
  repository: VisualRepository;
  actors?: Record<string, Actor>;
  profileRepository?: ImageProfileRepository;
  credentialRepository?: ImageCredentialRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  createImageExecutor?: () => CharacterImageExecutor;
  onComplete: (imageId: string | undefined, message: string) => void;
  onCancel: () => void;
  onOpenSettings: () => void;
}

function routingTargetLabel(task: ImageGenerationTask): string {
  const target = task.draft?.executionTarget;
  if (!target) return '尚未生成预览';
  return target.kind === 'model'
    ? `模型：${target.modelId}`
    : `工作流：${target.workflowTemplateId}（修订 ${target.workflowRevision}）`;
}

function referenceIds(task: ImageGenerationTask): string[] {
  return task.intent.referenceImageIds;
}

function anchorSourceIds(task: ImageGenerationTask): string[] {
  return task.intent.type === 'character-image'
    ? task.intent.anchorSourceImageIds ?? []
    : [];
}

function sourceValidationMessage(
  asset: VisualAsset,
  task: ImageGenerationTask,
  actors?: Record<string, Actor>
): string | undefined {
  if (!task.submittedRequest || asset.sourceTaskId !== task.taskId || task.saveId !== asset.saveId) {
    return '图片与原任务的可追溯关系不完整，不能安全复用。你仍可复制提示词后手动创建新任务。';
  }
  if (task.intent.type === 'character-image') {
    if (asset.originSubject?.type !== 'actor' || asset.originSubject.actorId !== task.intent.actorId) {
      return '图片主体与原人物任务不一致，不能安全复用。';
    }
    if (actors && !actors[task.intent.actorId]) return '原角色已不在当前人物资料中，不能创建幽灵图片绑定。';
    return undefined;
  }
  if (asset.originSubject?.type !== 'scene-shot' || asset.originSubject.shotId !== task.intent.shotId) {
    return '图片镜头与原场景任务不一致，不能安全复用。';
  }
  return undefined;
}

export function ImagePromptReusePanel({
  sourceAsset,
  sourceTask,
  snapshot,
  repository,
  actors,
  profileRepository,
  credentialRepository,
  generationPresetRepository,
  createImageExecutor,
  onComplete,
  onCancel,
  onOpenSettings
}: ImagePromptReusePanelProps) {
  const profiles = useMemo(
    () => profileRepository ?? new IndexedDbImageProfileRepository(),
    [profileRepository]
  );
  const credentials = useMemo(
    () => credentialRepository ?? new IndexedDbImageCredentialRepository(),
    [credentialRepository]
  );
  const presets = useMemo(
    () => generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository(),
    [generationPresetRepository]
  );
  const verificationStore = useMemo(() => new IndexedDbImageProbeStore(), []);
  const executor = useMemo(
    () => createImageExecutor?.() ?? new CharacterImageRuntimeExecutor({
      profiles,
      credentials,
      verificationStore,
      visualRepository: repository,
      pageUrl: () => window.location.href
    }),
    [createImageExecutor, credentials, profiles, repository, verificationStore]
  );
  const [availableProfiles, setAvailableProfiles] = useState<ImageApiProfile[]>([]);
  const [availableWorkflows, setAvailableWorkflows] = useState<ComfyWorkflowTemplate[]>([]);
  const [profileId, setProfileId] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [draft, setDraft] = useState<ReuseDraft>();
  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [notice, setNotice] = useState('正在读取当前可用图片档案…');
  const [busy, setBusy] = useState(false);
  const validationMessage = sourceValidationMessage(sourceAsset, sourceTask, actors);
  const selectedProfile = availableProfiles.find((profile) => profile.profileId === profileId);
  const previewTask = draft?.draft.tasks[0];

  useEffect(() => {
    let active = true;
    void listManualImageRoutingOptions(profiles).then(({ profiles: enabledProfiles, workflows }) => {
      if (!active) return;
      setAvailableProfiles(enabledProfiles);
      setAvailableWorkflows(workflows);
      const originalProfile = enabledProfiles.find(
        (profile) => profile.profileId === sourceTask.submittedRequest?.imageProfileId
      );
      setProfileId(originalProfile?.profileId ?? '');
      if (originalProfile?.providerType === 'comfyui-workflow') {
        const originalTarget = sourceTask.submittedRequest?.executionTarget;
        const originalWorkflowId = originalTarget?.kind === 'comfy-workflow'
          ? originalTarget.workflowTemplateId
          : '';
        setWorkflowId(workflows.some((workflow) => workflow.workflowTemplateId === originalWorkflowId)
          ? originalWorkflowId
          : '');
      } else {
        setWorkflowId('');
      }
      setNotice(enabledProfiles.length
        ? originalProfile
          ? '已匹配原图片档案；请核对当前路由并生成请求预览。'
          : '原图片档案已停用或不存在。请明确选择当前有效档案，不会静默沿用旧配置。'
        : '当前没有已启用的图片档案，请先前往文生图设置。');
    }, () => {
      if (active) setNotice('读取图片档案失败；尚未创建任何任务。');
    });
    return () => { active = false; };
  }, [
    profiles,
    sourceTask.submittedRequest?.executionTarget,
    sourceTask.submittedRequest?.imageProfileId
  ]);

  function clearPreview() {
    setDraft(undefined);
    setPositivePrompt('');
    setNegativePrompt('');
  }

  async function createPreview() {
    if (validationMessage || busy) return;
    setBusy(true);
    setNotice('正在用当前档案重建执行参数；不会调用图片供应商，也不会保存任务。');
    try {
      const routing = await resolveManualImageRouting({
        profileRepository: profiles,
        credentialRepository: credentials,
        profileId,
        workflowTemplateId: workflowId || undefined
      });
      if (sourceTask.intent.type === 'character-image') {
        const preset = await presets.get(routing.profile.profileId, sourceTask.intent.purpose);
        const execution = await createBuiltInCharacterDraftExecutionConfig({
          profile: routing.profile,
          purpose: sourceTask.intent.purpose,
          credential: routing.credential,
          workflow: routing.workflow,
          preset
        });
        const next = await createCharacterPromptReuseDraft({ sourceTask, execution });
        setDraft({ kind: 'character', draft: next });
        setPositivePrompt(next.tasks[0]?.draft?.positivePrompt ?? '');
        setNegativePrompt(next.tasks[0]?.draft?.negativePrompt ?? '');
      } else {
        const sourcePlan = snapshot.scenePlans[sourceTask.intent.scenePlanId];
        if (!sourcePlan) throw new Error('原场景计划已经缺失，不能安全复用镜头意图。');
        const preset = await presets.get(routing.profile.profileId, 'narrative-scene');
        const execution = await createBuiltInSceneDraftExecutionConfig({
          profile: routing.profile,
          credential: routing.credential,
          workflow: routing.workflow,
          preset
        });
        const isActive = snapshot.storySceneDisplayStates[sourcePlan.sourceTurnId]
          ?.activeShotIds.includes(sourceTask.intent.shotId) ?? false;
        const next = await createSceneShotRegenerationDraft({
          repository,
          sourcePlan,
          sourceShotId: sourceTask.intent.shotId,
          sourceTask,
          execution,
          taskSource: 'reuse-prompt',
          displayOperation: isActive ? 'replace-shot' : 'append',
          persistDraft: false
        });
        setDraft({ kind: 'scene', draft: next });
        setPositivePrompt(next.tasks[0]?.draft?.positivePrompt ?? '');
        setNegativePrompt(next.tasks[0]?.draft?.negativePrompt ?? '');
      }
      setNotice('预览只存在于当前界面。确认前可修改最终提示词；取消不会留下任务或资产。');
    } catch (error) {
      clearPreview();
      setNotice(error instanceof Error ? error.message : '无法创建复用预览。');
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndGenerate() {
    if (!draft || !previewTask || busy) return;
    setBusy(true);
    setNotice('已确认，正在保存新任务并调用所选图片供应商…');
    try {
      let taskId: string;
      if (draft.kind === 'character') {
        const purpose = draft.draft.tasks[0]!.intent.type === 'character-image'
          ? draft.draft.tasks[0]!.intent.purpose
          : sourceTask.intent.type === 'character-image' ? sourceTask.intent.purpose : 'half-body-medium';
        const confirmed = await confirmManualCharacterBatch({
          repository,
          draft: draft.draft,
          edits: [{ purpose, positivePrompt, negativePrompt }]
        });
        taskId = confirmed.tasks[0]!.taskId;
        await executeConfirmedCharacterBatch({ repository, confirmed, executor });
      } else {
        const shotId = draft.draft.tasks[0]!.intent.type === 'scene-image'
          ? draft.draft.tasks[0]!.intent.shotId
          : '';
        const confirmed = await confirmManualScenePlan({
          repository,
          draft: draft.draft,
          edits: [{ shotId, positivePrompt, negativePrompt }],
          persistPlanOnConfirmation: true
        });
        taskId = confirmed.tasks[0]!.taskId;
        await executeConfirmedScenePlan({ repository, confirmed, executor });
      }
      const next = await repository.loadSnapshot(sourceTask.saveId);
      const completed = next.tasks[taskId];
      if (completed?.status === 'succeeded') {
        onComplete(completed.primaryImageId, '新图片已生成并设为当前图片；原图片仍保留在图册中。');
      } else {
        onComplete(undefined, `新任务未成功：${completed?.error?.message ?? completed?.status ?? '状态未知'}。原图片与绑定保持不变。`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '复用任务执行失败；原图片与绑定保持不变。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="image-prompt-reuse-panel" aria-label="沿用提示词再次生成">
      <div className="image-prompt-reuse-heading">
        <div><strong>沿用提示词再次生成</strong><span>来源任务：{sourceTask.taskId}</span></div>
        <button type="button" disabled={busy} onClick={onCancel}>取消复用</button>
      </div>
      {validationMessage ? <p className="image-gallery-error" role="alert">{validationMessage}</p> : null}
      <div className="image-prompt-reuse-routing">
        <label>本次图片档案
          <select value={profileId} disabled={busy || Boolean(validationMessage)} onChange={(event) => {
            setProfileId(event.target.value);
            setWorkflowId('');
            clearPreview();
          }}>
            <option value="">请明确选择</option>
            {availableProfiles.map((profile) => (
              <option key={profile.profileId} value={profile.profileId}>
                {profile.name} · {getImageProviderLabel(profile.providerType)}
              </option>
            ))}
          </select>
        </label>
        {selectedProfile?.providerType === 'comfyui-workflow' ? (
          <label>本次 API 工作流
            <select value={workflowId} disabled={busy} onChange={(event) => {
              setWorkflowId(event.target.value);
              clearPreview();
            }}>
              <option value="">请明确选择</option>
              {availableWorkflows.map((workflow) => (
                <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name} · 修订 {workflow.revision}</option>
              ))}
            </select>
          </label>
        ) : null}
        <button type="button" disabled={busy || Boolean(validationMessage) || !profileId} onClick={() => void createPreview()}>
          {draft ? '按当前配置重新预览' : '生成请求预览'}
        </button>
        {!availableProfiles.length ? <button type="button" onClick={onOpenSettings}>前往文生图设置</button> : null}
      </div>
      <p className="image-prompt-reuse-notice" role="status">{notice}</p>
      {draft && previewTask?.draft ? (
        <div className="image-prompt-reuse-preview">
          <dl>
            <div><dt>当前后端</dt><dd>{getImageProviderLabel(previewTask.draft.providerType)} · {routingTargetLabel(previewTask)}</dd></div>
            <div><dt>目标画幅</dt><dd>{previewTask.draft.targetAspectRatio}</dd></div>
            <div><dt>锚点来源图片</dt><dd>{anchorSourceIds(previewTask).length
              ? `${anchorSourceIds(previewTask).join('、')}（不会随沿用提示词自动发送）`
              : '无'}</dd></div>
            <div><dt>实际生成参考图</dt><dd>{referenceIds(previewTask).join('、') || '无'}</dd></div>
            <div><dt>新任务来源</dt><dd>沿用提示词 · 原任务 {sourceTask.taskId}</dd></div>
            <div><dt>实际生成参数</dt><dd><pre className="image-gallery-request-parameters">{JSON.stringify(previewTask.draft.generationParameters, null, 2)}</pre></dd></div>
          </dl>
          <label>最终正向提示词
            <textarea rows={7} value={positivePrompt} disabled={busy} onChange={(event) => setPositivePrompt(event.target.value)} />
          </label>
          <label>最终负向提示词
            <textarea rows={4} value={negativePrompt} disabled={busy} onChange={(event) => setNegativePrompt(event.target.value)} />
          </label>
          <p className="image-prompt-reuse-warning">点击确认后才会保存任务并调用供应商，可能产生费用。只有新任务成功，当前人物图或正文场景图才会切换；原资产不会删除。</p>
          <div className="image-prompt-reuse-confirm-actions">
            <button type="button" disabled={busy || !positivePrompt.trim()} onClick={() => void confirmAndGenerate()}>
              {busy ? '正在生成…' : '确认并开始生成（可能产生费用）'}
            </button>
            <button type="button" disabled={busy} onClick={onCancel}>取消，不创建任务</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

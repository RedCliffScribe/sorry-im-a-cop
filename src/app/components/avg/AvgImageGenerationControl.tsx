import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type AvgImageGenerationCandidate,
  type AvgImageGenerationService,
  type AvgPortraitGenerationContext,
  type AvgSceneGenerationContext
} from '../../../domain/avgImageGeneration';
import { validateAvgOverrideImage, type AvgValidatedOverrideImage } from '../../../domain/avgVisualOverride';
import type { ComfyWorkflowTemplate, ImageApiProfile } from '../../../domain/imageGeneration/profile';

export type AvgImageGenerationControlRuntime =
  | {
      kind: 'portrait';
      service: AvgImageGenerationService;
      saveId: string;
      context: AvgPortraitGenerationContext;
      onOpenSettings?: () => void;
    }
  | {
      kind: 'scene';
      service: AvgImageGenerationService;
      saveId: string;
      context: AvgSceneGenerationContext;
      onOpenSettings?: () => void;
    };

function providerLabel(profile: ImageApiProfile): string {
  return `${profile.name} · ${profile.providerType}`;
}

function candidateFileName(candidate: AvgImageGenerationCandidate): string {
  const extension = candidate.asset.mimeType === 'image/jpeg'
    ? 'jpg'
    : candidate.asset.mimeType === 'image/webp' ? 'webp' : 'png';
  return `${candidate.purpose}__${candidate.asset.imageId.replace(/[^a-zA-Z0-9_-]+/gu, '_')}.${extension}`;
}

export function AvgImageGenerationControl({
  runtime,
  onUse
}: {
  runtime: AvgImageGenerationControlRuntime;
  onUse: (image: AvgValidatedOverrideImage) => Promise<void>;
}) {
  const [profiles, setProfiles] = useState<ImageApiProfile[]>([]);
  const [workflows, setWorkflows] = useState<ComfyWorkflowTemplate[]>([]);
  const [profileId, setProfileId] = useState('');
  const [workflowTemplateId, setWorkflowTemplateId] = useState('');
  const [instruction, setInstruction] = useState('');
  const [candidate, setCandidate] = useState<AvgImageGenerationCandidate>();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string>();
  const [adopting, setAdopting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const selectedProfile = profiles.find((profile) => profile.profileId === profileId);
  const candidatePurpose = runtime.kind === 'portrait'
    ? runtime.context.generationPurpose === 'outfit'
      ? 'avg_character_outfit'
      : 'avg_character_portrait'
    : 'avg_scene_background';
  const candidateUrl = useMemo(
    () => candidate ? URL.createObjectURL(candidate.blob) : undefined,
    [candidate]
  );

  useEffect(() => () => {
    if (candidateUrl) URL.revokeObjectURL(candidateUrl);
  }, [candidateUrl]);

  useEffect(() => {
    let active = true;
    setError(undefined);
    void runtime.service.listRoutingOptions().then((options) => {
      if (!active) return;
      setProfiles(options.profiles);
      setWorkflows(options.workflows);
      setProfileId((current) => current || options.profiles[0]?.profileId || '');
    }, (reason) => active && setError(reason instanceof Error ? reason.message : String(reason)));
    void runtime.service.findLatestCandidate(
      runtime.saveId,
      candidatePurpose,
      runtime.context.targetKey
    ).then((latest) => {
      if (active && latest) setCandidate(latest);
    }, () => undefined);
    return () => { active = false; };
  }, [
    candidatePurpose,
    runtime.context.targetKey,
    runtime.kind,
    runtime.saveId,
    runtime.service
  ]);

  useEffect(() => {
    if (selectedProfile?.providerType !== 'comfyui-workflow') {
      setWorkflowTemplateId('');
      return;
    }
    setWorkflowTemplateId((current) => current || workflows[0]?.workflowTemplateId || '');
  }, [selectedProfile, workflows]);

  const generate = async () => {
    if (!profileId) {
      setError('请先在图片生成设置中启用并选择一个生图档案。');
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setError(undefined);
    setStage('正在准备本地确定性提示词…');
    try {
      const options = {
        profileId,
        ...(workflowTemplateId ? { workflowTemplateId } : {}),
        ...(instruction.trim() ? { additionalInstruction: instruction.trim() } : {}),
        signal: controller.signal,
        onStage: (next: string) => setStage(next)
      };
      const next = runtime.kind === 'portrait'
        ? await runtime.service.generatePortrait(runtime.saveId, runtime.context, options)
        : await runtime.service.generateScene(runtime.saveId, runtime.context, options);
      setCandidate(next);
      setStage('候选图已生成；尚未替换当前 AVG 资源。');
    } catch (reason) {
      if (controller.signal.aborted) setStage('已取消本次生成。');
      else setError(reason instanceof Error ? reason.message : '图片生成失败。');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setBusy(false);
    }
  };

  const adoptCandidate = async () => {
    if (!candidate) return;
    setAdopting(true);
    setError(undefined);
    try {
      const validated = await validateAvgOverrideImage(candidate.blob);
      await onUse({
        ...validated,
        source: 'image_generation',
        sourceTaskId: candidate.taskId,
        originalFileName: candidateFileName(candidate)
      });
      setStage('候选图已设为本次游玩进程的 AVG 自定义图片。');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '采用候选图失败，原图片保持不变。');
    } finally {
      setAdopting(false);
    }
  };

  return (
    <section className="avg-image-generation-control" aria-label="AI 生成 AVG 候选图">
      <header>
        <div>
          <h5>AI 生成候选图</h5>
          <p>直接使用现有图片档案、模型和风格设置；生成完成后不会自动替换。</p>
          {runtime.kind === 'portrait' && runtime.context.generationPurpose === 'outfit' ? (
            <p className="avg-override-warning">
              当前为文字约束换装，模型可能改变脸或身材；请先核对人物身份，再决定是否采用。
            </p>
          ) : null}
        </div>
      </header>
      {profiles.length ? (
        <div className="avg-image-generation-fields">
          <label>
            图片档案
            <select value={profileId} disabled={busy} onChange={(event) => setProfileId(event.target.value)}>
              {profiles.map((profile) => (
                <option key={profile.profileId} value={profile.profileId}>{providerLabel(profile)}</option>
              ))}
            </select>
          </label>
          {selectedProfile?.providerType === 'comfyui-workflow' ? (
            <label>
              ComfyUI 工作流
              <select
                value={workflowTemplateId}
                disabled={busy}
                onChange={(event) => setWorkflowTemplateId(event.target.value)}
              >
                <option value="">请选择工作流</option>
                {workflows.map((workflow) => (
                  <option key={workflow.workflowTemplateId} value={workflow.workflowTemplateId}>{workflow.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            本次额外要求（可选）
            <textarea
              value={instruction}
              disabled={busy}
              maxLength={2000}
              rows={3}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder={runtime.kind === 'portrait'
                ? '只补充本次服装或构图要求；不会写回人物档案。'
                : '只补充本次稳定空间要求；不要写当前天气、时间或剧情人物。'}
            />
          </label>
          <div className="avg-override-actions">
            <button type="button" disabled={busy || adopting} onClick={() => void generate()}>
              {busy ? '正在生成…' : candidate ? '重新生成候选图' : '生成候选图'}
            </button>
            {busy ? (
              <button type="button" onClick={() => abortRef.current?.abort()}>取消生成</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="avg-image-generation-empty">
          <p>当前没有已启用的图片档案。这里不会改用主叙事模型。</p>
          {runtime.onOpenSettings ? (
            <button type="button" onClick={runtime.onOpenSettings}>打开图片生成设置</button>
          ) : null}
        </div>
      )}
      {stage ? <p className="avg-image-generation-stage" role="status">{stage}</p> : null}
      {candidate && candidateUrl ? (
        <section className="avg-image-generation-candidate" aria-label="AI 生成候选图预览">
          <div className="avg-image-generation-preview" data-kind={runtime.kind}>
            <img src={candidateUrl} alt="AI 生成的 AVG 候选图" />
          </div>
          <dl>
            <div><dt>来源</dt><dd>{candidate.profileName}</dd></div>
            <div><dt>模型/工作流</dt><dd>{candidate.modelOrWorkflowLabel}</dd></div>
            <div><dt>尺寸</dt><dd>{candidate.asset.width} × {candidate.asset.height}</dd></div>
            <div><dt>背景透明</dt><dd>{candidate.transparencyMode === 'requested' ? '供应商参数已请求' : '仅提示词要求，不保证真透明'}</dd></div>
          </dl>
          <details>
            <summary>查看最终发送给生图模型的提示词</summary>
            <label>正向<textarea readOnly rows={8} value={candidate.positivePrompt} /></label>
            <label>负向<textarea readOnly rows={5} value={candidate.negativePrompt} /></label>
          </details>
          <div className="avg-override-actions">
            <button type="button" disabled={busy || adopting} onClick={() => void adoptCandidate()}>
              {adopting ? '正在采用…' : '使用此图'}
            </button>
            <button type="button" disabled={busy || adopting} onClick={() => setCandidate(undefined)}>关闭候选</button>
          </div>
        </section>
      ) : null}
      {error ? <p className="avg-override-error" role="alert">{error}</p> : null}
    </section>
  );
}

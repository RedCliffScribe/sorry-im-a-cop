import type { Actor, RuntimeState, StoryEntry } from '../runtime/types';
import {
  confirmManualCharacterBatch,
  createBuiltInCharacterDraftExecutionConfig,
  createManualCharacterBatchDraft,
  executeConfirmedCharacterBatch,
  type CharacterDraftExecutionConfig,
  type CharacterImageExecutor
} from './characterVisualWorkflow';
import { CharacterImageRuntimeExecutor } from './characterImageRuntimeExecutor';
import {
  resolveImageAutomationRoute,
  type ImageAutomationSettingsRepository
} from './automationSettings';
import {
  createImageAutomationTriggerId,
  type ImageAutomationRuntimeRepository,
  type ImageAutomationTriggerRecord
} from './automationRuntime';
import type { ImageProbeStore } from './probe';
import {
  createStoryVisualBlocks,
  compileFormattedProviderPrompt,
  createProviderPromptRenderInput,
  hashStoryText,
  projectAnchoredActorsForScenePlanning,
  projectActorForVisualConversion,
  resolveSelectedImageStyleModifiers,
  type CharacterVisualPurpose,
  type ImagePromptConversionProbe,
  type ImagePromptTemplateRepository,
  type TurnScenePlanningInput,
  type VisualWorldContext
} from './promptConversion';
import {
  hasMatchingRuntimeGenerationEvidence,
  type ComfyWorkflowTemplate,
  type ImageApiCredentialSummary,
  type ImageApiProfile,
  type ImageCredentialRepository,
  type ImageProfileRepository
} from './profile';
import {
  confirmManualScenePlan,
  createBuiltInSceneDraftExecutionConfig,
  createFailedSceneRetryDraft,
  createManualScenePlanDraft,
  executeConfirmedScenePlan,
  type ManualScenePlanDraft
} from './sceneVisualWorkflow';
import type { ImageGenerationTask, VisualRepository } from './visualRepository';
import {
  IndexedDbImageGenerationPresetRepository,
  type ImageGenerationPresetRepository
} from './generationPresets';
import {
  IndexedDbPngStyleRepository,
  type PngStyleRepository
} from './pngStyle';

export interface AutomaticImageSubjects {
  actors: Actor[];
  narratorEntries: StoryEntry[];
}

export function detectAutomaticImageSubjects(previous: RuntimeState, current: RuntimeState): AutomaticImageSubjects {
  const previousActorIds = new Set(Object.keys(previous.actors));
  const previousNarratorTextByTurnId = new Map(
    previous.storyLog
      .filter((entry) => entry.speaker === 'narrator')
      .map((entry) => [entry.turnId, entry.text] as const)
  );
  return {
    actors: Object.values(current.actors).filter((actor) =>
      !previousActorIds.has(actor.actorId) &&
      actor.actorId !== current.player.actorId &&
      actor.visibility !== 'hidden' &&
      actor.visibility !== 'private'
    ),
    narratorEntries: current.storyLog.filter((entry) =>
      entry.speaker === 'narrator'
      && previousNarratorTextByTurnId.get(entry.turnId) !== entry.text
    )
  };
}

interface ResolvedAutomaticProfile {
  profile: ImageApiProfile;
  credential?: ImageApiCredentialSummary;
  workflow?: ComfyWorkflowTemplate;
}

export interface ImageAutomationCoordinatorDependencies {
  visualRepository: VisualRepository;
  runtimeRepository: ImageAutomationRuntimeRepository;
  settingsRepository: ImageAutomationSettingsRepository;
  profileRepository: ImageProfileRepository;
  credentialRepository: ImageCredentialRepository;
  verificationStore: ImageProbeStore;
  promptTemplateRepository: ImagePromptTemplateRepository;
  generationPresetRepository?: ImageGenerationPresetRepository;
  pngStyleRepository?: PngStyleRepository;
  createPromptConversion: () => ImagePromptConversionProbe | null;
  createImageExecutor?: () => CharacterImageExecutor;
  pageUrl?: () => string | undefined;
  now?: () => string;
  onRepositoryChanged?: () => void;
}

function safeFailureMessage(kind: 'character' | 'scene', error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return '自动图片任务已取消。';
  const prefix = kind === 'character' ? '自动人物图任务失败' : '自动场景图任务失败';
  return `${prefix}；正文与已有图片未受影响，可在图片管理中重试。`;
}

export class ImageAutomationCoordinator {
  private readonly controllers = new Map<string, AbortController>();
  private readonly now: () => string;
  private readonly executor: CharacterImageExecutor;
  private readonly generationPresets: ImageGenerationPresetRepository;
  private readonly pngStyles: PngStyleRepository;

  constructor(private readonly dependencies: ImageAutomationCoordinatorDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.executor = dependencies.createImageExecutor?.() ?? new CharacterImageRuntimeExecutor({
      profiles: dependencies.profileRepository,
      credentials: dependencies.credentialRepository,
      verificationStore: dependencies.verificationStore,
      visualRepository: dependencies.visualRepository,
      pageUrl: dependencies.pageUrl
    });
    this.generationPresets = dependencies.generationPresetRepository ?? new IndexedDbImageGenerationPresetRepository();
    this.pngStyles = dependencies.pngStyleRepository ?? new IndexedDbPngStyleRepository();
  }

  async processTransition(saveId: string, previous: RuntimeState, current: RuntimeState): Promise<void> {
    const settings = await this.dependencies.settingsRepository.load();
    const subjects = detectAutomaticImageSubjects(previous, current);
    if (settings.characterMode === 'automatic') {
      for (const actor of subjects.actors) {
        await this.processCharacter(saveId, actor, current.time.year, settings.characterAutomaticPurposes);
      }
    }
    if (settings.sceneMode === 'automatic') {
      for (const entry of subjects.narratorEntries) {
        await this.processScene(saveId, entry, current.actors, current.time.year, settings.sceneMaxPerTurn, settings.sceneConcurrency, settings.sceneFailureRetry === 'once');
      }
    }
  }

  cancel(triggerId: string): void {
    this.controllers.get(triggerId)?.abort(new DOMException('玩家取消自动图片任务。', 'AbortError'));
  }

  async retry(saveId: string, state: RuntimeState, triggerId: string): Promise<void> {
    const record = await this.dependencies.runtimeRepository.get(triggerId);
    if (!record || record.saveId !== saveId || !['blocked', 'failed', 'cancelled'].includes(record.status)) return;
    const settings = await this.dependencies.settingsRepository.load();
    if (record.kind === 'character-created' && settings.characterMode === 'automatic') {
      const actor = state.actors[record.subjectId];
      if (actor && actor.actorId !== state.player.actorId && actor.visibility !== 'hidden' && actor.visibility !== 'private') {
        await this.dependencies.runtimeRepository.remove(triggerId);
        await this.processCharacter(saveId, actor, state.time.year, settings.characterAutomaticPurposes);
      }
      return;
    }
    if (record.kind === 'story-turn-completed' && settings.sceneMode === 'automatic') {
      const entry = state.storyLog.find((item) => item.turnId === record.subjectId && item.speaker === 'narrator');
      if (!entry) {
        await this.update(record, {
          status: 'cancelled',
          blockerCode: 'turn-invalidated',
          safeMessage: '原自动场景对应的正文回合已不存在；没有重新提交图片请求。'
        });
        return;
      }
      const currentStoryTextHash = await hashStoryText(entry.text);
      if (record.sourceStoryTextHash && record.sourceStoryTextHash !== currentStoryTextHash) {
        await this.update(record, {
          status: 'cancelled',
          blockerCode: 'turn-invalidated',
          safeMessage: '原自动场景对应的正文已被回溯或改写；旧任务保留审计记录，不会用于新正文。'
        });
        return;
      }
      await this.dependencies.runtimeRepository.remove(triggerId);
      await this.processScene(saveId, entry, state.actors, state.time.year, settings.sceneMaxPerTurn, settings.sceneConcurrency, settings.sceneFailureRetry === 'once');
    }
  }

  dispose(): void {
    for (const controller of this.controllers.values()) {
      controller.abort(new DOMException('游戏界面已关闭。', 'AbortError'));
    }
    this.controllers.clear();
  }

  async recover(saveId: string): Promise<void> {
    const records = await this.dependencies.runtimeRepository.listForSave(saveId);
    const snapshot = await this.dependencies.visualRepository.loadSnapshot(saveId);
    for (const record of records.filter((item) => ['planning', 'queued', 'running'].includes(item.status))) {
      const tasks = record.taskIds.map((taskId) => snapshot.tasks[taskId]).filter(Boolean);
      if (tasks.some((task) => ['submitting', 'remote-pending', 'downloading', 'persisting'].includes(task.status))) {
        await this.update(record, {
          status: 'failed',
          blockerCode: 'interrupted-remote-state',
          safeMessage: '页面重载时任务已进入远端或落盘阶段；为避免重复计费，没有自动重提。'
        });
        continue;
      }
      const queued = tasks.filter((task) => task.status === 'queued');
      if (!queued.length) {
        await this.update(record, {
          status: 'failed',
          blockerCode: 'interrupted-before-queue',
          safeMessage: '自动任务在排队前中断；没有向图片供应商重复提交。'
        });
        continue;
      }
      const controller = new AbortController();
      this.controllers.set(record.triggerId, controller);
      await this.update(record, { status: 'running', safeMessage: '正在恢复尚未提交的本地排队任务。' });
      try {
        if (record.kind === 'character-created') {
          const batch = Object.values(snapshot.characterBatches).find((item) => queued.some((task) => item.taskIds.includes(task.taskId)));
          if (!batch) throw new Error('missing-character-batch');
          await executeConfirmedCharacterBatch({
            repository: this.dependencies.visualRepository,
            confirmed: { batch, tasks: queued },
            executor: this.executor,
            signal: controller.signal
          });
        } else {
          const plan = Object.values(snapshot.scenePlans).find((item) => queued.some((task) => task.intent.type === 'scene-image' && task.intent.scenePlanId === item.planId));
          if (!plan) throw new Error('missing-scene-plan');
          const settings = await this.dependencies.settingsRepository.load();
          await executeConfirmedScenePlan({
            repository: this.dependencies.visualRepository,
            confirmed: { plan, tasks: queued },
            executor: this.executor,
            signal: controller.signal,
            concurrency: settings.sceneConcurrency
          });
        }
        await this.finishFromTasks(record, record.taskIds);
      } catch (error) {
        await this.fail(record, record.kind === 'character-created' ? 'character' : 'scene', error);
      } finally {
        this.controllers.delete(record.triggerId);
      }
    }
  }

  private async resolveProfile(kind: 'character' | 'scene'): Promise<ResolvedAutomaticProfile> {
    const settings = await this.dependencies.settingsRepository.load();
    const route = resolveImageAutomationRoute(settings, kind);
    if (!route.profileId) throw new Error(`${kind}-automatic-profile-missing`);
    const profile = await this.dependencies.profileRepository.getProfile(route.profileId);
    if (!profile?.enabled) throw new Error('automatic-profile-unavailable');
    const credential = profile.credentialId
      ? (await this.dependencies.credentialRepository.getCredentialSummary(profile.credentialId)) ?? undefined
      : undefined;
    const workflow = profile.providerType === 'comfyui-workflow'
      ? route.workflowTemplateId
        ? (await this.dependencies.profileRepository.getWorkflowTemplate(route.workflowTemplateId)) ?? undefined
        : undefined
      : undefined;
    if (profile.providerType === 'comfyui-workflow' && !workflow) throw new Error('automatic-workflow-unavailable');
    return { profile, credential, workflow };
  }

  private async assertEvidence(profile: ImageApiProfile, fingerprints: string[]): Promise<void> {
    const records = await this.dependencies.verificationStore.listRecords(profile.profileId);
    if (fingerprints.some((fingerprint) => !hasMatchingRuntimeGenerationEvidence(records, profile.profileId, fingerprint))) {
      throw new Error('runtime-evidence-missing');
    }
  }

  private async claim(
    saveId: string,
    kind: ImageAutomationTriggerRecord['kind'],
    subjectId: string,
    maxRetries: number,
    sourceStoryTextHash?: string
  ) {
    const now = this.now();
    return this.dependencies.runtimeRepository.claim({
      triggerId: createImageAutomationTriggerId(saveId, kind, subjectId, sourceStoryTextHash),
      saveId,
      kind,
      subjectId,
      ...(sourceStoryTextHash ? { sourceStoryTextHash } : {}),
      status: 'detected',
      executionFingerprints: [],
      taskIds: [],
      retryCount: 0,
      maxRetries,
      safeMessage: '已检测到自动图片触发条件。',
      createdAt: now,
      updatedAt: now
    });
  }

  private async update(record: ImageAutomationTriggerRecord, patch: Partial<ImageAutomationTriggerRecord>): Promise<ImageAutomationTriggerRecord> {
    const next = { ...record, ...patch, updatedAt: this.now() };
    await this.dependencies.runtimeRepository.put(next);
    return next;
  }

  private async processCharacter(saveId: string, actor: Actor, worldYear: number, purposes: CharacterVisualPurpose[]): Promise<void> {
    const claimed = await this.claim(saveId, 'character-created', actor.actorId, 0);
    if (!claimed.created) return;
    let record = claimed.record;
    const controller = new AbortController();
    this.controllers.set(record.triggerId, controller);
    try {
      record = await this.update(record, { status: 'planning', safeMessage: `正在为 ${actor.name} 准备自动人物图。` });
      const resolved = await this.resolveProfile('character');
      const executions = Object.fromEntries(await Promise.all(purposes.map(async (purpose) => [
        purpose,
        await createBuiltInCharacterDraftExecutionConfig({
          ...resolved,
          purpose,
          preset: await this.generationPresets.get(resolved.profile.profileId, purpose)
        })
      ]))) as Record<CharacterVisualPurpose, CharacterDraftExecutionConfig>;
      const fingerprints = purposes.map((purpose) => executions[purpose].executionFingerprint);
      await this.assertEvidence(resolved.profile, fingerprints);
      record = await this.update(record, { profileId: resolved.profile.profileId, executionFingerprints: fingerprints });
      const converter = this.dependencies.createPromptConversion();
      if (!converter) throw new Error('prompt-conversion-unavailable');
      const snapshot = await this.dependencies.visualRepository.loadSnapshot(saveId);
      let anchor = Object.values(snapshot.characterAnchors).find((item) => item.actorId === actor.actorId);
      if (!anchor) {
        const convertedAnchor = await converter.generateCharacterAnchor({
          actor: projectActorForVisualConversion(actor),
          world: { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' }
        }, { signal: controller.signal });
        anchor = {
          anchorId: `character-anchor:${actor.actorId}`,
          saveId,
          actorId: actor.actorId,
          anchorText: convertedAnchor.anchorText,
          source: 'actor-profile-api',
          sourceImageIds: [],
          updatedAt: this.now()
        };
        await this.dependencies.visualRepository.saveCharacterAnchor(anchor);
      }
      const converted = await converter.generateCharacterViewPrompts({
        actorId: actor.actorId,
        anchorText: anchor.anchorText,
        world: { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' }
      }, { signal: controller.signal });
      const [promptSettings, pngStyleSettings] = await Promise.all([
        this.dependencies.promptTemplateRepository.load(),
        this.pngStyles.load()
      ]);
      const draft = await createManualCharacterBatchDraft({
        repository: this.dependencies.visualRepository,
        anchor,
        views: converted.views.filter((view) => purposes.includes(view.purpose)),
        purposes,
        additionalRequirementText: '',
        additionalRequirementMode: 'none',
        execution: executions,
        modifiers: promptSettings.modifiers,
        styleModifiers: resolveSelectedImageStyleModifiers(
          promptSettings.stylePresets,
          promptSettings.styleSelection,
          'character'
        ),
        pngStyleSettings,
        renderPrompt: async ({ semanticPrompt, execution }) => {
          const dialect = promptSettings.dialectPresets.find(
            (preset) => preset.dialectPresetId === execution.promptDialectPresetId
          );
          if (!dialect) throw new Error('prompt-dialect-missing');
          const output = await converter.renderProviderPrompt(
            createProviderPromptRenderInput(semanticPrompt, dialect),
            { signal: controller.signal }
          );
          return compileFormattedProviderPrompt(semanticPrompt, dialect, output);
        },
        taskSource: 'automatic',
        submissionMode: 'automatic',
        batchSource: 'automatic-new-actor'
      });
      const confirmed = await confirmManualCharacterBatch({
        repository: this.dependencies.visualRepository,
        draft,
        edits: draft.tasks.map((task) => ({
          purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium',
          positivePrompt: task.draft?.positivePrompt ?? '',
          negativePrompt: task.draft?.negativePrompt ?? ''
        }))
      });
      record = await this.update(record, { status: 'running', taskIds: confirmed.tasks.map((task) => task.taskId), safeMessage: `正在生成 ${actor.name} 的人物图。` });
      await executeConfirmedCharacterBatch({ repository: this.dependencies.visualRepository, confirmed, executor: this.executor, signal: controller.signal });
      await this.finishFromTasks(record, confirmed.tasks.map((task) => task.taskId));
      this.dependencies.onRepositoryChanged?.();
    } catch (error) {
      await this.fail(record, 'character', error);
    } finally {
      this.controllers.delete(record.triggerId);
    }
  }

  private async processScene(
    saveId: string,
    entry: StoryEntry,
    runtimeActors: RuntimeState['actors'],
    worldYear: number,
    maxScenes: number,
    concurrency: number,
    retryOnce: boolean
  ): Promise<void> {
    const sourceStoryTextHash = await hashStoryText(entry.text);
    const claimed = await this.claim(
      saveId,
      'story-turn-completed',
      entry.turnId,
      retryOnce ? 1 : 0,
      sourceStoryTextHash
    );
    if (!claimed.created) return;
    let record = claimed.record;
    const controller = new AbortController();
    this.controllers.set(record.triggerId, controller);
    try {
      if (!entry.visualContext) {
        await this.update(record, { status: 'skipped', safeMessage: '本回合没有冻结的视觉上下文，未创建图片任务。' });
        return;
      }
      record = await this.update(record, { status: 'planning', safeMessage: '正在分析本回合是否适合生成场景图。' });
      const resolved = await this.resolveProfile('scene');
      const execution = await createBuiltInSceneDraftExecutionConfig({
        ...resolved,
        preset: await this.generationPresets.get(resolved.profile.profileId, 'narrative-scene')
      });
      await this.assertEvidence(resolved.profile, [execution.executionFingerprint]);
      record = await this.update(record, { profileId: resolved.profile.profileId, executionFingerprints: [execution.executionFingerprint] });
      const converter = this.dependencies.createPromptConversion();
      if (!converter) throw new Error('prompt-conversion-unavailable');
      const snapshot = await this.dependencies.visualRepository.loadSnapshot(saveId);
      const actors = projectAnchoredActorsForScenePlanning({
        actors: runtimeActors,
        anchors: Object.values(snapshot.characterAnchors),
        priorityActorIds: [
          ...entry.visualContext.presentActorIds,
          ...Object.values(entry.dialogueSpeakerActorIds ?? {})
        ]
      });
      const planningInput: TurnScenePlanningInput = {
        sourceTurnId: entry.turnId,
        sourceStoryTextHash,
        mode: 'automatic',
        requestedMaxScenes: maxScenes,
        storyText: entry.text,
        ...(entry.summaryText?.trim() ? { summaryText: entry.summaryText } : {}),
        blocks: await createStoryVisualBlocks(entry.turnId, entry.text),
        frozenContext: entry.visualContext,
        actors
      };
      const planningOutput = await converter.planTurnScenes(planningInput, { signal: controller.signal });
      if (!planningOutput.shots.length) {
        await this.update(record, { status: 'skipped', safeMessage: '提示词转换 API 判断本回合没有适合成图的镜头；未调用图片供应商。' });
        return;
      }
      const world: VisualWorldContext = { year: worldYear, region: '香港', visualStyle: '香港犯罪剧情写实电影感' };
      const actorMap = new Map(actors.map((actor) => [actor.actorId, actor]));
      const promptOutputs = [];
      for (const shot of planningOutput.shots) {
        const participants = shot.knownActorIds.map((actorId) => {
          const actor = actorMap.get(actorId);
          if (!actor) throw new Error('scene-anchor-missing');
          return { ...actor, sceneSpecificAppearance: shot.actorVisualStates.find((state) => state.actorId === actorId)?.sceneSpecificAppearance };
        });
        promptOutputs.push(await converter.generateSceneShotPrompt({ shot, participants, world }, { signal: controller.signal }));
      }
      const [promptSettings, pngStyleSettings] = await Promise.all([
        this.dependencies.promptTemplateRepository.load(),
        this.pngStyles.load()
      ]);
      const draft = await createManualScenePlanDraft({
        repository: this.dependencies.visualRepository,
        saveId,
        planningInput,
        planningOutput,
        world,
        promptOutputs,
        execution,
        modifiers: promptSettings.modifiers,
        styleModifiers: resolveSelectedImageStyleModifiers(
          promptSettings.stylePresets,
          promptSettings.styleSelection,
          'narrative-scene'
        ),
        pngStyleSettings,
        renderPrompt: async ({ semanticPrompt, execution: promptExecution }) => {
          const dialect = promptSettings.dialectPresets.find(
            (preset) => preset.dialectPresetId === promptExecution.promptDialectPresetId
          );
          if (!dialect) throw new Error('prompt-dialect-missing');
          const output = await converter.renderProviderPrompt(
            createProviderPromptRenderInput(semanticPrompt, dialect),
            { signal: controller.signal }
          );
          return compileFormattedProviderPrompt(semanticPrompt, dialect, output);
        },
        mode: 'automatic',
        taskSource: 'automatic',
        submissionMode: 'automatic'
      });
      let confirmed = await this.confirmScene(draft);
      record = await this.update(record, { status: 'running', taskIds: confirmed.tasks.map((task) => task.taskId), safeMessage: `正在生成 ${confirmed.tasks.length} 张场景图。` });
      await executeConfirmedScenePlan({ repository: this.dependencies.visualRepository, confirmed, executor: this.executor, signal: controller.signal, concurrency });
      let failed = await this.failedTasks(saveId, confirmed.tasks);
      if (failed.length && retryOnce && !controller.signal.aborted) {
        const retryDraft = await createFailedSceneRetryDraft({
          repository: this.dependencies.visualRepository,
          plan: confirmed.plan,
          failedTasks: failed,
          submissionMode: 'automatic'
        });
        confirmed = await this.confirmScene(retryDraft);
        record = await this.update(record, {
          retryCount: 1,
          taskIds: [...record.taskIds, ...confirmed.tasks.map((task) => task.taskId)],
          safeMessage: `场景图失败，正在按设置自动重试一次。`
        });
        await executeConfirmedScenePlan({ repository: this.dependencies.visualRepository, confirmed, executor: this.executor, signal: controller.signal, concurrency });
        failed = await this.failedTasks(saveId, confirmed.tasks);
      }
      await this.finishFromTasks(record, record.taskIds);
      this.dependencies.onRepositoryChanged?.();
    } catch (error) {
      await this.fail(record, 'scene', error);
    } finally {
      this.controllers.delete(record.triggerId);
    }
  }

  private async confirmScene(draft: ManualScenePlanDraft): Promise<ManualScenePlanDraft> {
    return confirmManualScenePlan({
      repository: this.dependencies.visualRepository,
      draft,
      edits: draft.tasks.map((task) => ({
        shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
        positivePrompt: task.draft?.positivePrompt ?? '',
        negativePrompt: task.draft?.negativePrompt ?? ''
      }))
    });
  }

  private async failedTasks(saveId: string, tasks: ImageGenerationTask[]): Promise<ImageGenerationTask[]> {
    const snapshot = await this.dependencies.visualRepository.loadSnapshot(saveId);
    return tasks.map((task) => snapshot.tasks[task.taskId]).filter((task): task is ImageGenerationTask => task?.status === 'failed');
  }

  private async finishFromTasks(record: ImageAutomationTriggerRecord, taskIds: string[]): Promise<void> {
    const snapshot = await this.dependencies.visualRepository.loadSnapshot(record.saveId);
    const tasks = taskIds.map((taskId) => snapshot.tasks[taskId]).filter(Boolean);
    const succeeded = tasks.filter((task) => task.status === 'succeeded').length;
    const failed = tasks.filter((task) => task.status === 'failed' || task.status === 'cancelled').length;
    const cancelled = tasks.length > 0 && tasks.every((task) => task.status === 'cancelled');
    await this.update(record, {
      status: cancelled ? 'cancelled' : failed === 0 && succeeded === tasks.length ? 'succeeded' : succeeded > 0 ? 'partially-succeeded' : 'failed',
      safeMessage: cancelled ? '自动图片任务已取消。' : failed === 0
        ? `自动图片任务完成，共生成 ${succeeded} 张图片。`
        : `自动图片任务结束：${succeeded} 张成功，${failed} 张失败或取消。`
    });
  }

  private async fail(record: ImageAutomationTriggerRecord, kind: 'character' | 'scene', error: unknown): Promise<void> {
    const cancelled = error instanceof DOMException && error.name === 'AbortError';
    await this.update(record, {
      status: cancelled ? 'cancelled' : record.taskIds.length ? 'failed' : 'blocked',
      blockerCode: cancelled ? 'cancelled' : error instanceof Error ? error.message.slice(0, 200) : 'automation-failed',
      safeMessage: safeFailureMessage(kind, error)
    });
  }
}

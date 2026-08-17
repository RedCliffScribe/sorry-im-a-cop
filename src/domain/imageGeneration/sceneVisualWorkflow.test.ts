import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import {
  createStoryVisualBlocks,
  hashStoryText,
  type SceneShotPromptOutput,
  type TurnScenePlanningInput,
  type TurnScenePlanningOutput
} from './promptConversion';
import {
  createBuiltInSceneDraftExecutionConfig,
  confirmManualScenePlan,
  createFailedSceneRetryDraft,
  createManualScenePlanDraft,
  createSceneShotRegenerationDraft,
  executeConfirmedScenePlan
} from './sceneVisualWorkflow';
import {
  createDefaultImageApiProfile,
  type ComfyWorkflowTemplate
} from './profile';
import { IndexedDbVisualRepository } from './visualRepository';
import { createDraft, TEST_ANCHOR, TEST_PNG_BYTES } from './visualRepository/testFixtures';

const now = '2026-07-23T03:00:00.000Z';

it('selects an Illustrious prompt format for a clearly identified ComfyUI checkpoint', async () => {
  const profile = {
    ...createDefaultImageApiProfile('comfyui-workflow', 'profile_illustrious', now),
    enabled: true
  };
  const workflow: ComfyWorkflowTemplate = {
    workflowTemplateId: 'workflow_illustrious',
    name: 'Illustrious 场景',
    apiWorkflow: {
      '4': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: 'asianBlendIllustrious_v10.safetensors' }
      }
    },
    workflowHash: 'a'.repeat(64),
    bindings: {
      positivePrompt: { nodeId: '6', inputName: 'text' },
      checkpoint: { nodeId: '4', inputName: 'ckpt_name' }
    },
    outputNodeIds: ['9'],
    revision: 1,
    createdAt: now,
    updatedAt: now
  };

  await expect(createBuiltInSceneDraftExecutionConfig({ profile, workflow }))
    .resolves.toMatchObject({ promptDialectPresetId: 'builtin-dialect-illustrious' });
});

function execution() {
  const { intentId: _intentId, positivePrompt: _positive, negativePrompt: _negative, sourceAnchorHashes: _hashes, compiledAt: _compiled, ...config } = createDraft('placeholder');
  return config;
}

async function planning(): Promise<{ input: TurnScenePlanningInput; output: TurnScenePlanningOutput; prompts: SceneShotPromptOutput[] }> {
  const storyText = '【旁白】雨水沿着霓虹招牌滴落。\n【陈美】她脱下湿透的外套，只穿白色衬衣站在窗边。';
  const blocks = await createStoryVisualBlocks('turn_7', storyText);
  const input: TurnScenePlanningInput = {
    sourceTurnId: 'turn_7',
    sourceStoryTextHash: await hashStoryText(storyText),
    mode: 'manual',
    requestedMaxScenes: 2,
    storyText,
    blocks,
    frozenContext: {
      timeDescription: '1988年7月23日 23:10',
      locationDescription: '旺角唐楼房间',
      weatherDescription: '暴雨',
      presentActorIds: ['actor_mei']
    },
    actors: [{ actorId: 'actor_mei', anchorText: TEST_ANCHOR, persistentAdditionalRequirementText: '保留红色发夹' }],
    manualInstruction: '突出窗边逆光'
  };
  const output: TurnScenePlanningOutput = {
    shots: [{
      placement: { blockIndex: 1, blockHash: blocks[1]!.blockHash },
      order: 0,
      sceneSummary: '陈美站在雨夜窗边',
      knownActorIds: ['actor_mei'],
      actorVisualStates: [{ actorId: 'actor_mei', sceneSpecificAppearance: '脱下湿外套，只穿白色衬衣' }],
      unboundCharacterDescriptions: [],
      locationDescription: '旺角唐楼房间的窗边',
      actionDescription: '站在窗边望向街道',
      atmosphere: '雨夜、克制、危险',
      composition: '16:9 中景，窗边逆光'
    }]
  };
  const prompts: SceneShotPromptOutput[] = [{
    basePositive: '雨夜香港唐楼房间，窗边逆光',
    baseNegative: '错误时代物件',
    participantResolutions: [{
      actorId: 'actor_mei',
      fixedIdentityPositive: '固定脸部与红色发夹',
      fixedIdentityNegative: '避免改变脸型',
      appearanceSource: 'scene-specific-override',
      resolvedAppearancePositive: '白色衬衣，不穿湿外套',
      resolvedAdditionalPositive: '红色发夹清晰可见',
      resolvedAdditionalNegative: '缺少发夹'
    }],
    resolvedOneTimePositive: '突出窗边逆光',
    resolvedOneTimeNegative: ''
  }];
  return { input, output, prompts };
}

describe('scene visual workflow', () => {
  it('freezes actor anchors and scene-specific appearance, then requires explicit prompt confirmation', async () => {
    const repository = new IndexedDbVisualRepository(`scene-draft-${crypto.randomUUID()}`);
    const data = await planning();
    let id = 0;
    const draft = await createManualScenePlanDraft({
      repository,
      saveId: 'save_scene',
      planningInput: data.input,
      planningOutput: data.output,
      promptOutputs: data.prompts,
      world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(),
      oneTimeInstruction: '突出窗边逆光',
      now,
      createId: () => String(++id)
    });

    expect(draft.tasks).toHaveLength(1);
    expect(draft.tasks[0]).toMatchObject({ status: 'awaiting-confirmation' });
    expect(draft.tasks[0].intent).toMatchObject({
      type: 'scene-image',
      participantAnchorSnapshots: [{
        actorId: 'actor_mei',
        anchorText: TEST_ANCHOR,
        sceneSpecificAppearance: '脱下湿外套，只穿白色衬衣'
      }]
    });
    expect(draft.tasks[0].draft?.positivePrompt).toContain('白色衬衣，不穿湿外套');
    expect(draft.tasks[0].draft?.positivePrompt.endsWith('突出窗边逆光')).toBe(true);

    const confirmed = await confirmManualScenePlan({
      repository,
      draft,
      edits: [{
        shotId: draft.plan.shots[0]!.shotId,
        positivePrompt: `${draft.tasks[0].draft!.positivePrompt}\n玩家最终修改`,
        negativePrompt: draft.tasks[0].draft!.negativePrompt
      }],
      now: '2026-07-23T03:01:00.000Z'
    });
    expect(confirmed.tasks[0]).toMatchObject({ status: 'queued', submittedRequest: { userEdited: true } });
  });

  it('executes each shot independently, binds the result to the story block, and can preview a failed-shot retry', async () => {
    const repository = new IndexedDbVisualRepository(`scene-execution-${crypto.randomUUID()}`);
    const data = await planning();
    let id = 0;
    const waiting = await createManualScenePlanDraft({
      repository, saveId: 'save_scene', planningInput: data.input, planningOutput: data.output,
      promptOutputs: data.prompts, world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(), now, createId: () => String(++id)
    });
    const confirmed = await confirmManualScenePlan({
      repository,
      draft: waiting,
      edits: [{ shotId: waiting.plan.shots[0]!.shotId, positivePrompt: waiting.tasks[0].draft!.positivePrompt, negativePrompt: '' }]
    });
    const display = await executeConfirmedScenePlan({
      repository,
      confirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES], { type: 'image/png' }), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const snapshot = await repository.loadSnapshot('save_scene');
    expect(display.activeShotIds).toEqual([waiting.plan.shots[0]!.shotId]);
    expect(Object.values(snapshot.assets)).toHaveLength(1);
    expect(Object.values(snapshot.bindings)[0]).toMatchObject({ purpose: 'turn-scene', variantKey: waiting.plan.shots[0]!.shotId });

    const secondData = await planning();
    const secondWaiting = await createManualScenePlanDraft({
      repository, saveId: 'save_scene', planningInput: secondData.input, planningOutput: secondData.output,
      promptOutputs: secondData.prompts, world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(), createId: () => String(++id)
    });
    const secondConfirmed = await confirmManualScenePlan({
      repository,
      draft: secondWaiting,
      edits: [{ shotId: secondWaiting.plan.shots[0]!.shotId, positivePrompt: secondWaiting.tasks[0].draft!.positivePrompt, negativePrompt: '' }]
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed: secondConfirmed,
      executor: { generate: vi.fn().mockRejectedValue(new Error('temporary failure')) }
    });
    const failedSnapshot = await repository.loadSnapshot('save_scene');
    const failedTask = failedSnapshot.tasks[secondConfirmed.tasks[0].taskId]!;
    expect(failedTask.status).toBe('failed');
    expect(failedSnapshot.storySceneDisplayStates.turn_7.activeShotIds).toEqual([waiting.plan.shots[0]!.shotId]);

    const retry = await createFailedSceneRetryDraft({
      repository,
      plan: secondWaiting.plan,
      failedTasks: [failedTask],
      createId: () => String(++id)
    });
    expect(retry.tasks[0]).toMatchObject({ status: 'awaiting-confirmation', source: 'retry', sourceTaskId: failedTask.taskId });
    expect(retry.tasks[0].draft?.positivePrompt).toBe(failedTask.submittedRequest?.positivePrompt);
  });

  it('honors the bounded scene concurrency and merges all successful display bindings', async () => {
    const repository = new IndexedDbVisualRepository(`scene-concurrency-${crypto.randomUUID()}`);
    const data = await planning();
    data.output.shots.push({
      ...data.output.shots[0]!,
      placement: { blockIndex: 0, blockHash: data.input.blocks[0]!.blockHash },
      order: 1,
      sceneSummary: '雨夜霓虹街道',
      knownActorIds: [],
      actorVisualStates: []
    });
    data.prompts.push({
      basePositive: '雨夜霓虹街道广角',
      baseNegative: '错误时代物件',
      participantResolutions: [],
      resolvedOneTimePositive: '突出窗边逆光',
      resolvedOneTimeNegative: ''
    });
    let id = 0;
    const waiting = await createManualScenePlanDraft({
      repository,
      saveId: 'save_scene_concurrency',
      planningInput: data.input,
      planningOutput: data.output,
      promptOutputs: data.prompts,
      world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(),
      oneTimeInstruction: '突出窗边逆光',
      createId: () => String(++id)
    });
    const confirmed = await confirmManualScenePlan({
      repository,
      draft: waiting,
      edits: waiting.tasks.map((task) => ({
        shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
        positivePrompt: task.draft!.positivePrompt,
        negativePrompt: task.draft!.negativePrompt
      }))
    });
    let active = 0;
    let peak = 0;
    await executeConfirmedScenePlan({
      repository,
      confirmed,
      concurrency: 2,
      executor: {
        generate: async () => {
          active += 1;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return [{ blob: new Blob([TEST_PNG_BYTES], { type: 'image/png' }), width: 1, height: 1 }];
        }
      },
      createId: () => String(++id)
    });
    const snapshot = await repository.loadSnapshot('save_scene_concurrency');
    expect(peak).toBe(2);
    expect(snapshot.storySceneDisplayStates.turn_7?.activeShotIds).toHaveLength(2);
  });

  it('keeps the old group visible after partial replacement and switches atomically after retry succeeds', async () => {
    const repository = new IndexedDbVisualRepository(`scene-replace-group-${crypto.randomUUID()}`);
    const originalData = await planning();
    let id = 0;
    const originalWaiting = await createManualScenePlanDraft({
      repository, saveId: 'save_replace', planningInput: originalData.input, planningOutput: originalData.output,
      promptOutputs: originalData.prompts, world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(), createId: () => String(++id)
    });
    const originalConfirmed = await confirmManualScenePlan({
      repository,
      draft: originalWaiting,
      edits: [{
        shotId: originalWaiting.plan.shots[0]!.shotId,
        positivePrompt: originalWaiting.tasks[0].draft!.positivePrompt,
        negativePrompt: ''
      }]
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed: originalConfirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const oldShotId = originalWaiting.plan.shots[0]!.shotId;

    const replacementData = await planning();
    replacementData.output.shots.push({
      ...replacementData.output.shots[0]!,
      placement: { blockIndex: 0, blockHash: replacementData.input.blocks[0]!.blockHash },
      order: 1,
      sceneSummary: '替换组第二镜头',
      knownActorIds: [],
      actorVisualStates: []
    });
    replacementData.prompts.push({
      basePositive: '替换组第二镜头', baseNegative: '', participantResolutions: [],
      resolvedOneTimePositive: '', resolvedOneTimeNegative: ''
    });
    const replacementWaiting = await createManualScenePlanDraft({
      repository, saveId: 'save_replace', planningInput: replacementData.input, planningOutput: replacementData.output,
      promptOutputs: replacementData.prompts, world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(), displayOperation: 'replace-group', createId: () => String(++id)
    });
    const replacementConfirmed = await confirmManualScenePlan({
      repository,
      draft: replacementWaiting,
      edits: replacementWaiting.tasks.map((task) => ({
        shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
        positivePrompt: task.draft!.positivePrompt,
        negativePrompt: task.draft!.negativePrompt
      }))
    });
    const generate = vi.fn()
      .mockResolvedValueOnce([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }])
      .mockRejectedValueOnce(new Error('second shot failed'));
    await executeConfirmedScenePlan({ repository, confirmed: replacementConfirmed, executor: { generate }, createId: () => String(++id) });
    let snapshot = await repository.loadSnapshot('save_replace');
    expect(snapshot.storySceneDisplayStates.turn_7.activeShotIds).toEqual([oldShotId]);
    expect(snapshot.storySceneDisplayStates.turn_7.pendingReplacement).toBeUndefined();

    const failed = replacementConfirmed.tasks
      .map((task) => snapshot.tasks[task.taskId]!)
      .filter((task) => task.status === 'failed');
    const retryWaiting = await createFailedSceneRetryDraft({
      repository, plan: replacementWaiting.plan, failedTasks: failed, createId: () => String(++id)
    });
    const retryConfirmed = await confirmManualScenePlan({
      repository,
      draft: retryWaiting,
      edits: retryWaiting.tasks.map((task) => ({
        shotId: task.intent.type === 'scene-image' ? task.intent.shotId : '',
        positivePrompt: task.draft!.positivePrompt,
        negativePrompt: task.draft!.negativePrompt
      }))
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed: retryConfirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    snapshot = await repository.loadSnapshot('save_replace');
    expect(snapshot.storySceneDisplayStates.turn_7.activeShotIds).toEqual(
      replacementWaiting.plan.shots.map((shot) => shot.shotId)
    );
  });

  it('regenerates one displayed shot from its frozen prompt and replaces it in place only after success', async () => {
    const repository = new IndexedDbVisualRepository(`scene-regenerate-${crypto.randomUUID()}`);
    const data = await planning();
    let id = 0;
    const waiting = await createManualScenePlanDraft({
      repository, saveId: 'save_regenerate', planningInput: data.input, planningOutput: data.output,
      promptOutputs: data.prompts, world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(), createId: () => String(++id)
    });
    const confirmed = await confirmManualScenePlan({
      repository,
      draft: waiting,
      edits: [{ shotId: waiting.plan.shots[0]!.shotId, positivePrompt: '玩家冻结的原提示词', negativePrompt: '原负向词' }]
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const sourceSnapshot = await repository.loadSnapshot('save_regenerate');
    const sourceTask = sourceSnapshot.tasks[confirmed.tasks[0].taskId]!;
    const regeneration = await createSceneShotRegenerationDraft({
      repository,
      sourcePlan: waiting.plan,
      sourceShotId: waiting.plan.shots[0]!.shotId,
      sourceTask,
      execution: execution(),
      createId: () => String(++id)
    });
    expect(regeneration.plan).toMatchObject({
      displayOperation: 'replace-shot', replacementTargetShotId: waiting.plan.shots[0]!.shotId
    });
    expect(regeneration.tasks[0]).toMatchObject({ source: 'regenerate', sourceTaskId: sourceTask.taskId });
    expect(regeneration.tasks[0].draft?.positivePrompt).toBe('玩家冻结的原提示词');
    const regenerationConfirmed = await confirmManualScenePlan({
      repository,
      draft: regeneration,
      edits: [{
        shotId: regeneration.plan.shots[0]!.shotId,
        positivePrompt: regeneration.tasks[0].draft!.positivePrompt,
        negativePrompt: regeneration.tasks[0].draft!.negativePrompt
      }]
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed: regenerationConfirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const finalSnapshot = await repository.loadSnapshot('save_regenerate');
    expect(finalSnapshot.storySceneDisplayStates.turn_7.activeShotIds).toEqual([regeneration.plan.shots[0]!.shotId]);
  });

  it('keeps a scene prompt reuse out of storage until confirmation, then replaces only after success', async () => {
    const repository = new IndexedDbVisualRepository(`scene-reuse-prompt-${crypto.randomUUID()}`);
    const data = await planning();
    let id = 0;
    const waiting = await createManualScenePlanDraft({
      repository,
      saveId: 'save_scene_reuse',
      planningInput: data.input,
      planningOutput: data.output,
      promptOutputs: data.prompts,
      world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(),
      createId: () => String(++id)
    });
    const confirmed = await confirmManualScenePlan({
      repository,
      draft: waiting,
      edits: [{
        shotId: waiting.plan.shots[0]!.shotId,
        positivePrompt: '原场景最终正向词',
        negativePrompt: '原场景最终负向词'
      }]
    });
    await executeConfirmedScenePlan({
      repository,
      confirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const beforeReuse = await repository.loadSnapshot('save_scene_reuse');
    const sourceTask = beforeReuse.tasks[confirmed.tasks[0].taskId]!;
    const sourceAssetIds = Object.keys(beforeReuse.assets);
    const reuse = await createSceneShotRegenerationDraft({
      repository,
      sourcePlan: waiting.plan,
      sourceShotId: waiting.plan.shots[0]!.shotId,
      sourceTask,
      execution: { ...execution(), imageProfileId: 'profile_current' },
      taskSource: 'reuse-prompt',
      persistDraft: false,
      createId: () => String(++id)
    });
    const afterPreview = await repository.loadSnapshot('save_scene_reuse');
    expect(Object.keys(afterPreview.tasks)).toEqual(Object.keys(beforeReuse.tasks));
    expect(afterPreview.scenePlans[reuse.plan.planId]).toBeUndefined();
    expect(reuse.tasks[0]).toMatchObject({
      source: 'reuse-prompt',
      sourceTaskId: sourceTask.taskId,
      status: 'awaiting-confirmation'
    });
    expect(reuse.tasks[0].draft).toMatchObject({
      imageProfileId: 'profile_current',
      positivePrompt: '原场景最终正向词',
      negativePrompt: '原场景最终负向词'
    });

    const reuseConfirmed = await confirmManualScenePlan({
      repository,
      draft: reuse,
      persistPlanOnConfirmation: true,
      edits: [{
        shotId: reuse.plan.shots[0]!.shotId,
        positivePrompt: '玩家复用后修改的场景正向词',
        negativePrompt: '玩家复用后修改的场景负向词'
      }]
    });
    const afterConfirmation = await repository.loadSnapshot('save_scene_reuse');
    expect(afterConfirmation.scenePlans[reuse.plan.planId]).toBeDefined();
    expect(afterConfirmation.tasks[reuseConfirmed.tasks[0].taskId]?.status).toBe('queued');

    await executeConfirmedScenePlan({
      repository,
      confirmed: reuseConfirmed,
      executor: { generate: vi.fn().mockResolvedValue([{ blob: new Blob([TEST_PNG_BYTES]), width: 1, height: 1 }]) },
      createId: () => String(++id)
    });
    const afterExecution = await repository.loadSnapshot('save_scene_reuse');
    expect(Object.keys(afterExecution.assets)).toHaveLength(sourceAssetIds.length + 1);
    expect(sourceAssetIds.every((imageId) => afterExecution.assets[imageId])).toBe(true);
    expect(afterExecution.storySceneDisplayStates.turn_7.activeShotIds).toEqual([reuse.plan.shots[0]!.shotId]);
  });

  it('rejects an empty execution batch before creating a pending display replacement', async () => {
    const repository = new IndexedDbVisualRepository(`scene-empty-${crypto.randomUUID()}`);
    const data = await planning();
    const waiting = await createManualScenePlanDraft({
      repository,
      saveId: 'save_empty',
      planningInput: data.input,
      planningOutput: data.output,
      promptOutputs: data.prompts,
      world: { year: 1988, region: '香港', visualStyle: '犯罪剧情写实电影感' },
      execution: execution(),
      displayOperation: 'replace-group'
    });

    await expect(executeConfirmedScenePlan({
      repository,
      confirmed: { plan: waiting.plan, tasks: [] },
      executor: { generate: vi.fn() }
    })).rejects.toThrow('场景计划没有可执行的图片任务。');

    const snapshot = await repository.loadSnapshot('save_empty');
    expect(snapshot.storySceneDisplayStates.turn_7).toBeUndefined();
  });
});

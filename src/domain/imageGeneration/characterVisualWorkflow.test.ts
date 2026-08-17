import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultImageApiProfile, type ComfyWorkflowTemplate, type ImageApiProfile } from './profile';
import {
  confirmManualCharacterBatch,
  createBuiltInCharacterDraftExecutionConfig,
  createCharacterPromptReuseDraft,
  createFailedCharacterBatchRetryDraft,
  createManualCharacterBatchDraft,
  executeConfirmedCharacterBatch
} from './characterVisualWorkflow';
import { CHARACTER_VISUAL_PURPOSES, type CharacterViewPrompt } from './promptConversion';
import {
  createDefaultPngStyleLibrarySettings,
  createPngStyleImportDraft
} from './pngStyle';
import { TEST_ANCHOR, TEST_PNG_BYTES, createDraft, createPersistingTask } from './visualRepository/testFixtures';
import { IndexedDbVisualRepository, type CharacterVisualAnchor } from './visualRepository';

const anchor: CharacterVisualAnchor = {
  anchorId: 'anchor_actor_mei',
  saveId: 'save_a',
  actorId: 'actor_mei',
  anchorText: TEST_ANCHOR,
  persistentAdditionalRequirementText: '保留红色发夹',
  source: 'user-edited',
  sourceImageIds: ['image_anchor_source'],
  updatedAt: '2026-07-23T00:00:00.000Z'
};

const views: CharacterViewPrompt[] = CHARACTER_VISUAL_PURPOSES.map((purpose) => ({
  purpose,
  basePositive: `base positive ${purpose}`,
  baseNegative: `base negative ${purpose}`,
  appearanceSource: 'anchor-default',
  resolvedAppearancePositive: 'dark jacket',
  resolvedAdditionalPositive: 'red hair clip',
  resolvedAdditionalNegative: 'missing hair clip'
}));

function execution() {
  const { intentId: _intentId, positivePrompt: _positive, negativePrompt: _negative, sourceAnchorHashes: _hashes, compiledAt: _compiled, ...config } = createDraft('placeholder');
  return config;
}

describe('character visual workflow', () => {
  it('previews a prompt reuse in memory and only persists a new linked task after confirmation', async () => {
    const sourceTask = createPersistingTask('task_source_prompt', 'half-body-medium');
    let nextId = 0;
    const waiting = await createCharacterPromptReuseDraft({
      sourceTask,
      execution: {
        ...execution(),
        imageProfileId: 'profile_current',
        executionTarget: { kind: 'model', modelId: 'current-model' }
      },
      now: '2026-07-23T00:10:00.000Z',
      createId: () => String(++nextId)
    });

    expect(waiting.batch).toMatchObject({
      source: 'manual-reuse-prompt',
      status: 'awaiting-confirmation',
      selectedPurposes: ['half-body-medium']
    });
    expect(waiting.tasks[0]).toMatchObject({
      source: 'reuse-prompt',
      sourceTaskId: sourceTask.taskId,
      status: 'awaiting-confirmation'
    });
    expect(waiting.tasks[0].draft).toMatchObject({
      imageProfileId: 'profile_current',
      executionTarget: { kind: 'model', modelId: 'current-model' },
      positivePrompt: sourceTask.submittedRequest?.positivePrompt,
      negativePrompt: sourceTask.submittedRequest?.negativePrompt
    });

    const saveCharacterBatchWithTasks = vi.fn(async () => undefined);
    const confirmed = await confirmManualCharacterBatch({
      repository: { saveCharacterBatchWithTasks },
      draft: waiting,
      edits: [{
        purpose: 'half-body-medium',
        positivePrompt: '玩家复用后修改的正向词',
        negativePrompt: '玩家复用后修改的负向词'
      }],
      now: '2026-07-23T00:11:00.000Z'
    });

    expect(saveCharacterBatchWithTasks).toHaveBeenCalledTimes(1);
    expect(confirmed.tasks[0].submittedRequest).toMatchObject({
      positivePrompt: '玩家复用后修改的正向词',
      negativePrompt: '玩家复用后修改的负向词',
      userEdited: true
    });
  });

  it('creates four editable manual drafts and freezes exactly the prompts the player confirmed', async () => {
    const saveCharacterBatchWithTasks = vi.fn().mockResolvedValue(undefined);
    let nextId = 0;
    const draft = await createManualCharacterBatchDraft({
      repository: { saveCharacterBatchWithTasks },
      anchor,
      views,
      purposes: [...CHARACTER_VISUAL_PURPOSES],
      compositions: {
        'avatar-close-up': { viewAngle: 'three-quarter-left', cameraElevation: 'eye-level' }
      },
      additionalRequirementText: '保留红色发夹',
      additionalRequirementMode: 'persistent',
      execution: execution(),
      now: '2026-07-23T00:01:00.000Z',
      createId: () => String(++nextId)
    });

    expect(draft.tasks).toHaveLength(4);
    expect(draft.tasks.every((task) => task.status === 'awaiting-confirmation')).toBe(true);
    expect(draft.tasks[0].intent).toMatchObject({
      anchorSnapshot: TEST_ANCHOR,
      additionalRequirementMode: 'persistent',
      appearanceSource: 'anchor-default',
      anchorSourceImageIds: ['image_anchor_source'],
      referenceImageIds: []
    });
    expect(draft.tasks[0].draft?.positivePrompt.split('\n')).toEqual([
      'base positive avatar-close-up',
      'dark jacket',
      '左前方四分之三视角，人物略微转向画面右侧',
      '镜头与人物视线大致平齐',
      'red hair clip'
    ]);
    expect(draft.tasks[0].draft?.semanticPromptSegments).toEqual(expect.arrayContaining([
      expect.objectContaining({ segmentId: 'character-appearance:current', priority: 60 }),
      expect.objectContaining({
        segmentId: 'persistent-requirement:character',
        kind: 'persistent-requirement'
      })
    ]));
    expect(draft.tasks[0].draft?.characterComposition).toEqual({
      viewAngle: 'three-quarter-left',
      cameraElevation: 'eye-level'
    });
    expect(draft.tasks[1].draft?.characterComposition).toEqual({
      viewAngle: 'auto',
      cameraElevation: 'auto'
    });

    const edits = draft.tasks.map((task) => ({
      purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium' as const,
      positivePrompt: `${task.draft!.positivePrompt}\nplayer final edit`,
      negativePrompt: task.draft!.negativePrompt
    }));
    const confirmed = await confirmManualCharacterBatch({
      repository: { saveCharacterBatchWithTasks },
      draft,
      edits,
      now: '2026-07-23T00:02:00.000Z'
    });

    expect(confirmed.batch.status).toBe('running');
    expect(confirmed.tasks.every((task) => task.status === 'queued')).toBe(true);
    expect(confirmed.tasks[0].submittedRequest).toMatchObject({
      positivePrompt: expect.stringContaining('player final edit'),
      userEdited: true
    });
    expect(saveCharacterBatchWithTasks).toHaveBeenCalledTimes(2);
  });

  it('freezes PNG style provenance and literal artist syntax into a tag-provider task draft', async () => {
    const pngStyleSettings = createDefaultPngStyleLibrarySettings('2026-07-29T00:00:00.000Z');
    const imported = createPngStyleImportDraft({
      parsed: {
        source: 'novelai',
        positivePrompt: '(by wlop:1.2), soft shading',
        negativePrompt: 'lowres',
        rawMetadata: '',
        warnings: []
      },
      imageHash: 'd'.repeat(64),
      fileName: 'style.png',
      now: '2026-07-29T00:00:00.000Z',
      createId: () => 'trace'
    });
    pngStyleSettings.presets = [imported.preset];
    pngStyleSettings.selection.characterPngStylePresetId = imported.preset.pngStylePresetId;
    let nextId = 0;
    const draft = await createManualCharacterBatchDraft({
      repository: { saveCharacterBatchWithTasks: vi.fn().mockResolvedValue(undefined) },
      anchor,
      views: views.slice(0, 1),
      purposes: ['avatar-close-up'],
      additionalRequirementText: '',
      additionalRequirementMode: 'none',
      pngStyleSettings,
      execution: {
        ...execution(),
        promptDialectPresetId: 'builtin-dialect-novelai',
        promptDialectFamily: 'novelai',
        negativePromptMode: 'separate'
      },
      now: '2026-07-29T00:01:00.000Z',
      createId: () => String(++nextId)
    });
    const pngSegment = draft.tasks[0]?.draft?.semanticPromptSegments?.find(
      (segment) => segment.kind === 'artist-style'
    );
    expect(pngSegment).toMatchObject({
      positive: '(by wlop:1.2), soft shading',
      renderPolicy: 'preserve-literal',
      provenance: {
        kind: 'png-style',
        presetId: imported.preset.pngStylePresetId,
        imageHash: 'd'.repeat(64),
        parserVersion: 1
      }
    });
    expect(draft.tasks[0]?.draft?.positivePrompt).toContain('(by wlop:1.2)');
  });

  it('runs a confirmed batch through a mock executor and persists four independent visual assets', async () => {
    const repository = new IndexedDbVisualRepository(`character-executor-${crypto.randomUUID()}`);
    let nextId = 0;
    const waiting = await createManualCharacterBatchDraft({
      repository,
      anchor,
      views,
      purposes: [...CHARACTER_VISUAL_PURPOSES],
      additionalRequirementText: '',
      additionalRequirementMode: 'none',
      execution: execution(),
      now: '2026-07-23T00:01:00.000Z',
      createId: () => String(++nextId)
    });
    const confirmed = await confirmManualCharacterBatch({
      repository,
      draft: waiting,
      edits: waiting.tasks.map((task) => ({
        purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium',
        positivePrompt: task.draft!.positivePrompt,
        negativePrompt: task.draft!.negativePrompt
      })),
      now: '2026-07-23T00:02:00.000Z'
    });
    const times = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    const batch = await executeConfirmedCharacterBatch({
      repository,
      confirmed,
      executor: {
        generate: vi.fn().mockResolvedValue([{
          blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }), width: 1, height: 1
        }])
      },
      now: () => `2026-07-23T00:${String(times.shift() ?? 59).padStart(2, '0')}:00.000Z`,
      createId: () => String(++nextId)
    });
    const snapshot = await repository.loadSnapshot('save_a');

    expect(batch.status).toBe('succeeded');
    expect(Object.keys(snapshot.assets)).toHaveLength(4);
    expect(Object.keys(snapshot.bindings)).toHaveLength(4);
    expect(Object.values(snapshot.tasks).every((task) => task.status === 'succeeded')).toBe(true);
  });

  it('builds typed purpose-specific execution presets for every supported provider', async () => {
    const ratios = {
      'avatar-close-up': '1:1',
      'half-body-medium': '3:4',
      'knee-up-medium-full': '2:3',
      'full-body': '9:16'
    } as const;
    const providers = [
      'openai-images', 'xai-images', 'gemini-image', 'alibaba-model-studio',
      'novelai-image', 'sd-webui'
    ] as const;
    for (const provider of providers) {
      const base = createDefaultImageApiProfile(provider, `profile_${provider}`, '2026-07-23T00:00:00.000Z');
      const profile = {
        ...base,
        enabled: true,
        models: [{ modelId: `model_${provider}`, source: 'manual' as const }],
        defaultModelId: `model_${provider}`
      } as ImageApiProfile;
      const fingerprints = [];
      for (const purpose of CHARACTER_VISUAL_PURPOSES) {
        const config = await createBuiltInCharacterDraftExecutionConfig({ profile, purpose });
        expect(config).toMatchObject({ providerType: provider, targetAspectRatio: ratios[purpose] });
        expect(config.executionTarget).toEqual({ kind: 'model', modelId: `model_${provider}` });
        expect(config.imageGenerationPresetId).toContain(purpose);
        fingerprints.push(config.executionFingerprint);
      }
      expect(new Set(fingerprints).size).toBe(4);
    }

    const comfy = { ...createDefaultImageApiProfile('comfyui-workflow'), enabled: true };
    const workflow: ComfyWorkflowTemplate = {
      workflowTemplateId: 'workflow_1', name: '人物立绘',
      apiWorkflow: {
        '4': {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'asianBlendIllustrious_v10.safetensors' }
        }
      },
      workflowHash: 'a'.repeat(64),
      bindings: {
        positivePrompt: { nodeId: '1', inputName: 'text' },
        checkpoint: { nodeId: '4', inputName: 'ckpt_name' }
      },
      outputNodeIds: ['2'], revision: 3,
      createdAt: '2026-07-23T00:00:00.000Z', updatedAt: '2026-07-23T00:00:00.000Z'
    };
    const config = await createBuiltInCharacterDraftExecutionConfig({
      profile: comfy,
      purpose: 'full-body',
      workflow
    });
    expect(config.executionTarget).toMatchObject({ kind: 'comfy-workflow', workflowRevision: 3 });
    expect(config.negativePromptMode).toBe('workflow-controlled');
    expect(config).toMatchObject({ targetAspectRatio: '9:16' });
    expect(config.promptDialectPresetId).toBe('builtin-dialect-illustrious');
    expect(config.generationParameters).toMatchObject({ overrides: { width: 576, height: 1024 } });

    const compatibleNaiBase = createDefaultImageApiProfile(
      'openai-images',
      'profile_openai_compatible_nai',
      '2026-07-23T00:00:00.000Z'
    );
    if (compatibleNaiBase.providerType !== 'openai-images') throw new Error('test profile type mismatch');
    const compatibleNai = {
      ...compatibleNaiBase,
      enabled: true,
      models: [{ modelId: 'nai-diffusion-4-5-curated', source: 'manual' as const }],
      defaultModelId: 'nai-diffusion-4-5-curated'
    };
    const incompatibleNaiExecution = await createBuiltInCharacterDraftExecutionConfig({
      profile: compatibleNai,
      purpose: 'half-body-medium'
    });
    expect(incompatibleNaiExecution).toMatchObject({
      promptDialectPresetId: 'builtin-dialect-novelai',
      promptDialectFamily: 'novelai',
      executionTarget: { kind: 'model', modelId: 'nai-diffusion-4-5-curated' }
    });
    await expect(createManualCharacterBatchDraft({
      repository: new IndexedDbVisualRepository(`nai-transport-gate-${crypto.randomUUID()}`),
      anchor,
      views: [views[1]!],
      purposes: ['half-body-medium'],
      additionalRequirementText: '',
      additionalRequirementMode: 'none',
      execution: incompatibleNaiExecution
    })).rejects.toThrow(/必须使用经过验证的独立负向提示词通道/);
  });

  it('keeps successful purposes, preserves failures, and retries only failed purposes after a new preview', async () => {
    const repository = new IndexedDbVisualRepository(`character-partial-${crypto.randomUUID()}`);
    let nextId = 0;
    const waiting = await createManualCharacterBatchDraft({
      repository, anchor, views: views.slice(0, 2), purposes: ['avatar-close-up', 'half-body-medium'],
      additionalRequirementText: '', additionalRequirementMode: 'none', execution: execution(),
      now: '2026-07-23T01:00:00.000Z', createId: () => String(++nextId)
    });
    const confirmed = await confirmManualCharacterBatch({
      repository,
      draft: waiting,
      edits: waiting.tasks.map((task) => ({
        purpose: task.intent.type === 'character-image' ? task.intent.purpose : 'half-body-medium',
        positivePrompt: task.draft!.positivePrompt,
        negativePrompt: task.draft!.negativePrompt
      })),
      now: '2026-07-23T01:01:00.000Z'
    });
    const batch = await executeConfirmedCharacterBatch({
      repository,
      confirmed,
      executor: {
        generate: vi.fn(async (task) => {
          if (task.intent.type === 'character-image' && task.intent.purpose === 'half-body-medium') {
            throw new Error('temporary provider failure');
          }
          return [{ blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }), width: 1, height: 1 }];
        })
      },
      createId: () => String(++nextId)
    });
    const failedSnapshot = await repository.loadSnapshot('save_a');
    expect(batch.status).toBe('partially-succeeded');
    expect(Object.keys(failedSnapshot.assets)).toHaveLength(1);
    expect(Object.values(failedSnapshot.bindings)).toHaveLength(1);

    const retry = await createFailedCharacterBatchRetryDraft({
      repository,
      previousBatch: batch,
      tasksById: failedSnapshot.tasks,
      now: '2026-07-23T01:05:00.000Z',
      createId: () => String(++nextId)
    });
    expect(retry.tasks).toHaveLength(1);
    expect(retry.tasks[0].intent).toMatchObject({ purpose: 'half-body-medium' });
    expect(retry.tasks[0].status).toBe('awaiting-confirmation');
    expect(retry.tasks[0].sourceTaskId).toBeTruthy();
    expect(retry.tasks[0].draft?.positivePrompt).toContain('base positive half-body-medium');
  });

  it('stores results that arrive after cancellation as unbound late assets', async () => {
    const repository = new IndexedDbVisualRepository(`character-late-${crypto.randomUUID()}`);
    let nextId = 0;
    const waiting = await createManualCharacterBatchDraft({
      repository, anchor, views: views.slice(0, 1), purposes: ['avatar-close-up'],
      additionalRequirementText: '', additionalRequirementMode: 'none', execution: execution(),
      createId: () => String(++nextId)
    });
    const confirmed = await confirmManualCharacterBatch({
      repository,
      draft: waiting,
      edits: [{ purpose: 'avatar-close-up', positivePrompt: waiting.tasks[0].draft!.positivePrompt, negativePrompt: '' }]
    });
    const controller = new AbortController();
    const batch = await executeConfirmedCharacterBatch({
      repository,
      confirmed,
      signal: controller.signal,
      executor: {
        generate: vi.fn(async () => {
          controller.abort();
          return [{ blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }), width: 1, height: 1 }];
        })
      },
      createId: () => String(++nextId)
    });
    const snapshot = await repository.loadSnapshot('save_a');
    expect(batch.status).toBe('cancelled');
    expect(Object.values(snapshot.assets)).toHaveLength(1);
    expect(Object.values(snapshot.assets)[0].lateResultOfTaskId).toBe(confirmed.tasks[0].taskId);
    expect(Object.keys(snapshot.bindings)).toHaveLength(0);
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { CharacterImageRuntimeExecutor } from './characterImageRuntimeExecutor';
import {
  BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS,
  ImagePromptConversionProbe,
  compileFormattedProviderPrompt,
  createProviderPromptRenderInput,
  createStoryVisualBlocks,
  hashStoryText,
  type ProviderPromptRenderInput,
  type SceneShotPromptInput,
  type TurnScenePlanningInput
} from './promptConversion';
import {
  confirmManualScenePlan,
  createBuiltInSceneDraftExecutionConfig,
  createManualScenePlanDraft,
  executeConfirmedScenePlan
} from './sceneVisualWorkflow';
import {
  createDefaultImageApiProfile,
  type ImageApiCredential,
  type ImageApiProfile
} from './profile';
import { IndexedDbVisualRepository } from './visualRepository';
import { TEST_PNG_BYTES } from './visualRepository/testFixtures';

const now = '2026-07-30T04:00:00.000Z';

function readPromptInput<T>(prompt: string): T {
  const marker = '输入资料：\n';
  const position = prompt.lastIndexOf(marker);
  if (position < 0) throw new Error('测试提示词没有输入资料标记。');
  return JSON.parse(prompt.slice(position + marker.length)) as T;
}

describe('正文场景图到 OpenAI Images 链路', () => {
  it('本地恢复轻微场景规划偏差后，冻结请求并调用 /images/generations', async () => {
    const storyText = '【旁白】夜班巴士驶过弥敦道，雨后的霓虹映在车窗上。';
    const blocks = await createStoryVisualBlocks('turn_gpt_image_2', storyText);
    const planningInput: TurnScenePlanningInput = {
      sourceTurnId: 'turn_gpt_image_2',
      sourceStoryTextHash: await hashStoryText(storyText),
      mode: 'manual',
      requestedMaxScenes: 1,
      storyText,
      blocks,
      frozenContext: {
        timeDescription: '1988年9月12日 22:00',
        locationDescription: '旺角弥敦道',
        weatherDescription: '雨后多云',
        presentActorIds: []
      },
      actors: [],
      manualInstruction: '不要生成文字或水印'
    };

    const textClient: NarratorClient = {
      complete: vi.fn(async (promptInput) => {
        const prompt = String(promptInput);
        if (prompt.includes('从本回合正文中选择 0 到 requestedMaxScenes 个值得生成的场景镜头')) {
          return {
            scenes: [{
              blockIndex: '0',
              summary: '雨后霓虹映在夜班巴士车窗上',
              characters: null,
              location: '1988年的旺角弥敦道',
              action: '夜班巴士驶过雨后的街道',
              mood: '潮湿、克制、城市夜色',
              camera: '16:9 街景中远景',
              ignoredExtraField: '模型多出的解释字段'
            }]
          };
        }
        if (prompt.includes('已冻结的场景镜头和参与者锚点')) {
          return {
            basePositive: '1988 Hong Kong, Mong Kok night bus, wet neon reflections',
            baseNegative: 'modern vehicles, readable text, watermark',
            participantResolutions: [],
            resolvedOneTimePositive: 'no text or watermark',
            resolvedOneTimeNegative: ''
          };
        }
        if (prompt.includes('逐段转换成指定模型提示词格式')) {
          const input = readPromptInput<ProviderPromptRenderInput>(prompt);
          return {
            segments: input.segments.map((segment) => ({
              segmentId: segment.segmentId,
              positive: segment.positive ? `OpenAI visual brief: ${segment.positive}` : '',
              negative: segment.negative ? `Avoid: ${segment.negative}` : ''
            }))
          };
        }
        throw new Error('测试遇到未识别的提示词转换任务。');
      })
    };
    const converter = new ImagePromptConversionProbe(textClient);
    const planningOutput = await converter.planTurnScenes(planningInput);
    expect(planningOutput.shots).toEqual([
      expect.objectContaining({
        placement: {
          blockIndex: 0,
          blockHash: blocks[0]!.blockHash
        },
        order: 0,
        knownActorIds: [],
        actorVisualStates: [],
        unboundCharacterDescriptions: []
      })
    ]);

    const promptOutputs = await Promise.all(planningOutput.shots.map((shot) => {
      const input: SceneShotPromptInput = {
        shot,
        participants: [],
        world: {
          year: 1988,
          region: '香港',
          visualStyle: '香港犯罪剧情写实电影感'
        },
        oneTimeInstruction: planningInput.manualInstruction
      };
      return converter.generateSceneShotPrompt(input);
    }));

    const profile = {
      ...createDefaultImageApiProfile('openai-images', 'profile_gpt_image_2', now),
      enabled: true,
      credentialId: 'credential_gpt_image_2',
      models: [{ modelId: 'gpt-image-2', source: 'manual' as const }],
      defaultModelId: 'gpt-image-2'
    } as ImageApiProfile;
    const credential: ImageApiCredential = {
      credentialId: 'credential_gpt_image_2',
      label: '本地链路测试凭据',
      providerAffinity: 'openai-images',
      material: { kind: 'bearer-token', token: 'local-chain-test-token' },
      revision: 1,
      createdAt: now,
      updatedAt: now
    };
    const execution = await createBuiltInSceneDraftExecutionConfig({
      profile,
      credential: {
        credentialId: credential.credentialId,
        revision: credential.revision
      }
    });
    const dialect = BUILT_IN_IMAGE_PROMPT_DIALECT_PRESETS.find(
      (candidate) => candidate.dialectPresetId === execution.promptDialectPresetId
    );
    expect(dialect?.dialectPresetId).toBe('builtin-dialect-openai-gpt-image');

    const repository = new IndexedDbVisualRepository(
      `scene-openai-chain-${crypto.randomUUID()}`
    );
    let nextId = 0;
    const draft = await createManualScenePlanDraft({
      repository,
      saveId: 'save_gpt_image_2',
      planningInput,
      planningOutput,
      promptOutputs,
      world: {
        year: 1988,
        region: '香港',
        visualStyle: '香港犯罪剧情写实电影感'
      },
      execution,
      oneTimeInstruction: planningInput.manualInstruction,
      renderPrompt: async ({ semanticPrompt }) => {
        if (!dialect) throw new Error('缺少 OpenAI GPT Image 提示词格式。');
        const output = await converter.renderProviderPrompt(
          createProviderPromptRenderInput(semanticPrompt, dialect)
        );
        return compileFormattedProviderPrompt(semanticPrompt, dialect, output);
      },
      now,
      createId: () => String(++nextId)
    });
    expect(draft.tasks).toHaveLength(1);
    expect(draft.tasks[0]).toMatchObject({ status: 'awaiting-confirmation' });
    expect(draft.tasks[0]!.submittedRequest).toBeUndefined();
    expect(draft.tasks[0]!.draft?.positivePrompt).toContain(
      'Create one production-ready game narrative illustration'
    );

    const confirmed = await confirmManualScenePlan({
      repository,
      draft,
      edits: [{
        shotId: draft.plan.shots[0]!.shotId,
        positivePrompt: draft.tasks[0]!.draft!.positivePrompt,
        negativePrompt: draft.tasks[0]!.draft!.negativePrompt
      }],
      now
    });

    const base64 = btoa(String.fromCharCode(...TEST_PNG_BYTES));
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ data: [{ b64_json: base64 }] }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    ));
    const executor = new CharacterImageRuntimeExecutor({
      profiles: {
        getProfile: vi.fn().mockResolvedValue(profile),
        getWorkflowTemplate: vi.fn().mockResolvedValue(null)
      } as never,
      credentials: {
        resolveCredential: vi.fn().mockResolvedValue(credential)
      } as never,
      verificationStore: {
        listRecords: vi.fn().mockResolvedValue([])
      } as never,
      visualRepository: repository,
      fetch: fetchMock,
      pageUrl: () => 'https://game.example.test/',
      decodeDimensions: vi.fn().mockResolvedValue({ width: 1536, height: 1024 })
    });

    const display = await executeConfirmedScenePlan({
      repository,
      confirmed,
      executor,
      now: () => now,
      createId: () => String(++nextId)
    });
    const snapshot = await repository.loadSnapshot('save_gpt_image_2');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/images/generations');
    const requestBody = JSON.parse(String(request.body)) as {
      model: string;
      prompt: string;
      size: string;
    };
    expect(requestBody).toMatchObject({
      model: 'gpt-image-2',
      size: '1536x1024'
    });
    expect(requestBody.prompt).toContain('OpenAI visual brief');
    expect(display.activeShotIds).toEqual([draft.plan.shots[0]!.shotId]);
    expect(Object.values(snapshot.assets)).toHaveLength(1);
    expect(Object.values(snapshot.tasks)[0]).toMatchObject({
      status: 'succeeded',
      submittedRequest: {
        imageProfileId: 'profile_gpt_image_2',
        executionTarget: {
          kind: 'model',
          modelId: 'gpt-image-2'
        }
      }
    });
    expect(textClient.complete).toHaveBeenCalledTimes(3);
  });
});

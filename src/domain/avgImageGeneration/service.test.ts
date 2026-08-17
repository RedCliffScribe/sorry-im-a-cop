import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbImageGenerationPresetRepository } from '../imageGeneration/generationPresets';
import { IndexedDbPngStyleRepository } from '../imageGeneration/pngStyle';
import {
  createComfyWorkflowHash,
  createDefaultImageApiProfile,
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  type ComfyWorkflowTemplate
} from '../imageGeneration/profile';
import { IndexedDbImagePromptTemplateRepository } from '../imageGeneration/promptConversion';
import { IndexedDbVisualRepository } from '../imageGeneration/visualRepository';
import { TEST_PNG_BYTES } from '../imageGeneration/visualRepository/testFixtures';
import { AvgImageGenerationService } from './service';

async function serviceFixture() {
  const suffix = crypto.randomUUID();
  const visualRepository = new IndexedDbVisualRepository(`avg-image-candidate-${suffix}`);
  const profileRepository = new IndexedDbImageProfileRepository(`avg-image-profile-${suffix}`);
  const credentialRepository = new IndexedDbImageCredentialRepository(`avg-image-credential-${suffix}`);
  const apiWorkflow = {
    '1': { class_type: 'CLIPTextEncode', inputs: { text: '' } },
    '2': { class_type: 'SaveImage', inputs: { filename_prefix: 'avg-test' } }
  };
  const bindings = { positivePrompt: { nodeId: '1', inputName: 'text' } };
  const outputNodeIds = ['2'];
  const workflow: ComfyWorkflowTemplate = {
    workflowTemplateId: `workflow-${suffix}`,
    name: 'AVG local candidate test',
    apiWorkflow,
    workflowHash: await createComfyWorkflowHash({ apiWorkflow, bindings, outputNodeIds }),
    bindings,
    outputNodeIds,
    revision: 1,
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z'
  };
  const profile = {
    ...createDefaultImageApiProfile('comfyui-workflow', `profile-${suffix}`, '2026-08-10T00:00:00.000Z'),
    name: 'yuqing tianbohe fixture',
    enabled: true
  };
  await profileRepository.putProfile(profile);
  await profileRepository.putWorkflowTemplate(workflow);
  const executor = {
    generate: vi.fn().mockResolvedValue([{
      blob: new Blob([TEST_PNG_BYTES], { type: 'image/png' }),
      width: 1024,
      height: 1536
    }])
  };
  const onRepositoryChanged = vi.fn();
  const service = new AvgImageGenerationService({
    visualRepository,
    profileRepository,
    credentialRepository,
    promptTemplateRepository: new IndexedDbImagePromptTemplateRepository(`avg-image-prompt-${suffix}`),
    generationPresetRepository: new IndexedDbImageGenerationPresetRepository(`avg-image-preset-${suffix}`),
    pngStyleRepository: new IndexedDbPngStyleRepository(`avg-image-png-style-${suffix}`),
    executor,
    onRepositoryChanged
  });
  return { service, visualRepository, profile, workflow, executor, onRepositoryChanged };
}

describe('AvgImageGenerationService', () => {
  it('creates a portrait candidate in the existing visual history without binding or auto-overriding it', async () => {
    const fixture = await serviceFixture();
    const candidate = await fixture.service.generatePortrait('partition-a', {
      worldpackId: 'hk1988',
      worldYear: 1988,
      actorId: 'actor-mei',
      targetKey: 'actor:actor-mei',
      identityLabel: '陈美',
      gender: 'female',
      visualAge: 'adult woman in her late twenties',
      appearance: 'East Asian face, long black hair, realistic skin texture',
      bodyDescription: 'tall curvy silhouette',
      roleDescription: 'CID detective',
      clothingDescription: 'fitted burgundy 1980s suit'
    }, {
      profileId: fixture.profile.profileId,
      workflowTemplateId: fixture.workflow.workflowTemplateId
    });

    const snapshot = await fixture.visualRepository.loadSnapshot('partition-a');
    expect(candidate).toMatchObject({
      purpose: 'avg_character_portrait',
      targetKey: 'actor:actor-mei',
      profileName: 'yuqing tianbohe fixture',
      providerType: 'comfyui-workflow'
    });
    expect(candidate.positivePrompt).toContain('neutral natural expression');
    expect(candidate.positivePrompt).not.toMatch(/\bsilhouettes?\b/iu);
    expect(candidate.positivePrompt).toContain('visible facial features and eyes');
    expect(candidate.negativePrompt).toContain('black silhouette');
    expect(snapshot.tasks[candidate.taskId]?.intent).toMatchObject({
      generationPurpose: 'avg_character_portrait',
      generationTargetKey: 'actor:actor-mei'
    });
    expect(Object.keys(snapshot.assets)).toHaveLength(1);
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.storySceneDisplayStates).toEqual({});
    expect(fixture.onRepositoryChanged).toHaveBeenCalledOnce();
    await expect(fixture.service.findLatestCandidate(
      'partition-a', 'avg_character_portrait', 'actor:actor-mei'
    )).resolves.toMatchObject({ taskId: candidate.taskId });
  });

  it('creates a scene candidate without changing story scene display state or scene bindings', async () => {
    const fixture = await serviceFixture();
    const candidate = await fixture.service.generateScene('partition-b', {
      worldpackId: 'hk1988',
      worldYear: 1988,
      targetKey: 'runtime_scene:scene-cid',
      anchor: { type: 'runtime_scene', id: 'scene-cid' },
      locationName: 'CID办公室',
      district: 'Mong Kok',
      placeType: 'police office',
      stableDescription: 'late colonial office with desks and filing cabinets',
      exposure: 'indoor',
      stableSceneTags: ['police', 'cid', 'office']
    }, {
      profileId: fixture.profile.profileId,
      workflowTemplateId: fixture.workflow.workflowTemplateId
    });

    const snapshot = await fixture.visualRepository.loadSnapshot('partition-b');
    expect(candidate).toMatchObject({
      purpose: 'avg_scene_background',
      targetKey: 'runtime_scene:scene-cid'
    });
    expect(candidate.positivePrompt).toContain('landscape 16:9 composition');
    expect(snapshot.tasks[candidate.taskId]?.intent).toMatchObject({
      generationPurpose: 'avg_scene_background',
      generationTargetKey: 'runtime_scene:scene-cid'
    });
    expect(Object.keys(snapshot.assets)).toHaveLength(1);
    expect(snapshot.bindings).toEqual({});
    expect(snapshot.storySceneDisplayStates).toEqual({});
  });

  it('stores outfit generation as a separate unbound candidate intent', async () => {
    const fixture = await serviceFixture();
    const candidate = await fixture.service.generatePortrait('partition-outfit', {
      worldpackId: 'hk1988',
      worldYear: 1988,
      actorId: 'actor-mei',
      targetKey: 'actor:actor-mei:outfit:user_outfit_evening',
      identityLabel: '陈美',
      appearance: 'East Asian face, long black hair, realistic skin texture',
      bodyDescription: 'tall curvy silhouette',
      generationPurpose: 'outfit',
      outfitId: 'user_outfit_evening',
      outfitDisplayName: '晚宴装',
      outfitDescription: '酒红色丝绒晚宴长裙，贴身剪裁'
    }, {
      profileId: fixture.profile.profileId,
      workflowTemplateId: fixture.workflow.workflowTemplateId
    });

    const snapshot = await fixture.visualRepository.loadSnapshot('partition-outfit');
    expect(candidate).toMatchObject({
      purpose: 'avg_character_outfit',
      targetKey: 'actor:actor-mei:outfit:user_outfit_evening'
    });
    expect(candidate.positivePrompt).toContain('酒红色丝绒晚宴长裙');
    expect(snapshot.tasks[candidate.taskId]?.intent).toMatchObject({
      generationPurpose: 'avg_character_outfit',
      generationTargetKey: 'actor:actor-mei:outfit:user_outfit_evening'
    });
    expect(snapshot.bindings).toEqual({});
  });
});

import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import { ImageAutomationCoordinator, detectAutomaticImageSubjects } from './ImageAutomationCoordinator';
import { createBuiltInCharacterDraftExecutionConfig } from './characterVisualWorkflow';
import { createDefaultImageAutomationSettings } from './automationSettings';
import { IndexedDbImageAutomationRuntimeRepository } from './automationRuntime';
import { CHARACTER_VISUAL_PURPOSES, IndexedDbImagePromptTemplateRepository, type ImagePromptConversionProbe, type TurnScenePlanningInput } from './promptConversion';
import {
  IndexedDbImageCredentialRepository,
  IndexedDbImageProfileRepository,
  createDefaultImageApiProfile,
  type OpenAiImagesProfile
} from './profile';
import { IndexedDbVisualRepository } from './visualRepository';
import { createBuiltInSceneDraftExecutionConfig } from './sceneVisualWorkflow';
import { TEST_ANCHOR, TEST_PNG_BYTES } from './visualRepository/testFixtures';
import { IndexedDbImageGenerationPresetRepository, createImageGenerationPreset } from './generationPresets';
import type { ImageGenerationVerificationRecord } from './probe';

function npc(actorId: string, visibility: 'public' | 'hidden' = 'public') {
  return createActorDefaults({
    actorId,
    name: actorId,
    gender: 'female',
    currentIdentity: 'civilian',
    visibility
  });
}

describe('automatic image coordination', () => {
  it('detects only newly visible non-player actors and new narrator turns', () => {
    const previous = createInitialRuntimeState();
    const current = {
      ...previous,
      actors: { ...previous.actors, npc_visible: npc('npc_visible'), npc_hidden: npc('npc_hidden', 'hidden') },
      storyLog: [
        ...previous.storyLog,
        { turnId: 'turn_player', speaker: 'player' as const, text: '行动', gameTime: previous.time },
        { turnId: 'turn_narrator', speaker: 'narrator' as const, text: '【旁白】雨夜。', gameTime: previous.time }
      ]
    };

    const subjects = detectAutomaticImageSubjects(previous, current);
    expect(subjects.actors.map((actor) => actor.actorId)).toEqual(['npc_visible']);
    expect(subjects.narratorEntries.map((entry) => entry.turnId)).toEqual(['turn_narrator']);
  });

  it('detects a rewritten narrator entry when rollback keeps the same turn id', () => {
    const previous = createInitialRuntimeState();
    const previousNarrator = previous.storyLog.find((entry) => entry.speaker === 'narrator')!;
    const current = {
      ...previous,
      storyLog: previous.storyLog.map((entry) => entry === previousNarrator
        ? { ...entry, text: '【旁白】回溯后生成了不同的正文。' }
        : entry)
    };

    const subjects = detectAutomaticImageSubjects(previous, current);

    expect(subjects.narratorEntries).toEqual([
      expect.objectContaining({
        turnId: previousNarrator.turnId,
        text: '【旁白】回溯后生成了不同的正文。'
      })
    ]);
  });

  it('detects an existing actor when they enter the scene or first speak in the rewritten turn', () => {
    const previous = createInitialRuntimeState();
    const existing = { ...npc('npc_existing'), name: '温碧霞', presence: 'absent' as const };
    const previousWithActor = {
      ...previous,
      actors: { ...previous.actors, [existing.actorId]: existing }
    };
    const current = {
      ...previousWithActor,
      actors: {
        ...previousWithActor.actors,
        [existing.actorId]: { ...existing, presence: 'present' as const }
      },
      storyLog: [...previousWithActor.storyLog, {
        turnId: 'turn_first_appearance',
        speaker: 'narrator' as const,
        text: '【温碧霞】你终于来了。',
        gameTime: previous.time,
        blocks: [{
          type: 'dialogue' as const,
          speakerLabel: '温碧霞',
          text: '你终于来了。',
          emotion: 'happy' as const
        }]
      }]
    };

    const subjects = detectAutomaticImageSubjects(previousWithActor, current);

    expect(subjects.actors.map((actor) => actor.actorId)).toEqual(['npc_existing']);
    expect(subjects.narratorEntries.map((entry) => entry.turnId)).toEqual(['turn_first_appearance']);
  });

  it('detects first dialogue appearance without repeating an unchanged established speaker', () => {
    const previous = createInitialRuntimeState();
    const existing = { ...npc('npc_existing'), name: '温碧霞', presence: 'present' as const };
    const previousWithActor = {
      ...previous,
      actors: { ...previous.actors, [existing.actorId]: existing }
    };
    const entry = {
      turnId: 'turn_dialogue_appearance',
      speaker: 'narrator' as const,
      text: '【温碧霞】第一次开口。',
      gameTime: previous.time,
      blocks: [{
        type: 'dialogue' as const,
        speakerLabel: '温碧霞',
        text: '第一次开口。',
        emotion: 'neutral' as const
      }]
    };
    const current = { ...previousWithActor, storyLog: [...previousWithActor.storyLog, entry] };

    expect(detectAutomaticImageSubjects(previousWithActor, current).actors.map((actor) => actor.actorId))
      .toEqual(['npc_existing']);
    expect(detectAutomaticImageSubjects(current, current).actors).toEqual([]);
  });

  it('hard-blocks before prompt conversion and retries only once before any provider submission', async () => {
    const profileRepository = new IndexedDbImageProfileRepository(`auto-profile-${crypto.randomUUID()}`);
    const profile = createDefaultImageApiProfile('openai-images', 'profile_auto') as OpenAiImagesProfile;
    profile.enabled = true;
    profile.models = [{ modelId: 'gpt-image-1', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-1';
    await profileRepository.putProfile(profile);
    const runtimeRepository = new IndexedDbImageAutomationRuntimeRepository(`auto-runtime-${crypto.randomUUID()}`);
    const createPromptConversion = vi.fn(() => null);
    const settings = {
      ...createDefaultImageAutomationSettings('2026-07-23T00:00:00.000Z'),
      characterMode: 'automatic' as const,
      sceneMode: 'off' as const,
      characterAutomaticProfileId: profile.profileId
    };
    const coordinator = new ImageAutomationCoordinator({
      visualRepository: new IndexedDbVisualRepository(`auto-visual-${crypto.randomUUID()}`),
      runtimeRepository,
      settingsRepository: { load: async () => settings, save: async () => undefined },
      profileRepository,
      credentialRepository: new IndexedDbImageCredentialRepository(`auto-credential-${crypto.randomUUID()}`),
      verificationStore: {
        saveOutcome: async () => undefined,
        listRecords: async () => [],
        getLatestArtifact: async () => null,
        clearProfile: async () => undefined,
        clearAll: async () => undefined
      },
      promptTemplateRepository: new IndexedDbImagePromptTemplateRepository(`auto-template-${crypto.randomUUID()}`),
      createPromptConversion,
      now: () => '2026-07-23T00:00:00.000Z'
    });
    const previous = createInitialRuntimeState();
    const current = { ...previous, actors: { ...previous.actors, npc_new: npc('npc_new') } };

    await coordinator.processTransition('save_auto', previous, current);
    await coordinator.processTransition('save_auto', previous, current);
    await coordinator.processTransition('save_auto', previous, current);

    const records = await runtimeRepository.listForSave('save_auto');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      status: 'blocked',
      blockerCode: 'runtime-evidence-missing',
      taskIds: [],
      retryCount: 1,
      maxRetries: 1
    });
    expect(createPromptConversion).not.toHaveBeenCalled();
  });

  it('uses the separate scene route and checks evidence only against that scene profile', async () => {
    const profileRepository = new IndexedDbImageProfileRepository(`auto-split-profile-${crypto.randomUUID()}`);
    const characterProfile = createDefaultImageApiProfile('openai-images', 'profile_character_default') as OpenAiImagesProfile;
    characterProfile.enabled = true;
    characterProfile.models = [{ modelId: 'gpt-image-character', source: 'manual' }];
    characterProfile.defaultModelId = 'gpt-image-character';
    const sceneProfile = createDefaultImageApiProfile('openai-images', 'profile_scene_separate') as OpenAiImagesProfile;
    sceneProfile.enabled = true;
    sceneProfile.models = [{ modelId: 'gpt-image-scene', source: 'manual' }];
    sceneProfile.defaultModelId = 'gpt-image-scene';
    await profileRepository.putProfile(characterProfile);
    await profileRepository.putProfile(sceneProfile);
    const sceneFingerprint = (await createBuiltInSceneDraftExecutionConfig({ profile: sceneProfile })).executionFingerprint;
    const sceneEvidence: ImageGenerationVerificationRecord = {
      verificationId: 'verification_scene_split', scope: 'runtime-profile' as const,
      profileId: sceneProfile.profileId, providerType: sceneProfile.providerType,
      verdict: 'real-passed' as const, adapterRevision: 'test', executionFingerprint: sceneFingerprint,
      environment: 'test-runner' as const, startedAt: '2026-07-23T00:00:00.000Z',
      completedAt: '2026-07-23T00:00:00.000Z',
      completedStages: ['local-validation', 'submit', 'download', 'decode', 'blob-persist'],
      safeSummary: 'scene route evidence'
    };
    const listRecords = vi.fn(async (profileId: string) => profileId === sceneProfile.profileId ? [sceneEvidence] : []);
    const converter = {
      planTurnScenes: vi.fn(async (input: TurnScenePlanningInput) => ({
        shots: [{
          placement: { blockIndex: input.blocks[0]!.blockIndex, blockHash: input.blocks[0]!.blockHash },
          order: 0, sceneSummary: '独立场景路由', knownActorIds: [], actorVisualStates: [],
          unboundCharacterDescriptions: [], locationDescription: '香港街头', actionDescription: '雨水落下',
          atmosphere: '危险', composition: '16:9 广角'
        }]
      })),
      generateSceneShotPrompt: vi.fn(async () => ({
        basePositive: 'separate scene profile', baseNegative: 'modern objects', participantResolutions: [],
        resolvedOneTimePositive: '', resolvedOneTimeNegative: ''
      })),
      renderProviderPrompt: vi.fn(async (input: {
        segments: Array<{ segmentId: string; positive: string; negative: string }>;
      }) => ({
        segments: input.segments.map((segment) => ({
          segmentId: segment.segmentId,
          positive: segment.positive,
          negative: segment.negative
        }))
      }))
    } as unknown as ImagePromptConversionProbe;
    const settings = {
      ...createDefaultImageAutomationSettings('2026-07-23T00:00:00.000Z'),
      characterMode: 'off' as const,
      sceneMode: 'automatic' as const,
      characterAutomaticProfileId: characterProfile.profileId,
      sceneAutomaticRouting: 'separate' as const,
      sceneAutomaticProfileId: sceneProfile.profileId
    };
    const visualRepository = new IndexedDbVisualRepository(`auto-split-visual-${crypto.randomUUID()}`);
    const runtimeRepository = new IndexedDbImageAutomationRuntimeRepository(`auto-split-runtime-${crypto.randomUUID()}`);
    const coordinator = new ImageAutomationCoordinator({
      visualRepository,
      runtimeRepository,
      settingsRepository: { load: async () => settings, save: async () => undefined },
      profileRepository,
      credentialRepository: new IndexedDbImageCredentialRepository(`auto-split-credential-${crypto.randomUUID()}`),
      verificationStore: {
        saveOutcome: async () => undefined, listRecords, getLatestArtifact: async () => null,
        clearProfile: async () => undefined, clearAll: async () => undefined
      },
      promptTemplateRepository: new IndexedDbImagePromptTemplateRepository(`auto-split-template-${crypto.randomUUID()}`),
      createPromptConversion: () => converter,
      createImageExecutor: () => ({ generate: vi.fn(async () => [{
        blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }), width: 1, height: 1
      }]) }),
      now: () => '2026-07-23T00:00:00.000Z'
    });
    const previous = createInitialRuntimeState();
    const current = {
      ...previous,
      storyLog: [...previous.storyLog, {
        turnId: 'turn_split_scene', speaker: 'narrator' as const, text: '【旁白】雨水落在香港街头。',
        gameTime: previous.time,
        visualContext: { timeDescription: '1988 年深夜', locationDescription: '香港街头', weatherDescription: '暴雨', presentActorIds: [] }
      }]
    };

    await coordinator.processTransition('save_split_scene', previous, current);

    const records = await runtimeRepository.listForSave('save_split_scene');
    const snapshot = await visualRepository.loadSnapshot('save_split_scene');
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: 'succeeded', profileId: sceneProfile.profileId });
    expect(Object.values(snapshot.tasks)[0]?.submittedRequest?.imageProfileId).toBe(sceneProfile.profileId);
    expect(listRecords).toHaveBeenCalledWith(sceneProfile.profileId);
    expect(listRecords).not.toHaveBeenCalledWith(characterProfile.profileId);
  });

  it('allows regenerated text with the same turn id to claim a separate automatic scene trigger', async () => {
    const profileRepository = new IndexedDbImageProfileRepository(`auto-regenerated-profile-${crypto.randomUUID()}`);
    const profile = createDefaultImageApiProfile('openai-images', 'profile_regenerated') as OpenAiImagesProfile;
    profile.enabled = true;
    profile.models = [{ modelId: 'gpt-image-1', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-1';
    await profileRepository.putProfile(profile);
    const runtimeRepository = new IndexedDbImageAutomationRuntimeRepository(`auto-regenerated-runtime-${crypto.randomUUID()}`);
    const createPromptConversion = vi.fn(() => null);
    const settings = {
      ...createDefaultImageAutomationSettings('2026-07-23T00:00:00.000Z'),
      characterMode: 'off' as const,
      sceneMode: 'automatic' as const,
      characterAutomaticProfileId: profile.profileId
    };
    const coordinator = new ImageAutomationCoordinator({
      visualRepository: new IndexedDbVisualRepository(`auto-regenerated-visual-${crypto.randomUUID()}`),
      runtimeRepository,
      settingsRepository: { load: async () => settings, save: async () => undefined },
      profileRepository,
      credentialRepository: new IndexedDbImageCredentialRepository(`auto-regenerated-credential-${crypto.randomUUID()}`),
      verificationStore: {
        saveOutcome: async () => undefined,
        listRecords: async () => [],
        getLatestArtifact: async () => null,
        clearProfile: async () => undefined,
        clearAll: async () => undefined
      },
      promptTemplateRepository: new IndexedDbImagePromptTemplateRepository(`auto-regenerated-template-${crypto.randomUUID()}`),
      createPromptConversion,
      now: () => '2026-07-23T00:00:00.000Z'
    });
    const restored = createInitialRuntimeState();
    const first = {
      ...restored,
      storyLog: [...restored.storyLog, {
        turnId: 'turn_0001',
        speaker: 'narrator' as const,
        text: '【旁白】第一次正文。',
        gameTime: restored.time,
        visualContext: {
          timeDescription: '1988 年夜晚',
          locationDescription: '香港街头',
          weatherDescription: '晴',
          presentActorIds: []
        }
      }]
    };
    const regenerated = {
      ...restored,
      storyLog: [...restored.storyLog, {
        ...first.storyLog.at(-1)!,
        text: '【旁白】回溯后重新生成的不同正文。'
      }]
    };

    await coordinator.processTransition('save_regenerated', restored, first);
    await coordinator.processTransition('save_regenerated', first, restored);
    await coordinator.processTransition('save_regenerated', restored, regenerated);

    const records = await runtimeRepository.listForSave('save_regenerated');
    expect(records).toHaveLength(2);
    expect(new Set(records.map((record) => record.sourceStoryTextHash)).size).toBe(2);
    expect(records.every((record) => record.status === 'blocked' && record.blockerCode === 'runtime-evidence-missing')).toBe(true);
    expect(createPromptConversion).not.toHaveBeenCalled();
  });

  it('runs new-actor and new-turn automation end to end with exact evidence and mock executors', async () => {
    const profileRepository = new IndexedDbImageProfileRepository(`auto-happy-profile-${crypto.randomUUID()}`);
    const profile = createDefaultImageApiProfile('openai-images', 'profile_auto_happy') as OpenAiImagesProfile;
    profile.enabled = true;
    profile.models = [{ modelId: 'gpt-image-1', source: 'manual' }];
    profile.defaultModelId = 'gpt-image-1';
    await profileRepository.putProfile(profile);
    const generationPresetRepository = new IndexedDbImageGenerationPresetRepository(`auto-happy-presets-${crypto.randomUUID()}`);
    const halfBodyPreset = createImageGenerationPreset({
      name: '自动半身像预设', profileId: profile.profileId, providerType: profile.providerType,
      variantKey: 'half-body-medium', routingTarget: { kind: 'model', modelId: 'gpt-image-1' },
      targetAspectRatio: '4:3',
      generationParameters: {
        providerType: 'openai-images', requestedImageCount: 2,
        size: { mode: 'dimensions', width: 1536, height: 1024 }, quality: 'high',
        outputFormat: 'webp', outputCompression: 78, background: 'opaque'
      },
      now: '2026-07-23T07:00:00.000Z'
    });
    await generationPresetRepository.save(halfBodyPreset);
    const characterFingerprints = await Promise.all(['avatar-close-up', 'half-body-medium'].map(async (purpose) => (
      await createBuiltInCharacterDraftExecutionConfig({
        profile,
        purpose: purpose as 'avatar-close-up' | 'half-body-medium',
        preset: purpose === 'half-body-medium' ? halfBodyPreset : undefined
      })
    ).executionFingerprint));
    const sceneFingerprint = (await createBuiltInSceneDraftExecutionConfig({ profile })).executionFingerprint;
    const verificationRecords = [...characterFingerprints, sceneFingerprint].map((executionFingerprint, index) => ({
      verificationId: `verification_${index}`,
      scope: 'runtime-profile' as const,
      profileId: profile.profileId,
      providerType: profile.providerType,
      verdict: 'real-passed' as const,
      adapterRevision: 'test',
      executionFingerprint,
      environment: 'test-runner' as const,
      startedAt: '2026-07-23T00:00:00.000Z',
      completedAt: '2026-07-23T00:00:00.000Z',
      completedStages: ['local-validation', 'submit', 'download', 'decode', 'blob-persist'] as const,
      safeSummary: 'test evidence'
    }));
    const converter = {
      generateCharacterAnchor: vi.fn(async (input: { actor: { actorId: string } }) => ({ actorId: input.actor.actorId, anchorText: TEST_ANCHOR })),
      generateCharacterViewPrompts: vi.fn(async (input: { actorId: string }) => ({
        actorId: input.actorId,
        views: CHARACTER_VISUAL_PURPOSES.map((purpose) => ({
          purpose,
          basePositive: `positive ${purpose}`,
          baseNegative: 'negative',
          resolvedAdditionalPositive: '',
          resolvedAdditionalNegative: ''
        }))
      })),
      planTurnScenes: vi.fn(async (input: TurnScenePlanningInput) => ({
        shots: [{
          placement: { blockIndex: input.blocks[0]!.blockIndex, blockHash: input.blocks[0]!.blockHash },
          order: 0,
          sceneSummary: '雨夜街头',
          knownActorIds: [],
          actorVisualStates: [],
          unboundCharacterDescriptions: [],
          locationDescription: '香港街头',
          actionDescription: '雨水落下',
          atmosphere: '危险',
          composition: '16:9 广角'
        }]
      })),
      generateSceneShotPrompt: vi.fn(async () => ({
        basePositive: '1980s Hong Kong rainy street',
        baseNegative: 'modern objects',
        participantResolutions: [],
        resolvedOneTimePositive: '',
        resolvedOneTimeNegative: ''
      })),
      renderProviderPrompt: vi.fn(async (input: {
        segments: Array<{ segmentId: string; positive: string; negative: string }>;
      }) => ({
        segments: input.segments.map((segment) => ({
          segmentId: segment.segmentId,
          positive: segment.positive,
          negative: segment.negative
        }))
      }))
    } as unknown as ImagePromptConversionProbe;
    const settings = {
      ...createDefaultImageAutomationSettings('2026-07-23T00:00:00.000Z'),
      characterMode: 'automatic' as const,
      sceneMode: 'automatic' as const,
      characterAutomaticProfileId: profile.profileId
    };
    const visualRepository = new IndexedDbVisualRepository(`auto-happy-visual-${crypto.randomUUID()}`);
    const runtimeRepository = new IndexedDbImageAutomationRuntimeRepository(`auto-happy-runtime-${crypto.randomUUID()}`);
    const generate = vi.fn(async () => [{
      blob: new Blob([TEST_PNG_BYTES.slice().buffer], { type: 'image/png' }),
      width: 1,
      height: 1
    }]);
    const coordinator = new ImageAutomationCoordinator({
      visualRepository,
      runtimeRepository,
      settingsRepository: { load: async () => settings, save: async () => undefined },
      profileRepository,
      credentialRepository: new IndexedDbImageCredentialRepository(`auto-happy-credential-${crypto.randomUUID()}`),
      verificationStore: {
        saveOutcome: async () => undefined,
        listRecords: async () => verificationRecords.map((record) => ({ ...record, completedStages: [...record.completedStages] })),
        getLatestArtifact: async () => null,
        clearProfile: async () => undefined,
        clearAll: async () => undefined
      },
      promptTemplateRepository: new IndexedDbImagePromptTemplateRepository(`auto-happy-template-${crypto.randomUUID()}`),
      generationPresetRepository,
      createPromptConversion: () => converter,
      createImageExecutor: () => ({ generate }),
      now: () => '2026-07-23T00:00:00.000Z'
    });
    const previous = createInitialRuntimeState();
    const newNpc = npc('npc_happy');
    const current = {
      ...previous,
      actors: { ...previous.actors, [newNpc.actorId]: newNpc },
      storyLog: [...previous.storyLog, {
        turnId: 'turn_happy',
        speaker: 'narrator' as const,
        text: '【旁白】雨水落在香港街头。',
        gameTime: previous.time,
        visualContext: {
          timeDescription: '1988 年深夜',
          locationDescription: '香港街头',
          weatherDescription: '暴雨',
          presentActorIds: [newNpc.actorId]
        }
      }]
    };

    await coordinator.processTransition('save_happy', previous, current);

    const records = await runtimeRepository.listForSave('save_happy');
    const snapshot = await visualRepository.loadSnapshot('save_happy');
    expect(converter.planTurnScenes).toHaveBeenCalledWith(expect.objectContaining({
      actors: [expect.objectContaining({
        actorId: newNpc.actorId,
        publicName: newNpc.name
      })]
    }), expect.anything());
    expect(records.map((record) => record.status).sort()).toEqual(['succeeded', 'succeeded']);
    expect(Object.keys(snapshot.assets)).toHaveLength(3);
    expect(Object.values(snapshot.tasks).every((task) => task.source === 'automatic' && task.submissionMode === 'automatic')).toBe(true);
    const halfBodyTask = Object.values(snapshot.tasks).find((task) => task.intent.type === 'character-image' && task.intent.purpose === 'half-body-medium');
    expect(halfBodyTask?.submittedRequest).toMatchObject({
      imageGenerationPresetId: halfBodyPreset.presetId,
      targetAspectRatio: '4:3',
      characterComposition: { viewAngle: 'auto', cameraElevation: 'auto' },
      generationParameters: { quality: 'high', outputCompression: 78, requestedImageCount: 2 }
    });
    expect(generate).toHaveBeenCalledTimes(3);
  });
});

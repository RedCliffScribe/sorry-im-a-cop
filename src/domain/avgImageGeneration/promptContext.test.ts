import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import {
  buildAvgPortraitGenerationContext,
  buildAvgOutfitGenerationContext,
  buildAvgPortraitPromptParts,
  buildAvgSceneGenerationContext,
  buildAvgScenePromptParts
} from './promptContext';

describe('AVG image generation prompt context', () => {
  it('uses only stable portrait facts and excludes story emotion, relationships, memories and temporary status', () => {
    const state = createInitialRuntimeState({ playerName: '梁美仪', gender: 'female' });
    const actor = state.actors.player!;
    state.actors.player = {
      ...actor,
      visualAgeAnchor: 'adult woman in her late twenties',
      appearance: 'oval East Asian face, long black hair, warm natural skin texture',
      clothing: 'fitted burgundy 1980s jacket and high-waist skirt',
      publicIdentity: 'CID detective',
      relationshipSummary: 'EXCLUDED_RELATIONSHIP_TOKEN',
      recentInteractionMemory: 'EXCLUDED_MEMORY_TOKEN',
      statusSummary: 'EXCLUDED_TEMPORARY_STATUS_TOKEN',
      bodyConditionSummary: 'EXCLUDED_BODY_CONDITION_TOKEN',
      personality: 'EXCLUDED_PERSONALITY_TOKEN'
    };

    const context = buildAvgPortraitGenerationContext(state, state.actors.player);
    const prompt = buildAvgPortraitPromptParts(context);
    const rendered = [prompt.anchorText, prompt.basePositive, prompt.appearancePositive].join('\n');

    expect(rendered).toContain('oval East Asian face');
    expect(rendered).toContain('fitted burgundy 1980s jacket');
    expect(rendered).toContain('CID detective');
    expect(prompt.basePositive).toContain('neutral natural expression');
    expect(prompt.basePositive).toContain('full body from head to toe');
    expect(rendered).not.toContain('EXCLUDED_RELATIONSHIP_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_MEMORY_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_TEMPORARY_STATUS_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_BODY_CONDITION_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_PERSONALITY_TOKEN');
  });

  it('uses stable place structure and excludes current scene state, actors, time and weather', () => {
    const state = createInitialRuntimeState();
    const sceneId = state.location.currentSceneId!;
    const scene = state.scenes[sceneId]!;
    const place = state.places[scene.placeId]!;
    state.time = { ...state.time, hour: 23, minute: 45 };
    state.environment.weather = {
      ...state.environment.weather,
      label: 'EXCLUDED_WEATHER_TOKEN',
      condition: 'heavy_rain',
      intensity: 90,
      impactSummary: 'EXCLUDED_WEATHER_TOKEN'
    };
    state.scenes[sceneId] = {
      ...scene,
      summary: 'EXCLUDED_RECENT_PLOT_SUMMARY_TOKEN',
      temporaryState: 'EXCLUDED_SCENE_STATE_TOKEN',
      presentActorIds: ['player', 'EXCLUDED_ACTOR_TOKEN']
    };
    state.places[place.placeId] = {
      ...place,
      summary: 'EXCLUDED_MUTABLE_PLACE_SUMMARY_TOKEN',
      publicKnowledge: 'public police facility serving the district',
      currentState: 'EXCLUDED_PLACE_STATE_TOKEN',
      historicalNote: 'late colonial Hong Kong civic architecture',
      roadAnchors: ['Argyle Street']
    };

    const context = buildAvgSceneGenerationContext(state, {
      exposure: 'indoor',
      stableSceneTags: ['police', 'office']
    });
    expect(context).toBeDefined();
    const prompt = buildAvgScenePromptParts(context!);
    const rendered = [prompt.stableDescription, prompt.basePositive, prompt.baseNegative].join('\n');

    expect(rendered).toContain('public police facility');
    expect(rendered).toContain('late colonial Hong Kong civic architecture');
    expect(rendered).toContain('Argyle Street');
    expect(prompt.basePositive).toContain('landscape 16:9 composition');
    expect(prompt.basePositive).toContain('neutral base illumination');
    expect(rendered).not.toContain('EXCLUDED_SCENE_STATE_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_PLACE_STATE_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_RECENT_PLOT_SUMMARY_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_MUTABLE_PLACE_SUMMARY_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_ACTOR_TOKEN');
    expect(rendered).not.toContain('EXCLUDED_WEATHER_TOKEN');
    expect(rendered).not.toContain('23:45');
  });

  it('builds an outfit-only target while preserving stable identity and excluding current emotion', () => {
    const state = createInitialRuntimeState({ playerName: '梁美仪', gender: 'female' });
    const actor = state.actors.player!;
    actor.appearance = 'oval East Asian face, long black hair';
    actor.clothing = 'default police uniform';
    const context = buildAvgOutfitGenerationContext(state, actor, {
      outfitId: 'user_outfit_evening',
      displayName: '晚宴装',
      description: '酒红色丝绒晚宴长裙，贴身剪裁'
    });
    const prompt = buildAvgPortraitPromptParts(context, '完整全身构图');
    const rendered = [prompt.anchorText, prompt.basePositive, prompt.baseNegative].join('\n');

    expect(context.targetKey).toContain('outfit:user_outfit_evening');
    expect(rendered).toContain('oval East Asian face');
    expect(rendered).toContain('酒红色丝绒晚宴长裙');
    expect(rendered).not.toContain('default police uniform');
    expect(rendered).toContain('natural expression');
    expect(rendered).toContain('identity drift');
  });

  it('places stable identity and the selected outfit in separate prompt segments without duplication', () => {
    const state = createInitialRuntimeState({ playerName: '梁美仪', gender: 'female' });
    const actor = state.actors.player!;
    actor.appearance = 'UNIQUE_STABLE_FACE_TOKEN';
    actor.femaleProfile = {
      ...actor.femaleProfile,
      bodyDescription: 'UNIQUE_BODY_TOKEN'
    };
    const context = buildAvgOutfitGenerationContext(state, actor, {
      outfitId: 'user_outfit_evening',
      displayName: '晚宴装',
      description: 'UNIQUE_OUTFIT_TOKEN'
    });

    const prompt = buildAvgPortraitPromptParts(context);
    const compiledSegments = [prompt.basePositive, prompt.appearancePositive].join('\n');

    expect(compiledSegments.match(/UNIQUE_STABLE_FACE_TOKEN/gu)).toHaveLength(1);
    expect(compiledSegments.match(/UNIQUE_BODY_TOKEN/gu)).toHaveLength(1);
    expect(compiledSegments.match(/UNIQUE_OUTFIT_TOKEN/gu)).toHaveLength(1);
    expect(prompt.basePositive).not.toContain('UNIQUE_OUTFIT_TOKEN');
    expect(prompt.appearancePositive).toBe('Target outfit: UNIQUE_OUTFIT_TOKEN');
  });

  it('removes silhouette ambiguity from positive portrait facts and rejects featureless cutouts', () => {
    const prompt = buildAvgPortraitPromptParts({
      worldpackId: 'hk1988',
      worldYear: 1988,
      actorId: 'actor-regression',
      targetKey: 'actor:actor-regression',
      identityLabel: '回归测试人物',
      gender: 'male',
      visualAge: 'adult man in his thirties',
      appearance: 'short black hair, 黑色人物剪影，square face',
      bodyDescription: 'tall athletic silhouette',
      roleDescription: 'uniformed police officer',
      clothingDescription: 'structured uniform silhouette with visible fabric details'
    });
    const positive = [prompt.anchorText, prompt.basePositive, prompt.appearancePositive].join('\n');

    expect(positive).not.toMatch(/\bsilhouettes?\b/iu);
    expect(positive).not.toContain('剪影');
    expect(positive).toContain('centered full-body character');
    expect(positive).toContain('visible facial features and eyes');
    expect(prompt.baseNegative).toContain('black silhouette');
    expect(prompt.baseNegative).toContain('featureless face');
    expect(prompt.baseNegative).toContain('placeholder character');
  });
});

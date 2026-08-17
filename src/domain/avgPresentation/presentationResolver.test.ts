import { describe, expect, it } from 'vitest';
import { DefaultAvgResourceResolver } from '../avgResourcePack';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { StoryBlock } from '../runtime/storyBlocks';
import type { Actor, CivilianRoleProfile, StoryEntry } from '../runtime/types';
import { MemoryAvgGenericPortraitBindingRepository } from './bindingRepository';
import { formatAvgPresentationDiagnostics } from './diagnostics';
import { resolveAvgPresentation } from './presentationResolver';
import { fixtureFixed, fixtureGeneric, fixtureOutfit, fixturePack, fixtureScene } from './testFixtures';
import {
  MemoryAvgVisualOverrideRepository,
  type AvgValidatedOverrideImage
} from '../avgVisualOverride';

const identity = {
  worldpackId: 'hk1988',
  kind: 'era_seed',
  canonicalId: 'fixed_test_actor'
} as const;

const secondIdentity = {
  worldpackId: 'hk1988',
  kind: 'era_seed',
  canonicalId: 'second_fixed_test_actor'
} as const;

const playerIdentity = {
  worldpackId: 'hk1988',
  kind: 'era_seed',
  canonicalId: 'player_fixed_test_actor'
} as const;

function civilianProfile(): CivilianRoleProfile {
  return {
    status: 'active',
    publicOccupation: '街坊',
    sectorIds: ['civilian'],
    roleTags: [],
    livelihoodActorIds: [],
    communitySummary: '',
    familyEconomicSummary: '',
    legalStatusSummary: ''
  };
}

function cloneActor(actorId: string): Actor {
  const actor = structuredClone(createInitialRuntimeState().actors.player!);
  actor.actorId = actorId;
  actor.name = actorId;
  actor.gender = 'female';
  actor.computedAge = 30;
  actor.currentIdentity = 'civilian';
  actor.roleProfiles = { civilian: civilianProfile() };
  actor.stableIdentityRef = undefined;
  return actor;
}

function entry(state: ReturnType<typeof createInitialRuntimeState>): StoryEntry {
  return {
    turnId: 'turn_avg_003',
    speaker: 'narrator',
    text: '原始正文保持不参与美术决策。',
    gameTime: state.time,
    visualContext: {
      timeDescription: '1988年夏夜',
      locationDescription: '旺角警署 CID 办公室',
      weatherDescription: '闷热',
      presentActorIds: ['npc_fixed', 'npc_generic']
    },
    blocks: [
      { type: 'narration', text: '门开了。', sourceStyle: 'tagged' },
      { type: 'dialogue', text: '查到了。', speakerLabel: '固定人物', speakerActorId: 'npc_fixed', emotion: 'serious' },
      { type: 'dialogue', text: '不可能。', speakerLabel: '固定人物', speakerActorId: 'npc_fixed', emotion: 'surprised' },
      { type: 'dialogue', text: '我知道了。', speakerLabel: '玩家', speakerActorId: 'player', emotion: 'neutral' },
      { type: 'narration', text: '走廊传来脚步声。', sourceStyle: 'tagged' },
      { type: 'dialogue', text: '有人找你。', speakerLabel: '通用人物', speakerActorId: 'npc_generic', emotion: 'happy' },
      { type: 'inner_monologue', text: '来得太快。', actorId: 'player', emotion: 'thinking' },
      { type: 'dialogue', text: '无线电杂音。', speakerLabel: '无线电', emotion: 'neutral' }
    ]
  };
}

function fixtureResolver(state: ReturnType<typeof createInitialRuntimeState>) {
  return new DefaultAvgResourceResolver({
    basePack: fixturePack({
      fixed: [fixtureFixed(identity, ['default', 'serious', 'surprised'])],
      generic: [fixtureGeneric({
        portraitSetId: 'generic_female_civilian',
        gender: 'female',
        ageBand: '25_34',
        roleFamily: 'civilian',
        variants: ['default', 'alternate_01']
      })],
      scenes: [fixtureScene({
        sceneAssetId: 'scene_cid',
        runtimeSceneIds: [state.location.currentSceneId!],
        tags: ['police', 'cid', 'office', 'indoor']
      })]
    })
  });
}

function carryEntry(
  state: ReturnType<typeof createInitialRuntimeState>,
  turnId: string,
  blocks: StoryBlock[]
): StoryEntry {
  return {
    turnId,
    speaker: 'narrator',
    text: '跨 StoryEntry 演出测试。',
    gameTime: state.time,
    visualContext: {
      timeDescription: '1988年夏夜',
      locationDescription: state.location.currentSceneId === 'scene_tea_runtime'
        ? '茶餐厅'
        : 'CID办公室',
      presentActorIds: ['npc_fixed', 'npc_second']
    },
    blocks
  };
}

function carryResolver(initialSceneId: string) {
  return new DefaultAvgResourceResolver({
    basePack: fixturePack({
      fixed: [
        fixtureFixed(identity, ['default', 'serious', 'surprised']),
        fixtureFixed(secondIdentity, ['default', 'happy'])
      ],
      scenes: [
        fixtureScene({
          sceneAssetId: 'scene_cid',
          runtimeSceneIds: [initialSceneId],
          tags: ['police', 'cid', 'office']
        }),
        fixtureScene({
          sceneAssetId: 'scene_tea',
          runtimeSceneIds: ['scene_tea_runtime'],
          tags: ['restaurant', 'food', 'interior']
        })
      ]
    })
  });
}

const activePack = {
  worldpackId: 'hk1988',
  basePackId: 'fixture_base',
  basePackVersion: '1.0.0'
} as const;

function overrideImage(seed: string): AvgValidatedOverrideImage {
  const blob = new Blob([seed], { type: 'image/png' });
  return {
    blob,
    mediaType: 'image/png',
    width: 512,
    height: 1024,
    byteLength: blob.size,
    sha256: seed.padEnd(64, '0').slice(0, 64)
  };
}

describe('AVG presentation resolver', () => {
  it('builds a pure one-portrait frame sequence with speaker and emotion changes', async () => {
    const state = createInitialRuntimeState();
    const fixed = cloneActor('npc_fixed');
    fixed.stableIdentityRef = identity;
    const generic = cloneActor('npc_generic');
    state.actors.npc_fixed = fixed;
    state.actors.npc_generic = generic;
    const storyEntry = entry(state);
    const stateBefore = structuredClone(state);
    const entryBefore = structuredClone(storyEntry);

    const result = await resolveAvgPresentation({
      saveId: 'save_a',
      storyEntry,
      runtimeState: state,
      resourceResolver: fixtureResolver(state),
      activePack,
      bindingRepository: new MemoryAvgGenericPortraitBindingRepository(),
      includeDiagnostics: true
    });

    expect(result.scene).toMatchObject({ sceneAssetId: 'scene_cid' });
    expect(result.frames).toHaveLength(8);
    expect(result.frames[0]?.portrait).toBeNull();
    expect(result.frames[1]?.portrait).toMatchObject({ actorId: 'npc_fixed', source: 'fixed', resolvedVariantId: 'serious' });
    expect(result.frames[1]?.portraitStageMode).toBe('active');
    expect(result.frames[2]?.portrait).toMatchObject({ actorId: 'npc_fixed', resolvedVariantId: 'surprised' });
    expect(result.frames[2]?.changeFlags).toMatchObject({ portraitChanged: false, portraitVariantChanged: true });
    expect(result.frames[3]?.portrait?.actorId).toBe('npc_fixed');
    expect(result.frames[3]?.portraitStageMode).toBe('receded');
    expect(result.frames[4]?.portrait?.actorId).toBe('npc_fixed');
    expect(result.frames[4]?.portraitStageMode).toBe('receded');
    expect(result.frames[5]?.portrait).toMatchObject({
      actorId: 'npc_generic',
      source: 'generic_new',
      resolvedVariantId: 'default'
    });
    expect(result.frames[6]?.portrait?.actorId).toBe('npc_generic');
    expect(result.frames[6]?.portraitStageMode).toBe('receded');
    expect(result.frames[7]?.portrait).toBeNull();
    expect(result.frames[7]?.speakerLabel).toBe('无线电');
    expect(result.frames.every((frame) => !('text' in frame))).toBe(true);
    expect(result.frames.every((frame) => frame.scene?.sceneAssetId === 'scene_cid')).toBe(true);
    expect(formatAvgPresentationDiagnostics(result)).toContain('portrait=generic_female_civilian');
    expect(formatAvgPresentationDiagnostics(result)).toContain('Scene: scene_cid');
    expect(formatAvgPresentationDiagnostics(result)).toContain('outfitSelection=resource_default');
    expect(state).toEqual(stateBefore);
    expect(storyEntry).toEqual(entryBefore);
  });

  it('freezes generic identity across emotion and role changes, then repairs stale bindings', async () => {
    const state = createInitialRuntimeState();
    const actor = cloneActor('npc_generic');
    state.actors.npc_generic = actor;
    const repository = new MemoryAvgGenericPortraitBindingRepository();
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({
        generic: [
          fixtureGeneric({ portraitSetId: 'generic_a', gender: 'female', ageBand: '25_34', roleFamily: 'civilian' }),
          fixtureGeneric({ portraitSetId: 'generic_b', gender: 'female', ageBand: '25_34', roleFamily: 'civilian' })
        ]
      })
    });
    const makeEntry = (emotion: 'happy' | 'angry'): StoryEntry => ({
      turnId: `turn_${emotion}`,
      speaker: 'narrator',
      text: `【通用人物】${emotion}`,
      gameTime: state.time,
      blocks: [{ type: 'dialogue', text: emotion, speakerLabel: '通用人物', speakerActorId: 'npc_generic', emotion }]
    });
    const first = await resolveAvgPresentation({
      saveId: 'save_stable', storyEntry: makeEntry('happy'), runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: repository
    });
    actor.positionSummary = '身份资料后来变化';
    const second = await resolveAvgPresentation({
      saveId: 'save_stable', storyEntry: makeEntry('angry'), runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: repository
    });

    expect(second.frames[0]?.portrait?.portraitSetId)
      .toBe(first.frames[0]?.portrait?.portraitSetId);
    expect(second.frames[0]?.portrait?.source).toBe('generic_bound');
    expect(second.frames[0]?.portrait?.resolvedVariantId).toBe('default');

    await repository.remove('save_stable', 'npc_generic', 'hk1988', 'fixture_base');
    await repository.bindIfAvailable({
      saveId: 'save_stable', actorId: 'npc_generic', worldpackId: 'hk1988',
      basePackId: 'fixture_base', portraitSetId: 'removed_set',
      createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z'
    }, 'unique_per_save');
    const repaired = await resolveAvgPresentation({
      saveId: 'save_stable', storyEntry: makeEntry('happy'), runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: repository
    });
    expect(repaired.frames[0]?.portrait?.portraitSetId).not.toBe('removed_set');
    expect((await repository.get('save_stable', 'npc_generic', 'hk1988', 'fixture_base'))?.portraitSetId)
      .toBe(repaired.frames[0]?.portrait?.portraitSetId);
  });

  it('fails soft when the resource pack is unavailable or belongs to another world', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_generic = cloneActor('npc_generic');
    const noPack = await resolveAvgPresentation({
      saveId: 'save_a', storyEntry: entry(state), runtimeState: state
    });
    expect(noPack.scene).toBeNull();
    expect(noPack.frames.every((frame) => frame.portrait === null)).toBe(true);
    expect(noPack.diagnostics?.warnings).toContain('resource-pack-unavailable');

    const wrongWorld = await resolveAvgPresentation({
      saveId: 'save_a', storyEntry: entry(state), runtimeState: state,
      resourceResolver: fixtureResolver(state),
      activePack: { ...activePack, worldpackId: 'another_world' }
    });
    expect(wrongWorld.frames.every((frame) => frame.portrait === null)).toBe(true);
    expect(wrongWorld.diagnostics?.warnings).toContain('active-pack-worldpack-mismatch');
  });

  describe('player portrait presentation policy', () => {
    function setupFixedPlayer() {
      const state = createInitialRuntimeState();
      const player = state.actors[state.player.actorId]!;
      player.stableIdentityRef = playerIdentity;
      const npc = cloneActor('npc_fixed');
      npc.stableIdentityRef = identity;
      state.actors.npc_fixed = npc;
      const resolver = new DefaultAvgResourceResolver({
        basePack: fixturePack({
          fixed: [
            fixtureFixed(playerIdentity, ['default']),
            fixtureFixed(identity, ['default', 'happy'])
          ]
        })
      });
      return {
        state,
        resolver,
        repository: new MemoryAvgGenericPortraitBindingRepository()
      };
    }

    it('keeps hidden as the default and marks the carried NPC as receded', async () => {
      const context = setupFixedPlayer();
      const previous = await resolveAvgPresentation({
        saveId: 'save_player_hidden',
        storyEntry: carryEntry(context.state, 'turn_hidden_a', [{
          type: 'dialogue',
          text: '先听我说。',
          speakerLabel: '固定人物',
          speakerActorId: 'npc_fixed',
          emotion: 'happy'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository
      });
      const current = await resolveAvgPresentation({
        saveId: 'save_player_hidden',
        storyEntry: carryEntry(context.state, 'turn_hidden_b', [{
          type: 'dialogue',
          text: '我明白。',
          speakerLabel: '玩家',
          speakerActorId: context.state.player.actorId,
          emotion: 'neutral'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait?.actorId).toBe('npc_fixed');
      expect(current.frames[0]?.portraitStageMode).toBe('receded');
      expect(current.frames[0]?.changeFlags.portraitStageChanged).toBe(true);
    });

    it('shows one stable player portrait for dialogue and inner monologue, then lets NPC dialogue override it', async () => {
      const context = setupFixedPlayer();
      const result = await resolveAvgPresentation({
        saveId: 'save_player_show',
        storyEntry: carryEntry(context.state, 'turn_player_show', [
          {
            type: 'dialogue',
            text: '我来问。',
            speakerLabel: '玩家',
            speakerActorId: context.state.player.actorId,
            emotion: 'neutral'
          },
          {
            type: 'inner_monologue',
            text: '他在回避视线。',
            actorId: context.state.player.actorId,
            emotion: 'thinking'
          },
          {
            type: 'dialogue',
            text: '你想知道什么？',
            speakerLabel: '固定人物',
            speakerActorId: 'npc_fixed',
            emotion: 'happy'
          }
        ]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        playerPortraitMode: 'show'
      });

      expect(result.frames[0]?.portrait).toMatchObject({
        actorId: context.state.player.actorId,
        portraitSetId: 'fixed_player_fixed_test_actor'
      });
      expect(result.frames[0]?.portraitStageMode).toBe('active');
      expect(result.frames[1]?.portrait?.portraitSetId).toBe(
        result.frames[0]?.portrait?.portraitSetId
      );
      expect(result.frames[1]?.portraitStageMode).toBe('active');
      expect(result.frames[2]?.portrait?.actorId).toBe('npc_fixed');
      expect(result.frames[2]?.portraitStageMode).toBe('active');
    });

    it('uses the player only as a receded narration fallback when show mode has no carried actor', async () => {
      const context = setupFixedPlayer();
      const result = await resolveAvgPresentation({
        saveId: 'save_player_narration',
        storyEntry: carryEntry(context.state, 'turn_player_narration', [{
          type: 'narration',
          text: '房间里只剩下风扇声。',
          sourceStyle: 'tagged'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        playerPortraitMode: 'show'
      });

      expect(result.frames[0]?.portrait?.actorId).toBe(context.state.player.actorId);
      expect(result.frames[0]?.portraitStageMode).toBe('receded');
    });

    it('does not leak a carried player portrait after switching back to hidden mode', async () => {
      const context = setupFixedPlayer();
      const shown = await resolveAvgPresentation({
        saveId: 'save_player_toggle',
        storyEntry: carryEntry(context.state, 'turn_player_toggle_a', [{
          type: 'dialogue',
          text: '先显示主角。',
          speakerLabel: '玩家',
          speakerActorId: context.state.player.actorId,
          emotion: 'neutral'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        playerPortraitMode: 'show'
      });
      const hidden = await resolveAvgPresentation({
        saveId: 'save_player_toggle',
        storyEntry: carryEntry(context.state, 'turn_player_toggle_b', [{
          type: 'narration',
          text: '主角立绘不应残留。',
          sourceStyle: 'tagged'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: shown.finalPresentation,
        playerPortraitMode: 'hidden'
      });

      expect(hidden.frames[0]?.portrait).toBeNull();
      expect(hidden.finalPresentation.primaryPortrait).toBeUndefined();
    });

    it('freezes a generic player face across StoryEntry boundaries', async () => {
      const state = createInitialRuntimeState();
      const player = state.actors[state.player.actorId]!;
      player.stableIdentityRef = undefined;
      player.gender = 'female';
      player.computedAge = 30;
      player.currentIdentity = 'civilian';
      player.roleProfiles = { civilian: civilianProfile() };
      const repository = new MemoryAvgGenericPortraitBindingRepository();
      const resolver = new DefaultAvgResourceResolver({
        basePack: fixturePack({
          generic: [fixtureGeneric({
            portraitSetId: 'generic_player_female',
            gender: 'female',
            ageBand: '25_34',
            roleFamily: 'civilian'
          })]
        })
      });
      const first = await resolveAvgPresentation({
        saveId: 'save_generic_player',
        storyEntry: carryEntry(state, 'turn_generic_player_a', [{
          type: 'dialogue',
          text: '第一回合。',
          speakerLabel: '玩家',
          speakerActorId: state.player.actorId,
          emotion: 'neutral'
        }]),
        runtimeState: state,
        resourceResolver: resolver,
        activePack,
        bindingRepository: repository,
        playerPortraitMode: 'show'
      });
      const second = await resolveAvgPresentation({
        saveId: 'save_generic_player',
        storyEntry: carryEntry(state, 'turn_generic_player_b', [{
          type: 'inner_monologue',
          text: '第二回合。',
          actorId: state.player.actorId,
          emotion: 'thinking'
        }]),
        runtimeState: state,
        resourceResolver: resolver,
        activePack,
        bindingRepository: repository,
        previousPresentation: first.finalPresentation,
        playerPortraitMode: 'show'
      });

      expect(first.frames[0]?.portrait?.portraitSetId).toBe('generic_player_female');
      expect(second.frames[0]?.portrait?.portraitSetId).toBe('generic_player_female');
      expect(second.frames[0]?.portrait?.source).toBe('generic_bound');
    });
  });

  describe('cross-StoryEntry presentation carry', () => {
    function setup() {
      const state = createInitialRuntimeState();
      const initialSceneId = state.location.currentSceneId!;
      const firstActor = cloneActor('npc_fixed');
      firstActor.stableIdentityRef = identity;
      const secondActor = cloneActor('npc_second');
      secondActor.stableIdentityRef = secondIdentity;
      state.actors.npc_fixed = firstActor;
      state.actors.npc_second = secondActor;
      return {
        state,
        resolver: carryResolver(initialSceneId),
        repository: new MemoryAvgGenericPortraitBindingRepository()
      };
    }

    async function seedFirstSequence(context: ReturnType<typeof setup>) {
      return resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, 'turn_carry_a', [{
          type: 'dialogue',
          text: '明天早上再查。',
          speakerLabel: '固定人物',
          speakerActorId: 'npc_fixed',
          emotion: 'serious'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository
      });
    }

    it.each([
      ['narration', { type: 'narration', text: '几秒钟后，他把文件扔回桌上。', sourceStyle: 'tagged' }],
      ['player dialogue', { type: 'dialogue', text: '我知道了。', speakerLabel: '玩家', speakerActorId: 'player', emotion: 'neutral' }],
      ['inner monologue', { type: 'inner_monologue', text: '他已经不耐烦了。', actorId: 'player', emotion: 'thinking' }]
    ] satisfies Array<[string, StoryBlock]>)('recedes the previous NPC for leading %s', async (_label, block) => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, `turn_carry_${block.type}`, [block]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait).toMatchObject({
        actorId: 'npc_fixed',
        portraitSetId: 'fixed_fixed_test_actor',
        resolvedVariantId: 'serious'
      });
      expect(current.frames[0]?.changeFlags).toMatchObject({
        portraitChanged: false,
        portraitVariantChanged: false,
        portraitStageChanged: true,
        sceneChanged: false
      });
      expect(current.frames[0]?.portraitStageMode).toBe('receded');
      expect(current.finalPresentation.primaryPortrait?.actorId).toBe('npc_fixed');
      expect(current.finalPresentation.primaryPortraitStageMode).toBe('receded');
    });

    it('clears a carried NPC when the next StoryEntry explicitly has no present actors', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const currentEntry = carryEntry(context.state, 'turn_carry_empty_presence', [{
        type: 'narration',
        text: '她独自回到住所。',
        sourceStyle: 'tagged'
      }]);
      currentEntry.visualContext!.presentActorIds = [];

      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: currentEntry,
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait).toBeNull();
      expect(current.frames[0]?.portraitStageMode).toBeUndefined();
      expect(current.frames[0]?.changeFlags).toMatchObject({
        portraitChanged: true,
        portraitVariantChanged: false,
        portraitStageChanged: true
      });
      expect(current.finalPresentation.primaryPortrait).toBeUndefined();
    });

    it('keeps an NPC receded after they speak even when the entry presence hint omitted them', async () => {
      const context = setup();
      const currentEntry = carryEntry(context.state, 'turn_current_speaker_presence', [
        {
          type: 'dialogue',
          text: '我刚刚才到。',
          speakerLabel: '固定人物',
          speakerActorId: 'npc_fixed',
          emotion: 'serious'
        },
        {
          type: 'narration',
          text: '她把文件推到桌面中央。',
          sourceStyle: 'tagged'
        }
      ]);
      currentEntry.visualContext!.presentActorIds = ['player'];

      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: currentEntry,
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository
      });

      expect(current.frames[0]?.portrait).toMatchObject({ actorId: 'npc_fixed' });
      expect(current.frames[0]?.portraitStageMode).toBe('active');
      expect(current.frames[1]?.portrait).toMatchObject({ actorId: 'npc_fixed' });
      expect(current.frames[1]?.portraitStageMode).toBe('receded');
      expect(current.frames[1]?.changeFlags).toMatchObject({
        portraitChanged: false,
        portraitStageChanged: true
      });
    });

    it('switches directly to a different NPC on the first dialogue block', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, 'turn_carry_second_actor', [{
          type: 'dialogue',
          text: '我来接手。',
          speakerLabel: '第二人物',
          speakerActorId: 'npc_second',
          emotion: 'happy'
        }]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait).toMatchObject({
        actorId: 'npc_second',
        resolvedVariantId: 'happy'
      });
      expect(current.frames[0]?.changeFlags.portraitChanged).toBe(true);
      expect(current.frames[0]?.changeFlags.portraitVariantChanged).toBe(false);
    });

    it('does not carry an unrelated previous NPC through narration before another NPC speaks', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const currentEntry = carryEntry(context.state, 'turn_carry_stale_actor', [
        {
          type: 'narration',
          text: '门外传来脚步声。',
          sourceStyle: 'tagged'
        },
        {
          type: 'dialogue',
          text: '我来接手。',
          speakerLabel: '第二人物',
          speakerActorId: 'npc_second',
          emotion: 'serious'
        }
      ]);
      currentEntry.visualContext!.presentActorIds = ['player', 'npc_fixed', 'npc_second'];

      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: currentEntry,
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait).toBeNull();
      expect(current.frames[0]?.changeFlags).toMatchObject({
        portraitChanged: true,
        portraitVariantChanged: false,
        portraitStageChanged: true
      });
      expect(current.frames[1]?.portrait).toMatchObject({
        actorId: 'npc_second',
        resolvedVariantId: 'default'
      });
      expect(current.diagnostics?.warnings).toContain(
        'carried-portrait-not-in-current-speakers:npc_fixed'
      );
    });

    it('keeps the previous NPC through narration when that same NPC speaks later', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const current = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, 'turn_carry_same_actor_after_narration', [
          {
            type: 'narration',
            text: '他把文件重新推到桌面中央。',
            sourceStyle: 'tagged'
          },
          {
            type: 'dialogue',
            text: '再看一次。',
            speakerLabel: '固定人物',
            speakerActorId: 'npc_fixed',
            emotion: 'serious'
          }
        ]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(current.frames[0]?.portrait).toMatchObject({ actorId: 'npc_fixed' });
      expect(current.frames[0]?.portraitStageMode).toBe('receded');
      expect(current.frames[1]?.portrait).toMatchObject({ actorId: 'npc_fixed' });
      expect(current.frames[1]?.portraitStageMode).toBe('active');
      expect(current.diagnostics?.warnings).not.toContain(
        'carried-portrait-not-in-current-speakers:npc_fixed'
      );
    });

    it('distinguishes an unchanged portrait from a same-actor variant change', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const nextDialogue = async (emotion: 'serious' | 'surprised') =>
        resolveAvgPresentation({
          saveId: 'save_carry',
          storyEntry: carryEntry(context.state, `turn_carry_${emotion}`, [{
            type: 'dialogue',
            text: emotion,
            speakerLabel: '固定人物',
            speakerActorId: 'npc_fixed',
            emotion
          }]),
          runtimeState: context.state,
          resourceResolver: context.resolver,
          activePack,
          bindingRepository: context.repository,
          previousPresentation: previous.finalPresentation
        });

      const unchanged = await nextDialogue('serious');
      const changedVariant = await nextDialogue('surprised');
      expect(unchanged.frames[0]?.changeFlags).toMatchObject({
        portraitChanged: false,
        portraitVariantChanged: false
      });
      expect(changedVariant.frames[0]?.changeFlags).toMatchObject({
        portraitChanged: false,
        portraitVariantChanged: true
      });
    });

    it('compares the first frame scene against the previous sequence', async () => {
      const context = setup();
      const previous = await seedFirstSequence(context);
      const narration: StoryBlock = {
        type: 'narration',
        text: '时间继续流动。',
        sourceStyle: 'tagged'
      };
      const sameScene = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, 'turn_same_scene', [narration]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });
      context.state.location.currentSceneId = 'scene_tea_runtime';
      const changedScene = await resolveAvgPresentation({
        saveId: 'save_carry',
        storyEntry: carryEntry(context.state, 'turn_changed_scene', [narration]),
        runtimeState: context.state,
        resourceResolver: context.resolver,
        activePack,
        bindingRepository: context.repository,
        previousPresentation: previous.finalPresentation
      });

      expect(sameScene.frames[0]?.scene?.sceneAssetId).toBe('scene_cid');
      expect(sameScene.frames[0]?.changeFlags.sceneChanged).toBe(false);
      expect(changedScene.frames[0]?.scene?.sceneAssetId).toBe('scene_tea');
      expect(changedScene.frames[0]?.changeFlags.sceneChanged).toBe(true);
    });
  });
});

describe('AVG save visual override resolution', () => {
  it('uses one actor override for every emotion and restores fixed emotion variants immediately', async () => {
    const state = createInitialRuntimeState();
    const fixed = cloneActor('npc_fixed');
    fixed.stableIdentityRef = identity;
    state.actors.npc_fixed = fixed;
    const storyEntry: StoryEntry = {
      turnId: 'override_fixed', speaker: 'narrator', text: 'fixed', gameTime: state.time,
      blocks: [
        { type: 'dialogue', text: '严肃', speakerLabel: '固定', speakerActorId: 'npc_fixed', emotion: 'serious' },
        { type: 'dialogue', text: '惊讶', speakerLabel: '固定', speakerActorId: 'npc_fixed', emotion: 'surprised' }
      ]
    };
    const overrides = new MemoryAvgVisualOverrideRepository();
    await overrides.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    }, overrideImage('custom-fixed'));

    const custom = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack,
      overrideRepository: overrides
    });
    expect(custom.frames.map((frame) => frame.portrait?.source))
      .toEqual(['save_override', 'save_override']);
    expect(custom.frames[0]?.portrait?.asset.assetId)
      .toBe(custom.frames[1]?.portrait?.asset.assetId);
    expect(custom.frames.map((frame) => frame.portrait?.requestedEmotion))
      .toEqual(['serious', 'surprised']);

    await overrides.removeActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    });
    const restored = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack,
      overrideRepository: overrides
    });
    expect(restored.frames.map((frame) => frame.portrait?.resolvedVariantId))
      .toEqual(['serious', 'surprised']);
    expect(restored.frames.every((frame) => frame.portrait?.source === 'fixed')).toBe(true);
  });

  it('restores the same frozen generic face after removing an override', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_generic = cloneActor('npc_generic');
    const storyEntry: StoryEntry = {
      turnId: 'override_generic', speaker: 'narrator', text: 'generic', gameTime: state.time,
      blocks: [{ type: 'dialogue', text: '你好', speakerLabel: '普通人', speakerActorId: 'npc_generic', emotion: 'happy' }]
    };
    const bindings = new MemoryAvgGenericPortraitBindingRepository();
    const overrides = new MemoryAvgVisualOverrideRepository();
    const resolver = fixtureResolver(state);
    const first = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: bindings
    });
    const frozenSet = first.frames[0]?.portrait?.portraitSetId;
    await overrides.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_generic'
    }, overrideImage('custom-generic'));
    expect((await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: bindings,
      overrideRepository: overrides
    })).frames[0]?.portrait?.source).toBe('save_override');
    await overrides.removeActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_generic'
    });
    const restored = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: resolver, activePack, bindingRepository: bindings,
      overrideRepository: overrides
    });
    expect(restored.frames[0]?.portrait?.portraitSetId).toBe(frozenSet);
    expect(restored.frames[0]?.portrait?.source).toBe('generic_bound');
  });

  it('shows an override without a Resource Pack and keeps active/receded staging', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_plain = cloneActor('npc_plain');
    const storyEntry: StoryEntry = {
      turnId: 'override_only', speaker: 'narrator', text: 'override only', gameTime: state.time,
      blocks: [
        { type: 'dialogue', text: '在场', speakerLabel: '人物', speakerActorId: 'npc_plain', emotion: 'happy' },
        { type: 'narration', text: '他退到画面后方。', sourceStyle: 'tagged' }
      ]
    };
    const overrides = new MemoryAvgVisualOverrideRepository();
    await overrides.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_plain'
    }, overrideImage('only'));
    const result = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state, overrideRepository: overrides
    });
    expect(result.frames[0]?.portrait).toMatchObject({ source: 'save_override' });
    expect(result.frames[0]?.portraitStageMode).toBe('active');
    expect(result.frames[1]?.portrait?.asset.assetId).toBe(result.frames[0]?.portrait?.asset.assetId);
    expect(result.frames[1]?.portraitStageMode).toBe('receded');
  });

  it('overrides a stable runtime scene while preserving location-driven environment metadata', async () => {
    const state = createInitialRuntimeState();
    const storyEntry = entry(state);
    const overrides = new MemoryAvgVisualOverrideRepository();
    await overrides.replaceSceneOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988',
      anchor: { type: 'runtime_scene', id: state.location.currentSceneId! }
    }, overrideImage('custom-scene'));
    const result = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack,
      overrideRepository: overrides
    });
    expect(result.scene).toMatchObject({ sceneAssetId: 'scene_cid', matchType: 'save_override' });
    expect(result.scene?.asset).toMatchObject({ kind: 'save_override' });
    expect(result.diagnostics?.scene).toMatchObject({
      overrideFound: true,
      overrideValid: true,
      underlyingResolvedSceneAssetId: 'scene_cid',
      finalSource: 'save_override'
    });
    expect(result.environment.sceneExposure).toBe('indoor');
  });

  it('falls back without deleting a damaged player mapping', async () => {
    const state = createInitialRuntimeState();
    const fixed = cloneActor('npc_fixed');
    fixed.stableIdentityRef = identity;
    state.actors.npc_fixed = fixed;
    const overrides = new MemoryAvgVisualOverrideRepository();
    const stored = await overrides.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    }, overrideImage('damaged'));
    overrides.removeAssetForTest(stored.mapping.assetId);
    const storyEntry: StoryEntry = {
      turnId: 'damaged', speaker: 'narrator', text: 'damaged', gameTime: state.time,
      blocks: [{ type: 'dialogue', text: '仍能显示', speakerLabel: '固定', speakerActorId: 'npc_fixed', emotion: 'serious' }]
    };
    const result = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack, overrideRepository: overrides
    });
    expect(result.frames[0]?.portrait?.source).toBe('fixed');
    expect(result.diagnostics?.warnings).toContain(
      'override-asset-missing:chain_a\u001fhk1988\u001fnpc_fixed'
    );
    expect((await overrides.getActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    }))?.status).toBe('asset_missing');
  });

  it('keeps an actor override across base-pack switches and restores into the new pack', async () => {
    const state = createInitialRuntimeState();
    const fixed = cloneActor('npc_fixed');
    fixed.stableIdentityRef = identity;
    state.actors.npc_fixed = fixed;
    const storyEntry: StoryEntry = {
      turnId: 'override_pack_switch', speaker: 'narrator', text: 'pack switch', gameTime: state.time,
      blocks: [{
        type: 'dialogue', text: '切换资源包。', speakerLabel: '固定',
        speakerActorId: 'npc_fixed', emotion: 'serious'
      }]
    };
    const overrides = new MemoryAvgVisualOverrideRepository();
    const stored = await overrides.replaceActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    }, overrideImage('pack-independent'));
    const secondPack = fixturePack({
      packId: 'fixture_base_b',
      version: '2.0.0',
      fixed: [fixtureFixed(identity, ['default', 'serious'])]
    });
    const secondResolver = new DefaultAvgResourceResolver({ basePack: secondPack });
    const secondActivePack = {
      worldpackId: 'hk1988',
      basePackId: secondPack.manifest.packId,
      basePackVersion: secondPack.manifest.version
    } as const;

    const overridden = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: secondResolver, activePack: secondActivePack,
      overrideRepository: overrides
    });
    expect(overridden.frames[0]?.portrait?.asset.assetId).toBe(stored.mapping.assetId);
    expect(overridden.frames[0]?.portrait?.source).toBe('save_override');

    await overrides.removeActorOverride({
      visualPartitionId: 'chain_a', worldpackId: 'hk1988', actorId: 'npc_fixed'
    });
    const restored = await resolveAvgPresentation({
      saveId: 'chain_a', storyEntry, runtimeState: state,
      resourceResolver: secondResolver, activePack: secondActivePack,
      overrideRepository: overrides
    });
    expect(restored.frames[0]?.portrait).toMatchObject({
      source: 'fixed',
      sourcePackId: 'fixture_base_b',
      resolvedVariantId: 'serious'
    });
  });

  it('keeps a selected resource outfit while resolving emotion fallbacks inside that outfit', async () => {
    const state = createInitialRuntimeState();
    const actor = cloneActor('npc_fixed');
    actor.stableIdentityRef = identity;
    state.actors.npc_fixed = actor;
    const fixedEntry = fixtureFixed(identity, ['default', 'serious']);
    const formal = fixtureOutfit(['default', 'surprised']);
    formal.outfitId = 'formal';
    Object.values(formal.variants).forEach((variant) => {
      variant.image = { ...variant.image, assetId: `formal_${variant.variantId}` };
    });
    fixedEntry.outfits.formal = formal;
    const resolver = new DefaultAvgResourceResolver({
      basePack: fixturePack({ fixed: [fixedEntry] })
    });
    const overrides = new MemoryAvgVisualOverrideRepository();
    const key = {
      visualPartitionId: 'chain_outfit', worldpackId: 'hk1988', actorId: 'npc_fixed'
    };
    await overrides.setActorOutfitSelection(key, {
      type: 'resource_outfit', basePackId: 'fixture_base', outfitId: 'formal'
    }, 'fixture_base');
    const storyEntry: StoryEntry = {
      turnId: 'resource_outfit', speaker: 'narrator', text: 'outfit', gameTime: state.time,
      blocks: [{
        type: 'dialogue', text: '严肃。', speakerLabel: '固定',
        speakerActorId: 'npc_fixed', emotion: 'serious'
      }]
    };

    const result = await resolveAvgPresentation({
      saveId: 'chain_outfit', storyEntry, runtimeState: state,
      resourceResolver: resolver, activePack, overrideRepository: overrides
    });

    expect(result.frames[0]?.portrait).toMatchObject({
      source: 'fixed', outfitId: 'formal', resolvedVariantId: 'default'
    });
    expect(result.frames[0]?.portrait?.asset.assetId).toBe('formal_default');
    expect(result.diagnostics?.portraits[0]?.outfitSelection).toEqual({
      type: 'resource_outfit', basePackId: 'fixture_base', outfitId: 'formal'
    });
  });

  it('resolves outfit-specific override above actor-wide override, then restores each layer', async () => {
    const state = createInitialRuntimeState();
    const actor = cloneActor('npc_fixed');
    actor.stableIdentityRef = identity;
    state.actors.npc_fixed = actor;
    const overrides = new MemoryAvgVisualOverrideRepository();
    const key = {
      visualPartitionId: 'chain_layers', worldpackId: 'hk1988', actorId: 'npc_fixed'
    };
    const userOutfit = await overrides.createUserOutfit(key, {
      displayName: '晚宴装', visualDescription: '酒红色晚宴装'
    });
    await overrides.setActorOutfitSelection(key, {
      type: 'user_outfit', outfitId: userOutfit.outfitId
    }, 'fixture_base');
    const global = await overrides.replaceActorOverride(key, overrideImage('global-layer'));
    const specificKey = {
      ...key,
      outfit: { type: 'user_outfit' as const, outfitId: userOutfit.outfitId }
    };
    const specific = await overrides.replaceActorOutfitOverride(
      specificKey,
      overrideImage('outfit-layer')
    );
    const storyEntry: StoryEntry = {
      turnId: 'outfit_layers', speaker: 'narrator', text: 'layers', gameTime: state.time,
      blocks: [
        { type: 'dialogue', text: '开心。', speakerLabel: '固定', speakerActorId: 'npc_fixed', emotion: 'happy' },
        { type: 'narration', text: '她稍稍退后。', sourceStyle: 'tagged' }
      ]
    };
    const resolve = () => resolveAvgPresentation({
      saveId: 'chain_layers', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack, overrideRepository: overrides
    });

    const outfitLayer = await resolve();
    expect(outfitLayer.frames[0]?.portrait).toMatchObject({
      source: 'save_override', resolvedVariantId: 'actor_outfit_all_variants'
    });
    expect(outfitLayer.frames[0]?.portrait?.asset.assetId).toBe(specific.mapping.assetId);
    expect(outfitLayer.frames[1]?.portraitStageMode).toBe('receded');

    await overrides.removeActorOutfitOverride(specificKey);
    const globalLayer = await resolve();
    expect(globalLayer.frames[0]?.portrait?.asset.assetId).toBe(global.mapping.assetId);
    expect(globalLayer.frames[0]?.portrait?.outfitId).toBe('actor_all_variants');

    await overrides.removeActorOverride(key);
    const resourceLayer = await resolve();
    expect(resourceLayer.frames[0]?.portrait).toMatchObject({
      source: 'fixed', outfitId: 'default'
    });
    expect(resourceLayer.diagnostics?.portraits[0]?.outfitSelection).toEqual({
      type: 'user_outfit', outfitId: userOutfit.outfitId
    });
  });

  it('falls through a damaged outfit image to the actor-wide override without deleting either mapping', async () => {
    const state = createInitialRuntimeState();
    const actor = cloneActor('npc_fixed');
    actor.stableIdentityRef = identity;
    state.actors.npc_fixed = actor;
    const overrides = new MemoryAvgVisualOverrideRepository();
    const key = {
      visualPartitionId: 'chain_damaged_outfit', worldpackId: 'hk1988', actorId: 'npc_fixed'
    };
    const outfit = await overrides.createUserOutfit(key, { displayName: '便装' });
    await overrides.setActorOutfitSelection(key, {
      type: 'user_outfit', outfitId: outfit.outfitId
    }, 'fixture_base');
    const outfitKey = {
      ...key, outfit: { type: 'user_outfit' as const, outfitId: outfit.outfitId }
    };
    const damaged = await overrides.replaceActorOutfitOverride(
      outfitKey,
      overrideImage('damaged-outfit')
    );
    overrides.removeAssetForTest(damaged.mapping.assetId);
    const global = await overrides.replaceActorOverride(key, overrideImage('safe-global'));
    const storyEntry: StoryEntry = {
      turnId: 'damaged_outfit', speaker: 'narrator', text: 'damaged outfit', gameTime: state.time,
      blocks: [{
        type: 'dialogue', text: '继续显示。', speakerLabel: '固定',
        speakerActorId: 'npc_fixed', emotion: 'serious'
      }]
    };

    const result = await resolveAvgPresentation({
      saveId: 'chain_damaged_outfit', storyEntry, runtimeState: state,
      resourceResolver: fixtureResolver(state), activePack, overrideRepository: overrides
    });
    expect(result.frames[0]?.portrait?.asset.assetId).toBe(global.mapping.assetId);
    expect((await overrides.getActorOutfitOverride(outfitKey))?.status).toBe('asset_missing');
    expect(result.diagnostics?.warnings.some((warning) =>
      warning.startsWith('override-asset-missing:')
    )).toBe(true);
  });
});

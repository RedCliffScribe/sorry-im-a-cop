import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import { hkLateColonialScreenCharacterSeeds } from './hkLateColonialScreenCharacterSeeds';

function fullMarkLeePatch(actorId: string) {
  const card = hkLateColonialScreenCharacterSeeds.find(
    (candidate) => candidate.id === 'screen_film_better_tomorrow_mark_lee'
  );
  if (!card) throw new Error('Missing Mark Lee screen character seed.');
  return {
    actorId,
    name: card.displayName,
    aliases: [...card.recognitionAliases],
    gender: card.gender,
    computedAge: 36,
    currentIdentity: card.currentIdentity,
    publicIdentity: card.publicIdentity,
    actualIdentitySummary: card.actualIdentitySummary,
    positionSummary: card.positionSummary,
    profileSummary: card.profileSummary,
    appearance: card.appearanceAnchor,
    clothing: card.clothingAnchor,
    equipment: ['打火机'],
    personality: card.personality,
    speechStyle: card.speechStyle,
    motivation: card.motivation,
    longTermGoal: card.longTermGoal,
    values: card.values,
    attributes: { body: 62, action: 76, perception: 68, thinking: 61, negotiation: 65, will: 82 },
    relationshipSummary: card.relationshipAnchors.join('；'),
    attitudeTowardPlayer: '先观察玩家是否守信。',
    interactionScore: 8,
    trustTendency: '只把真正守义气的人当自己人。',
    entanglementSummary: '旧集团、兄弟恩怨和码头生意仍会牵动他。',
    longTermMemorySummary: '记得自己曾被背叛和羞辱。',
    recentInteractionMemory: '刚与玩家在码头短暂交谈。',
    statusSummary: '在码头附近等待一条消息。',
    bodyConditionSummary: '旧伤偶尔影响动作，但精神仍锐利。',
    currentPlaceId: 'place_kowloon_docks',
    presence: 'mentioned' as const,
    visibility: 'player_known' as const,
    importance: card.importance
  };
}

describe('screen character writeback identity lock', () => {
  it('does not reclassify an existing ordinary Actor solely because its name matches a role', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1986;
    state.actors.npc_unrelated_mark_lee = createActorDefaults({
      actorId: 'npc_unrelated_mark_lee',
      name: '李马克',
      currentIdentity: 'civilian'
    });

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家与同名的普通市民李马克交谈。',
      turnSummary: '普通市民李马克更新了自己的近况。',
      writeback: {
        actorPatches: [fullMarkLeePatch('npc_unrelated_mark_lee')]
      }
    });
    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_unrelated_mark_lee).toBeDefined();
    expect(next.actors.npc_screen_screen_film_better_tomorrow_mark_lee).toBeUndefined();
    expect(JSON.stringify(next.actors.npc_unrelated_mark_lee.worldpackActorData ?? {})).not.toContain(
      'screenCharacterIdentity'
    );
  });

  it('keeps a screen character separate from the real public figure and reuses one Actor', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1986;
    state.actors.npc_seed_fig_fat_gor_brooding_lead = createActorDefaults({
      actorId: 'npc_seed_fig_fat_gor_brooding_lead',
      name: '周润发',
      englishName: 'Chow Yun-fat',
      currentIdentity: 'civilian',
      worldpackActorData: {
        hk1988: {
          eraSeedIdentity: {
            canonicalSeedId: 'fig_fat_gor_brooding_lead',
            seedFigureId: 'fig_fat_gor_brooding_lead',
            displayName: '周润发',
            englishName: 'Chow Yun-fat'
          }
        }
      }
    });

    const firstResponse = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家在码头见到李马克。',
      turnSummary: '玩家首次在码头与李马克交谈。',
      writeback: {
        actorPatches: [fullMarkLeePatch('npc_screen_screen_film_better_tomorrow_mark_lee')],
        actorMemories: [
          {
            actorId: 'npc_screen_screen_film_better_tomorrow_mark_lee',
            actorName: '李马克',
            text: '李马克记得玩家在码头没有追问旧集团的秘密。',
            importance: 62,
            visibility: 'player_known'
          }
        ]
      }
    });
    const first = applyNarratorResponse(state, firstResponse);
    const roleActorId = 'npc_screen_screen_film_better_tomorrow_mark_lee';
    const roleActor = first.actors[roleActorId];

    expect(first.actors.npc_temp_mark_lee).toBeUndefined();
    expect(first.actors.npc_seed_fig_fat_gor_brooding_lead).toMatchObject({
      name: '周润发',
      englishName: 'Chow Yun-fat'
    });
    expect(roleActor).toMatchObject({
      actorId: roleActorId,
      name: '李马克',
      worldpackActorData: {
        hk1988: {
          screenCharacterIdentity: {
            canonicalCharacterId: 'screen_film_better_tomorrow_mark_lee',
            seedCharacterId: 'screen_film_better_tomorrow_mark_lee',
            sourceWorkId: 'work_film_better_tomorrow',
            displayName: '李马克'
          }
        }
      }
    });
    expect(roleActor.aliases).toEqual(expect.arrayContaining(['小马哥', 'Mark Lee']));
    expect(JSON.stringify(roleActor)).not.toMatch(/周润发|Chow Yun-fat/u);
    expect(
      Object.values(first.memories).some(
        (memory) => memory.relatedActorIds.includes(roleActorId) && memory.text.includes('码头')
      )
    ).toBe(true);
    const secondResponse = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '小马哥换了地方等消息。',
      turnSummary: '李马克改到货仓外等候。',
      writeback: {
        actorPatches: [
          {
            actorId: 'npc_mark_again',
            name: '小马哥',
            statusSummary: '在货仓外等候。',
            worldpackActorData: {
              hk1988: {
                eraSeedIdentity: {
                  canonicalSeedId: 'fig_fat_gor_brooding_lead',
                  displayName: '周润发'
                },
                screenCharacterIdentity: {
                  canonicalCharacterId: 'screen_film_better_tomorrow_mark_lee',
                  seedCharacterId: 'screen_film_better_tomorrow_mark_lee',
                  sourceWorkId: 'work_film_better_tomorrow',
                  displayName: '李马克'
                }
              }
            }
          }
        ]
      }
    });
    const second = applyNarratorResponse(first, secondResponse);

    expect(second.actors.npc_mark_again).toBeUndefined();
    expect(Object.keys(second.actors).filter((actorId) => actorId.startsWith('npc_screen_'))).toEqual([
      roleActorId
    ]);
    expect(second.actors[roleActorId].statusSummary).toBe('在货仓外等候。');
    expect(second.actors[roleActorId].worldpackActorData?.hk1988).not.toHaveProperty('eraSeedIdentity');
    expect(second.actors.npc_seed_fig_fat_gor_brooding_lead.name).toBe('周润发');
  });

  it('does not turn a generic actor into a screen character from a nickname alias alone', () => {
    const state = createInitialRuntimeState();
    const genericPatch = {
      ...fullMarkLeePatch('npc_driver_ah_shing'),
      name: '陈志成',
      callName: '阿成',
      aliases: ['成哥'],
      publicIdentity: '夜班的士司机',
      actualIdentitySummary: '在油麻地与旺角之间跑夜班的普通司机。',
      currentIdentity: 'civilian' as const
    };

    const response = validateNarratorResponse({
      writebackVersion: '1.5',
      narrativeText: '玩家在街口截停阿成的的士问路。',
      turnSummary: '玩家认识了夜班司机阿成。',
      writeback: { actorPatches: [genericPatch] }
    });
    const next = applyNarratorResponse(state, response);

    expect(next.actors.npc_driver_ah_shing).toMatchObject({
      name: '陈志成',
      callName: '阿成',
      publicIdentity: '夜班的士司机'
    });
    expect(next.actors.npc_screen_screen_film_better_tomorrow_sung_ah_shing).toBeUndefined();
    expect(JSON.stringify(next.actors.npc_driver_ah_shing.worldpackActorData ?? {})).not.toContain(
      'screenCharacterIdentity'
    );
  });
});

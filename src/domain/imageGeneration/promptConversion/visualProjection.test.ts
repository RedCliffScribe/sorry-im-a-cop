import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../../runtime/actorFactory';
import {
  createStoryVisualBlocks,
  hashStoryText,
  projectActorForVisualConversion,
  projectActorIdentityForScenePlanning,
  projectAnchoredActorsForScenePlanning
} from './visualProjection';

describe('visual conversion source projection', () => {
  it('whitelists public visual actor fields and excludes secrets, memories and adult-private data', () => {
    const actor = createActorDefaults({
      actorId: 'actor_mei',
      name: '阿梅',
      gender: 'female',
      currentIdentity: 'civilian',
      publicIdentity: '酒吧侍应',
      actualIdentitySummary: '秘密线人 SECRET_IDENTITY',
      positionSummary: '吧台内侧',
      visualAgeAnchor: '约二十五岁',
      appearance: '齐肩黑发，圆脸',
      clothing: '白衬衣和黑色长裤',
      equipment: ['银色腕表'],
      longTermMemorySummary: 'PRIVATE_MEMORY',
      recentInteractionMemory: 'RECENT_PRIVATE_MEMORY',
      femaleProfile: {
        appearanceDescription: '左眼下有一颗小痣',
        bodyDescription: '身形修长',
        clothingStyle: '简洁利落',
        appearanceExtension: '常把头发别到耳后',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          summary: 'ADULT_PRIVATE_SECRET'
        }
      }
    });

    const projected = projectActorForVisualConversion(actor);
    const serialized = JSON.stringify(projected);

    expect(projected).toMatchObject({
      actorId: 'actor_mei',
      publicName: '阿梅',
      appearanceDescription: '左眼下有一颗小痣',
      bodyDescription: '身形修长',
      clothingStyle: '简洁利落'
    });
    expect(serialized).not.toContain('SECRET_IDENTITY');
    expect(serialized).not.toContain('PRIVATE_MEMORY');
    expect(serialized).not.toContain('RECENT_PRIVATE_MEMORY');
    expect(serialized).not.toContain('ADULT_PRIVATE_SECRET');
    expect(serialized).not.toContain('actualIdentitySummary');
    expect(serialized).not.toContain('adultPrivateProfile');
  });

  it('projects only public actor names and de-duplicated aliases for scene binding', () => {
    const actor = createActorDefaults({
      actorId: 'actor_mei',
      name: '陈美玲',
      englishName: 'Mei Ling Chen',
      aliases: ['阿玲', '陈美玲', '阿玲', '  '],
      callName: '美玲',
      gender: 'female',
      currentIdentity: 'civilian',
      actualIdentitySummary: 'SECRET_IDENTITY',
      longTermMemorySummary: 'PRIVATE_MEMORY',
      femaleProfile: {
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          summary: 'ADULT_PRIVATE_SECRET'
        }
      }
    });

    const projected = projectActorIdentityForScenePlanning(actor);
    const serialized = JSON.stringify(projected);

    expect(projected).toEqual({
      publicName: '陈美玲',
      publicAliases: ['美玲', 'Mei Ling Chen', '阿玲']
    });
    expect(serialized).not.toContain('SECRET_IDENTITY');
    expect(serialized).not.toContain('PRIVATE_MEMORY');
    expect(serialized).not.toContain('ADULT_PRIVATE_SECRET');
  });

  it('offers anchored actor candidates beyond an incomplete frozen presence list without leaking unanchored actors', () => {
    const present = createActorDefaults({
      actorId: 'player',
      name: '玩家',
      gender: 'male',
      currentIdentity: 'police'
    });
    const laterKnown = createActorDefaults({
      actorId: 'actor_mei',
      name: '陈美玲',
      aliases: ['美玲'],
      gender: 'female',
      currentIdentity: 'civilian'
    });
    const unanchored = createActorDefaults({
      actorId: 'actor_secret',
      name: '没有锚点的人',
      gender: 'unknown',
      currentIdentity: 'civilian'
    });

    const projected = projectAnchoredActorsForScenePlanning({
      actors: {
        player: present,
        actor_mei: laterKnown,
        actor_secret: unanchored
      },
      anchors: [{
        actorId: 'actor_mei',
        anchorText: `【固定外观】黑发
【默认服装】碎花衬衫
【一致性要求】保持脸部一致
【避免偏移】避免改变发色`
      }],
      priorityActorIds: ['player']
    });

    expect(projected).toEqual([expect.objectContaining({
      actorId: 'actor_mei',
      publicName: '陈美玲',
      publicAliases: ['美玲']
    })]);
    expect(JSON.stringify(projected)).not.toContain('没有锚点的人');
  });

  it('creates stable tagged blocks without local semantic guessing', async () => {
    const text = ['【旁白】雨打在招牌上。', '【阿梅】你迟到了。', '没有标签的动作描写。'].join('\n');
    const first = await createStoryVisualBlocks('turn_7', text);
    const second = await createStoryVisualBlocks('turn_7', text);

    expect(first).toEqual(second);
    expect(first).toMatchObject([
      { blockIndex: 0, kind: 'narration', text: '雨打在招牌上。' },
      { blockIndex: 1, kind: 'dialogue', speakerLabel: '阿梅', text: '你迟到了。' },
      { blockIndex: 2, kind: 'plain', text: '没有标签的动作描写。' }
    ]);
    expect(first.every((block) => /^[a-f0-9]{64}$/.test(block.blockHash))).toBe(true);
    expect((await createStoryVisualBlocks('turn_8', text))[0].blockHash).not.toBe(first[0].blockHash);
    expect(await hashStoryText(text)).toMatch(/^[a-f0-9]{64}$/);
  });
});

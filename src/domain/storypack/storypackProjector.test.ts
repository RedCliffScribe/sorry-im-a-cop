import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { hk1988StorypackCards, hkLateColonialStorypackCards } from './hk1988StorypackCards';
import { projectStorypackContext, validateStorypackCards } from './storypackProjector';

describe('storypack projection', () => {
  it('bundles validated Storypack V2 late-colonial Hong Kong cards for runtime use', () => {
    const validation = validateStorypackCards(hk1988StorypackCards);

    expect(validation).toMatchObject({
      total: 1800,
      counts: {
        HistoricalEventCard: 700,
        SectorPressureCard: 500,
        DramaMotifCard: 600
      },
      errors: []
    });
    expect(hk1988StorypackCards).toBe(hkLateColonialStorypackCards);

    const choiEvent = hk1988StorypackCards.find((card) => card.id === 'he_137');
    expect(choiEvent).toMatchObject({ title: '蔡子明遇害' });
    expect(JSON.stringify(choiEvent)).toMatch(/李连杰|Jet Li|蔡子明|Choi Chi-ming/u);
    expect(JSON.stringify(choiEvent)).not.toMatch(/才经理|阿捷/u);
  });

  it('rejects Round 1 prompt-safe text that leaks protected film or drama source terms', () => {
    const validation = validateStorypackCards([
      {
        type: 'DramaMotifCard',
        id: 'dm_bad_source_leak',
        motifName: 'bad source leak',
        timeWindow: { applicableFromYear: 1980, applicableUntilYear: 1998 },
        promptSafeVersion: '这个桥段直接写出赌神、跛豪、寒戰和壹號皇庭作为提示词。',
        identityVariants: {
          police: '警察视角',
          civilian: '市民视角',
          gang_member: '社团视角'
        },
        paraphraseVariants: ['改写一', '改写二', '改写三'],
        copyRisk: 'high'
      }
    ]);

    expect(validation.errors).toEqual(['dm_bad_source_leak: promptSafeVersion leaks protected source term']);
  });

  it('reports missing prompt-safe text instead of crashing when runtime data is not a string', () => {
    const validation = validateStorypackCards([
      {
        type: 'DramaMotifCard',
        id: 'dm_bad_prompt_type',
        motifName: 'bad prompt type',
        timeWindow: { applicableFromYear: 1980, applicableUntilYear: 1998 },
        promptSafeVersion: 42,
        identityVariants: {
          police: '警察视角',
          civilian: '市民视角',
          gang_member: '社团视角'
        },
        paraphraseVariants: ['改写一', '改写二', '改写三'],
        copyRisk: 'high'
      }
    ] as unknown as Parameters<typeof validateStorypackCards>[0]);

    expect(validation.errors).toEqual(['dm_bad_prompt_type: missing promptSafeVersion']);
  });

  it('selects relevant prompt-safe material without creating a fixed event', () => {
    const state = createInitialRuntimeState({ storypackInfluence: 'high' });
    const projection = projectStorypackContext(state, '去清水湾电视城找娱乐记者问问片场纠纷');

    const selectedIds = projection.cards.map((card) => card.id);
    expect(selectedIds).toContain('he_003');
    expect(selectedIds).toContain('sp_006');
    expect(projection.diagnostics.estimatedTokenBudget).toBe(10000);
    expect(projection.diagnostics.selectedTextChars).toBeLessThanOrEqual(10000);
    expect(projection.rules.join('\n')).toContain('optional');
    expect(projection.rules.join('\n')).toContain('not a fixed event');
    expect(projection.rules.join('\n')).toContain('public-figure Chinese and English names');

    const projectedText = projection.cards.map((card) => card.promptSafeVersion).join('\n');
    expect(projectedText).toContain('新电视城');
    expect(projectedText).not.toMatch(/TVB|无间道|無間道|英雄本色|古惑仔|寒战|PTU|十二少/u);
  });

  it('honors the off influence level', () => {
    const state = createInitialRuntimeState({ storypackInfluence: 'off' });
    const projection = projectStorypackContext(state, '去清水湾电视城找娱乐记者');

    expect(projection.cards).toEqual([]);
    expect(projection.diagnostics.estimatedTokenBudget).toBe(0);
  });

  it('does not project arbitrary baseline cards without a concrete storypack signal', () => {
    const state = createInitialRuntimeState({ storypackInfluence: 'high' });
    const projection = projectStorypackContext(state, '继续');

    expect(projection.cards).toEqual([]);
    expect(projection.diagnostics.selectedCardIds).toEqual([]);
  });

  it('rejects protected source terms in prompt-visible fields beyond promptSafeVersion', () => {
    const validation = validateStorypackCards([
      {
        type: 'DramaMotifCard',
        id: 'dm_bad_visible_title',
        motifName: '赌神式赌桌风波',
        timeWindow: { applicableFromYear: 1980, applicableUntilYear: 1998 },
        promptSafeVersion: '赌桌上有人借牌局遮掩债务和面子压力。',
        identityVariants: {
          police: '警察视角',
          civilian: '市民视角',
          gang_member: '社团视角'
        },
        paraphraseVariants: ['改写一', '改写二', '改写三'],
        copyRisk: 'high'
      }
    ]);

    expect(validation.errors).toEqual(['dm_bad_visible_title: prompt-visible field title leaks protected source term']);
  });

  it('rejects generated template artifacts in prompt-visible identity hooks', () => {
    const validation = validateStorypackCards([
      {
        type: 'HistoricalEventCard',
        id: 'he_bad_identity_hook_template',
        title: 'bad identity hook template',
        category: 'police',
        timeWindow: {
          firstUsableYear: 1980,
          factualFromYear: 1980,
          factualUntilYear: 1988,
          afterlifeUntilYear: 1998
        },
        realEventBasis: 'test basis',
        publicSummary: 'test summary',
        socialImpact: 'test impact',
        usableAngles: ['test angle'],
        relatedSectors: ['police'],
        relatedPlaces: [],
        fictionalizedEcho: 'test echo',
        promptSafeVersion: '可作为时代背景使用。',
        structuralInspiration: 'test inspiration',
        copyRisk: 'low',
        sourceConfidence: 'medium',
        identityHooks: {
          police: '同relatedSectors警察视角',
          civilian: '市民视角',
          gang_member: '社团视角'
        }
      }
    ]);

    expect(validation.errors).toEqual([
      'he_bad_identity_hook_template: prompt-visible field identityHook contains generator artifact'
    ]);
  });

  it('gates later entertainment crime echoes by year and keeps them prompt-safe', () => {
    const state = createInitialRuntimeState({
      storypackInfluence: 'high',
      startTime: { year: 1992, month: 4, day: 20, hour: 22, minute: 10 }
    });
    const projection = projectStorypackContext(state, '调查功夫明星经纪人枪击和片场合约压力');

    const selectedIds = projection.cards.map((card) => card.id);
    expect(selectedIds).toContain('he_137');

    const projectedText = projection.cards.map((card) => card.promptSafeVersion).join('\n');
    expect(projectedText).toContain('李连杰');
    expect(projectedText).toContain('Jet Li');
    expect(projectedText).toContain('蔡子明');
    expect(projectedText).toContain('Choi Chi-ming');
    expect(projectedText).not.toMatch(/才经理|阿捷|黄飞鸿|笑傲江湖|东方不败|英雄本色|无间道|古惑仔/u);
  });

  it('projects V2 coverage material across core play domains', () => {
    const state = createInitialRuntimeState({ storypackInfluence: 'high' });
    const cases = [
      { input: '去片场问武师保险和临时演员登记', sectors: ['film_company'], text: /片场|武师|临时演员|保险/u },
      { input: '查投诉科和廉署咖啡问话压力', sectors: ['icac', 'police'], text: /廉署|投诉科|咖啡|警队/u },
      { input: '追证券经纪夜逃和楼花认购书风波', sectors: ['finance', 'real_estate'], text: /证券|经纪|楼花|金融/u },
      { input: '去屋邨问逃学少年和互委会阿姐', sectors: ['public_housing', 'school'], text: /屋邨|逃学|少年|互委/u },
      { input: '调查夜总会后台保护费和包房纠纷', sectors: ['nightlife', 'gang'], text: /夜总会|后台|保护费|包房/u },
      { input: '问娱乐周刊偷拍和报馆匿名信', sectors: ['media', 'entertainment_weekly'], text: /娱乐周刊|偷拍|报馆|匿名/u },
      { input: '去货柜码头查报关单和夜班司机', sectors: ['transport', 'customs'], text: /货柜|码头|报关|司机/u },
      { input: '急症室假跌倒和私家诊所病假纸', sectors: ['hospital', 'clinic_note'], text: /急症室|诊所|病假|医院/u }
    ];

    for (const item of cases) {
      const projection = projectStorypackContext(state, item.input);
      const projectedText = projection.cards
        .map((card) => [card.title, card.promptSafeVersion, card.categoryOrSector, ...card.relatedSectors].join(' '))
        .join('\n');
      expect(projection.cards.some((card) => card.reasons.includes('player_input'))).toBe(true);
      expect(projection.cards.some((card) => item.sectors.some((sector) => card.relatedSectors.includes(sector)))).toBe(
        true
      );
      expect(projectedText).toMatch(item.text);
      expect(projection.diagnostics.selectedTextChars).toBeLessThanOrEqual(
        projection.diagnostics.estimatedTokenBudget
      );
    }
  });
});

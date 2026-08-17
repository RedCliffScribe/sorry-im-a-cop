import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { hkLateColonialEraSeedFigures } from './hkLateColonialEraSeedFigures';
import {
  hkLateColonialEntertainmentFigureExpansion,
  hkLateColonialEntertainmentFigureExpansionSource
} from './hkLateColonialEntertainmentFigureExpansion';
import { projectEraSeedFigureContext, validateEraSeedFigures } from './eraSeedFigureProjector';

function normalizeIdentity(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\-–—·.(),'’]/gu, '');
}

describe('era seed figure projection', () => {
  it('keeps public era figures in the knowledge layer instead of opening runtime actors', () => {
    const validation = validateEraSeedFigures(hkLateColonialEraSeedFigures);
    const state = createInitialRuntimeState();

    expect(validation).toMatchObject({
      total: 379,
      counts: {
        entertainment: 361,
        literature_media: 12,
        business_backstage: 6
      },
      errors: []
    });
    expect(hkLateColonialEraSeedFigures.filter((figure) => figure.englishName)).toHaveLength(370);
    expect(
      hkLateColonialEraSeedFigures.filter(
        (figure) => figure.category === 'entertainment' && figure.englishName
      )
    ).toHaveLength(357);
    expect(hkLateColonialEraSeedFigures.every((figure) => (figure.protectedRealNames ?? []).length === 0)).toBe(true);
    expect(hkLateColonialEraSeedFigures.flatMap((figure) => figure.recognitionAliases)).not.toContainEqual(
      expect.stringContaining('影子')
    );
    expect(Object.keys(state.actors)).toEqual(['player']);
  });

  it('keeps the expanded public-figure roster compact, stable, unique, and inside the era window', () => {
    expect(hkLateColonialEntertainmentFigureExpansionSource).toHaveLength(299);
    expect(hkLateColonialEntertainmentFigureExpansion).toHaveLength(299);

    const ids = hkLateColonialEntertainmentFigureExpansion.map((figure) => figure.id);
    const sourceIds = hkLateColonialEntertainmentFigureExpansionSource.map((figure) => figure.sourceId);
    const displayNames = hkLateColonialEntertainmentFigureExpansion.map((figure) =>
      normalizeIdentity(figure.displayName)
    );
    const englishNames = hkLateColonialEntertainmentFigureExpansion.map((figure) =>
      normalizeIdentity(figure.englishName ?? '')
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(displayNames).size).toBe(displayNames.length);
    expect(new Set(englishNames).size).toBe(englishNames.length);
    expect(
      hkLateColonialEntertainmentFigureExpansion.every(
        (figure) =>
          figure.activeYears.from >= 1980 &&
          figure.activeYears.to <= 1996 &&
          figure.activeYears.from <= figure.activeYears.to
      )
    ).toBe(true);
    expect(
      hkLateColonialEntertainmentFigureExpansion.every(
        (figure) => figure.promptSafeProfile.length < 220 && figure.usualPlaceIds.length === 0
      )
    ).toBe(true);
  });

  it('keeps dedicated AVG portrait candidates at A-tier importance', () => {
    const aTierNames = [
      '钟楚红',
      '关之琳',
      '王祖贤',
      '李嘉欣',
      '邱淑贞',
      '叶子楣',
      '叶玉卿',
      '陈宝莲',
      '李华月',
      '彭丹',
      '麦家琪',
      '村上丽奈'
    ];

    expect(
      aTierNames.map((displayName) => {
        const figure = hkLateColonialEraSeedFigures.find((item) => item.displayName === displayName);
        return {
          displayName,
          importance: figure?.importance
        };
      })
    ).toEqual(aTierNames.map((displayName) => ({ displayName, importance: expect.any(Number) })));
    expect(
      hkLateColonialEraSeedFigures
        .filter((figure) => aTierNames.includes(figure.displayName))
        .every((figure) => figure.importance >= 90)
    ).toBe(true);
  });

  it('selects recognizable film and literary seeds with canonical Chinese and English names', () => {
    const state = createInitialRuntimeState();
    const projection = projectEraSeedFigureContext(
      state,
      '去片场找那个功夫明星的经纪人，再问报馆查先生和那个好酒的武侠小说家旧事'
    );

    const selectedIds = projection.figures.map((figure) => figure.id);
    expect(selectedIds).toContain('fig_lian_jit_action_star');
    expect(selectedIds).toContain('fig_choi_manager_shadow');
    expect(selectedIds).toContain('fig_cha_sir_wuxia_publisher');
    expect(selectedIds).toContain('fig_gu_lung_wine_swordsman');
    expect(projection.diagnostics.selectedTextChars).toBeLessThanOrEqual(
      projection.diagnostics.estimatedTokenBudget
    );
    expect(projection.rules.join('\n')).toContain('not fixed NPCs');
    expect(projection.rules.join('\n')).toContain('Create Actor only');

    const promptText = projection.figures
      .map(
        (figure) =>
          `${figure.displayName}\n${figure.englishName ?? ''}\n${figure.promptSafeProfile}\n${figure.accessRoutes.join('\n')}`
      )
      .join('\n');
    expect(promptText).toMatch(/李连杰/u);
    expect(promptText).toMatch(/Jet Li/u);
    expect(promptText).toMatch(/蔡子明/u);
    expect(promptText).toMatch(/Choi Chi-ming/u);
    expect(promptText).toMatch(/金庸/u);
    expect(promptText).toMatch(/古龙/u);
    expect(promptText).not.toMatch(/李联捷|才志明|查良庸|古隆/u);
  });

  it('projects canonical real names while retaining one stable actor identity', () => {
    const state = createInitialRuntimeState();
    const projection = projectEraSeedFigureContext(state, '去电台找张学友的唱片公司旧档案');
    const figure = projection.figures.find((item) => item.id === 'fig_jacky_crooner_rising');

    expect(figure).toMatchObject({
      canonicalSeedId: 'fig_jacky_crooner_rising',
      runtimeActorId: 'npc_seed_fig_jacky_crooner_rising',
      displayName: '张学友',
      englishName: 'Jacky Cheung'
    });
    expect(JSON.stringify(projection)).not.toMatch(/张学佑|张学仁/u);
  });

  it('recalls Li Chi by Chinese or English name without creating a second identity', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1989;
    const projection = projectEraSeedFigureContext(state, '查利智 Nina Li Chi 最近的片场通告');
    const figure = projection.figures.find((item) => item.id === 'fig_hk_ent_q283983');

    expect(figure).toMatchObject({
      canonicalSeedId: 'fig_hk_ent_q283983',
      runtimeActorId: 'npc_seed_fig_hk_ent_q283983',
      displayName: '利智',
      englishName: 'Nina Li Chi'
    });
    expect(figure?.recognitionAliases).toContain('Nina Li');
    expect(projection.figures.filter((item) => item.displayName === '利智')).toHaveLength(1);
    expect(projection.figures.length).toBeLessThanOrEqual(12);
  });

  it('keeps later debuts out of earlier years and never projects more than twelve candidates', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1984;
    const projection = projectEraSeedFigureContext(
      state,
      '去电影片场查演员、导演、摄影、制片和幕后制作人员的通告名单'
    );

    expect(projection.figures.length).toBeLessThanOrEqual(12);
    expect(projection.figures.map((figure) => figure.id)).not.toContain('fig_hk_ent_q283983');
    expect(projection.figures.map((figure) => figure.id)).not.toContain('fig_hk_ent_q531617');
    expect(projection.diagnostics.totalFigures).toBe(379);
  });

  it('rotates broad tied candidates deterministically as the saved turn context changes', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1989;
    const input = '去电影片场查看演员和幕后制作人员的通告名单';

    const first = projectEraSeedFigureContext(state, input);
    const repeated = projectEraSeedFigureContext(state, input);
    const nextTurnState = { ...state, turnCounter: state.turnCounter + 1 };
    const nextTurn = projectEraSeedFigureContext(nextTurnState, input);

    expect(first.figures.map((figure) => figure.id)).toEqual(repeated.figures.map((figure) => figure.id));
    expect(first.figures).toHaveLength(12);
    expect(nextTurn.figures).toHaveLength(12);
    expect(nextTurn.figures.map((figure) => figure.id)).not.toEqual(
      first.figures.map((figure) => figure.id)
    );
  });
});

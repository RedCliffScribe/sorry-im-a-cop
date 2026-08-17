import { describe, expect, it, vi } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { createAuxiliaryNewsPrompt, maybeGenerateAuxiliaryNews } from './auxiliaryNewsGeneration';

describe('auxiliary news generation', () => {
  it('uses the current game year without exposing the internal worldpack id', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1994, month: 7, day: 10, hour: 20, minute: 0 }
    });

    const prompt = createAuxiliaryNewsPrompt(state, '', 'daily_digest');

    expect(prompt).toContain('1994 年香港语境');
    expect(prompt).toContain('1994 都市裂缝');
    expect(prompt).toContain('hk_1994_electoral_reform');
    expect(prompt).not.toContain('worldpack=hk_1988');
  });

  it('does not pass private player activity or player-linked matters as newspaper material', () => {
    const state = createInitialRuntimeState();
    state.dynamicEvents.currentMatters.matter_private_car = {
      id: 'matter_private_car',
      title: '新买的私家车',
      summary: '玩家刚买了一辆普通私家车。',
      status: 'active',
      priority: 40,
      visibility: 'known',
      source: 'personal',
      matterKind: 'personal',
      relatedActorIds: [state.player.actorId],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };

    const prompt = createAuxiliaryNewsPrompt(state, '我买了一辆车，再看看报纸。', 'manual_newspaper');

    expect(prompt).not.toContain('我买了一辆车');
    expect(prompt).not.toContain('新买的私家车');
    expect(prompt).toContain('玩家正在读报；这不是新闻素材');
    expect(prompt).toContain('普通人的买车买楼');
    expect(prompt).toContain('不得声称任何地铁线路、隧道、道路或大型设施');
  });

  it('requires Hong Kong Traditional Chinese when the selected locale is zh-Hant-HK', () => {
    const state = createInitialRuntimeState();

    const prompt = createAuxiliaryNewsPrompt(state, '', 'daily_digest', undefined, 'zh-Hant-HK');

    expect(prompt).toContain('所有直接显示给玩家的自然语言内容必须使用香港繁體中文');
    expect(prompt).toContain('JSON 字段名、稳定 ID、枚举值、协议常量');
  });

  it('generates overdue news on the first turn after 06:00 even when the morning window was missed', async () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1994, month: 7, day: 10, hour: 20, minute: 0 }
    });
    state.dynamicEvents.newsIssues.news_old = {
      id: 'news_old',
      date: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      outletName: '大公报',
      headline: '旧报纸',
      summary: '两日前的报纸。',
      articles: [],
      createdAt: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      updatedAt: { year: 1994, month: 7, day: 8, hour: 7, minute: 0 },
      read: true
    };
    const auxiliaryGeneration = {
      complete: vi.fn().mockResolvedValue({ newsIssuePatches: [] })
    };

    await maybeGenerateAuxiliaryNews({
      state,
      playerInput: '',
      auxiliaryGeneration,
      promptSettings: { overrides: { 'news.generation': 'CUSTOM_NEWS_GENERATION_RULES' } },
      locale: 'zh-Hant-HK'
    });

    expect(auxiliaryGeneration.complete).toHaveBeenCalledTimes(1);
    expect(auxiliaryGeneration.complete).toHaveBeenCalledWith(expect.stringContaining('CUSTOM_NEWS_GENERATION_RULES'));
    expect(auxiliaryGeneration.complete).toHaveBeenCalledWith(expect.stringContaining('香港繁體中文'));
  });

  it('keeps city news but rejects an ordinary-player purchase returned by the auxiliary model', async () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const auxiliaryGeneration = {
      complete: vi.fn().mockResolvedValue({
        newsIssuePatches: [
          {
            id: 'news_19880912_test',
            outletName: '明报',
            headline: '本港要闻',
            summary: '社会与金融消息。',
            articles: [
              {
                id: 'article_player_car',
                section: 'local',
                headline: '普通市民购入私家车',
                body: '玩家买了一辆私家车。',
                playerRelated: true,
                relatedActorIds: [state.player.actorId],
                relatedPlaceIds: [],
                relatedCaseIds: [],
                relatedOrganizationIds: []
              },
              {
                id: 'article_monetary',
                section: 'business',
                headline: '银行界关注货币安排',
                body: '银行界继续关注联系汇率制度的运作。',
                playerRelated: false,
                relatedActorIds: [],
                relatedPlaceIds: [],
                relatedCaseIds: [],
                relatedOrganizationIds: []
              }
            ]
          }
        ]
      })
    };

    const next = await maybeGenerateAuxiliaryNews({
      state,
      playerInput: '看看今天报纸',
      auxiliaryGeneration
    });

    expect(next.dynamicEvents.newsIssues.news_19880912_test.articles.map((article) => article.id)).toEqual([
      'article_monetary'
    ]);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'player_news_suppressed' })
      ])
    );
  });

  it('keeps only the first newspaper issue when the auxiliary model returns duplicate candidates', async () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const createIssue = (id: string, headline: string) => ({
      id,
      outletName: '明报',
      headline,
      summary: '本港公共消息。',
      articles: [
        {
          id: `${id}_article`,
          section: 'local',
          headline: '市区交通繁忙',
          body: '繁忙时段公共交通需求上升。',
          playerRelated: false,
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ]
    });
    const auxiliaryGeneration = {
      complete: vi.fn().mockResolvedValue({
        newsIssuePatches: [
          createIssue('news_first', '第一期'),
          createIssue('news_duplicate', '重复候选')
        ]
      })
    };

    const next = await maybeGenerateAuxiliaryNews({
      state,
      playerInput: '看看今天报纸',
      auxiliaryGeneration
    });

    expect(Object.keys(next.dynamicEvents.newsIssues)).toEqual(['news_first']);
    expect(next.storyLog.at(-1)?.writebackDiagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'auxiliary_news_extra_issues_ignored' })
      ])
    );
  });
});

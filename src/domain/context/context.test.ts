import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type {
  Actor,
  CombatEvent,
  CaseEvidence,
  CaseFile,
  CurrentMatter,
  DeferredEvent,
  JudgementCheck,
  MemoryItem,
  NewsIssue,
  PressureHook,
  RelationshipThread,
  RuntimeState,
  Signal,
  VehicleAsset
} from '../runtime/types';
import { composePrompt } from './composePrompt';
import { selectContext } from './selectContext';

describe('context selection', () => {
  const openingPressureIds = ['relaxed', 'routine', 'standard', 'tense', 'high'] as const;

  it('selects current place, scene, present actors, and limited pressure hooks', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '我看看报案室里有没有熟人');

    expect(context.currentPlace?.name).toBe('旺角警署');
    expect(context.currentScene?.name).toBe('报案室');
    expect(context.presentActors.map((actor) => actor.actorId)).toContain('player');
    expect(context.pressures.length).toBeLessThanOrEqual(1);
  });

  it('includes player origin and background in the context player summary', () => {
    const state = createInitialRuntimeState({
      policeNumber: '9527',
      originBackground: {
        originBackgroundId: 'mainland_newcomer_family',
        name: '大陆新移民家庭',
        definition: '家中有人从内地来港。',
        backgroundSummary: 'LLM 可生成亲属、落脚屋邨和两地关系牵连。'
      }
    });
    const context = selectContext(state, '问问家里近况');

    expect(context.playerSummary).toContain('大陆新移民家庭');
    expect(context.playerSummary).toContain('亲属');
    expect(context.playerSummary).toContain('警员编号：9527');
  });

  it('asks the opening narrator to generate a four-digit police number when none was entered', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '开局');

    expect(context.playerSummary).toContain('警员编号：未填写，开局需要生成四位数字');
  });

  it('feeds clothing and equipment into later prompt context', () => {
    const state = createInitialRuntimeState();
    state.player.clothing = '浅蓝短袖衬衫、灰色西裤和便鞋';
    state.player.clothingState = {
      currentSummary: state.player.clothing,
      mode: 'off_duty_plain',
      lastChangedReason: '下班后在警署更衣室换成便服。',
      lastChangedAt: { ...state.time }
    };
    state.player.equipment = ['警察委任证', '警棍', '点三八左轮'];
    state.actors.player.clothing = state.player.clothing;
    state.actors.player.equipment = [...state.player.equipment];

    const context = selectContext(state, '巡逻前检查装备');
    const prompt = composePrompt(context, '巡逻前检查装备');

    expect(context.playerSummary).toContain('浅蓝短袖衬衫');
    expect(context.playerSummary).toContain('衣着状态：便服');
    expect(context.playerSummary).toContain('上次衣着变化：下班后在警署更衣室换成便服。');
    expect(context.playerSummary).toContain('警棍');
    expect(prompt).toContain('点三八左轮');
  });

  it('gives civilian turns a lightweight background-based route prompt without auto-transitioning', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'nightlife_staff'
    });
    const prompt = composePrompt(selectContext(state, '先把今晚的醉客安置好'), '先把今晚的醉客安置好');

    expect(prompt).toContain('## 市民身份入口');
    expect(prompt).toContain('湾仔夜场侍应');
    expect(prompt).toContain('不得每回合硬塞');
    expect(prompt).toContain('不得同时弹出两条路线');
    expect(prompt).toContain('接受、追问条件、拒绝或暂缓');
    expect(prompt).toContain('身份尚未真正成立时，不得输出 identityContextPatch');

    const policePrompt = composePrompt(selectContext(createInitialRuntimeState(), '继续当值'), '继续当值');
    expect(policePrompt).not.toContain('## 市民身份入口');
  });

  it('lists the exact clothing mode enum accepted by writeback', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '下班后换便服');
    const prompt = composePrompt(context, '下班后换便服');

    expect(prompt).toContain(
      'mode 只能使用 duty_uniform / off_duty_plain / formal / disguise / special / sleepwear / other'
    );
    expect(prompt).toContain('不能使用 uniform、casual 等自造值');
    expect(prompt).toContain('clothing 必须写成对象');
    expect(prompt).toContain('currentSummary 与 mode 都必填');
  });

  it('projects weather context into prompt and output rules', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const context = selectContext(state, '雨中巡逻');
    const prompt = composePrompt(context, '雨中巡逻');

    expect(context.weatherProjection.label).toBeTruthy();
    expect(prompt).toContain('WEATHER_CONTEXT_PROJECTION');
    expect(prompt).toContain('weatherPatch');
    expect(prompt).toContain('天气');
  });

  it('feeds weekday and lightweight police duty pacing into ordinary turn prompts', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'police',
      startTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 13 },
      lawIdentity: {
        department: 'Uniform Branch（军装巡逻）',
        assignmentSummary: 'Patrol Constable（巡逻警员）'
      }
    });
    const context = selectContext(state, '交班前整理今晚记录，不想再接新事');
    const prompt = composePrompt(context, '交班前整理今晚记录，不想再接新事');

    expect(context.timeLabel).toContain('星期一');
    expect(prompt).toContain('警务值班节奏');
    expect(prompt).toContain('临近交班');
    expect(prompt).toContain('不要因为玩家是警察就每回合自动新增报案');
    expect(prompt).toContain('交班、下班、补眠、私人生活');
  });

  it('carries relaxed opening pressure into early turn prompt pacing', () => {
    const state = createInitialRuntimeState({
      openingPressure: 'relaxed',
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const context = selectContext(state, '问林叔袋子里是什么，不要急着把事情闹大');
    const prompt = composePrompt(context, '问林叔袋子里是什么，不要急着把事情闹大');

    expect(prompt).toContain('开局节奏延续');
    expect(prompt).toContain('轻松开局');
    expect(prompt).toContain('普通日常开局');
    expect(prompt).toContain('正文禁用“暗流”一词');
    expect(prompt).toContain('阴谋、黑幕、幕后安排不是禁题');
    expect(prompt).not.toContain('不要主动制造暗流、黑幕、阴谋');
    expect(prompt).toContain('日常执勤、生活小事、街坊寒暄、家长里短、普通人情请求、轻微投诉或文书交接');
    expect(prompt).not.toContain('普通异常');
    expect(prompt).not.toContain('高危证物');
  });

  it('carries the anti-undercurrent rule into every early turn pacing profile', () => {
    for (const openingPressure of openingPressureIds) {
      const state = createInitialRuntimeState({
        openingPressure,
        startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
      });
      const context = selectContext(state, '按当前节奏继续处理现场，不要乱加黑幕');
      const prompt = composePrompt(context, '按当前节奏继续处理现场，不要乱加黑幕');

      expect(prompt).toContain('正文禁用“暗流”一词');
      expect(prompt).toContain('阴谋、黑幕、幕后安排不是禁题');
      expect(prompt).toContain('已有证据、NPC具体行动、已投喂事实或玩家主动调查');
      expect(prompt).toContain('压力必须写成具体可见、可感知、可行动的现场事实');
      expect(prompt).toContain('不要把普通场面写成无事实支撑的未来危机预告或万能悬疑钩子');
    }
  });

  it('feeds triad violence boundaries as hidden world logic for ordinary turns', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const prompt = composePrompt(selectContext(state, '盘问夜场看场是否敢动警察'), '盘问夜场看场是否敢动警察');

    expect(prompt).toContain('香港社团行为逻辑');
    expect(prompt).toContain('社团对警队人员使用暴力是高风险行为');
    expect(prompt).toContain('私人恩怨或个人失控');
    expect(prompt).toContain('大概率会被社团切割');
    expect(prompt).toContain('触及社团根本利益');
    expect(prompt).toContain('不要在 narrativeText 中直白讲解这条底层规则');
  });

  it('projects storypack context into the main turn prompt as optional material', () => {
    const state = createInitialRuntimeState({
      storypackInfluence: 'high',
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const context = selectContext(state, '去清水湾电视城找娱乐记者问问片场纠纷');
    const prompt = composePrompt(context, '去清水湾电视城找娱乐记者问问片场纠纷');

    expect(context.storypackProjection.cards.map((card) => card.id)).toContain('he_003');
    expect(context.storypackProjection.cards.map((card) => card.id)).toContain('sp_006');
    expect(prompt).toContain('STORYPACK_CONTEXT_PROJECTION');
    expect(prompt).toContain('optional story texture');
    expect(prompt).toContain('not a fixed event');
    expect(prompt).toContain('新电视城');
    const storypackSection = prompt.slice(
      prompt.indexOf('STORYPACK_CONTEXT_PROJECTION'),
      prompt.indexOf('## DYNAMIC_CONTEXT')
    );
    expect(storypackSection).not.toMatch(/TVB|无间道|無間道|英雄本色|古惑仔|寒战|PTU|十二少/u);
  });

  it('projects era seed figures into the main prompt as knowledge anchors without opening actors', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '去片场找那个功夫明星的经纪人，再问报馆查先生');
    const prompt = composePrompt(context, '去片场找那个功夫明星的经纪人，再问报馆查先生');

    expect(Object.keys(state.actors)).toEqual(['player']);
    expect(context.eraSeedFigureProjection.figures.map((figure) => figure.id)).toEqual(
      expect.arrayContaining(['fig_lian_jit_action_star', 'fig_choi_manager_shadow', 'fig_cha_sir_wuxia_publisher'])
    );
    expect(prompt).toContain('ERA_SEED_FIGURE_PROJECTION');
    expect(prompt).toContain('not fixed NPCs');
    expect(prompt).toContain('Create Actor only');
    expect(prompt).toContain('SEED_IDENTITY_LOCK');
    expect(prompt).toContain('runtimeActorId=npc_seed_fig_lian_jit_action_star');
    expect(prompt).toContain('李连杰');
    expect(prompt).toContain('Jet Li');
    expect(prompt).toContain('蔡子明');
    expect(prompt).toContain('Choi Chi-ming');
    expect(prompt).toContain('查先生');
    const seedSection = prompt.slice(
      prompt.indexOf('ERA_SEED_FIGURE_PROJECTION'),
      prompt.indexOf('## Storypack 投影')
    );
    expect(seedSection).not.toMatch(/李联捷|才志明|查良庸|古隆/u);
  });

  it('uses the configured narrative length profile in the main turn prompt', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '今晚巡逻慢一点，多写现场细节');

    const prompt = composePrompt(context, '今晚巡逻慢一点，多写现场细节', {
      narrativeLengthLevel: 'long'
    });

    expect(prompt).toContain('常规回合 narrativeText 目标 900-1400 个中文字符');
    expect(prompt).toContain('复杂回合 narrativeText 目标 1400-2200 个中文字符');
    expect(prompt).toContain('每个常规回合至少 7-12 个显示段落或对白行');
    expect(prompt).toContain('输出前自检');
    expect(prompt).toContain('现场锚点、玩家行动承接、NPC 或环境反应、局面变化、下一步可互动点');
    expect(prompt).toContain('禁止用第二人称选择题或征询句收尾');
    expect(prompt).toContain('行动选项只写入 suggestedActions');
  });

  it('locks the selected narrative perspective without constraining character dialogue', () => {
    const state = createInitialRuntimeState({ playerName: '陈启明', gender: 'male' });
    const context = selectContext(state, '推门进入报案室');

    const firstPersonPrompt = composePrompt(context, '推门进入报案室', {
      narrativePerspective: 'first_person'
    });
    expect(firstPersonPrompt).toContain('本局选择第一人称');
    expect(firstPersonPrompt).toContain('固定以“我”指代玩家');
    expect(firstPersonPrompt).toContain('人物对白仍按说话关系自然使用“我、你、他/她”');

    const thirdPersonPrompt = composePrompt(context, '推门进入报案室', {
      narrativePerspective: 'third_person'
    });
    expect(thirdPersonPrompt).toContain('本局选择第三人称');
    expect(thirdPersonPrompt).toContain('玩家姓名“陈启明”或代词“他”');
    expect(thirdPersonPrompt).toContain('不得使用“你”称呼玩家');
    expect(thirdPersonPrompt).not.toContain('本局选择第一人称');
  });

  it('uses editable prompt overrides for main turn style guides', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '今晚巡逻慢一点');

    const prompt = composePrompt(context, '今晚巡逻慢一点', {
      promptSettings: {
        overrides: {
          'narrative.styleAndDisplay': 'CUSTOM_TURN_NARRATIVE_GUIDE',
          'relationship.adultStyleGuide': 'CUSTOM_TURN_RELATIONSHIP_GUIDE'
        }
      }
    });

    expect(prompt).toContain('CUSTOM_TURN_NARRATIVE_GUIDE');
    expect(prompt).toContain('CUSTOM_TURN_RELATIONSHIP_GUIDE');
    expect(prompt).not.toContain('adultPrivateProfile 是稳定锚点');
  });

  it('keeps hard narrative ending rules even when style guide is overridden', () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '继续推进现场，但不要用问句收尾');

    const prompt = composePrompt(context, '继续推进现场，但不要用问句收尾', {
      promptSettings: {
        overrides: {
          'narrative.styleAndDisplay': 'OLD_CUSTOM_NARRATIVE_GUIDE_WITHOUT_ENDING_RULE'
        }
      }
    });

    expect(prompt).toContain('OLD_CUSTOM_NARRATIVE_GUIDE_WITHOUT_ENDING_RULE');
    expect(prompt).toContain('禁止用第二人称选择题或征询句收尾');
    expect(prompt).toContain('“你是打算……还是……？”');
    expect(prompt).toContain('“是否……？”');
    expect(prompt).toContain('“要不要……？”');
    expect(prompt).toContain('可选行动只写 suggestedActions');
  });

  it('projects only the bounded recent raw story window; older turns belong to memory layers', () => {
    const state = createInitialRuntimeState();
    state.time = { year: 1988, month: 9, day: 13, hour: 1, minute: 20 };
    state.storyLog = Array.from({ length: 20 }, (_, index) => {
      const turnNumber = index + 1;
      return {
        turnId: `turn_${String(turnNumber).padStart(4, '0')}`,
        speaker: 'narrator' as const,
        text: `turn ${turnNumber} full narrative marker: the player follows the case thread through a concrete scene.`,
        summaryText: `turn ${turnNumber} factual summary marker: completed handoff and known consequences.`,
        gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: turnNumber },
        suggestedActions: [`action ${turnNumber}a`, `action ${turnNumber}b`]
      };
    }).flatMap((entry) => [
      {
        turnId: entry.turnId,
        speaker: 'player' as const,
        text: `player input for ${entry.turnId}: already submitted the novel to the newspaper.`,
        gameTime: entry.gameTime
      },
      entry
    ]);

    const context = selectContext(state, '继续追问线索') as unknown as {
      recentStoryProjection: {
        rawEntries: Array<{ turnId: string; text: string }>;
        summaryEntries: Array<{ turnId: string; summaryText: string }>;
        diagnostics: { totalNarratorEntries: number; omittedEarlierCount: number };
      };
    };
    const prompt = composePrompt(context as any, '继续追问线索');

    expect(prompt).toContain('TIME_REFERENCE_FRAME');
    expect(prompt).toContain('current=1988-09-13 星期二 01:20');
    expect(prompt).toContain('yesterday=1988-09-12');
    expect(prompt).toContain('lastNight=1988-09-12 夜间');
    expect(context.recentStoryProjection.rawEntries.map((entry) => entry.turnId)).toEqual([
      'turn_0009',
      'turn_0010',
      'turn_0011',
      'turn_0012',
      'turn_0013',
      'turn_0014',
      'turn_0015',
      'turn_0016',
      'turn_0017',
      'turn_0018',
      'turn_0019',
      'turn_0020'
    ]);
    expect(context.recentStoryProjection.summaryEntries).toEqual([]);
    expect(context.recentStoryProjection.diagnostics).toMatchObject({
      totalNarratorEntries: 20,
      omittedEarlierCount: 8
    });
    expect(prompt).toContain('RECENT_STORY_PROJECTION');
    expect(prompt).toContain('### recent_raw_story');
    expect(prompt).toContain('time=1988-09-12 星期一 21:20 relative=昨晚');
    expect(prompt).toContain('playerInput=player input for turn_0020: already submitted the novel to the newspaper.');
    expect(prompt).toContain('turn 20 full narrative marker');
    expect(prompt).not.toContain('### earlier_story_summaries');
    expect(prompt).not.toContain('turn 8 factual summary marker');
    expect(prompt).not.toContain('turn 8 full narrative marker');
    expect(prompt).not.toContain('suggestedActions=action');
  });

  it('projects vector-retrieved older story entries without replacing the fixed recent story window', () => {
    const state = createInitialRuntimeState();
    state.storyLog = Array.from({ length: 30 }, (_, index) => {
      const turnNumber = index + 1;
      return {
        turnId: `turn_${String(turnNumber).padStart(4, '0')}`,
        speaker: 'narrator' as const,
        text: `turn ${turnNumber} narrative marker about ${turnNumber === 2 ? 'old pier informant promise' : 'routine patrol detail'}.`,
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: turnNumber },
        embeddingText: turnNumber === 2 ? 'old pier informant promise' : 'routine patrol detail',
        embeddingVector: turnNumber === 2 ? [1, 0] : [0, 1],
        embeddingModel: 'test-embedding'
      };
    }) as any;

    const context = selectContext(state, 'old pier informant promise', { queryEmbedding: [1, 0] }) as any;
    const prompt = composePrompt(context, 'old pier informant promise');

    expect(context.storyVectorProjection.entries.map((entry: { turnId: string }) => entry.turnId)).toContain('turn_0002');
    expect(context.storyVectorProjection.entries.map((entry: { turnId: string }) => entry.turnId)).not.toContain('turn_0030');
    expect(context.storyVectorProjection.diagnostics.estimatedTokenBudget).toBe(24000);
    expect(context.storyVectorProjection.diagnostics.selectedTextChars).toBeLessThanOrEqual(24000);
    expect(context.recentStoryProjection.rawEntries.map((entry: { turnId: string }) => entry.turnId)).toEqual([
      'turn_0019',
      'turn_0020',
      'turn_0021',
      'turn_0022',
      'turn_0023',
      'turn_0024',
      'turn_0025',
      'turn_0026',
      'turn_0027',
      'turn_0028',
      'turn_0029',
      'turn_0030'
    ]);
    expect(prompt).toContain('STORY_VECTOR_PROJECTION');
    expect(prompt).toContain('old pier informant promise');
    expect(prompt).not.toContain('suggestedActions=');
  });

  it('uses current scene anchors to recall older raw story even when vector score is low', () => {
    const state = createInitialRuntimeState();
    state.places.place_golden_karaoke = {
      placeId: 'place_golden_karaoke',
      name: '金粉世家',
      nameZh: '金粉世家',
      nameEn: 'Golden Palace Karaoke',
      aliases: ['金粉世家卡拉OK'],
      regionId: 'region_kowloon',
      districtId: 'district_mong_kok',
      type: 'karaoke',
      category: 'nightlife',
      summary: '旺角一间夜场卡拉OK。',
      publicKnowledge: '夜场熟人知道这里常有看场人员。',
      currentState: '营业中。',
      source: 'runtime_generated',
      canonical: false,
      confidence: 'medium',
      roadAnchors: [],
      relatedActorIds: [],
      relatedCaseIds: [],
      relatedPressureIds: []
    };
    state.location = { currentPlaceId: 'place_golden_karaoke' };
    state.storyLog = Array.from({ length: 30 }, (_, index) => {
      const turnNumber = index + 1;
      return {
        turnId: `turn_${String(turnNumber).padStart(4, '0')}`,
        speaker: 'narrator' as const,
        text:
          turnNumber === 2
            ? '值日警长说：旺角道那间金粉世家卡拉OK，经理打电话说有几个喝大的后生仔在包厢里砸酒瓶。'
            : `turn ${turnNumber} routine patrol detail at another place.`,
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: turnNumber },
        embeddingText: turnNumber === 2 ? 'unrelated vector text' : 'routine patrol detail',
        embeddingVector: [0, 1],
        embeddingModel: 'test-embedding'
      };
    }) as any;

    const context = selectContext(state, '问肥仔森：你们不是自己人报过警吗？', { queryEmbedding: [1, 0] }) as any;
    const recalled = context.storyVectorProjection.entries.find(
      (entry: { turnId: string }) => entry.turnId === 'turn_0002'
    );

    expect(recalled?.text).toContain('经理打电话');
    expect(recalled?.reasons).toContain('context_anchor');
  });

  it('uses old player input as story vector recall text', () => {
    const state = createInitialRuntimeState();
    state.storyLog = Array.from({ length: 30 }, (_, index) => {
      const turnNumber = index + 1;
      const turnId = `turn_${String(turnNumber).padStart(4, '0')}`;
      const gameTime = { year: 1988, month: 9, day: 12, hour: 20, minute: turnNumber };
      return [
        {
          turnId,
          speaker: 'player' as const,
          text: turnNumber === 2 ? '我把小说初稿投稿给东方日报和成报。' : `player routine input ${turnNumber}`,
          gameTime
        },
        {
          turnId,
          speaker: 'narrator' as const,
          text: `turn ${turnNumber} narrative marker.`,
          summaryText: turnNumber === 2 ? '玩家已经把小说初稿投给报社，后续只能写回音、退稿、采用或编辑联系。' : `turn ${turnNumber} summary.`,
          gameTime,
          embeddingVector: turnNumber === 2 ? [1, 0] : [0, 1],
          embeddingModel: 'test-embedding'
        }
      ];
    }).flat() as any;

    const context = selectContext(state, '报社小说投稿后续', { queryEmbedding: [1, 0] }) as any;
    const recalled = context.storyVectorProjection.entries.find(
      (entry: { turnId: string }) => entry.turnId === 'turn_0002'
    );

    expect(recalled?.text).toContain('玩家输入：我把小说初稿投稿给东方日报和成报。');
    expect(recalled?.text).toContain('回合摘要：玩家已经把小说初稿投给报社');
  });

  it('feeds finance, home base, and reputation while keeping gray ledger out of normal context', () => {
    const state = createInitialRuntimeState();
      state.finance = {
        ...state.finance,
        cashOnHand: 300,
        bankBalance: 1800,
      summary: '工资刚够自己周转，家里偶尔还会开口要钱。',
      cashflows: {
        salary: {
          itemId: 'salary',
          direction: 'income',
          kind: 'salary',
          title: '警队月薪',
          amount: 4200,
          account: 'bank',
          summary: '基层警员固定月薪。',
          activeFromMonth: '1988-06',
          relatedAssetItemIds: [],
          relatedActorIds: [],
          relatedPlaceIds: [],
          source: 'opening',
          status: 'active',
          visibility: 'private'
        },
        rent: {
          itemId: 'rent',
          direction: 'expense',
          kind: 'rent',
          title: '唐楼租金',
          amount: 900,
          account: 'bank',
          summary: '每月房租。',
          activeFromMonth: '1988-06',
          relatedAssetItemIds: [],
          relatedActorIds: [],
          relatedPlaceIds: [],
          source: 'writeback',
          status: 'active',
          visibility: 'private'
        }
      }
    };
    state.player.homeBase = {
      placeId: 'place_sham_shui_po_tenement_room',
      placeName: '深水埗唐楼住处',
      housingType: '唐楼分租房',
      summary: '深水埗一间狭窄唐楼房间。',
      householdSummary: '与母亲同住，弟弟偶尔回来借钱。'
    };
    state.player.reputation = {
      ...state.player.reputation,
      notoriety: 235,
      overallReputation: -12,
      summary: '在旺角附近开始有人知道他，但整体评价仍有争议。',
      circles: {
        ...state.player.reputation.circles,
        neighborhoodMedia: {
          visibility: 45,
          standing: -50,
          summary: '附近街坊知道他，但觉得他做事太硬。'
        }
      }
    };
    state.grayLedger = [
      {
        ledgerId: 'gray_001',
        gameTime: state.time,
        kind: 'cash',
        amount: 500,
        fromSummary: '旧同学塞来的红包',
        relatedActorIds: ['player'],
        relatedPlaceIds: [state.location.currentPlaceId],
        relatedCaseIds: [],
        summary: '旧同学说只是见面利是。',
        exposureRisk: 20,
        status: 'hidden',
        visibility: 'hidden'
      }
    ];

    const context = selectContext(state, '下班回家看看');
    const prompt = composePrompt(context, '下班回家看看');

    expect(context.financeProjection.bankBalance).toBe(1800);
    expect(context.financeProjection.monthlyIncome).toBe(4200);
    expect(context.financeProjection.monthlyExpense).toBe(900);
    expect(context.playerSummary).toContain('随身现金：HK$300');
    expect(context.playerSummary).toContain('银行存款：HK$1,800');
    expect(context.playerSummary).not.toContain('经济压力');
    expect(context.playerSummary).toContain('深水埗唐楼住处');
    expect(context.playerSummary).toContain('整体知名度235/1000');
    expect(context.playerSummary).toContain('整体口碑-12（-100到100）');
    expect(context.playerSummary).not.toContain('街坊/公众媒体：知名度45/1000，口碑-50（-100到100）');
    expect(context.reputationProjection.circles.map((entry) => entry.circle)).toContain('neighborhoodMedia');
    expect(context.reputationProjection.circles.length).toBeLessThanOrEqual(3);
    expect(prompt).toContain('## 金钱与收支');
    expect(prompt).toContain('警队月薪');
    expect(prompt).toContain('唐楼租金');
    expect(prompt).toContain('upsertCashflows is only for stable recurring monthly income/expense');
    expect(prompt).toContain('routine one-time spending/income must not be converted into cashflow items');
    expect(prompt).toContain('every concrete one-time payment or income must include both the matching financePatch cash/bank delta');
    expect(prompt).toContain('REPUTATION_CONTEXT_PROJECTION');
    expect(prompt).toContain('circle=neighborhoodMedia');
    expect(prompt).toContain('附近街坊知道他，但觉得他做事太硬');
    expect(prompt).not.toContain('旧同学塞来的红包');
  });

  it('projects only relevant reputation circles and recent reputation logs into the prompt', () => {
    const state = createInitialRuntimeState();
    state.player.reputation = {
      ...state.player.reputation,
      notoriety: 210,
      overallReputation: -8,
      summary: 'Public attention is starting to form.',
      circles: {
        ...state.player.reputation.circles,
        police: { visibility: 180, standing: -20, summary: 'Police supervisors are watching him.' },
        neighborhoodMedia: { visibility: 160, standing: -45, summary: 'Local residents remember the complaint.' },
        entertainment: { visibility: 10, standing: 80, summary: 'Film people only know a rumor.' },
        triad: { visibility: 40, standing: -10, summary: 'Triad runners barely know him.' },
        business: { visibility: 80, standing: 10, summary: 'Shopkeepers heard his name.' },
        politics: { visibility: 20, standing: 0, summary: 'Officials have no stable view.' }
      },
      logs: [
        {
          logId: 'rep_1',
          gameTime: { ...state.time, minute: 31 },
          turnId: 'turn_1',
          kind: 'circle',
          circle: 'business',
          visibilityDelta: 10,
          standingDelta: 0,
          summary: 'Business heard.',
          reason: 'Shop talk'
        },
        {
          logId: 'rep_2',
          gameTime: { ...state.time, minute: 32 },
          turnId: 'turn_2',
          kind: 'circle',
          circle: 'police',
          visibilityDelta: 5,
          standingDelta: -5,
          summary: 'Police heard.',
          reason: 'Station complaint'
        },
        {
          logId: 'rep_3',
          gameTime: { ...state.time, minute: 33 },
          turnId: 'turn_3',
          kind: 'circle',
          circle: 'neighborhoodMedia',
          visibilityDelta: 8,
          standingDelta: -10,
          summary: 'Residents complained.',
          reason: 'Street talk'
        },
        {
          logId: 'rep_4',
          gameTime: { ...state.time, minute: 34 },
          turnId: 'turn_4',
          kind: 'overall',
          notorietyDelta: 2,
          overallReputationDelta: -1,
          summary: 'Overall shifted.',
          reason: 'Public complaint'
        }
      ]
    };

    const context = selectContext(state, 'ask the station sergeant about a media complaint from local residents');
    const selected = context.reputationProjection.circles.map((entry) => entry.circle);

    expect(selected).toContain('police');
    expect(selected).toContain('neighborhoodMedia');
    expect(selected.length).toBeLessThanOrEqual(3);
    expect(context.reputationProjection.recentLogs.map((log) => log.logId)).toEqual(['rep_4', 'rep_3', 'rep_2']);

    const prompt = composePrompt(context, 'ask the station sergeant about a media complaint from local residents');

    expect(prompt).toContain('REPUTATION_CONTEXT_PROJECTION');
    expect(prompt).toContain('Police supervisors are watching him.');
    expect(prompt).toContain('Local residents remember the complaint.');
    expect(prompt).not.toContain('Film people only know a rumor.');
  });

  it('projects visible social institution context and filters hidden actor relations', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push(
      {
        organizationId: 'org_tvb',
        relationType: 'informal_contact',
        roleTitle: 'news tip contact',
        summary: 'The player knows a junior TVB assignment editor through a neighborhood introduction.',
        visibility: 'player_known'
      },
      {
        organizationId: 'org_icac',
        relationType: 'informal_contact',
        roleTitle: 'confidential handler',
        summary: 'secret icac handler should not be projected',
        visibility: 'hidden'
      }
    );

    const context = selectContext(state, 'ask the TVB assignment editor about a street complaint');
    const prompt = composePrompt(context, 'ask the TVB assignment editor about a street complaint');
    const playerPacket = context.actorPackets.find((actor) => actor.actorId === 'player');

    expect(context.institutionProjection.organizations.map((organization) => organization.organizationId)).toContain('org_tvb');
    expect(context.institutionProjection.actorRelations.map((relation) => relation.organizationId)).toContain('org_tvb');
    expect(context.institutionProjection.actorRelations.map((relation) => relation.organizationId)).not.toContain('org_icac');
    expect(playerPacket?.organizationRelations.map((relation) => relation.organizationId)).toContain('org_tvb');
    expect(playerPacket?.organizationRelations.map((relation) => relation.organizationId)).not.toContain('org_icac');
    expect(context.institutionProjection.diagnostics.omittedHiddenCount).toBeGreaterThanOrEqual(1);
    expect(prompt).toContain('INSTITUTION_CONTEXT_PROJECTION');
    expect(prompt).toContain('org_tvb');
    expect(prompt).toContain('organizationRelations');
    expect(prompt).toContain('organizationPatches');
    expect(prompt).toContain('do not automatically convict');
    expect(prompt).not.toContain('secret icac handler should not be projected');
  });

  it('projects city power anchors into the narrator prompt for relevant high-level queries', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'police';

    const context = selectContext(state, '查一下警务处处长和廉署最近对旺角案件有没有压力。');
    const prompt = composePrompt(context, '查一下警务处处长和廉署最近对旺角案件有没有压力。');

    expect(context.cityPowerProjection.figures.some((figure) => figure.category === 'police_command')).toBe(true);
    expect(
      context.cityPowerProjection.organizations.some((organization) => organization.organizationId === 'org_icac')
    ).toBe(true);
    expect(prompt).toContain('城市权力锚点投影');
    expect(prompt).toContain('CITY_POWER_IDENTITY_LOCK');
    expect(prompt).toContain('organizationType=');
    expect(prompt).toContain('organizationPatches');
    expect(prompt).toContain('actorPatches[].organizationRelations');
  });

  it('projects known society structure trees so organization writeback can update them', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const prompt = composePrompt(selectContext(state, '查一下新义安现在公开知道的组织架构。'), '查一下新义安现在公开知道的组织架构。');

    expect(prompt).toContain('INSTITUTION_CONTEXT_PROJECTION');
    expect(prompt).toContain('org_sun_yee_on');
    expect(prompt).toContain('structureTree=');
    expect(prompt).toContain('坐馆');
    expect(prompt).toContain('人员未知');
  });

  it('keeps city power anchor expansion compact for ordinary low-signal actions', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'police';

    const context = selectContext(state, '我坐在报案室喝水，整理自己的鞋带。');
    const organizationIds = context.cityPowerProjection.organizations.map((organization) => organization.organizationId);
    const figureIds = context.cityPowerProjection.figures.map((figure) => figure.canonicalSeedId);

    expect(organizationIds).toContain('org_hk_police');
    expect(organizationIds).not.toContain('org_tvb');
    expect(organizationIds).not.toContain('org_icac');
    expect(organizationIds).not.toContain('org_legal_department');
    expect(organizationIds).toHaveLength(1);
    expect(figureIds).toHaveLength(1);
  });

  it('keeps hidden triad certainty out of ordinary civilian city power prompt context', () => {
    const state = createInitialRuntimeState();
    state.player.currentIdentity = 'civilian';

    const context = selectContext(state, '街市有人说和胜和换人话事。');
    const prompt = composePrompt(context, '街市有人说和胜和换人话事。');

    expect(prompt).toContain('和胜和');
    expect(prompt).toContain('不要把传闻提升为确定事实');
    expect(prompt).not.toContain('protectedRealNames');
  });

  it('projects dynamic matters, signals, and newspaper issues into prompt context', () => {
    const state = createInitialRuntimeState();
    const currentPlaceId = state.location.currentPlaceId;
    const now = state.time;
    const matter: CurrentMatter = {
      id: 'matter_media_pressure',
      title: 'Tabloid pressure near Mong Kok',
      summary: 'A local reporter is asking why patrol officers ignored a nightclub complaint.',
      status: 'active',
      priority: 80,
      visibility: 'known',
      source: 'media',
      matterKind: 'social',
      pressureLevel: 2,
      responseWindow: 'today',
      consequenceHint: 'If ignored, the reporter may turn the complaint into a sharper article.',
      dueAt: now,
      currentHook: 'The reporter is still waiting for a response.',
      unread: true,
      relatedActorIds: ['player'],
      relatedPlaceIds: [currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: ['org_tvb'],
      createdAt: now,
      updatedAt: now
    };
    const hiddenMatter: CurrentMatter = {
      ...matter,
      id: 'matter_hidden_editor',
      title: 'Hidden editor pressure',
      visibility: 'hidden'
    };
    const signal: Signal = {
      id: 'signal_street_rumor',
      title: 'Street rumor about a club fight',
      summary: 'Residents say a club owner is trying to keep a fight out of the papers.',
      signalType: 'rumor',
      reliability: 'unknown',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [],
      relatedPlaceIds: [currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    const issue: NewsIssue = {
      id: 'news_evening_19880912',
      date: now,
      outletName: 'Evening Daily',
      headline: 'Police district faces nightclub questions',
      summary: 'A tabloid-style evening issue mixes civic rumors with entertainment gossip.',
      articles: [
        {
          id: 'article_player_related',
          section: 'local',
          headline: 'Nightclub complaint draws attention',
          body: 'Reporters are watching whether patrol officers respond.',
          tone: 'probing',
          playerRelated: true,
          relatedActorIds: ['player'],
          relatedPlaceIds: [currentPlaceId],
          relatedCaseIds: [],
          relatedOrganizationIds: ['org_tvb']
        }
      ],
      createdAt: now,
      updatedAt: now,
      read: false
    };
    state.dynamicEvents.currentMatters[matter.id] = matter;
    state.dynamicEvents.currentMatters[hiddenMatter.id] = hiddenMatter;
    state.dynamicEvents.signals[signal.id] = signal;
    state.dynamicEvents.newsIssues[issue.id] = issue;

    const context = selectContext(state, 'ask the reporter about the nightclub article');
    const prompt = composePrompt(context, 'ask the reporter about the nightclub article');

    expect(context.dynamicProjection.currentMatters.map((entry) => entry.id)).toContain('matter_media_pressure');
    expect(context.dynamicProjection.currentMatters.map((entry) => entry.id)).not.toContain('matter_hidden_editor');
    expect(context.dynamicProjection.signals.map((entry) => entry.id)).toContain('signal_street_rumor');
    expect(context.dynamicProjection.newsIssues.map((entry) => entry.id)).toContain('news_evening_19880912');
    expect(context.dynamicProjection.diagnostics.omittedHiddenCount).toBeGreaterThanOrEqual(1);
    expect(prompt).toContain('DYNAMIC_CONTEXT_PROJECTION');
    expect(prompt).toContain('matter_media_pressure');
    expect(prompt).toContain('signal_street_rumor');
    expect(prompt).toContain('news_evening_19880912');
    expect(prompt).toContain('matterKind=social');
    expect(prompt).toContain('pressureLevel=2');
    expect(prompt).toContain('responseWindow=today');
    expect(prompt).toContain('currentHook=The reporter is still waiting for a response.');
    expect(prompt).toContain('Current matters are not quests');
    expect(prompt).toContain('Do not write rewards');
    expect(prompt).toContain('currentMatterPatches');
    expect(prompt).toContain('signalPatches');
    expect(prompt).toContain('newsIssuePatches');
  });

  it('places recent resolved matters after player input as authoritative completion facts', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    const contractMatter: CurrentMatter = {
      id: 'matter_mingpao_contract',
      title: '《时空差佬》明报签约事宜',
      summary: '玩家已正式签署连载合同与保密协议，取得两万元预付款，签约事宜已经完成。',
      status: 'resolved',
      priority: 85,
      visibility: 'known',
      source: 'personal',
      matterKind: 'personal',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    state.dynamicEvents.currentMatters[contractMatter.id] = contractMatter;
    state.memories.stale_contract_plan = createMemory('stale_contract_plan', {
      text: '玩家已与报馆达成连载协议，拟定于明日签署高薪合同。',
      kind: 'turn',
      tier: 'mid_term',
      gameTime: { ...now, year: now.year - 1 },
      importance: 85
    });
    const playerInput = '边吃边和她商量明天签约后联名户口的安排。';

    const context = selectContext(state, playerInput);
    const prompt = composePrompt(context, playerInput);

    expect(context.dynamicProjection.currentMatters.map((matter) => matter.id)).not.toContain(contractMatter.id);
    expect(context.dynamicProjection.recentResolvedMatters.map((matter) => matter.id)).toContain(contractMatter.id);
    expect(prompt).toContain('拟定于明日签署高薪合同');
    expect(prompt).toContain('RECENT_COMPLETED_FACTS');
    expect(prompt).toContain('matterId=matter_mingpao_contract status=resolved');
    expect(prompt).toContain('玩家已正式签署连载合同与保密协议');
    expect(prompt).toContain('明天、明日、明晚、后天');
    expect(prompt).toContain('suggestedActions must not schedule or invite the same completion again');
    expect(prompt.indexOf('## 近期已完成事实（结构化权威）')).toBeGreaterThan(prompt.indexOf('## 玩家输入'));
    expect(prompt.indexOf('## 近期已完成事实（结构化权威）')).toBeGreaterThan(
      prompt.indexOf('拟定于明日签署高薪合同')
    );
    expect(prompt.indexOf('## 近期已完成事实（结构化权威）')).toBeLessThan(
      prompt.indexOf('TURN_OUTPUT_JSON_EXAMPLE')
    );
  });

  it('projects relationship threads and heartbeat candidates into prompt context', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    const relationship: RelationshipThread = {
      threadId: 'rel_lam_sing',
      kind: 'network',
      title: '湾仔同僚梁伟杰',
      summary: '梁伟杰和玩家共事多次，知道玩家不爱邀功。',
      relatedActorIds: ['player'],
      primaryActorId: 'player',
      relationshipRole: '同僚',
      status: 'active',
      trustSummary: '愿意提醒玩家避开投诉。',
      conflictSummary: '',
      promiseSummary: '欠玩家一次人情。',
      riskSummary: '',
      currentPull: '他想请玩家帮忙看一次旧案资料。',
      nextNaturalBeatHint: '可以通过电话或警署走廊闲谈出现。',
      milestones: [],
      visibility: 'player_known',
      importance: 70,
      createdAt: now,
      updatedAt: now
    };
    const hiddenRelationship: RelationshipThread = {
      ...relationship,
      threadId: 'rel_hidden_handler',
      title: '隐藏关系',
      summary: '不应进入普通投影。',
      visibility: 'hidden',
      importance: 100
    };
    state.relationshipThreads[relationship.threadId] = relationship;
    state.relationshipThreads[hiddenRelationship.threadId] = hiddenRelationship;

    const context = selectContext(state, '找梁伟杰聊旧案');
    const prompt = composePrompt(context, '找梁伟杰聊旧案');

    expect(context.relationshipProjection.threads.map((thread) => thread.threadId)).toContain('rel_lam_sing');
    expect(context.relationshipProjection.threads.map((thread) => thread.threadId)).not.toContain('rel_hidden_handler');
    expect(context.relationshipProjection.diagnostics.omittedHiddenCount).toBe(1);
    expect(prompt).toContain('RELATIONSHIP_CONTEXT_PROJECTION');
    expect(prompt).toContain('rel_lam_sing');
    expect(prompt).toContain('他想请玩家帮忙看一次旧案资料');
    expect(prompt).toContain('relationshipThreadPatches');
    expect(prompt).toContain('Heartbeat candidates are undecided suggestions');
    expect(prompt).not.toContain('不应进入普通投影');
  });

  it('projects NPC dynamic simulation suggestions into the main prompt', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    const currentSceneId = state.location.currentSceneId;
    const presentNpc = createActor(state.actors.player, {
      actorId: 'npc_sergeant_chan',
      name: '陈强',
      aliases: ['强哥'],
      callName: '陈沙展',
      presence: 'present',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      visibility: 'player_known',
      importance: 65,
      personality: '谨慎、压得住场面',
      motivation: '维持报案室秩序，避免玩家把线人话题讲得太明',
      relationshipSummary: '值日警长，对玩家既照顾又观察',
      recentInteractionMemory: '刚提醒玩家别在柜台前谈线人'
    });
    const remoteNpc = createActor(state.actors.player, {
      actorId: 'npc_ah_ling',
      name: '阿玲',
      aliases: ['玲姐'],
      presence: 'absent',
      visibility: 'player_known',
      importance: 80,
      motivation: '想知道玩家是否还记得昨晚的承诺',
      relationshipSummary: '与玩家有一条暧昧但未说明的缘份线',
      recentInteractionMemory: '上次在茶餐厅分别前让玩家别忘了回电话'
    });
    state.actors[presentNpc.actorId] = presentNpc;
    state.actors[remoteNpc.actorId] = remoteNpc;
    if (currentSceneId) state.scenes[currentSceneId].presentActorIds.push(presentNpc.actorId);
    state.relationshipThreads.rel_ah_ling = {
      threadId: 'rel_ah_ling',
      kind: 'fate',
      title: '阿玲的未回电话',
      summary: '阿玲等玩家回电话已有一晚。',
      relatedActorIds: ['npc_ah_ling'],
      primaryActorId: 'npc_ah_ling',
      relationshipRole: '暧昧旧识',
      status: 'active',
      trustSummary: '愿意相信玩家，但不喜欢被敷衍。',
      conflictSummary: '',
      promiseSummary: '',
      riskSummary: '',
      currentPull: '她可能通过电话或传呼台留下口信。',
      nextNaturalBeatHint: '可以由值日警长随口提到有女人找过玩家。',
      milestones: [],
      visibility: 'player_known',
      importance: 85,
      createdAt: now,
      updatedAt: now
    };

    const context = selectContext(state, '我问陈强，阿玲有没有再打电话过来。');
    const prompt = composePrompt(context, '我问陈强，阿玲有没有再打电话过来。');

    expect(context.presentActorReactionProjection.candidates.map((candidate) => candidate.actorId)).toContain('npc_sergeant_chan');
    expect(context.remoteNpcPresenceProjection.candidates.map((candidate) => candidate.actorId)).toContain('npc_ah_ling');
    expect(prompt).toContain('PRESENT_ACTOR_REACTION_PROJECTION');
    expect(prompt).toContain('REMOTE_NPC_PRESENCE_PROJECTION');
    expect(prompt).toContain('陈强');
    expect(prompt).toContain('阿玲的未回电话');
    expect(prompt).toContain('未裁定建议');
  });

  it('projects police panel context and promotion action hints into the prompt', () => {
    const state = createInitialRuntimeState({
      lawIdentity: {
        rank: 'Senior Constable (SPC)',
        stationOrPost: 'Wan Chai Police Station',
        department: 'Uniform Branch',
        assignmentSummary: 'Street patrol'
      }
    });
    state.policePanel.actionHints = ['Ask the duty sergeant how promotion recommendations work.'];
    state.policePanel.careerPath.dynamicAssessment.supervisor =
      'The patrol supervisor thinks he is stable but still needs formal commendation.';

    const context = selectContext(state, 'ask about promotion route');
    const prompt = composePrompt(context, 'ask about promotion route');

    expect(context.policeProjection.available).toBe(true);
    expect(prompt).toContain('POLICE_CONTEXT_PROJECTION');
    expect(prompt).toContain('Senior Constable');
    expect(prompt).toContain('Ask the duty sergeant how promotion recommendations work.');
    expect(prompt).toContain('formal commendation');
  });

  it('projects gray network context by current identity and hides inaccessible records', () => {
    const state = createInitialRuntimeState();
    const areaId = currentAreaIdForTest(state);
    state.player.currentIdentity = 'police';
    state.grayNetworks.byAreaId[areaId] = createGrayNetworkProfileForTest(state, areaId, {
      knownOrganizations: [
        {
          organizationId: 'org_visible',
          name: 'Visible Society',
          visibleName: 'Visible Society',
          summary: 'Visible to police.',
          knownScope: 'area rumor',
          confidence: 'medium',
          visibility: { police: 'known', civilian: 'hidden' },
          relatedActorIds: ['missing_actor'],
          relatedPlaceIds: ['missing_place'],
          relatedCaseIds: [],
          updatedAtTurn: 3
        },
        {
          organizationId: 'org_hidden',
          name: 'Hidden Society',
          visibleName: 'Hidden Society',
          summary: 'Hidden from police.',
          knownScope: 'secret',
          confidence: 'high',
          visibility: { police: 'hidden' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 4
        }
      ],
      relationClues: [
        {
          clueId: 'clue_visible',
          summary: 'Tea stall pays protection money.',
          certainty: 'rumor',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: ['missing_org'],
          relatedCaseIds: [],
          updatedAtTurn: 5
        },
        {
          clueId: 'clue_hidden',
          summary: 'Hidden clue should not leak.',
          certainty: 'claim',
          confidence: 'high',
          visibility: { police: 'hidden' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 6
        }
      ],
      actionRisks: [
        {
          riskId: 'risk_police',
          identity: 'police',
          title: 'Do not expose informant',
          level: 'medium',
          summary: 'Police contact can burn a source.',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        },
        {
          riskId: 'risk_gang',
          identity: 'gang_member',
          title: 'Gang-only risk',
          level: 'high',
          summary: 'Not relevant to police identity.',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        }
      ],
      suggestedActions: [
        {
          actionId: 'action_police',
          identity: 'police',
          text: 'Ask the tea stall owner quietly.',
          rationale: 'Police can ask without exposing the source.',
          riskLevel: 'low',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        },
        {
          actionId: 'action_civilian',
          identity: 'civilian',
          text: 'Civilian-only action.',
          rationale: 'Not relevant to police.',
          riskLevel: 'medium',
          relatedActorIds: [],
          relatedPlaceIds: [],
          updatedAtTurn: 2
        }
      ]
    });

    const context = selectContext(state, 'check protection money rumor');
    const projection = (context as unknown as {
      grayNetworkProjection: {
        available: boolean;
        knownOrganizations: Array<{ organizationId?: string }>;
        relationClues: Array<{ clueId: string }>;
        actionRisks: Array<{ riskId: string }>;
        suggestedActions: Array<{ actionId: string }>;
        diagnostics: {
          omittedHidden: number;
          missingActorRefs: string[];
          missingPlaceRefs: string[];
          missingOrganizationRefs: string[];
        };
      };
    }).grayNetworkProjection;

    expect(projection.available).toBe(true);
    expect(projection.knownOrganizations.map((item) => item.organizationId)).toEqual(['org_visible']);
    expect(projection.relationClues.map((item) => item.clueId)).toEqual(['clue_visible']);
    expect(projection.actionRisks.map((item) => item.riskId)).toEqual(['risk_police']);
    expect(projection.suggestedActions.map((item) => item.actionId)).toEqual(['action_police']);
    expect(projection.diagnostics.omittedHidden).toBeGreaterThanOrEqual(2);
    expect(projection.diagnostics.missingActorRefs).toContain('missing_actor');
    expect(projection.diagnostics.missingPlaceRefs).toContain('missing_place');
    expect(projection.diagnostics.missingOrganizationRefs).toContain('missing_org');
  });

  it('composes gray network prompt section without dumping hidden or unrelated area records', () => {
    const state = createInitialRuntimeState();
    const areaId = currentAreaIdForTest(state);
    state.player.currentIdentity = 'police';
    state.grayNetworks.byAreaId[areaId] = createGrayNetworkProfileForTest(state, areaId, {
      climate: [
        {
          key: 'street_collections',
          label: 'Street collections',
          level: 'medium',
          summary: 'Tea stalls talk about new collection pressure.',
          confidence: 'medium',
          lastUpdatedTurn: 2
        }
      ],
      knownOrganizations: [
        {
          organizationId: 'org_visible',
          name: 'Visible Society',
          visibleName: 'Visible Society',
          summary: 'Visible society summary.',
          knownScope: 'area rumor',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 3
        },
        {
          organizationId: 'org_hidden',
          name: 'Hidden Society',
          visibleName: 'Hidden Society',
          summary: 'Hidden Society Secret',
          knownScope: 'secret',
          confidence: 'high',
          visibility: { police: 'hidden' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 4
        }
      ],
      relationClues: [
        {
          clueId: 'clue_visible',
          summary: 'Rumor is not confirmed fact.',
          certainty: 'rumor',
          confidence: 'medium',
          visibility: { police: 'known' },
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          relatedCaseIds: [],
          updatedAtTurn: 5
        }
      ]
    });
    state.grayNetworks.byAreaId.area_other = createGrayNetworkProfileForTest(state, 'area_other', {
      areaName: 'Other Area',
      climate: [
        {
          key: 'other_secret',
          label: 'Other secret',
          level: 'high',
          summary: 'Other Area Secret',
          confidence: 'high',
          lastUpdatedTurn: 10
        }
      ]
    });

    const prompt = composePrompt(selectContext(state, 'ask about street collections'), 'ask about street collections');

    expect(prompt).toContain('GRAY_NETWORK_CONTEXT_PROJECTION');
    expect(prompt).toContain('Street collections');
    expect(prompt).toContain('Visible society summary.');
    expect(prompt).toContain('Rumor is not confirmed fact.');
    expect(prompt).toContain('grayNetworkPatches');
    expect(prompt).toContain('do not treat rumors as confirmed facts');
    expect(prompt).toContain('do not execute suggested actions');
    expect(prompt).not.toContain('Hidden Society Secret');
    expect(prompt).not.toContain('Other Area Secret');
  });

  it('limits gray network projection records and reports missing references', () => {
    const state = createInitialRuntimeState();
    const areaId = currentAreaIdForTest(state);
    state.player.currentIdentity = 'gang_member';
    state.grayNetworks.byAreaId[areaId] = createGrayNetworkProfileForTest(state, areaId, {
      climate: Array.from({ length: 9 }, (_, index) => ({
        key: `climate_${index}`,
        label: `Climate ${index}`,
        level: 'low',
        summary: `Climate summary ${index}`,
        confidence: 'medium',
        lastUpdatedTurn: index
      })),
      relatedPeople: Array.from({ length: 9 }, (_, index) => ({
        actorId: `missing_actor_${index}`,
        visibleRole: `runner ${index}`,
        knownTieSummary: `Tie ${index}`,
        confidence: 'medium',
        visibility: { gang_member: 'known' },
        relatedPlaceIds: [`missing_place_${index}`],
        relatedOrganizationIds: [`missing_org_${index}`],
        relatedCaseIds: [],
        updatedAtTurn: index
      }))
    });

    const context = selectContext(state, 'ask gang contact');
    const projection = (context as unknown as {
      grayNetworkProjection: {
        climate: unknown[];
        relatedPeople: unknown[];
        diagnostics: {
          missingActorRefs: string[];
          missingPlaceRefs: string[];
          missingOrganizationRefs: string[];
        };
      };
    }).grayNetworkProjection;

    expect(projection.climate).toHaveLength(6);
    expect(projection.relatedPeople).toHaveLength(6);
    expect(projection.diagnostics.missingActorRefs).toContain('missing_actor_8');
    expect(projection.diagnostics.missingPlaceRefs).toContain('missing_place_8');
    expect(projection.diagnostics.missingOrganizationRefs).toContain('missing_org_8');
  });

  it('composes a prompt that includes the writeback contract and rejects prose parsing', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(selectContext(state, '接电话'), '接电话');

    expect(prompt).toContain('禁止从正文隐含写回状态');
    expect(prompt).toContain('正文风格与显示格式');
    expect(prompt).toContain('正文优先');
    expect(prompt).toContain('常规回合 narrativeText 目标 500-900 个中文字符');
    expect(prompt).toContain('复杂回合 narrativeText 目标 900-1500 个中文字符');
    expect(prompt).toContain('至少 4-8 个显示段落或对白行');
    expect(prompt).toContain('不要因为 JSON 写回字段很多而压缩正文');
    expect(prompt).toContain('【旁白】');
    expect(prompt).toContain('【角色名】');
    expect(prompt).toContain('成人关系描写指南');
    expect(prompt).toContain('adultPrivateProfile 是成年女性的香闺秘档');
    expect(prompt).toContain('女性 NPC 必须写 femaleProfile');
    expect(prompt).toContain('确认成年女性 NPC 必须生成 adultPrivateProfile');
    expect(prompt).toContain('未来文生图资料');
    expect(prompt).toContain('直接写该部位');
    expect(prompt).toContain('直白、具体、粗俗、可感');
    expect(prompt).toContain('动作、接触、摩擦、湿热、体液、喘息和身体反应');
    expect(prompt).toContain('当前动作 → 接触部位与身体位置 → 方向、力度和节奏');
    expect(prompt).toContain('双方生理、语言和情绪反馈 → 下一动作或调整');
    expect(prompt).toContain('从已有的 RECENT_STORY_PROJECTION 或当前场景中确认最后一个确切姿势');
    expect(prompt).toContain('慢节奏不是同义反复');
    expect(prompt).toContain('不得只换姓名套用同一段结构');
    expect(prompt).toContain('动作路径、主导感官、人物表达或现实后果至少两项');
    expect(prompt).toContain('输出前静默逐句复核成人段落');
    expect(prompt.indexOf('成人段落输出前复核')).toBeGreaterThan(prompt.indexOf('玩家输入'));
    expect(prompt).toContain('不要使用“甬道”这类女性器官隐喻');
    expect(prompt).toContain('也不要用“巨物、坚硬”这类替代男性器官或勃起状态的词');
    expect(prompt).toContain('imagePromptAnchor 是独立的文生图可画标签');
    expect(prompt).toContain('可保留如玉、细腻这类可画风格词');
    expect(prompt).toContain('不得反灌到 description');
    expect(prompt).toContain('不要写英文状态占位、中文待补内容、无记录占位、元说明、工程说明或泛化一致性说明');
    expect(prompt).not.toContain('视觉锚点');
    expect(prompt).not.toContain('锚点已建立');
    expect(prompt).not.toContain('依据成年女性档案');
    expect(prompt).toContain('addressToPlayer / appearanceDescription / bodyDescription');
    expect(prompt).toContain('relationshipNetworkEdges');
    expect(prompt).toContain('稳定档案真值');
    expect(prompt).toContain('不要使用 callSign、publicRelationship、appearanceExpansion');
    expect(prompt).toContain('1980s 香港警队职级资料库');
    expect(prompt).toContain('SPC 绝不是 SP');
    expect(prompt).toContain('narrativeText');
    expect(prompt).toContain('writebackVersion');
    expect(prompt).toContain('writeback');
    expect(prompt).toContain('playerPatch');
    expect(prompt).toContain('financePatch');
    expect(prompt).toContain('grayLedgerPatch');
    expect(prompt).toContain('assetPatch');
    expect(prompt).toContain('placePatches');
    expect(prompt).toContain('casePatches');
    expect(prompt).toContain('organizationPatches');
    expect(prompt).toContain('structureTree');
    expect(prompt).toContain('新人物必须用 actorPatches 创建');
    expect(prompt).toContain('actorId 必须稳定');
    expect(prompt).toContain('新普通 NPC 的 name 必须是可长期绑定身份的完整姓名');
    expect(prompt).toContain('缺少性别或年龄时不要创建新 Actor');
    expect(prompt).toContain('不要用“某人的手下/纹身男人/可疑男子”等临时描述凑 name');
    expect(prompt).toContain('roleProfiles');
    expect(prompt).toContain('NPC 记忆统一写入 actorMemories');
    expect(prompt).toContain('普通 NPC 不要写 vitalsPatch');
    expect(prompt).toContain('玩家发生追逐、奔跑、搏斗、摔伤、负重、长时间巡逻、熬夜或休息恢复等明显体力变化时');
    expect(prompt).toContain('警察写 police，社团人物写 triad，普通市民写 civilian');
    expect(prompt).toContain('正文一旦写出玩家脱下、换上、换成、改穿、穿上、伪装或更衣');
    expect(prompt).toContain('当前身份是警察不等于当前穿军装');
    expect(prompt).toContain('大社团对玩家的态度');
    expect(prompt).toContain('未知职位或未知人员写“未知”');
    expect(prompt).toContain('不得把当前游戏时间之后才出现的真实影视剧、歌曲、新闻或公共事件写成已经发生、正在播出或正在流行');
    expect(prompt).toContain('新建关系线必须有家庭、正式伴侣、正式线人、债务/承诺、保护、长期共同事务、反复接触或持续冲突之一');
    expect(prompt).toContain('creationBasis 与 evidenceRefs');
    expect(prompt).toContain('高 importance 都不足以创建');
    expect(prompt).toContain('接电话');
  });

  it('does not hardcode ordinary NPC names in the ordinary-turn JSON example', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(selectContext(state, '我观察报案室。'), '我观察报案室。');
    const marker = 'OUTPUT_JSON_EXAMPLE';
    const markerIndex = prompt.indexOf(marker);

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const jsonText = prompt.slice(markerIndex + marker.length).trim();

    expect(prompt).not.toContain('陈志强');
    expect(prompt).not.toContain('【陈强】');
    expect(jsonText).not.toContain('陈志强');
    expect(jsonText).not.toContain('Tony Chan');
  });

  it('projects relevant owned assets into prompt context without dumping the full asset list', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_gold_watch: {
          itemId: 'asset_gold_watch',
          category: 'valuable',
          name: 'Gold watch',
          summary: 'A gold watch connected to a nightclub owner.',
          detail: 'The player already accepted it, but its meaning is socially risky.',
          relatedActorIds: [],
          relatedCaseIds: ['case_nightclub'],
          relatedPlaceIds: [],
          evidence: {
            caseId: 'case_nightclub',
            caseTitle: 'Nightclub complaint',
            summary: 'May connect the nightclub owner to the complaint.',
            disputed: true,
            disputeSummary: 'The timing of the gift is disputed.'
          },
          importance: 70,
          visibility: 'player_known'
        },
        asset_old_receipt: {
          itemId: 'asset_old_receipt',
          category: 'document',
          name: 'Old receipt',
          summary: 'Unrelated household receipt.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known'
        }
      },
      equippedItemIds: []
    };

    const context = selectContext(state, 'check the nightclub evidence watch');
    const prompt = composePrompt(context, 'check the nightclub evidence watch');

    expect(context.assetProjection.items.map((item) => item.itemId)).toContain('asset_gold_watch');
    expect(prompt).toContain('ASSET_CONTEXT_PROJECTION');
    expect(prompt).toContain('Gold watch');
    expect(prompt).toContain('case_nightclub');
    expect(prompt).toContain('交给别人、寄出、提交到案件或证物袋');
    expect(prompt).toContain('小说手稿从前三章推进到前四章');
    expect(prompt).not.toContain('Old receipt');
  });

  it('always projects equipped owned assets even when they are otherwise low-importance', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_equipped_baton: {
          itemId: 'asset_equipped_baton',
          category: 'equipment',
          name: 'Equipped baton',
          summary: 'The baton currently carried by the player.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known'
        },
        asset_unrelated_receipt: {
          itemId: 'asset_unrelated_receipt',
          category: 'document',
          name: 'Unrelated receipt',
          summary: 'A low-importance receipt.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known'
        }
      },
      equippedItemIds: ['asset_equipped_baton']
    };

    const context = selectContext(state, 'routine patrol');

    expect(context.assetProjection.items.map((item) => item.itemId)).toContain('asset_equipped_baton');
    expect(context.assetProjection.items.map((item) => item.itemId)).not.toContain('asset_unrelated_receipt');
  });

  it('projects the current special clothing source item even when it is low-importance', () => {
    const state = createInitialRuntimeState();
    state.player.clothing = 'Dark wool sweater from May, plain trousers.';
    (state.player as any).clothingState = {
      currentSummary: state.player.clothing,
      mode: 'special',
      sourceItemId: 'asset_girlfriend_sweater',
      sourceItemSignificance: 'May bought it for the player before this date.',
      lastChangedAt: { ...state.time },
      lastChangedReason: 'The player chose to wear it to meet May.'
    };
    state.assets = {
      items: {
        asset_girlfriend_sweater: {
          itemId: 'asset_girlfriend_sweater',
          category: 'general',
          name: 'Girlfriend sweater',
          summary: 'A dark wool sweater kept at home.',
          detail: 'The item matters only when the player wears it.',
          relatedActorIds: ['npc_may'],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known',
          wearable: {
            wearSummary: 'Dark wool sweater from May.',
            significance: 'May bought it for the player, so wearing it can affect intimate and social scenes.'
          }
        } as any,
        asset_unrelated_low: {
          itemId: 'asset_unrelated_low',
          category: 'document',
          name: 'Unrelated document',
          summary: 'A low-importance unrelated document.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known'
        }
      },
      equippedItemIds: []
    };

    const context = selectContext(state, 'go meet May');
    const prompt = composePrompt(context, 'go meet May');

    expect(context.assetProjection.items.map((item) => item.itemId)).toContain('asset_girlfriend_sweater');
    expect(context.assetProjection.items.map((item) => item.itemId)).not.toContain('asset_unrelated_low');
    expect(context.playerSummary).toContain('May bought it for the player before this date.');
    expect(prompt).toContain('wearable');
    expect(prompt).toContain('May bought it for the player, so wearing it can affect intimate and social scenes.');
  });

  it('adds only current movement time references to the prompt when a destination is mentioned', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(selectContext(state, '步行去油麻地警署看看'), '步行去油麻地警署看看');

    expect(prompt).toContain('MOVEMENT_TIME_REFERENCE');
    expect(prompt).toContain('from=旺角警署');
    expect(prompt).toContain('to=油麻地警署');
    expect(prompt).toContain('mode=walk');
    expect(prompt).not.toContain('baseDistanceUnit');
    expect(prompt).not.toContain('RouteOverrides');
  });

  it('adds urgency and vehicle risk details to movement time references', () => {
    const state = createInitialRuntimeState();
    const policeCar: VehicleAsset = {
      itemId: 'asset_police_car',
      category: 'vehicle',
      vehicleType: 'policeVehicle',
      holdingRelation: 'assigned',
      condition: 'usable',
      name: 'Station patrol car',
      summary: 'A patrol car available during duty.',
      locationSummary: 'Parked near Mong Kok Police Station.',
      accessSummary: 'Available for duty movement.',
      mobilityProfile: {
        mode: 'policeVehicle',
        timeMultiplier: 0.82,
        availabilitySummary: 'Suitable for emergency police movement.'
      },
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: ['place_mong_kok_police_station'],
      visibility: 'player_known',
      importance: 70,
      incomeSettlementItemIds: [],
      expenseSettlementItemIds: []
    };
    state.assets.items[policeCar.itemId] = policeCar;

    const prompt = composePrompt(
      selectContext(state, 'Drive the police car emergency to Yau Ma Tei Police Station'),
      'Drive the police car emergency to Yau Ma Tei Police Station'
    );

    expect(prompt).toContain('MOVEMENT_TIME_REFERENCE');
    expect(prompt).toContain('mode=patrolCar');
    expect(prompt).toContain('urgency=emergency');
    expect(prompt).toContain('Station patrol car');
    expect(prompt).toContain('risk=emergency');
  });

  it('omits movement time references when no destination is mentioned', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(selectContext(state, '看看报案室里有没有熟人'), '看看报案室里有没有熟人');

    expect(prompt).not.toContain('MOVEMENT_TIME_REFERENCE');
  });

  it('includes a turn JSON response example that is valid JSON', () => {
    const state = createInitialRuntimeState();
    const prompt = composePrompt(selectContext(state, '接电话'), '接电话');
    const marker = 'TURN_OUTPUT_JSON_EXAMPLE';
    const markerIndex = prompt.indexOf(marker);

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const parsed = JSON.parse(prompt.slice(markerIndex + marker.length).trim());

    expect(parsed).toHaveProperty('writebackVersion');
    expect(parsed).toHaveProperty('narrativeText');
    expect((parsed.narrativeText as string).length).toBeGreaterThan(220);
    expect(((parsed.narrativeText as string).match(/【[^】]+】/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(parsed).toHaveProperty('writeback');
  });

  it('excludes hidden present actors', () => {
    const state = createInitialRuntimeState();
    const hiddenActor: Actor = {
      ...state.actors.player,
      actorId: 'hidden_present_actor',
      name: 'Hidden Present Actor',
      presence: 'present',
      visibility: 'hidden',
      importance: 999
    };
    state.actors[hiddenActor.actorId] = hiddenActor;

    const context = selectContext(state, 'look around');

    expect(context.presentActors.map((actor) => actor.actorId)).not.toContain(hiddenActor.actorId);
  });

  it('selects present actors from the current scene instead of globally present actors', () => {
    const state = createInitialRuntimeState();
    const sceneActor = createActor(state.actors.player, {
      actorId: 'scene_actor',
      name: 'Scene Actor',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'nearby',
      importance: 10
    });
    const otherSceneActor = createActor(state.actors.player, {
      actorId: 'other_scene_actor',
      name: 'Other Scene Actor',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: 'scene_elsewhere',
      presence: 'present',
      importance: 999
    });
    const otherPlaceActor = createActor(state.actors.player, {
      actorId: 'other_place_actor',
      name: 'Other Place Actor',
      currentPlaceId: 'place_elsewhere',
      currentSceneId: 'scene_elsewhere',
      presence: 'present',
      importance: 1000
    });
    state.actors[sceneActor.actorId] = sceneActor;
    state.actors[otherSceneActor.actorId] = otherSceneActor;
    state.actors[otherPlaceActor.actorId] = otherPlaceActor;
    state.scenes[state.location.currentSceneId ?? ''].presentActorIds = ['player', sceneActor.actorId];

    const context = selectContext(state, 'look around');
    const presentActorIds = context.presentActors.map((actor) => actor.actorId);

    expect(presentActorIds).toContain('player');
    expect(presentActorIds).toContain(sceneActor.actorId);
    expect(presentActorIds).not.toContain(otherSceneActor.actorId);
    expect(presentActorIds).not.toContain(otherPlaceActor.actorId);
  });

  it('builds actor context packets with NPC profile, relationship, role data, and limited memories', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    const npc = createActor(state.actors.player, {
      actorId: 'npc_station_sergeant',
      name: 'Station Sergeant Ho',
      englishName: 'Henry Ho',
      currentIdentity: 'police',
      publicIdentity: 'Station Sergeant',
      actualIdentitySummary: 'Uniformed station sergeant responsible for report room discipline.',
      roleProfiles: {
        police: {
          status: 'active',
          agencyId: 'org_hk_police',
          stationOrPost: 'Mong Kok Police Station',
          department: 'Uniform Branch',
          rank: 'Station Sergeant',
          assignmentSummary: 'Report room supervisor',
          supervisorActorIds: [],
          peerActorIds: [],
          authoritySummary: 'Supervises report room routine.',
          accessSummary: 'Knows daily station reports.',
          dutySummary: 'Keeps the report room moving.',
          institutionalReputation: 'Known as strict.',
          disciplinePressureSummary: 'Sensitive to complaints.'
        }
      },
      profileSummary: 'A strict station sergeant with a good memory for faces.',
      relationshipSummary: 'He treats the player as a new subordinate.',
      attitudeTowardPlayer: 'Testing but not hostile.',
      interactionScore: 18,
      trustTendency: 'Will trust competence, not excuses.',
      entanglementSummary: 'Can affect how other station staff view the player.',
      longTermMemorySummary: 'He remembers which newcomers cause paperwork trouble.',
      recentInteractionMemory: 'He just told the player to watch the report room door.',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      presence: 'present',
      importance: 70
    });
    state.actors[npc.actorId] = npc;
    state.scenes[currentSceneId].presentActorIds = ['player', npc.actorId];
    state.memories.mem_1 = createMemory('mem_1', {
      text: 'He saw the player arrive late once.',
      kind: 'actor',
      tier: 'short_term',
      importance: 40,
      relatedActorIds: [npc.actorId]
    });
    state.memories.mem_2 = createMemory('mem_2', {
      text: 'He warned the player about sloppy paperwork.',
      kind: 'actor',
      tier: 'short_term',
      importance: 80,
      relatedActorIds: [npc.actorId]
    });
    state.memories.mem_3 = createMemory('mem_3', {
      text: 'He knows a complaint came from a shopkeeper.',
      kind: 'actor',
      tier: 'short_term',
      importance: 60,
      relatedActorIds: [npc.actorId]
    });
    state.memories.mem_4 = createMemory('mem_4', {
      text: 'He remembers an old transfer rumor.',
      kind: 'actor',
      tier: 'short_term',
      importance: 20,
      relatedActorIds: [npc.actorId],
      visibility: 'hidden'
    });

    const context = selectContext(state, 'ask Ho about the complaint');
    const packet = context.actorPackets.find((item) => item.actorId === npc.actorId);
    const prompt = composePrompt(context, 'ask Ho about the complaint');

    expect(packet?.profileSummary).toContain('strict station sergeant');
    expect(packet?.roleProfiles.police?.rank).toBe('Station Sergeant');
    expect(packet?.relationshipSummary).toContain('new subordinate');
    expect(packet?.attitudeTowardPlayer).toBe('Testing but not hostile.');
    expect(packet?.interactionScore).toBe(18);
    expect(context.memoryLayerProjection.shortTerm).toEqual([]);
    expect(context.npcMemoryProjection.entries.map((entry) => entry.memoryId)).toEqual([
      'mem_3',
      'mem_2',
      'mem_1'
    ]);
    expect(context.npcMemoryProjection.entries.every((entry) => entry.relativeLabel.length > 0)).toBe(true);
    expect(prompt).toContain('Station Sergeant Ho / Henry Ho');
    expect(prompt).toContain(`actorId: ${npc.actorId}`);
    expect(prompt).toContain('sloppy paperwork');
    expect(prompt).toContain('relative=');
    expect(prompt).not.toContain('old transfer rumor');
    expect(prompt).toContain('Station Sergeant');
  });

  it('projects routed NPC memories with per-route layer quotas and a bounded prompt budget', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    state.memories = {};

    const presentActorIds = ['player'];
    const makeNpc = (actorId: string, name: string, presence: Actor['presence'], importance: number): Actor =>
      createActor(state.actors.player, {
        actorId,
        name,
        aliases: [`${name} alias`],
        currentPlaceId: presence === 'present' ? state.location.currentPlaceId : 'place_elsewhere',
        currentSceneId: presence === 'present' ? currentSceneId : undefined,
        presence,
        visibility: 'player_known',
        importance,
        relationshipSummary: `${name} relationship summary`,
        recentInteractionMemory: `${name} recent interaction`,
        longTermMemorySummary: `${name} long term summary`
      });

    const addActorMemory = (
      actorId: string,
      memoryId: string,
      index: number,
      overrides: Partial<MemoryItem> = {}
    ): void => {
      state.memories[memoryId] = createMemory(memoryId, {
        text: `${memoryId} ${'detail '.repeat(40)}`,
        kind: 'actor',
        tier: 'short_term',
        importance: index,
        relatedActorIds: [actorId],
        gameTime: { year: 1988, month: 9, day: 12, hour: 20, minute: index },
        ...overrides
      });
    };

    for (let actorIndex = 1; actorIndex <= 8; actorIndex += 1) {
      const actor = makeNpc(`npc_present_${actorIndex}`, `Present NPC ${actorIndex}`, 'present', 90 - actorIndex);
      state.actors[actor.actorId] = actor;
      presentActorIds.push(actor.actorId);
      for (let memoryIndex = 1; memoryIndex <= 7; memoryIndex += 1) {
        addActorMemory(actor.actorId, `${actor.actorId}_memory_${memoryIndex}`, memoryIndex);
      }
    }

    for (let actorIndex = 1; actorIndex <= 4; actorIndex += 1) {
      const actor = makeNpc(`npc_mentioned_${actorIndex}`, `Mentioned NPC ${actorIndex}`, 'absent', 70 - actorIndex);
      state.actors[actor.actorId] = actor;
      for (let memoryIndex = 1; memoryIndex <= 5; memoryIndex += 1) {
        addActorMemory(actor.actorId, `${actor.actorId}_memory_${memoryIndex}`, memoryIndex);
      }
    }

    for (let actorIndex = 1; actorIndex <= 4; actorIndex += 1) {
      const actor = makeNpc(`npc_remote_${actorIndex}`, `Remote NPC ${actorIndex}`, 'absent', 80 - actorIndex);
      state.actors[actor.actorId] = actor;
      for (let memoryIndex = 1; memoryIndex <= 5; memoryIndex += 1) {
        addActorMemory(actor.actorId, `${actor.actorId}_memory_${memoryIndex}`, memoryIndex);
      }
      state.dynamicEvents.currentMatters[`matter_remote_${actorIndex}`] = {
        id: `matter_remote_${actorIndex}`,
        title: `Remote pressure ${actorIndex}`,
        summary: `Remote NPC ${actorIndex} is tied to a live off-screen pressure.`,
        status: 'active',
        priority: 90 - actorIndex,
        visibility: 'known',
        source: 'test',
        matterKind: 'relationship',
        relatedActorIds: [actor.actorId],
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: [],
        createdAt: state.time,
        updatedAt: state.time
      };
    }

    state.scenes[currentSceneId].presentActorIds = presentActorIds;
    state.memories.hidden_npc_memory = createMemory('hidden_npc_memory', {
      text: 'hidden NPC memory must stay out',
      kind: 'actor',
      relatedActorIds: ['npc_present_1'],
      visibility: 'hidden'
    });
    state.memories.compressed_npc_memory = createMemory('compressed_npc_memory', {
      text: 'compressed NPC memory must stay out',
      kind: 'actor',
      relatedActorIds: ['npc_present_1'],
      compressedIntoMemoryId: 'summary_memory'
    });

    const playerInput = 'Mentioned NPC 1 and Mentioned NPC 2 and Mentioned NPC 3 and Mentioned NPC 4';
    const context = selectContext(state, playerInput);
    const prompt = composePrompt(context, playerInput);

    expect(context.npcMemoryProjection.entries).toHaveLength(54);
    expect(context.npcMemoryProjection.diagnostics.estimatedTokenBudget).toBe(20000);
    expect(context.npcMemoryProjection.diagnostics.selectedTextChars).toBeLessThanOrEqual(30000);
    expect(context.npcMemoryProjection.diagnostics.candidateMemoryCount).toBe(96);
    expect(context.npcMemoryProjection.entries.filter((entry) => entry.route === 'present')).toHaveLength(34);
    expect(context.npcMemoryProjection.entries.filter((entry) => entry.route === 'mentioned')).toHaveLength(12);
    expect(context.npcMemoryProjection.entries.filter((entry) => entry.route === 'remote')).toHaveLength(8);
    expect(context.npcMemoryProjection.diagnostics.tierCounts).toEqual({
      short_term: 54,
      mid_term: 0,
      long_term: 0
    });
    expect(prompt).toContain('NPC_MEMORY_PROJECTION');
    expect(prompt).toContain('Present NPC 1');
    expect(prompt).toContain('Mentioned NPC 1');
    expect(prompt).toContain('Remote NPC 1');
    expect(prompt).not.toContain('hidden NPC memory must stay out');
    expect(prompt).not.toContain('compressed NPC memory must stay out');
  });

  it('uses vector similarity to rerank routed NPC memories', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    const npc = createActor(state.actors.player, {
      actorId: 'npc_vector_contact',
      name: 'Vector Contact',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      presence: 'present',
      visibility: 'player_known',
      importance: 60
    });
    state.actors[npc.actorId] = npc;
    state.scenes[currentSceneId].presentActorIds = ['player', npc.actorId];
    state.memories = {
      unrelated_important: createMemory('unrelated_important', {
        text: 'The NPC remembers an unrelated station routine.',
        kind: 'actor',
        relatedActorIds: [npc.actorId],
        importance: 95,
        embeddingText: 'station routine unrelated',
        embeddingVector: [0, 1]
      }),
      vector_relevant_low: createMemory('vector_relevant_low', {
        text: 'The NPC remembers the player promised to protect the old pier informant.',
        kind: 'actor',
        relatedActorIds: [npc.actorId],
        importance: 10,
        embeddingText: 'old pier informant promise',
        embeddingVector: [1, 0]
      })
    };

    const context = selectContext(state, 'old pier informant promise', { queryEmbedding: [1, 0] }) as any;
    const firstNpcMemory = context.npcMemoryProjection.entries[0];

    expect(firstNpcMemory.memoryId).toBe('vector_relevant_low');
    expect(firstNpcMemory.reasons).toContain('vector_match');
    expect(firstNpcMemory.vectorScore).toBe(1);
  });

  it('does not let actor-memory importance change routed NPC recall order', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    const npc = createActor(state.actors.player, {
      actorId: 'npc_importance_free_memory',
      name: 'Importance Free Contact',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      presence: 'present',
      visibility: 'player_known',
      importance: 70
    });
    state.actors[npc.actorId] = npc;
    state.scenes[currentSceneId].presentActorIds = ['player', npc.actorId];
    state.memories = {
      older_high: createMemory('older_high', {
        text: 'Older routine contact.',
        kind: 'actor',
        relatedActorIds: [npc.actorId],
        importance: 100,
        gameTime: { ...state.time, minute: 10 }
      }),
      newer_low: createMemory('newer_low', {
        text: 'Newer routine contact.',
        kind: 'actor',
        relatedActorIds: [npc.actorId],
        importance: 1,
        gameTime: { ...state.time, minute: 20 }
      })
    };

    const before = selectContext(state, 'continue the conversation').npcMemoryProjection.entries.map(
      (entry) => entry.memoryId
    );
    state.memories.older_high.importance = 1;
    state.memories.newer_low.importance = 100;
    const after = selectContext(state, 'continue the conversation').npcMemoryProjection.entries.map(
      (entry) => entry.memoryId
    );

    expect(before).toEqual(['newer_low', 'older_high']);
    expect(after).toEqual(before);

    const prompt = composePrompt(selectContext(state, 'continue the conversation'), 'continue the conversation');
    const actorMemoryExample = prompt.split('"actorMemories"')[1]?.split('"traitProgress"')[0] ?? '';
    expect(prompt).toContain('每名 NPC 每回合最多一条，也可以零条');
    expect(actorMemoryExample).not.toContain('"importance"');
  });

  it('feeds NPC basic identity, attributes, traits, and aliases into prompt context', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    const npc = createActor(state.actors.player, {
      actorId: 'npc_big_fai',
      name: '梁辉',
      englishName: 'Fai Leung',
      aliases: ['大辉', 'Big Fai'],
      callName: '辉哥',
      gender: 'male',
      computedAge: 32,
      visualAgeAnchor: '三十出头',
      currentIdentity: 'gang_member',
      publicIdentity: '蓝灯笼边缘人物',
      actualIdentitySummary: '和联胜外围跑腿。',
      profileSummary: '有点虚张声势，但知道夜场消息。',
      positionSummary: '和联胜外围跑腿。',
      attributes: { body: 52, action: 60, perception: 58, thinking: 45, negotiation: 55, will: 48 },
      activeTraits: [
        {
          traitId: 'trait_streetwise_runner',
          name: '街面跑腿',
          source: 'llm_generated',
          description: '熟悉夜场后巷和街头传话规矩。',
          effectSummary: '夜场、社团边缘和街面消息判断更稳定。',
          scopes: ['underworld', 'street'],
          status: 'active',
          visibility: 'player_known'
        }
      ],
      traitProgress: [
        {
          traitId: 'trait_police_fear',
          name: '怕差人',
          progress: 35,
          maxProgress: 100,
          reason: '被玩家盘问后开始顾忌警察。'
        }
      ],
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      presence: 'present',
      importance: 70
    });
    state.actors[npc.actorId] = npc;
    state.scenes[currentSceneId].presentActorIds = ['player', npc.actorId];

    const context = selectContext(state, '问问辉哥昨晚夜场出了什么事');
    const packet = context.actorPackets.find((item) => item.actorId === npc.actorId) as unknown as {
      aliases?: string[];
      callName?: string;
      attributes?: Actor['attributes'];
      activeTraits?: Actor['activeTraits'];
      traitProgress?: Actor['traitProgress'];
    };
    const prompt = composePrompt(context, '问问辉哥昨晚夜场出了什么事');

    expect(packet.aliases).toEqual(['大辉', 'Big Fai']);
    expect(packet.callName).toBe('辉哥');
    expect(packet.attributes?.action).toBe(60);
    expect(packet.activeTraits?.[0]?.name).toBe('街面跑腿');
    expect(packet.traitProgress?.[0]?.name).toBe('怕差人');
    expect(prompt).toContain('别名/称呼: 大辉 / Big Fai / 辉哥');
    expect(prompt).toContain('性别/年龄: 男 / 32岁 / 三十出头');
    expect(prompt).toContain('六维: 体魄52，行动60，观察58，思考45，交涉55，意志48');
    expect(prompt).toContain('特质: 街面跑腿');
    expect(prompt).toContain('特质进度: 怕差人 35/100');
  });

  it('feeds adult private profile by the bottom age gate instead of the redundant ageConfirmedAdult flag', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    const currentSceneId = state.location.currentSceneId ?? '';
    const npc = createActor(state.actors.player, {
      actorId: 'npc_adult_may',
      name: '周嘉敏',
      englishName: 'May Chow',
      gender: 'female',
      birthDate: '1965-02-14',
      computedAge: 23,
      currentIdentity: 'civilian',
      publicIdentity: '玩家女友',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId,
      presence: 'present',
      visibility: 'player_known',
      importance: 95,
      femaleProfile: {
        addressToPlayer: '阿星',
        appearanceDescription: '笑起来眉眼弯弯。',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: false,
          profileStatus: 'ready',
          womb: {
            status: '未受孕',
            cervixStatus: '紧闭',
            records: []
          },
          partProfiles: {
            胸部: { description: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
            小穴: { description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
            屁穴: { description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
          }
        }
      }
    });
    state.actors[npc.actorId] = npc;
    state.scenes[currentSceneId].presentActorIds = ['player', npc.actorId];

    const prompt = composePrompt(selectContext(state, '给周嘉敏打电话'), '给周嘉敏打电话');

    expect(prompt).toContain('香闺秘档');
    expect(prompt).not.toContain('女性扩展档案状态');
    expect(prompt).toContain('子宫档案: 状态=未受孕 / 宫口状态=紧闭 / 生命周期=无活动妊娠 / 历史=无 / 记录=无');
    expect(prompt).toContain('部位档案: 胸部=乳房饱满柔软，乳晕色泽自然，乳头敏感。 / 小穴=阴唇紧致细嫩，穴口收敛，阴蒂敏感。 / 屁穴=臀缝紧窄，屁穴小而紧闭，周围皱褶细密。');
    expect(prompt).toContain('pregnancyRiskPatches');
    expect(prompt).toContain('本地引擎独占概率、验孕、孕期和分娩日期真值');
    expect(prompt).not.toContain('锚点已建立');
    expect(prompt).not.toContain('成人私密档案');
    expect(prompt).not.toContain('- 摘要: 稳定秘档备注');
  });

  it('caps present actors in prompt context', () => {
    const state = createInitialRuntimeState();
    const currentSceneId = state.location.currentSceneId ?? '';
    const actorIds = ['player'];
    for (let index = 1; index <= 10; index += 1) {
      const actor = createActor(state.actors.player, {
        actorId: `scene_actor_${index}`,
        name: `Scene Actor ${index}`,
        currentPlaceId: state.location.currentPlaceId,
        currentSceneId,
        presence: 'present',
        importance: index
      });
      state.actors[actor.actorId] = actor;
      actorIds.push(actor.actorId);
    }
    state.scenes[currentSceneId].presentActorIds = actorIds;

    const context = selectContext(state, 'routine');

    expect(context.presentActors).toHaveLength(8);
    expect(context.presentActors.map((actor) => actor.actorId)).toEqual([
      'player',
      'scene_actor_10',
      'scene_actor_9',
      'scene_actor_8',
      'scene_actor_7',
      'scene_actor_6',
      'scene_actor_5',
      'scene_actor_4'
    ]);
  });

  it('limits memories to six and filters hidden memories', () => {
    const state = createInitialRuntimeState();
    for (let index = 1; index <= 8; index += 1) {
      state.memories[`memory_${index}`] = createMemory(`memory_${index}`, {
        text: `memory ${index}`,
        importance: index
      });
    }
    state.memories.hidden_memory = createMemory('hidden_memory', {
      text: 'hidden memory',
      importance: 1000,
      visibility: 'hidden'
    });

    const context = selectContext(state, 'routine');
    const memoryIds = context.memories.map((memory) => memory.memoryId);

    expect(context.memories).toHaveLength(6);
    expect(memoryIds).not.toContain('hidden_memory');
  });

  it('limits pressures to one and filters hidden or resolved pressures', () => {
    const state = createInitialRuntimeState();
    state.pressures.unrelated_high = createPressure('unrelated_high', {
      summary: 'unrelated high pressure',
      severity: 90
    });
    state.pressures.current_place = createPressure('current_place', {
      summary: 'station pressure',
      severity: 10,
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    state.pressures.hidden_pressure = createPressure('hidden_pressure', {
      summary: 'hidden pressure',
      severity: 1000,
      visibility: 'hidden'
    });
    state.pressures.resolved_pressure = createPressure('resolved_pressure', {
      summary: 'resolved pressure',
      severity: 999,
      status: 'resolved'
    });

    const context = selectContext(state, 'routine');
    const pressureIds = context.pressures.map((pressure) => pressure.pressureId);

    expect(context.pressures).toHaveLength(1);
    expect(pressureIds).toEqual(['current_place']);
    expect(pressureIds).not.toContain('hidden_pressure');
    expect(pressureIds).not.toContain('resolved_pressure');
  });

  it('limits cases to three and filters hidden cases', () => {
    const state = createInitialRuntimeState();
    for (let index = 1; index <= 5; index += 1) {
      state.cases[`case_${index}`] = createCase(`case_${index}`, {
        title: `case ${index}`,
        summary: `case summary ${index}`,
        relatedPlaceIds: index <= 3 ? [state.location.currentPlaceId] : []
      });
    }
    state.cases.hidden_case = createCase('hidden_case', {
      title: 'hidden case',
      visibility: 'hidden',
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    const context = selectContext(state, 'routine');
    const caseIds = context.relevantCases.map((caseFile) => caseFile.caseId);

    expect(context.relevantCases).toHaveLength(3);
    expect(caseIds).toEqual(['case_3', 'case_2', 'case_1']);
    expect(caseIds).not.toContain('hidden_case');
  });

  it('ranks current-place and player-input relevance above unrelated global importance', () => {
    const state = createInitialRuntimeState();
    state.memories.unrelated_high = createMemory('unrelated_high', {
      text: 'unrelated high memory',
      importance: 100
    });
    state.memories.place_relevant_low = createMemory('place_relevant_low', {
      text: 'quiet station note',
      importance: 1,
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    state.cases.unrelated_high = createCase('unrelated_high', {
      title: 'Unrelated High Case',
      summary: 'nothing useful',
      relatedPlaceIds: []
    });
    state.cases.input_relevant_low = createCase('input_relevant_low', {
      title: 'Phone Trace',
      summary: 'call record mentioned by the player',
      relatedPlaceIds: []
    });

    const context = selectContext(state, 'phone');

    expect(context.memories.map((memory) => memory.memoryId).at(0)).toBe('place_relevant_low');
    expect(context.relevantCases.map((caseFile) => caseFile.caseId).at(0)).toBe('input_relevant_low');
  });

  it('keeps unrelated related cases behind current player case work', () => {
    const state = createInitialRuntimeState();
    state.cases.related_transferred = createCase('related_transferred', {
      title: '移交反黑案件',
      summary: '反黑组已接手，玩家只保留知情身份。',
      playerRole: 'aware'
    });
    state.cases.player_lead = createCase('player_lead', {
      title: '玩家主办案件',
      summary: '需要玩家继续主办。',
      playerRole: 'lead'
    });
    state.cases.player_assist = createCase('player_assist', {
      title: '玩家协办案件',
      summary: '需要玩家继续协办。',
      playerRole: 'assist'
    });
    state.cases.player_execute = createCase('player_execute', {
      title: '玩家执行案件',
      summary: '需要玩家继续执行。',
      playerRole: 'execute'
    });

    const context = selectContext(state, '整理自己手头案件');
    const caseIds = context.relevantCases.map((caseFile) => caseFile.caseId);

    expect(context.relevantCases).toHaveLength(3);
    expect(caseIds).toEqual(expect.arrayContaining(['player_lead', 'player_assist', 'player_execute']));
    expect(caseIds).not.toContain('related_transferred');
  });

  it('keeps directly mentioned related cases available to the prompt', () => {
    const state = createInitialRuntimeState();
    state.cases.related_transferred = createCase('related_transferred', {
      title: '移交反黑案件',
      summary: '反黑组已接手，玩家只保留知情身份。',
      playerRole: 'aware'
    });
    for (let index = 1; index <= 3; index += 1) {
      state.cases[`player_case_${index}`] = createCase(`player_case_${index}`, {
        title: `玩家案件 ${index}`,
        summary: `玩家案件 ${index}`,
        playerRole: 'lead'
      });
    }

    const context = selectContext(state, '问移交反黑案件有没有新进展');
    const prompt = composePrompt(context, '问移交反黑案件有没有新进展');

    expect(context.relevantCases.map((caseFile) => caseFile.caseId)).toContain('related_transferred');
    expect(prompt).toContain('相关案件，不是玩家当前负责案件');
    expect(prompt).toContain('已移交 CID/反黑/重案/检控');
  });

  it('projects case evidence and due deferred events without exposing future events', () => {
    const state = createInitialRuntimeState();
    state.cases.case_bar_assault = createCase('case_bar_assault', {
      title: 'Bar assault',
      summary: 'A bar assault with possible triad pressure.',
      currentFocus: 'Check the witness statement.',
      playerVisibleProgress: 'The player has one statement.',
      internalProgressSummary: 'The lead officer is waiting for review.',
      relatedPlaceIds: [state.location.currentPlaceId],
      evidenceIds: ['evidence_bar_owner_statement'],
      activityLog: [
        {
          activityId: 'activity_statement_added',
          kind: 'evidence_added',
          gameTime: state.time,
          summary: 'The bar owner statement was added.',
          relatedEvidenceIds: ['evidence_bar_owner_statement'],
          relatedActorIds: ['player'],
          relatedPlaceIds: [state.location.currentPlaceId],
          visibleToPlayer: true
        }
      ]
    });
    state.caseEvidence.evidence_bar_owner_statement = createCaseEvidence('evidence_bar_owner_statement', {
      caseId: 'case_bar_assault',
      title: 'Bar owner statement',
      evidenceType: 'statement',
      summary: 'The owner saw two men leave through the back door.',
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    state.deferredEvents.due_case_review = createDeferredEvent('due_case_review', {
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Lead officer review',
      summary: 'The lead officer should respond to the submitted statement.',
      triggerAt: state.time,
      promptInstruction: 'Resolve, cancel, or reschedule this review through deferredEventPatches.'
    });
    state.deferredEvents.future_case_review = createDeferredEvent('future_case_review', {
      relatedIds: { caseId: 'case_bar_assault' },
      title: 'Future court date',
      summary: 'This should not be projected before it is due.',
      triggerAt: { ...state.time, day: state.time.day + 1 },
      promptInstruction: 'Do not project before due.'
    });

    const context = selectContext(state, 'review the bar assault statement');
    const prompt = composePrompt(context, 'review the bar assault statement');

    expect(context.caseProjection.diagnostics.selectedCaseIds).toContain('case_bar_assault');
    expect(context.caseProjection.diagnostics.selectedEvidenceIds).toContain('evidence_bar_owner_statement');
    expect(context.deferredProjection.dueEvents.map((event) => event.eventId)).toEqual(['due_case_review']);
    expect(context.deferredProjection.diagnostics.omittedDueEventCount).toBe(0);
    expect(prompt).toContain('CASE_CONTEXT_PROJECTION');
    expect(prompt).toContain('caseId=case_bar_assault');
    expect(prompt).toContain('Check the witness statement.');
    expect(prompt).toContain('The player has one statement.');
    expect(prompt).toContain('Bar owner statement');
    expect(prompt).toContain('The bar owner statement was added.');
    expect(prompt).toContain('DEFERRED_EVENT_PROJECTION');
    expect(prompt).toContain('Lead officer review');
    expect(prompt).toContain('every due event listed above must receive exactly one deferredEventPatches item');
    expect(prompt).toContain('Never leave a due event unchanged');
    expect(prompt).toContain('caseEvidencePatches');
    expect(prompt).toContain('deferredEventPatches');
    expect(prompt).not.toContain('Future court date');
  });

  it('exposes a memory projection with selection reasons for diagnostics and future vector reranking', () => {
    const state = createInitialRuntimeState();
    state.memories.unrelated_high = createMemory('unrelated_high', {
      text: 'unrelated high memory',
      importance: 100
    });
    state.memories.place_relevant_low = createMemory('place_relevant_low', {
      text: 'quiet station note',
      importance: 1,
      relatedPlaceIds: [state.location.currentPlaceId]
    });
    state.memories.present_actor = createMemory('present_actor', {
      text: 'the player promised Ho to check the complaint ledger',
      importance: 30,
      relatedActorIds: ['player']
    });
    state.memories.input_relevant = createMemory('input_relevant', {
      text: 'a pager number was mentioned near the tea stall',
      importance: 5
    });

    const context = selectContext(state, 'pager');
    const projectionIds = context.memoryProjection.map((entry) => entry.memory.memoryId);
    const placeProjection = context.memoryProjection.find((entry) => entry.memory.memoryId === 'place_relevant_low');
    const actorProjection = context.memoryProjection.find((entry) => entry.memory.memoryId === 'present_actor');
    const inputProjection = context.memoryProjection.find((entry) => entry.memory.memoryId === 'input_relevant');
    const importanceProjection = context.memoryProjection.find((entry) => entry.memory.memoryId === 'unrelated_high');

    expect(context.memories.map((memory) => memory.memoryId)).toEqual(projectionIds);
    expect(placeProjection?.reasons).toContain('current_place');
    expect(actorProjection?.reasons).not.toContain('present_actor');
    expect(inputProjection?.reasons).toContain('player_input');
    expect(importanceProjection?.reasons).toContain('high_importance');
  });

  it('uses vector similarity as an additional memory projection signal', () => {
    const state = createInitialRuntimeState();
    state.memories.unrelated_high = createMemory('unrelated_high', {
      text: 'unrelated high memory',
      importance: 100,
      embeddingVector: [0, 1]
    });
    state.memories.vector_relevant = createMemory('vector_relevant', {
      text: 'older but semantically relevant memory',
      importance: 1,
      embeddingVector: [1, 0]
    });

    const context = selectContext(state, 'semantic query', { queryEmbedding: [1, 0] });
    const vectorProjection = context.memoryProjection.find((entry) => entry.memory.memoryId === 'vector_relevant');

    expect(context.memoryProjection.map((entry) => entry.memory.memoryId).at(0)).toBe('vector_relevant');
    expect(vectorProjection?.reasons).toContain('vector_match');
    expect(vectorProjection?.vectorScore).toBe(1);
  });

  it('projects a separate general vector memory budget without duplicating NPC memories', () => {
    const state = createInitialRuntimeState();
    state.memories = {
      vector_case_fact: createMemory('vector_case_fact', {
        text: 'The old pier gambling ledger was hidden inside a shipping crate.',
        kind: 'case',
        importance: 10,
        embeddingText: 'old pier gambling ledger shipping crate',
        embeddingVector: [1, 0]
      }),
      vector_world_fact: createMemory('vector_world_fact', {
        text: 'The old pier night guard knows which boats unload after midnight.',
        kind: 'world',
        importance: 15,
        embeddingText: 'old pier night guard boats midnight',
        embeddingVector: [1, 0]
      }),
      vector_actor_memory: createMemory('vector_actor_memory', {
        text: 'NPC memory should be handled by NPC_MEMORY_PROJECTION.',
        kind: 'actor',
        relatedActorIds: ['player'],
        importance: 100,
        embeddingText: 'old pier actor memory',
        embeddingVector: [1, 0]
      }),
      unrelated_fact: createMemory('unrelated_fact', {
        text: 'A kitchen supplier changed delivery times.',
        kind: 'world',
        importance: 100,
        embeddingText: 'kitchen supplier delivery times',
        embeddingVector: [0, 1]
      })
    };

    const context = selectContext(state, 'old pier gambling ledger', { queryEmbedding: [1, 0] }) as any;
    const prompt = composePrompt(context, 'old pier gambling ledger');

    expect(context.vectorMemoryProjection.entries.map((entry: { memoryId: string }) => entry.memoryId)).toEqual(
      expect.arrayContaining(['vector_case_fact', 'vector_world_fact'])
    );
    expect(context.vectorMemoryProjection.entries).toHaveLength(2);
    expect(context.vectorMemoryProjection.diagnostics.estimatedTokenBudget).toBe(12000);
    expect(context.vectorMemoryProjection.diagnostics.selectedTextChars).toBeLessThanOrEqual(12000);
    expect(prompt).toContain('VECTOR_MEMORY_PROJECTION');
    expect(prompt).toContain('old pier gambling ledger');
    const vectorSection = prompt.split('VECTOR_MEMORY_PROJECTION')[1]?.split('MEMORY_LAYER_PROJECTION')[0] ?? '';
    expect(vectorSection).not.toContain('NPC memory should be handled by NPC_MEMORY_PROJECTION.');
  });

  it('projects mutually exclusive player memory layers and excludes recent raw turns and non-turn facts', () => {
    const state = createInitialRuntimeState();
    state.memories = {};
    state.memories.short_old = createMemory('short_old', {
      text: 'old patrol exchange',
      kind: 'turn',
      tier: 'short_term',
      relatedTurnId: 'turn_old',
      gameTime: { year: 1988, month: 6, day: 1, hour: 8, minute: 20 },
      importance: 20
    });
    state.memories.short_recent = createMemory('short_recent', {
      text: 'recent raw patrol exchange must not be repeated as short memory',
      kind: 'turn',
      tier: 'short_term',
      relatedTurnId: 'turn_recent',
      gameTime: { year: 1988, month: 6, day: 1, hour: 8, minute: 45 },
      importance: 10
    });
    state.memories.mid_summary = createMemory('mid_summary', withMemoryTier({
      text: 'compressed summary of the last patrol segment',
      kind: 'turn',
      importance: 55
    }, 'mid_term'));
    state.memories.long_summary = createMemory('long_summary', withMemoryTier({
      text: 'long chronological player history',
      kind: 'turn',
      importance: 20
    }, 'long_term'));
    state.memories.world_fact = createMemory('world_fact', withMemoryTier({
      text: 'world facts stay outside player memory layers',
      kind: 'world',
      importance: 100,
      relatedPlaceIds: [state.location.currentPlaceId]
    }, 'long_term'));
    state.memories.actor_memory = createMemory('actor_memory', {
      text: 'NPC memory stays in NPC memory projection',
      kind: 'actor',
      tier: 'short_term',
      relatedActorIds: ['player'],
      importance: 100
    });
    state.storyLog = [
      {
        turnId: 'turn_old',
        speaker: 'narrator',
        text: 'old raw story',
        summaryText: 'old patrol exchange',
        gameTime: { year: 1988, month: 6, day: 1, hour: 8, minute: 20 }
      },
      {
        turnId: 'turn_recent',
        speaker: 'narrator',
        text: 'recent raw story',
        summaryText: 'recent raw patrol exchange must not be repeated as short memory',
        gameTime: { year: 1988, month: 6, day: 1, hour: 8, minute: 45 }
      }
    ];

    const context = selectContext(state, 'routine', {
      memorySettings: {
        autoCompressionEnabled: true,
        recentRawTurnLimit: 1,
        shortTermBatchSize: 20,
        midTermBatchSize: 15,
        longTermPromptTokenBudget: 24000
      }
    });
    const projection = (context as unknown as {
      memoryLayerProjection: {
        shortTerm: Array<{ memory: MemoryItem }>;
        midTerm: Array<{ memory: MemoryItem }>;
        longTerm: Array<{ memory: MemoryItem }>;
      };
    }).memoryLayerProjection;

    expect(projection.shortTerm.map((entry) => entry.memory.memoryId)).toEqual(['short_old']);
    expect(projection.midTerm.map((entry) => entry.memory.memoryId)).toEqual(['mid_summary']);
    expect(projection.longTerm.map((entry) => entry.memory.memoryId)).toEqual(['long_summary']);
    expect(context.recentStoryProjection.rawEntries.map((entry) => entry.turnId)).toEqual(['turn_recent']);
    expect(context.recentStoryProjection.summaryEntries).toEqual([]);
    expect([
      ...projection.shortTerm,
      ...projection.midTerm,
      ...projection.longTerm
    ].map((entry) => entry.memory.memoryId)).not.toEqual(expect.arrayContaining(['world_fact', 'actor_memory', 'short_recent']));
  });

  it('omits compressed source memories from active memory prompt projection', () => {
    const state = createInitialRuntimeState();
    state.memories = {
      raw_compressed: createMemory('raw_compressed', {
        text: 'raw patrol detail already represented by a summary',
        tier: 'short_term',
        importance: 100,
        relatedActorIds: ['player'],
        compressedIntoMemoryId: 'mid_summary',
        compressedAtTurnId: 'turn_0020',
        gameTime: { year: 1988, month: 6, day: 1, hour: 9, minute: 30 }
      }),
      mid_summary: createMemory('mid_summary', withMemoryTier({
        text: 'summary of the compressed patrol detail',
        kind: 'turn',
        importance: 60,
        relatedActorIds: ['player']
      }, 'mid_term'))
    };

    const context = selectContext(state, 'raw patrol detail');
    const layeredIds = [
      ...context.memoryLayerProjection.shortTerm,
      ...context.memoryLayerProjection.midTerm,
      ...context.memoryLayerProjection.longTerm
    ].map((entry) => entry.memory.memoryId);
    const prompt = composePrompt(context, 'raw patrol detail');

    expect(context.memoryProjection.map((entry) => entry.memory.memoryId)).not.toContain('raw_compressed');
    expect(layeredIds).not.toContain('raw_compressed');
    expect(layeredIds).toContain('mid_summary');
    expect(prompt).not.toContain('raw patrol detail already represented by a summary');
    expect(prompt).toContain('summary of the compressed patrol detail');
  });

  it('composes prompt with memory-only layered projection sections', () => {
    const state = createInitialRuntimeState();
    state.memories = {};
    state.memories.short_note = createMemory('short_note', {
      text: 'recent patrol note',
      kind: 'turn'
    });
    state.memories.mid_note = createMemory('mid_note', withMemoryTier({
      text: 'mid-term compressed patrol summary',
      kind: 'turn'
    }, 'mid_term'));
    state.memories.long_note = createMemory('long_note', withMemoryTier({
      text: 'long-term station fact',
      kind: 'turn',
      relatedPlaceIds: [state.location.currentPlaceId]
    }, 'long_term'));

    const prompt = composePrompt(selectContext(state, 'patrol'), 'patrol');

    expect(prompt).toContain('MEMORY_LAYER_PROJECTION');
    expect(prompt).toContain('short_term_history');
    expect(prompt).toContain('mid_term_history');
    expect(prompt).toContain('long_term_history');
    expect(prompt).toContain('recent patrol note');
    expect(prompt).toContain('mid-term compressed patrol summary');
    expect(prompt).toContain('long-term station fact');
  });

  it('keeps turn summaries out of generic vector memory because older prose has its own recall channel', () => {
    const state = createInitialRuntimeState();
    state.memories = {
      turn_memory: createMemory('turn_memory', {
        text: 'player already submitted the manuscript',
        kind: 'turn',
        tier: 'short_term',
        embeddingText: 'submitted manuscript',
        embeddingVector: [1, 0]
      }),
      world_memory: createMemory('world_memory', {
        text: 'the newspaper office moved its night desk',
        kind: 'world',
        embeddingText: 'newspaper office night desk',
        embeddingVector: [1, 0]
      })
    };

    const context = selectContext(state, 'newspaper manuscript', { queryEmbedding: [1, 0] });

    expect(context.vectorMemoryProjection.entries.map((entry) => entry.memoryId)).toEqual(['world_memory']);
  });

  it('composes memory prompt entries with time, kind, importance, and selection reasons', () => {
    const state = createInitialRuntimeState();
    state.memories.station_note = createMemory('station_note', {
      text: 'Ho warned the player that complaint ledgers cannot be altered casually.',
      kind: 'turn',
      tier: 'short_term',
      importance: 75,
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId]
    });

    const prompt = composePrompt(selectContext(state, 'complaint ledger'), 'complaint ledger');

    expect(prompt).toContain('1988-06-01 星期三 08:30');
    expect(prompt).toContain('kind=turn');
    expect(prompt).toContain('重要度=75');
    expect(prompt).toContain('原因=current_place,player_input,high_importance');
    expect(prompt).toContain('Ho warned the player');
  });

  it('projects conflict records into context and prompt output rules', () => {
    const state = createInitialRuntimeState();
    const judgementCheck: JudgementCheck = {
      checkId: 'check_alley_1',
      turnId: 'turn_1',
      gameTime: state.time,
      title: '后巷压制判定',
      category: 'melee',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      difficulty: 58,
      score: 71,
      margin: 13,
      outcome: 'success',
      shortSummary: '玩家成功压住对方持刀手。',
      consequenceSummary: '玩家体力明显消耗。',
      factors: [
        {
          label: '行动',
          value: 8,
          reason: '玩家反应更快。'
        }
      ],
      visibility: 'player_known'
    };
    const combatEvent: CombatEvent = {
      combatId: 'combat_alley_1',
      turnId: 'turn_1',
      gameTime: state.time,
      title: '后巷持刀拘捕',
      type: 'armed',
      locationId: state.location.currentPlaceId,
      locationSummary: '旺角后巷',
      participants: [
        {
          actorId: 'player',
          name: '玩家',
          side: 'player',
          roleSummary: '巡逻警员'
        }
      ],
      outcome: 'opponent_subdued',
      intensity: 72,
      animationKey: 'armed_alley',
      combatText: '后巷里，玩家侧身避刀后压腕，把对方顶向卷闸门。',
      resultSummary: '嫌疑人被控制。',
      consequenceSummary: '玩家体力下降，街坊开始围观。',
      judgementCheckIds: ['check_alley_1'],
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      visibility: 'player_known',
      unread: true,
      createdAt: state.time
    };
    state.judgementChecks.check_alley_1 = judgementCheck;
    state.combatEvents.combat_alley_1 = combatEvent;

    const context = selectContext(state, '追进后巷');
    const prompt = composePrompt(context, '追进后巷');

    expect(context.conflictProjection.combatEvents.map((event) => event.combatId)).toEqual(['combat_alley_1']);
    expect(context.conflictProjection.judgementChecks.map((check) => check.checkId)).toEqual(['check_alley_1']);
    expect(prompt).toContain('CONFLICT_CONTEXT_PROJECTION');
    expect(prompt).toContain('combat_alley_1');
    expect(prompt).toContain('check_alley_1');
    expect(prompt).toContain('judgementCheckPatches');
    expect(prompt).toContain('combatEventPatches');
    expect(prompt).toContain('combatText 必须是过程化精彩描写');
  });

  it('projects city situation tracks into prompt without exposing hidden tracks', () => {
    const state = createInitialRuntimeState();
    state.citySituationTracks = {
      track_public_media: {
        trackId: 'track_public_media',
        title: '报馆追访旧楼火灾',
        trackType: 'media_campaign',
        status: 'active',
        pressureLevel: 2,
        visibility: 'public',
        startedAt: state.time,
        nextReviewAt: state.time,
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: [],
        relatedActorIds: [],
        summary: '报馆正在追访旧楼火灾和逼迁。',
        currentBeat: '记者想找街坊和警署问话。',
        possibleDevelopments: ['新闻', '动态事项']
      },
      track_hidden_icac: {
        trackId: 'track_hidden_icac',
        title: '隐藏廉署调查',
        trackType: 'icac_investigation',
        status: 'active',
        pressureLevel: 4,
        visibility: 'hidden',
        startedAt: state.time,
        nextReviewAt: state.time,
        relatedOrganizationIds: [],
        relatedPowerFigureIds: [],
        relatedPlaceIds: [],
        relatedActorIds: [],
        summary: '不应投喂。',
        currentBeat: '不应投喂。',
        possibleDevelopments: ['不应投喂']
      }
    };

    const prompt = composePrompt(selectContext(state, '问报馆旧楼火灾有什么新消息'), '问报馆旧楼火灾有什么新消息');

    expect(prompt).toContain('CITY_SITUATION_TRACK_CONTEXT');
    expect(prompt).toContain('track_public_media');
    expect(prompt).toContain('citySituationTrackPatches');
    expect(prompt).toContain('不要每回合强行新增城市压力');
    expect(prompt).not.toContain('track_hidden_icac');
  });
});

function createMemory(memoryId: string, overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    memoryId,
    text: memoryId,
    kind: 'turn',
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1988, month: 6, day: 1, hour: 8, minute: 30 },
    importance: 1,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: memoryId,
    ...overrides
  };
}

function withMemoryTier(overrides: Partial<MemoryItem>, tier: 'short_term' | 'mid_term' | 'long_term'): Partial<MemoryItem> {
  return { ...overrides, tier } as Partial<MemoryItem>;
}

function createActor(baseActor: Actor, overrides: Partial<Actor>): Actor {
  return {
    ...baseActor,
    aliases: [...baseActor.aliases],
    organizationIds: [...baseActor.organizationIds],
    attributes: { ...baseActor.attributes },
    activeTraits: [...baseActor.activeTraits],
    traitProgress: [...baseActor.traitProgress],
    keyMemories: [...baseActor.keyMemories],
    ...overrides
  };
}

function createPressure(pressureId: string, overrides: Partial<PressureHook> = {}): PressureHook {
  return {
    pressureId,
    kind: 'test',
    summary: pressureId,
    status: 'active',
    severity: 1,
    exposureLikelihood: 1,
    visibility: 'player_known',
    knownByActorIds: [],
    sourceSummary: pressureId,
    relatedActorIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    allowedUses: [],
    forbiddenUses: [],
    escalationConditions: [],
    cooldownTurns: 0,
    ...overrides
  };
}

function createCase(caseId: string, overrides: Partial<CaseFile> = {}): CaseFile {
  const time = {
    year: 1988,
    month: 9,
    day: 12,
    hour: 8,
    minute: 30
  };
  return {
    caseId,
    title: caseId,
    caseType: 'test',
    status: 'investigating',
    playerRole: 'aware',
    summary: caseId,
    currentFocus: '',
    playerVisibleProgress: '',
    internalProgressSummary: '',
    relatedActorIds: [],
    relatedOrganizationIds: [],
    relatedPlaceIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function createCaseEvidence(evidenceId: string, overrides: Partial<CaseEvidence> = {}): CaseEvidence {
  const time = {
    year: 1988,
    month: 9,
    day: 12,
    hour: 8,
    minute: 30
  };
  return {
    evidenceId,
    caseId: 'case_test',
    title: evidenceId,
    evidenceType: 'other',
    sourceSummary: 'test evidence source',
    summary: evidenceId,
    relatedActorIds: [],
    relatedPlaceIds: [],
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function createDeferredEvent(eventId: string, overrides: Partial<DeferredEvent> = {}): DeferredEvent {
  const time = {
    year: 1988,
    month: 9,
    day: 12,
    hour: 8,
    minute: 30
  };
  return {
    eventId,
    sourceModule: 'case',
    relatedIds: {},
    title: eventId,
    summary: eventId,
    triggerAt: time,
    visibility: 'hidden',
    promptInstruction: 'test deferred event instruction',
    status: 'pending',
    createdAt: time,
    ...overrides
  };
}

function currentAreaIdForTest(state: RuntimeState): string {
  const currentPlace = state.places[state.location.currentPlaceId];
  return currentPlace?.districtId || currentPlace?.regionId || state.location.currentPlaceId;
}

function createGrayNetworkProfileForTest(
  state: RuntimeState,
  areaId: string,
  overrides: Partial<RuntimeState['grayNetworks']['byAreaId'][string]> = {}
): RuntimeState['grayNetworks']['byAreaId'][string] {
  return {
    areaId,
    areaName: areaId,
    updatedAtTurn: state.turnCounter,
    updatedAtTime: state.time,
    climate: [],
    knownOrganizations: [],
    keyPlaces: [],
    relatedPeople: [],
    relationClues: [],
    actionRisks: [],
    suggestedActions: [],
    ...overrides
  };
}

describe('era prompt projection', () => {
  it('uses the current Hong Kong era without exposing the internal worldpack id', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1994, month: 7, day: 8, hour: 17, minute: 45 }
    });

    const prompt = composePrompt(selectContext(state, '查看今日街面情况'), '查看今日街面情况');

    expect(prompt).toContain('1994 年香港语境');
    expect(prompt).toContain('1994 都市裂缝');
    expect(prompt).toContain('1994-07-08');
    expect(prompt).not.toContain('worldpack: hk_1988');
  });
});

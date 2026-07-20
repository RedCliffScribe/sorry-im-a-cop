import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState, type OpeningSetup } from '../runtime/initialState';
import type { Trait } from '../runtime/types';
import { composeOpeningPrompt } from './composeOpeningPrompt';

const openingTrait: Trait = {
  traitId: 'trait_reads_the_room',
  name: '会看场面',
  source: 'opening',
  description: '能判断街面谁在试探、谁在装糊涂。',
  effectSummary: '街面交涉和盘问判断时获得叙事权重。',
  scopes: ['street', 'social'],
  status: 'active',
  visibility: 'player_known'
};

function createSetup(): OpeningSetup {
  return {
    playerName: '陈启明',
    englishName: 'Michael Chan',
    gender: 'male',
    age: 25,
    policeNumber: '9527',
    currentIdentity: 'police',
    appearance: '制服整洁，眼神仍带一点新人谨慎。',
    personality: '谨慎，观察欲强，还没有完全适应街面规则。',
    cantoneseFlavor: 'heavy',
    storypackInfluence: 'medium',
    startTime: { year: 1988, month: 9, day: 1, hour: 8, minute: 30 },
    lawIdentity: {
      rank: 'Constable（警员 PC）',
      department: 'Uniform Branch（军装巡逻）',
      stationOrPost: 'Mong Kok Police Station（旺角警署）',
      assignmentSummary: 'Patrol Constable（巡逻警员）'
    },
    traits: [openingTrait],
    openingNote: '开局希望牵出一个旧同学带来的麻烦，但不要立刻变成大案。'
  };
}

function parseOpeningExample(prompt: string): Record<string, unknown> {
  const marker = 'OUTPUT_JSON_EXAMPLE';
  const markerIndex = prompt.indexOf(marker);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  return JSON.parse(prompt.slice(markerIndex + marker.length).trim()) as Record<string, unknown>;
}

describe('opening prompt', () => {
  const openingPressureIds = ['relaxed', 'routine', 'standard', 'tense', 'high'] as const;

  it('feeds real opening choices and the JSON contract to the narrator', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('不是警务流程模拟器');
    expect(prompt).toContain('陈启明');
    expect(prompt).toContain('Michael Chan');
    expect(prompt).toContain('9527');
    expect(prompt).toContain('1988');
    expect(prompt).toContain('Mong Kok Police Station');
    expect(prompt).toContain('会看场面');
    expect(prompt).toContain('粤语风味');
    expect(prompt).toContain('开局额外要求（最高优先级）');
    expect(prompt).toContain('不要立刻变成大案');
    expect(prompt).toContain('initialActors');
    expect(prompt).toContain('pressureSeeds');
    expect(prompt).toContain('0-1000');
    expect(prompt).toContain('-100到100');
    expect(prompt).toContain('clothing');
    expect(prompt).toContain('equipment');
    expect(prompt).toContain('最多三件');
    expect(prompt).toContain('roleProfiles');
    expect(prompt).toContain('attributes 六维');
    expect(prompt).toContain('不要把所有 NPC 都写成 50/50/50/50/50/50');
    expect(prompt).toContain('NPC 不需要生命/体力字段');
    expect(prompt).toContain('港警职级资料库');
    expect(prompt).toContain('SPC 绝不是 SP');
    expect(prompt).toContain('PC/SPC 是一线基层人员');
    expect(prompt).toContain('memory.kind 只能使用 turn、actor、case、place、world、player');
    expect(prompt).toContain('历史背景、时代大事、新闻环境请使用 world');
    expect(prompt).toContain('casePatches');
    expect(prompt).toContain('caseEvidencePatches');
    expect(prompt).toContain('assetPatch');
    expect(prompt).toContain('upsertItems');
    expect(prompt).toContain('禁止从正文解析状态写回');
    expect(prompt).toContain('正文风格与显示格式');
    expect(prompt).toContain('【旁白】');
    expect(prompt).toContain('【角色名】');
    expect(prompt).toContain('成人关系描写指南');
    expect(prompt).toContain('adultPrivateProfile 是成年女性的香闺秘档');
    expect(prompt).toContain('女性 NPC 必须写 femaleProfile');
    expect(prompt).toContain('确认成年女性 NPC 必须生成 adultPrivateProfile');
    expect(prompt).toContain('未来文生图资料');
    expect(prompt).toContain('profileStatus / womb / partProfiles');
    expect(prompt).toContain('partProfiles 固定包含 胸部 / 小穴 / 屁穴');
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
    expect(prompt.indexOf('成人段落输出前复核')).toBeGreaterThan(prompt.indexOf('硬规则'));
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
    expect(prompt).not.toContain('summary、preferenceNotes、boundaryNotes、relationshipRiskNotes');
    expect(prompt).toContain('不要使用 callSign、publicRelationship、appearanceExpansion');
  });

  it('feeds triad violence boundaries as hidden world logic for opening scenes', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('香港社团行为逻辑');
    expect(prompt).toContain('社团对警队人员使用暴力是高风险行为');
    expect(prompt).toContain('私人恩怨或个人失控');
    expect(prompt).toContain('大概率会被社团切割');
    expect(prompt).toContain('触及社团根本利益');
    expect(prompt).toContain('不要在 narrativeText 中直白讲解这条底层规则');
  });

  it('feeds a civilian livelihood and gradual route seeds without police-only context', () => {
    const setup: OpeningSetup = {
      ...createSetup(),
      currentIdentity: 'civilian',
      civilianProfileId: 'market_transport_helper',
      policeNumber: undefined,
      appearance: '穿着耐磨工装，肩上搭着旧毛巾。',
      lawIdentity: undefined
    };
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });
    const example = parseOpeningExample(prompt);
    const playerPatch = example.playerPatch as Record<string, unknown>;

    expect(prompt).toContain('市民开局身份边界');
    expect(prompt).toContain('公开职业：油麻地果栏运输帮工');
    expect(prompt).toContain('工作 / 日常地点：油麻地果栏');
    expect(prompt).toContain('夜班目击与货物流向使玩家成为警方常见联系人');
    expect(prompt).toContain('有人要求夹带一批来历不明的货');
    expect(prompt).toContain('不要在开局直接弹出“加入警队/加入社团”二选一');
    expect(prompt).toContain('警员编号：不适用；不得生成或写入');
    expect(prompt).not.toContain('警务值班节奏：');
    expect(prompt).not.toContain('港警职级资料库（长期约束');
    expect(playerPatch).not.toHaveProperty('policeNumber');
    expect(example.casePatches).toEqual([]);
    expect(example.secretFacts).toEqual([]);
  });

  it('keeps an unemployed civilian free of fabricated work and salary anchors', () => {
    const setup: OpeningSetup = {
      ...createSetup(),
      currentIdentity: 'civilian',
      civilianProfileId: 'unemployed',
      policeNumber: undefined,
      lawIdentity: undefined
    };
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('公开职业：暂时无业');
    expect(prompt).toContain('当前没有固定职业、雇主或固定薪水');
    expect(prompt).toContain('不得强行生成上班任务或工资现金流');
    expect(prompt).toContain('你目前没有固定工作');
  });

  it('feeds a bounded middle-rank triad role without granting top-level authority or police UI facts', () => {
    const setup: OpeningSetup = {
      ...createSetup(),
      currentIdentity: 'gang_member',
      triadProfileId: undefined,
      triadSocietyId: 'org_14k',
      triadTerritoryPlaceId: 'place_macau_ferry_terminal',
      triadRankId: 'district_cadre',
      triadRoleId: 'district_affairs_coordinator',
      policeNumber: undefined,
      appearance: '穿着普通便服，话不多。',
      lawIdentity: undefined
    };
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });
    const example = parseOpeningExample(prompt);
    const playerPatch = example.playerPatch as Record<string, unknown>;

    expect(prompt).toContain('社团开局身份边界');
    expect(prompt).toContain('字头：十四K（org_14k）');
    expect(prompt).toContain('当前层级：地区中层骨干');
    expect(prompt).toContain('当前职务：地区事务协调');
    expect(prompt).toContain('活动区域：港澳码头及其周边活动线');
    expect(prompt).toContain('可协调本区有限人手、场所和日常资源');
    expect(prompt).toContain('即使选择地区中层骨干，也不是叔伯辈、坐馆或话事人');
    expect(prompt).toContain('不能跨区随意命令他人');
    expect(prompt).toContain('警员编号：不适用；不得生成或写入');
    expect(prompt).not.toContain('警务值班节奏：');
    expect(prompt).not.toContain('港警职级资料库（长期约束');
    expect(playerPatch).not.toHaveProperty('policeNumber');
    expect(example.casePatches).toEqual([]);
    expect(example.secretFacts).toEqual([]);
  });

  it('feeds opening pressure as a real first-scene pacing constraint', () => {
    const setup = { ...createSetup(), openingPressure: 'relaxed' } as OpeningSetup;
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('开局压力：轻松开局');
    expect(prompt).toContain('普通日常开局');
    expect(prompt).toContain('正文禁用“暗流”一词');
    expect(prompt).toContain('阴谋、黑幕、幕后安排不是禁题');
    expect(prompt).not.toContain('不要主动制造暗流、黑幕、阴谋');
    expect(prompt).toContain('可写日常执勤、生活小事、街坊寒暄、家长里短、普通人情请求、轻微投诉或文书交接');
    expect(prompt).toContain('轻松开局禁止出现血衣、带血凶器、疑似命案、尸体、灭口、绑架、枪战、火场救人或关键证人求救');
    expect(prompt).toContain('旧街坊、旧同学或家人牵出的麻烦只能是欠薪、邻里争执、轻微投诉、生活困难、普通人情请求或普通工作安排');
    expect(prompt).toContain('narrativeText、suggestedActions、memories、casePatches、relationshipThreadPatches 都必须遵守轻松开局边界');
    expect(prompt).not.toContain('低风险异常');
    expect(prompt).not.toContain('普通异常');
    expect(prompt).not.toContain('背后都可能');
    expect(prompt).not.toContain('社会压力正在靠近');
    expect(prompt).not.toContain('轻松的开局并不意味着没有暗流');
  });

  it('includes weekday and police duty pacing so openings can leave free time', () => {
    const setup = {
      ...createSetup(),
      startTime: { year: 1988, month: 9, day: 12, hour: 22, minute: 13 },
      openingPressure: 'relaxed'
    } as OpeningSetup;
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('当前时间：1988-09-12 星期一 22:13');
    expect(prompt).toContain('警务值班节奏');
    expect(prompt).toContain('临近交班');
    expect(prompt).toContain('不要因为玩家是警察就自动安排新报案、新上级任务或连续加班');
    expect(prompt).toContain('可以写下班、休班、补眠、私人生活、人脉、家庭、娱乐、街坊关系或城市日常');
  });

  it('bans undercurrent writing across every opening pressure profile', () => {
    for (const openingPressure of openingPressureIds) {
      const setup = { ...createSetup(), openingPressure } as OpeningSetup;
      const state = createInitialRuntimeState(setup);

      const prompt = composeOpeningPrompt({ setup, initialState: state });

      expect(prompt).toContain('正文禁用“暗流”一词');
      expect(prompt).toContain('阴谋、黑幕、幕后安排不是禁题');
      expect(prompt).toContain('已有证据、NPC具体行动、已投喂事实或玩家主动调查');
      expect(prompt).toContain('压力必须写成具体可见、可感知、可行动的现场事实');
      expect(prompt).toContain('不要在 narrativeText、suggestedActions、pressureSeeds、memories、casePatches、relationshipThreadPatches 中埋无事实支撑的未来危机或万能悬疑钩子');
    }
  });

  it('locks opening narrative density and first-scene responsibilities', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('开局 narrativeText 目标 900-1400 个中文字符');
    expect(prompt).toContain('最低不得少于 700 个中文字符');
    expect(prompt).toContain('时代背景');
    expect(prompt).toContain('人物背景');
    expect(prompt).toContain('当前情况');
    expect(prompt).toContain('第一幕');
    expect(prompt).toContain('先完整写 narrativeText');
    expect(prompt).toContain('输出前自检');
    expect(prompt).toContain('现场锚点、玩家行动承接、NPC 或环境反应、局面变化、下一步可互动点');
    expect(prompt).not.toContain('长度适中');
  });

  it('uses the configured narrative length profile for opening density', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({
      setup,
      initialState: state,
      narrativeLengthLevel: 'immersive'
    });

    expect(prompt).toContain('开局 narrativeText 目标 1800-2800 个中文字符');
    expect(prompt).toContain('最低不得少于 1200 个中文字符');
    expect(prompt).toContain('常规回合 narrativeText 目标 1400-2200 个中文字符');
  });

  it('uses the selected narrative perspective in the opening prompt', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({
      setup,
      initialState: state,
      narrativePerspective: 'third_person'
    });

    expect(prompt).toContain('正文叙事人称（硬约束，优先于可编辑文风）');
    expect(prompt).toContain('本局选择第三人称');
    expect(prompt).toContain('玩家姓名“陈启明”或代词“他”');
    expect(prompt).toContain('玩家明确说出的对白可以自称“我”');
  });

  it('uses editable prompt overrides for opening style guides', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({
      setup,
      initialState: state,
      promptSettings: {
        overrides: {
          'narrative.styleAndDisplay': 'CUSTOM_OPENING_NARRATIVE_GUIDE',
          'relationship.adultStyleGuide': 'CUSTOM_OPENING_RELATIONSHIP_GUIDE'
        }
      }
    });

    expect(prompt).toContain('CUSTOM_OPENING_NARRATIVE_GUIDE');
    expect(prompt).toContain('CUSTOM_OPENING_RELATIONSHIP_GUIDE');
    expect(prompt).not.toContain('adultPrivateProfile 是成年女性的香闺秘档');
  });

  it('includes a JSON response example that is valid JSON', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });
    const parsed = parseOpeningExample(prompt);

    expect(parsed).toHaveProperty('narrativeText');
    expect((parsed.narrativeText as string).length).toBeGreaterThan(180);
    expect(((parsed.narrativeText as string).match(/【[^】]+】/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(parsed).toHaveProperty('initialActors');
    expect(parsed).toHaveProperty('playerPatch');
    expect(parsed).toHaveProperty('casePatches');
    expect(parsed).toHaveProperty('caseEvidencePatches');
    expect(parsed).toHaveProperty('deferredEventPatches');
    expect(parsed).toHaveProperty('assetPatch');
  });

  it('does not hardcode ordinary NPC names in the opening JSON example', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });
    const marker = 'OUTPUT_JSON_EXAMPLE';
    const markerIndex = prompt.indexOf(marker);

    expect(markerIndex).toBeGreaterThanOrEqual(0);
    const jsonText = prompt.slice(markerIndex + marker.length).trim();

    expect(prompt).not.toContain('陈志强');
    expect(prompt).not.toContain('【陈强】');
    expect(jsonText).not.toContain('陈志强');
    expect(jsonText).not.toContain('Tony Chan');
  });

  it('asks the narrator to generate a period-appropriate Hong Kong English name when the player leaves it blank', () => {
    const setup = { ...createSetup(), englishName: '' };
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('英文名：未填写');
    expect(prompt).toContain('请根据中文名、性别和1980-1990年代香港常见英文名习惯生成');
    expect(prompt).toContain('playerPatch.englishName');
  });

  it('requires concrete opening money, clothing and three equipment items instead of placeholders', () => {
    const setup = createSetup();
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('cashOnHand 与 bankBalance 都必须是符合身份、年代和背景的具体非负整数');
    expect(prompt).toContain('不得用 0 表示“待生成”');
    expect(prompt).toContain('playerPatch.clothing 必须是当前实际穿着');
    expect(prompt).toContain('equipment 必须返回三件具体随身装备');
    expect(prompt).toContain('禁止返回“装备一”“空槽”“开局待生成”');
  });
});

describe('opening era projection', () => {
  it('uses the selected opening year without exposing the internal worldpack id', () => {
    const setup = {
      ...createSetup(),
      startTime: { year: 1994, month: 7, day: 8, hour: 17, minute: 45 }
    } as OpeningSetup;
    const state = createInitialRuntimeState(setup);

    const prompt = composeOpeningPrompt({ setup, initialState: state });

    expect(prompt).toContain('1994 年香港语境');
    expect(prompt).toContain('1994 都市裂缝');
    expect(prompt).toContain('1994-07-08');
    expect(prompt).not.toContain('Worldpack：hk_1988');
  });
});

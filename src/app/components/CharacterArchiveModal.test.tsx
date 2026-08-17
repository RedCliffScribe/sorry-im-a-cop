import 'fake-indexeddb/auto';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbCustomContentRepository } from '../../domain/customContent/IndexedDbCustomContentRepository';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createActorDefaults } from '../../domain/runtime/actorFactory';
import type { ActorMemory, MemoryItem } from '../../domain/runtime/types';
import { CharacterArchiveModal } from './CharacterArchiveModal';

function createMemory(memoryId: string, text: string, importance = 50): ActorMemory {
  return {
    memoryId,
    text,
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
    importance,
    source: 'opening',
    visibility: 'player_known'
  };
}

function createRuntimeMemory(memoryId: string, text: string, actorId: string, minute: number): MemoryItem {
  return {
    memoryId,
    text,
    kind: 'actor',
    relatedActorIds: [actorId],
    relatedCaseIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute },
    importance: 50,
    visibility: 'player_known',
    certainty: 'fact',
    embeddingText: text
  };
}

describe('CharacterArchiveModal', () => {
  it('copies an encountered NPC into the custom character library after confirmation', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_import = createActorDefaults({
      actorId: 'npc_import',
      name: '阿玲',
      aliases: ['玲姐'],
      gender: 'female',
      currentIdentity: 'civilian',
      publicIdentity: '电影公司场务',
      actualIdentitySummary: '熟悉片场人脉的资深场务。',
      positionSummary: '片场协调人员',
      profileSummary: '说话爽快，做事利落。',
      appearance: '短发，目光敏锐。',
      clothing: '便于工作的衬衫长裤。',
      personality: '爽快、谨慎',
      speechStyle: '直截了当。',
      motivation: '保护片场同事',
      longTermGoal: '成为独当一面的制片主任',
      values: '义气、专业',
      presence: 'present',
      interactionScore: 12,
      importance: 70,
      visibility: 'player_known',
      relationshipSummary: '与玩家逐渐熟悉。',
      recentInteractionMemory: '刚带玩家看过摄影棚。'
    });
    const repository = new IndexedDbCustomContentRepository(
      `character-archive-import-${Date.now()}`
    );

    render(
      <CharacterArchiveModal
        state={state}
        onClose={vi.fn()}
        customContentRepository={repository}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '导入自定义人物库' }));
    expect(screen.getByText(/不会带入本局关系、记忆、位置或当前状态/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '已将“阿玲”保存为待审核草稿'
      );
    });

    const assets = await repository.listCharacterAssets();
    expect(assets).toHaveLength(1);
    const revision = await repository.getCharacterRevision(
      assets[0].characterAssetId,
      assets[0].latestRevision
    );
    expect(revision).toMatchObject({
      displayName: '阿玲',
      aliases: ['玲姐'],
      lifecycle: {
        reviewStatus: 'needs_review',
        availabilityStatus: 'disabled'
      }
    });
    expect(JSON.stringify(revision)).not.toContain('与玩家逐渐熟悉');
    expect(JSON.stringify(revision)).not.toContain('刚带玩家看过摄影棚');

    fireEvent.click(screen.getByRole('button', { name: '导入自定义人物库' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        '已经在自定义人物库中'
      );
    });
    expect(await repository.listCharacterAssets()).toHaveLength(1);
  });

  it('renders a player-facing NPC archive and hides zero-contact mentioned actors', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_station_sergeant = createActorDefaults({
      actorId: 'npc_station_sergeant',
      name: '何志强',
      englishName: 'Henry Ho',
      gender: 'male',
      computedAge: 44,
      currentIdentity: 'police',
      publicIdentity: '警署警长',
      actualIdentitySummary: '旺角警署报案室的老资格警署警长。',
      roleProfiles: {
        police: {
          status: 'active',
          stationOrPost: 'Mong Kok Police Station',
          department: 'Uniform Branch',
          rank: 'Station Sergeant',
          assignmentSummary: 'Report room supervisor',
          postRole: 'Station Supervisor',
          supervisorActorIds: [],
          peerActorIds: [],
          authoritySummary: '管报案室日常秩序。',
          accessSummary: '知道警署值班和投诉记录。',
          dutySummary: '维持报案室运转。',
          institutionalReputation: '严格但不阴险。',
          disciplinePressureSummary: '很在意投诉。'
        }
      },
      positionSummary: '旺角警署报案室监督',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: state.location.currentSceneId,
      presence: 'present',
      profileSummary: '记性很好、说话硬的老差人。',
      appearance: '头发花白，制服熨得很直。',
      clothing: '夏季军装制服。',
      equipment: ['警棍', '值班簿'],
      personality: '严厉，重规矩，观察人很细。',
      speechStyle: '短句，带老派粤语口吻。',
      motivation: '让新来的警员别给警署惹麻烦。',
      longTermGoal: '平稳熬到退休。',
      values: '规矩、面子和警署秩序。',
      relationshipSummary: '把玩家当成还要观察的新人。',
      attitudeTowardPlayer: '审视但不敌视。',
      interactionScore: 18,
      trustTendency: '看能力，不听借口。',
      entanglementSummary: '会影响其他同僚怎么看玩家。',
      longTermMemorySummary: '记得谁容易在文书上出错。',
      recentInteractionMemory: '刚提醒玩家注意报案室门口。',
      keyMemories: [],
      statusSummary: '正在值班。',
      bodyConditionSummary: '精神还好，但有点疲惫。',
      visibility: 'player_known',
      importance: 80
    });
    state.memories.mem_1 = {
      ...createRuntimeMemory('mem_1', '他提醒过玩家别把投诉记录写漏。', 'npc_station_sergeant', 15),
      importance: 75
    };
    state.actors.npc_heard_only = createActorDefaults({
      actorId: 'npc_heard_only',
      name: '罗老板',
      currentIdentity: 'civilian',
      publicIdentity: '只在传闻里出现的老板',
      presence: 'mentioned',
      interactionScore: 0,
      importance: 20,
      visibility: 'player_known'
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: '人物志' });
    expect(dialog).toHaveTextContent('已记录 1');
    const rosterEntry = within(dialog).getByRole('button', { name: /何志强/ });
    expect(rosterEntry).toBeInTheDocument();
    expect(rosterEntry.querySelector('.character-roster-line')).toHaveTextContent('何志强警署警长');
    expect(within(rosterEntry).getByText('警署警长')).toHaveAttribute('title', '警署警长');
    expect(rosterEntry).not.toHaveTextContent('审视但不敌视。');
    expect(rosterEntry).not.toHaveTextContent('往来 18');
    expect(within(dialog).queryByText('罗老板')).not.toBeInTheDocument();
    expect(dialog).toHaveTextContent('何志强 / Henry Ho');
    expect(dialog).toHaveTextContent('旺角警署报案室的老资格警署警长。');
    expect(dialog).toHaveTextContent('警队 / 警署警长（SSGT） / 军装巡逻 / 旺角警署');
    expect(dialog).toHaveTextContent('警署值班主管（Station Supervisor）');
    expect(dialog).not.toHaveTextContent('警队 / Station Sergeant / Uniform Branch');
    expect(dialog).toHaveTextContent('往来度 18');
    expect(dialog).toHaveTextContent('近期记忆');
    expect(dialog).not.toHaveTextContent('重要记忆');
    expect(dialog).toHaveTextContent('1988-09-12 21:15');
    expect(dialog).not.toHaveTextContent('重要度 75');
    expect(dialog).toHaveTextContent('他提醒过玩家别把投诉记录写漏。');
  });

  it('filters NPCs by search and present status', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_present = createActorDefaults({
      actorId: 'npc_present',
      name: '华叔',
      currentIdentity: 'civilian',
      publicIdentity: '茶档老板',
      profileSummary: '认识街坊的茶档老板。',
      presence: 'present',
      interactionScore: 5,
      importance: 45,
      visibility: 'player_known'
    });
    state.actors.npc_absent = createActorDefaults({
      actorId: 'npc_absent',
      name: '阿玲',
      currentIdentity: 'civilian',
      publicIdentity: '电影公司场务',
      profileSummary: '和片场有关的人。',
      presence: 'absent',
      interactionScore: 12,
      importance: 70,
      visibility: 'player_known'
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText('姓名 / 身份 / 地点 / 关系'), { target: { value: '电影' } });
    expect(screen.getByRole('button', { name: /阿玲/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /华叔/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('姓名 / 身份 / 地点 / 关系'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '仅在场' }));
    expect(screen.getByRole('button', { name: /华叔/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /阿玲/ })).not.toBeInTheDocument();
  });
  it('shows all local recent memories related to the selected NPC', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_informant = createActorDefaults({
      actorId: 'npc_informant',
      name: 'Tony Ng',
      currentIdentity: 'civilian',
      publicIdentity: 'street informant',
      profileSummary: 'A local informant with frequent contact.',
      presence: 'present',
      interactionScore: 35,
      importance: 70,
      visibility: 'player_known',
      recentInteractionMemory: 'Summary should not hide individual memories.'
    });
    state.memories.mem_recent_1 = createRuntimeMemory(
      'mem_recent_1',
      'Tony warned the player about a mahjong parlor debt.',
      'npc_informant',
      10
    );
    state.memories.mem_recent_2 = createRuntimeMemory(
      'mem_recent_2',
      'Tony asked the player not to mention his name at the tea stall.',
      'npc_informant',
      25
    );
    state.memories.mem_compressed = {
      ...createRuntimeMemory('mem_compressed', 'Cold compressed detail must stay hidden.', 'npc_informant', 5),
      compressedIntoMemoryId: 'mem_mid_summary'
    };
    state.memories.turn_related = {
      ...createRuntimeMemory('turn_related', 'A player turn summary mentioning Tony.', 'npc_informant', 6),
      kind: 'turn'
    };

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('近期记忆')).toBeInTheDocument();
    expect(screen.queryByText('重要记忆')).not.toBeInTheDocument();
    expect(screen.getByText('1988-09-12 21:25')).toBeInTheDocument();
    expect(screen.getByText('1988-09-12 21:10')).toBeInTheDocument();
    expect(screen.queryByText(/重要度/)).not.toBeInTheDocument();
    expect(screen.getByText('Tony warned the player about a mahjong parlor debt.')).toBeInTheDocument();
    expect(screen.getByText('Tony asked the player not to mention his name at the tea stall.')).toBeInTheDocument();
    expect(screen.queryByText('Summary should not hide individual memories.')).not.toBeInTheDocument();
    expect(screen.queryByText('Cold compressed detail must stay hidden.')).not.toBeInTheDocument();
    expect(screen.queryByText('A player turn summary mentioning Tony.')).not.toBeInTheDocument();
  });

  it('does not expose internal runtime memory tier labels in the NPC archive', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_informant = createActorDefaults({
      actorId: 'npc_informant',
      name: 'Tony Ng',
      currentIdentity: 'civilian',
      publicIdentity: 'street informant',
      profileSummary: 'A local informant with frequent contact.',
      presence: 'present',
      interactionScore: 35,
      importance: 70,
      visibility: 'player_known'
    });
    state.memories.mem_recent = {
      ...createRuntimeMemory('mem_recent', 'Tony gave a raw recent warning.', 'npc_informant', 25),
      tier: 'short_term'
    };
    state.memories.mem_mid = {
      ...createRuntimeMemory('mem_mid', 'Tony has become a recurring tea-stall source.', 'npc_informant', 30),
      tier: 'mid_term'
    };
    state.memories.mem_long = {
      ...createRuntimeMemory('mem_long', 'Tony is a long-term source around complaint ledgers.', 'npc_informant', 35),
      tier: 'long_term'
    };

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: /人物志/ });

    expect(screen.getByText('长期记忆')).toBeInTheDocument();
    expect(screen.getByText('阶段记忆')).toBeInTheDocument();
    expect(screen.getByText('近期记忆')).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('近期原始');
    expect(dialog).not.toHaveTextContent('中期摘要');
    expect(dialog).not.toHaveTextContent('已压缩');
  });

  it('shows NPC aliases, call names, traits, and trait progress in the archive detail', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_big_fai = createActorDefaults({
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
      profileSummary: '有点虚张声势，但知道夜场消息。',
      positionSummary: '和联胜外围跑腿。',
      presence: 'present',
      interactionScore: 12,
      importance: 70,
      visibility: 'player_known',
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
      ]
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('别名/称呼')).toBeInTheDocument();
    expect(screen.getByText('大辉 / Big Fai / 辉哥')).toBeInTheDocument();
    expect(screen.getByText('特质')).toBeInTheDocument();
    expect(screen.getByText('街面跑腿')).toBeInTheDocument();
    expect(screen.getByText('夜场、社团边缘和街面消息判断更稳定。')).toBeInTheDocument();
    expect(screen.getByText('怕差人 35/100')).toBeInTheDocument();
    expect(screen.getByText('被玩家盘问后开始顾忌警察。')).toBeInTheDocument();
  });

  it('renders the female profile as appearance and relationship-drive dossier blocks', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    state.actors.npc_adult_hostess = createActorDefaults({
      actorId: 'npc_adult_hostess',
      name: '何丽莲',
      englishName: 'Lily Ho',
      gender: 'female',
      birthDate: '1962-02-18',
      computedAge: 26,
      currentIdentity: 'civilian',
      publicIdentity: '夜总会公关',
      profileSummary: '熟悉夜场和娱乐圈消息。',
      presence: 'present',
      interactionScore: 20,
      importance: 75,
      visibility: 'player_known',
      femaleProfile: {
        addressToPlayer: '王Sir',
        birthday: '2月18日',
        appearanceDescription: '妆容精致，神情克制，习惯在说话前先观察对方反应。',
        bodyDescription: '身形匀称，动作谨慎。',
        clothingStyle: '夜场工作服偏精致，但外套遮掩明显。',
        personalityCore: '现实、戒备，懂得在危险关系中留后路。',
        affectionProgressionCondition: '玩家持续尊重她的安全边界并兑现承诺。',
        relationshipProgressionCondition: '玩家能帮助她摆脱夜场麻烦而不把她推出去挡风险。',
        relationshipNetworkEdges: [
          {
            targetName: '金粉世家',
            relation: '工作场所',
            note: '知道经理和看场之间的利益关系。'
          }
        ],
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: false,
          profileStatus: 'ready',
          womb: {
            status: '待验孕',
            cervixStatus: '紧闭',
            records: [],
            pregnancy: {
              pregnancyId: 'preg_lily_19880912',
              status: 'pending_check',
              registeredAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
              checkDueAt: { year: 1988, month: 10, day: 5, hour: 21, minute: 15 },
              confirmationDueAt: { year: 1988, month: 10, day: 27, hour: 21, minute: 15 },
              deliveryWindowAt: { year: 1989, month: 5, day: 30, hour: 21, minute: 15 },
              dueAt: { year: 1989, month: 6, day: 9, hour: 21, minute: 15 },
              deliveryDeadlineAt: { year: 1989, month: 6, day: 19, hour: 21, minute: 15 },
              chancePercent: 20,
              rollPercent: 9.75,
              riskTypes: ['unprotected'],
              riskSummaries: ['已登记风险。'],
              paternityCandidates: [
                { actorId: 'player', name: '王Sir', visibility: 'player_known' },
                { actorId: 'npc_hidden', name: '隐藏候选人', visibility: 'hidden' }
              ]
            },
            pendingPregnancyChecks: [
              {
                pregnancyId: 'preg_lily_19880913_private',
                status: 'pending_check',
                registeredAt: { year: 1988, month: 9, day: 13, hour: 21, minute: 15 },
                checkDueAt: { year: 1988, month: 10, day: 6, hour: 21, minute: 15 },
                confirmationDueAt: { year: 1988, month: 10, day: 28, hour: 21, minute: 15 },
                deliveryWindowAt: { year: 1989, month: 5, day: 31, hour: 21, minute: 15 },
                dueAt: { year: 1989, month: 6, day: 10, hour: 21, minute: 15 },
                deliveryDeadlineAt: { year: 1989, month: 6, day: 20, hour: 21, minute: 15 },
                chancePercent: 20,
                rollPercent: 65,
                riskTypes: ['unprotected'],
                riskSummaries: ['第二天再次登记风险。'],
                paternityCandidates: [{ actorId: 'player', name: '王Sir', visibility: 'player_known' }]
              }
            ]
          },
          partProfiles: {
            胸部: { description: '乳房饱满柔软，乳晕色泽自然，乳头敏感。' },
            小穴: { description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
            屁穴: { description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
          }
        }
      }
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('点击展开')).toBeInTheDocument();
    expect(screen.getByText('外貌档案')).not.toBeVisible();
    expect(screen.queryByText('成人私密档案')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('点击展开'));

    expect(screen.getByText('外貌档案')).toBeVisible();
    expect(screen.getByText('妆容精致，神情克制，习惯在说话前先观察对方反应。')).toBeVisible();
    expect(screen.getByText('生日')).toBeVisible();
    expect(screen.getByText('2月18日')).toBeVisible();
    expect(screen.getByText('称呼')).toBeVisible();
    expect(screen.getAllByText('王Sir').length).toBeGreaterThan(0);
    expect(screen.getByText('关系驱动')).toBeVisible();
    expect(screen.getByText('核心性格特征')).toBeVisible();
    expect(screen.getByText('好感突破条件')).toBeVisible();
    expect(screen.getByText('关系突破条件')).toBeVisible();
    expect(screen.getByText('重要女性关系网')).toBeVisible();
    expect(screen.getByText('金粉世家')).toBeVisible();
    expect(screen.getByText(/工作场所/)).toBeVisible();
    expect(screen.queryByText('关系备注')).not.toBeInTheDocument();
    expect(screen.queryByText('公开亲密度')).not.toBeInTheDocument();
    expect(screen.queryByText('情感边界')).not.toBeInTheDocument();
  });

  it('keeps adult private female profile present but behind nested disclosure', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    state.actors.npc_adult_hostess = createActorDefaults({
      actorId: 'npc_adult_hostess',
      name: '何丽莲',
      englishName: 'Lily Ho',
      gender: 'female',
      birthDate: '1962-02-18',
      computedAge: 26,
      currentIdentity: 'civilian',
      publicIdentity: '夜总会公关',
      profileSummary: '熟悉夜场和娱乐圈消息。',
      presence: 'present',
      interactionScore: 20,
      importance: 75,
      visibility: 'player_known',
      femaleProfile: {
        addressToPlayer: '王Sir',
        appearanceDescription: '妆容精致，神情克制。',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: false,
          profileStatus: 'ready',
          womb: {
            status: '待验孕',
            cervixStatus: '紧闭',
            records: [
              {
                date: '1988-09-12',
                description: '同一风险窗口涉及多名可能父亲。',
                pregnancyCheckDate: '1988-10-05',
                pregnancyId: 'preg_lily_previous_negative',
                pregnancyCheckResult: 'negative',
                paternityCandidates: [
                  { actorId: 'player', name: '王Sir', visibility: 'player_known' },
                  { actorId: 'npc_known_other', name: '陈先生', visibility: 'player_known' },
                  { actorId: 'npc_hidden', name: '隐藏候选人', visibility: 'hidden' }
                ]
              }
            ],
            pregnancy: {
              pregnancyId: 'preg_lily_19880912_private',
              status: 'pending_check',
              registeredAt: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
              checkDueAt: { year: 1988, month: 10, day: 5, hour: 21, minute: 15 },
              confirmationDueAt: { year: 1988, month: 10, day: 27, hour: 21, minute: 15 },
              deliveryWindowAt: { year: 1989, month: 5, day: 30, hour: 21, minute: 15 },
              dueAt: { year: 1989, month: 6, day: 9, hour: 21, minute: 15 },
              deliveryDeadlineAt: { year: 1989, month: 6, day: 19, hour: 21, minute: 15 },
              chancePercent: 20,
              rollPercent: 9.75,
              riskTypes: ['unprotected'],
              riskSummaries: ['已登记风险。'],
              paternityCandidates: [
                { actorId: 'player', name: '王Sir', visibility: 'player_known' },
                { actorId: 'npc_known_other', name: '陈先生', visibility: 'player_known' },
                { actorId: 'npc_hidden', name: '隐藏候选人', visibility: 'hidden' }
              ]
            },
            pendingPregnancyChecks: [
              {
                pregnancyId: 'preg_lily_19880913_private_followup',
                status: 'pending_check',
                registeredAt: { year: 1988, month: 9, day: 13, hour: 21, minute: 15 },
                checkDueAt: { year: 1988, month: 10, day: 6, hour: 21, minute: 15 },
                confirmationDueAt: { year: 1988, month: 10, day: 28, hour: 21, minute: 15 },
                deliveryWindowAt: { year: 1989, month: 5, day: 31, hour: 21, minute: 15 },
                dueAt: { year: 1989, month: 6, day: 10, hour: 21, minute: 15 },
                deliveryDeadlineAt: { year: 1989, month: 6, day: 20, hour: 21, minute: 15 },
                chancePercent: 20,
                rollPercent: 65,
                riskTypes: ['unprotected'],
                riskSummaries: ['第二天再次登记风险。'],
                paternityCandidates: [
                  { actorId: 'npc_queued_candidate', name: '李先生', visibility: 'player_known' }
                ]
              }
            ]
          },
          partProfiles: {
            胸部: {
              description: '乳房饱满柔软，乳晕色泽自然，乳头敏感。',
              imagePromptAnchor: 'jade-like skin texture, delicate close-up'
            },
            小穴: { description: '阴唇紧致细嫩，穴口收敛，阴蒂敏感。' },
            屁穴: { description: '臀缝紧窄，屁穴小而紧闭，周围皱褶细密。' }
          },
          fetishNotes: '偏好强势但有分寸的挑逗、贴身掌控和身体赞美；在私密空间里容易被羞耻感与被占有感激起欲望。',
          sensitivePoints: '敏感点集中在颈侧、乳尖、腰侧和大腿内侧。'
        }
      }
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('点击展开'));

    expect(screen.getByText('香闺秘档')).toBeVisible();
    expect(screen.getByText('乳房饱满柔软，乳晕色泽自然，乳头敏感。')).not.toBeVisible();

    fireEvent.click(screen.getByText('香闺秘档'));

    expect(screen.queryByText('女性扩展档案状态')).not.toBeInTheDocument();
    expect(screen.queryByText('ready')).not.toBeInTheDocument();
    expect(screen.getByText('胸部描述')).toBeVisible();
    expect(screen.getByText('小穴描述')).toBeVisible();
    expect(screen.getByText('屁穴描述')).toBeVisible();
    expect(screen.getByText('乳房饱满柔软，乳晕色泽自然，乳头敏感。')).toBeVisible();
    expect(screen.getAllByText('生图锚点')).toHaveLength(1);
    expect(screen.getByText('jade-like skin texture, delicate close-up')).toBeVisible();
    expect(screen.getByText('阴唇紧致细嫩，穴口收敛，阴蒂敏感。')).toBeVisible();
    expect(screen.getByText('臀缝紧窄，屁穴小而紧闭，周围皱褶细密。')).toBeVisible();
    expect(screen.getByText('偏好强势但有分寸的挑逗、贴身掌控和身体赞美；在私密空间里容易被羞耻感与被占有感激起欲望。')).toBeVisible();
    expect(screen.getByText('敏感点集中在颈侧、乳尖、腰侧和大腿内侧。')).toBeVisible();
    expect(screen.queryByText(/锚点已建立/)).not.toBeInTheDocument();
    expect(screen.queryByText(/视觉锚点/)).not.toBeInTheDocument();
    expect(screen.getByText('子宫档案')).toBeVisible();
    expect(screen.getByText('宫口状态')).toBeVisible();
    expect(screen.getAllByText('待验孕').length).toBeGreaterThan(0);
    expect(screen.getByText('1988年10月5日 21:15')).toBeVisible();
    expect(screen.getByText('后续待判定')).toBeVisible();
    expect(screen.getByText(/1 项：1988年10月6日 21:15（父系候选：李先生）/)).toBeVisible();
    expect(screen.getAllByText('王Sir').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/王Sir、陈先生/).length).toBeGreaterThan(0);
    expect(screen.getByText('父系记录')).toBeVisible();
    expect(screen.getByText(/1988-09-12：王Sir、陈先生（验孕阴性）/)).toBeVisible();
    expect(screen.queryByText('隐藏候选人')).not.toBeInTheDocument();
    expect(screen.getByText(/同日风险合并，跨日风险分别排期/)).toBeVisible();
    expect(screen.queryByText('9.75')).not.toBeInTheDocument();
    expect(screen.getByText('同一风险窗口涉及多名可能父亲。')).toBeVisible();
    expect(screen.queryByText('NO RECORDS')).not.toBeInTheDocument();
    expect(screen.queryByText('摘要')).not.toBeInTheDocument();
    expect(screen.queryByText('偏好备注')).not.toBeInTheDocument();
    expect(screen.queryByText('边界备注')).not.toBeInTheDocument();
    expect(screen.queryByText('关系风险')).not.toBeInTheDocument();
  });

  it('hides adult private female profile sections for underage female NPCs', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    state.actors.npc_teen_witness = createActorDefaults({
      actorId: 'npc_teen_witness',
      name: '林小敏',
      englishName: 'Mandy Lam',
      gender: 'female',
      birthDate: '1973-01-01',
      computedAge: 15,
      currentIdentity: 'civilian',
      publicIdentity: '学生目击者',
      profileSummary: '街角争执的目击者。',
      presence: 'present',
      interactionScore: 5,
      importance: 65,
      visibility: 'player_known',
      femaleProfile: {
        personalityCore: '未成年目击者，只显示普通人物档案。',
        adultPrivateProfile: {
          enabled: true,
          ageConfirmedAdult: true,
          summary: '不应显示的成人私密档案。'
        }
      }
    });

    render(<CharacterArchiveModal state={state} onClose={vi.fn()} />);

    expect(screen.getByText('点击展开')).toBeInTheDocument();
    expect(screen.getByText('关系驱动')).not.toBeVisible();

    fireEvent.click(screen.getByText('点击展开'));

    expect(screen.getByText('未成年目击者，只显示普通人物档案。')).toBeVisible();
    expect(screen.queryByText('香闺秘档')).not.toBeInTheDocument();
    expect(screen.queryByText('不应显示的成人私密档案。')).not.toBeInTheDocument();
  });

  it('requires confirmation before deleting an NPC and returns the updated runtime state', () => {
    const state = createInitialRuntimeState();
    state.actors.npc_delete = createActorDefaults({
      actorId: 'npc_delete',
      name: '待删除人物',
      currentIdentity: 'civilian',
      publicIdentity: '普通市民',
      presence: 'present',
      visibility: 'player_known',
      importance: 70,
      interactionScore: 10
    });
    const onStateChange = vi.fn();

    render(
      <CharacterArchiveModal state={state} onClose={vi.fn()} onStateChange={onStateChange} />
    );

    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    expect(screen.getByRole('alert')).toHaveTextContent('确定删除“待删除人物”');

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onStateChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '删除人物' }));
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0][0].actors.npc_delete).toBeUndefined();
  });

  it('edits a current-save actor through a safe form without exposing structural fields', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_edit = createActorDefaults({
      actorId: 'npc_edit',
      name: '错误姓名',
      aliases: ['旧称呼'],
      currentIdentity: 'civilian',
      publicIdentity: '公司职员',
      positionSummary: '普通职员',
      profileSummary: '需要玩家修正。',
      personality: '谨慎',
      presence: 'present',
      visibility: 'player_known',
      importance: 70,
      interactionScore: 10
    });
    const onUpdateActorProfile = vi.fn(async () => undefined);

    render(
      <CharacterArchiveModal
        state={state}
        onClose={vi.fn()}
        onUpdateActorProfile={onUpdateActorProfile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '修改资料' }));
    const form = screen.getByRole('form', { name: '修改人物资料' });
    expect(within(form).getByText(/不会改动人物ID、身份结构、组织、历史正文、记忆、案件/)).toBeVisible();
    expect(within(form).getByText(/结构身份：普通市民/)).toBeVisible();
    expect(within(form).queryByLabelText('人物ID')).not.toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('姓名 *'), { target: { value: '正确姓名' } });
    fireEvent.change(within(form).getByLabelText('别名（每行一项）'), { target: { value: '新称呼\n阿正' } });
    fireEvent.click(within(form).getByRole('button', { name: '保存修改' }));

    await waitFor(() => expect(onUpdateActorProfile).toHaveBeenCalledTimes(1));
    expect(onUpdateActorProfile).toHaveBeenCalledWith(
      'npc_edit',
      expect.objectContaining({ name: '正确姓名', aliases: ['新称呼', '阿正'] })
    );
    expect(screen.queryByRole('form', { name: '修改人物资料' })).not.toBeInTheDocument();
  });

  it('keeps the editor open and shows a player-facing error when persistence fails', async () => {
    const state = createInitialRuntimeState();
    state.actors.npc_edit_failure = createActorDefaults({
      actorId: 'npc_edit_failure',
      name: '待修人物',
      currentIdentity: 'civilian',
      presence: 'present',
      visibility: 'player_known',
      importance: 70,
      interactionScore: 10
    });
    const onUpdateActorProfile = vi.fn(async () => {
      throw new Error('自动保存失败，人物资料没有被修改。请稍后重试。');
    });

    render(
      <CharacterArchiveModal
        state={state}
        onClose={vi.fn()}
        onUpdateActorProfile={onUpdateActorProfile}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '修改资料' }));
    fireEvent.change(screen.getByLabelText('姓名 *'), { target: { value: '新名字' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('自动保存失败');
    expect(screen.getByRole('form', { name: '修改人物资料' })).toBeInTheDocument();
  });
});

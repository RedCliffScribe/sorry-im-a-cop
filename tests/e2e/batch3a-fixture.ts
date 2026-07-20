import { createActorDefaults } from '../../src/domain/runtime/actorFactory';
import { createBatch2bRuntimeState } from './batch2b-fixture';

export function createBatch3aRuntimeState() {
  const state = createBatch2bRuntimeState();
  const placeId = state.location.currentPlaceId;

  state.actors.npc_station_sergeant = createActorDefaults({
    actorId: 'npc_station_sergeant',
    name: '麦志强',
    englishName: 'Mak Chi-keung',
    gender: 'male',
    computedAge: 46,
    currentIdentity: 'police',
    publicIdentity: '旺角警署值日警长',
    positionSummary: '玩家早更巡逻的直属值日警长',
    currentPlaceId: placeId,
    presence: 'nearby',
    profileSummary: '办事老练，重视程序，也懂得给肯做事的下属留余地。',
    appearance: '鬓角微白，目光锐利，站姿端正。',
    clothing: '皇家香港警察夏季军装制服，警长肩章。',
    equipment: ['警棍', '对讲机', '值班簿'],
    personality: '严谨、务实、护短但不纵容。',
    speechStyle: '短句，带长官威压，私下偶尔说一句冷笑话。',
    motivation: '维持辖区秩序，也让手下少犯程序错误。',
    longTermGoal: '带出一班可靠的巡逻警员。',
    values: '程序、责任、同僚信誉。',
    relationshipSummary: '愿意在规矩范围内照应玩家，但会观察玩家是否可靠。',
    attitudeTowardPlayer: '谨慎认可，仍在考察。',
    interactionScore: 62,
    trustTendency: '只相信持续兑现的行动。',
    entanglementSummary: '他的评价会影响玩家在警署内部的机会。',
    longTermMemorySummary: '记得玩家在复杂街面冲突中愿意承担责任。',
    recentInteractionMemory: '早更前提醒玩家先处理例行巡逻，不要主动把旧案揽回身上。',
    statusSummary: '正在警署值日。',
    bodyConditionSummary: '精神良好。',
    visibility: 'player_known',
    importance: 86,
    roleProfiles: {
      police: {
        status: 'active',
        stationOrPost: 'Mong Kok Police Station',
        department: 'Uniform Branch',
        rank: 'Sergeant',
        postRole: 'Patrol Sergeant',
        supervisorActorIds: [],
        peerActorIds: [],
        authoritySummary: '负责早更巡逻调度与现场决定。',
        accessSummary: '掌握当日更表、报案记录和辖区巡逻安排。',
        dutySummary: '安排军装巡逻并审核交更记录。',
        institutionalReputation: '严谨可靠，愿意替肯做事的下属说话。',
        disciplinePressureSummary: '不容许越权和文书遗漏。'
      }
    }
  });

  state.actors.npc_reporter = createActorDefaults({
    actorId: 'npc_reporter',
    name: '何家荣',
    englishName: 'Gary Ho',
    gender: 'male',
    computedAge: 31,
    currentIdentity: 'civilian',
    publicIdentity: '报馆记者',
    positionSummary: '熟悉九龙街坊新闻的跑线记者',
    currentPlaceId: placeId,
    presence: 'absent',
    profileSummary: '消息灵通，懂得分辨闲话和真正能见报的线索。',
    appearance: '戴黑框眼镜，常把记事簿塞在外套口袋。',
    clothing: '浅色衬衫、旧西装外套。',
    equipment: ['记事簿', '录音机'],
    relationshipSummary: '与玩家保持互相试探的消息往来。',
    attitudeTowardPlayer: '欣赏玩家讲信用，但不会无条件保密。',
    interactionScore: 48,
    trustTendency: '交易式信任。',
    entanglementSummary: '报馆消息可能帮助玩家，也可能扩大舆论风险。',
    longTermMemorySummary: '记得玩家曾经及时澄清一则失实街坊传闻。',
    recentInteractionMemory: '托报摊老板转告，有记者在追问旺角夜间执法消息。',
    visibility: 'player_known',
    importance: 68
  });

  state.actors.npc_lily = createActorDefaults({
    actorId: 'npc_lily',
    name: '何丽莲',
    englishName: 'Lily Ho',
    gender: 'female',
    birthDate: '1962-02-18',
    computedAge: 22,
    currentIdentity: 'civilian',
    publicIdentity: '夜总会公关',
    positionSummary: '熟悉尖沙咀夜场消息的私人朋友',
    currentPlaceId: placeId,
    presence: 'absent',
    profileSummary: '现实、敏锐，知道什么时候应该说话，什么时候应该离开。',
    appearance: '长发及肩，妆容克制，观察别人时很少移开视线。',
    clothing: '剪裁利落的深色套裙和薄外套。',
    relationshipSummary: '与玩家已经建立稳定的私人信任，但仍担心警察身份带来的麻烦。',
    attitudeTowardPlayer: '亲近、信任，同时保留自己的退路。',
    interactionScore: 79,
    trustTendency: '较高，但在公开场合保持谨慎。',
    entanglementSummary: '她的夜场关系会把私人生活与街面消息连接起来。',
    longTermMemorySummary: '记得玩家在她遇到麻烦时没有把她推出去挡风险。',
    recentInteractionMemory: '约好下次休班后在尖沙咀见面。',
    visibility: 'player_known',
    importance: 82,
    femaleProfile: {
      addressToPlayer: '星仔',
      birthday: '2月18日',
      appearanceDescription: '妆容克制，神情敏锐，习惯先观察周围再开口。',
      bodyDescription: '身形匀称，动作轻快。',
      clothingStyle: '工作时穿剪裁利落的套裙，离场后会换低调外套。',
      personalityCore: '现实、独立，对信任和安全边界十分敏感。',
      affectionProgressionCondition: '玩家继续尊重她的选择并兑现私人承诺。',
      relationshipProgressionCondition: '双方能在警察职责与私人生活之间建立稳定安排。',
      relationshipNetworkEdges: [
        { targetName: '金声夜总会', relation: '工作场所', note: '认识经理、舞女和常客之间的关系。' }
      ]
    }
  });

  state.relationshipThreads.thread_reporter = {
    threadId: 'thread_reporter',
    kind: 'network',
    title: '报馆消息线',
    summary: '何家荣能接触九龙街坊新闻与报馆追题方向，双方保持互相试探的消息交换。',
    relatedActorIds: ['npc_reporter'],
    primaryActorId: 'npc_reporter',
    relationshipRole: '媒体联系人',
    status: 'active',
    trustSummary: '相信玩家会守住已答应的消息边界。',
    conflictSummary: '记者职业要求可能与警方保密责任冲突。',
    promiseSummary: '重大误报出现前会先设法通知玩家。',
    riskSummary: '来往过密会让同僚怀疑玩家向媒体放料。',
    currentPull: '近期有人向报馆兜售旺角夜间执法的夸张说法。',
    nextNaturalBeatHint: '可通过报摊电话或茶餐厅短暂会面。',
    lastHeartbeatAt: state.time,
    milestones: [
      {
        milestoneId: 'milestone_reporter_1',
        gameTime: state.time,
        summary: '何家荣曾协助确认一则街坊传闻尚未排版见报。',
        importance: 52,
        relatedActorIds: ['npc_reporter'],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 66,
    createdAt: state.time,
    updatedAt: state.time
  };

  state.relationshipThreads.thread_lily = {
    threadId: 'thread_lily',
    kind: 'fate',
    title: '休班后的约定',
    summary: '何丽莲与玩家已经建立稳定私人联系，关系会自然影响休班时间与生活选择。',
    relatedActorIds: ['npc_lily'],
    primaryActorId: 'npc_lily',
    relationshipRole: '女友',
    status: 'active',
    trustSummary: '她相信玩家会保护两人的私人边界。',
    intimacySummary: '关系亲近，已经形成稳定陪伴。',
    conflictSummary: '临时加班和危险工作会打乱约定。',
    promiseSummary: '下次休班后一起吃晚饭。',
    riskSummary: '警察身份和夜场工作都可能带来外部议论。',
    currentPull: '她在等玩家确认下一次休班时间。',
    nextNaturalBeatHint: '休班后可自然见面，不必制造额外危机。',
    lastHeartbeatAt: state.time,
    milestones: [
      {
        milestoneId: 'milestone_lily_1',
        gameTime: state.time,
        summary: '两人谈妥工作繁忙时也要提前通知对方。',
        importance: 72,
        relatedActorIds: ['npc_lily'],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 83,
    createdAt: state.time,
    updatedAt: state.time
  };

  state.player.reputation = {
    ...state.player.reputation,
    notoriety: 286,
    overallReputation: 18,
    summary: '旺角街坊和警署同僚开始知道玩家做事硬朗、愿意承担责任，但社团圈对他保持戒备。',
    circles: {
      ...state.player.reputation.circles,
      police: { visibility: 260, standing: 32, summary: '同僚认为玩家肯做事，但偶尔会冒险压线。' },
      neighborhoodMedia: { visibility: 340, standing: 25, summary: '街坊知道玩家愿意处理麻烦，报馆也开始听过他的名字。' },
      entertainment: { visibility: 145, standing: 12, summary: '少数夜场和片场人士知道他与红姑等人有往来。' },
      underworld: { visibility: 220, standing: -35, summary: '街面社团知道他不好应付，对其保持明显戒备。' },
      business: { visibility: 90, standing: 8, summary: '少数商户记得他处理纠纷时没有偏袒。' },
      political: { visibility: 20, standing: 0, summary: '政界暂时没有形成明确评价。' }
    },
    logs: Array.from({ length: 18 }, (_, index) => ({
      logId: `batch3a_reputation_${index + 1}`,
      gameTime: { ...state.time, minute: Math.max(0, state.time.minute - index) },
      kind: 'circle' as const,
      circle: index % 2 === 0 ? ('police' as const) : ('neighborhoodMedia' as const),
      visibilityDelta: index % 3 === 0 ? 3 : 1,
      standingDelta: index % 4 === 0 ? 2 : 1,
      summary: index === 17 ? '街坊第一次记住玩家的警员编号。' : `第 ${index + 1} 次公开评价变化。`,
      reason: '来自当值处事、街坊口耳相传或报纸报道。'
    }))
  };

  return state;
}

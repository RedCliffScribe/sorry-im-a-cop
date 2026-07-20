import { createInitialRuntimeState } from '../../src/domain/runtime/initialState';
import type { CaseFile, GameTime, MemoryItem, NewsIssue, RuntimeState } from '../../src/domain/runtime/types';

const time: GameTime = { year: 1984, month: 12, day: 29, hour: 8, minute: 30 };

function caseFile(caseId: string, overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    caseId,
    title: caseId,
    caseType: 'assault',
    status: 'investigating',
    playerRole: 'assist',
    leadActorName: '麦志强警长',
    summary: '案件仍在调查，现有证据和证词需要按程序整理。',
    currentFocus: '核对现场证词与物证之间是否存在矛盾。',
    playerVisibleProgress: '玩家已经完成现场登记，并把初步材料交给主办人员。',
    internalProgressSummary: '',
    relatedActorIds: [],
    relatedPlaceIds: [],
    relatedOrganizationIds: [],
    evidenceIds: [],
    activityLog: [],
    unreadActivityCount: 0,
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function newsIssue(
  id: string,
  outletName: string,
  headline: string,
  overrides: Partial<NewsIssue> = {}
): NewsIssue {
  return {
    id,
    date: time,
    outletName,
    headline,
    summary: `${headline}，本港各界继续关注后续发展。`,
    articles: [],
    read: false,
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

function addMemory(
  state: RuntimeState,
  memory: Pick<MemoryItem, 'memoryId' | 'text'> & Partial<MemoryItem>
) {
  state.memories[memory.memoryId] = {
    memoryId: memory.memoryId,
    text: memory.text,
    kind: memory.kind ?? 'turn',
    tier: memory.tier,
    relatedActorIds: memory.relatedActorIds ?? [],
    relatedCaseIds: memory.relatedCaseIds ?? [],
    relatedPlaceIds: memory.relatedPlaceIds ?? [],
    relatedOrganizationIds: memory.relatedOrganizationIds ?? [],
    relatedTurnId: memory.relatedTurnId,
    gameTime: memory.gameTime ?? time,
    importance: memory.importance ?? 60,
    visibility: memory.visibility ?? 'player_known',
    certainty: memory.certainty ?? 'fact',
    embeddingText: memory.embeddingText ?? memory.text,
    compressedIntoMemoryId: memory.compressedIntoMemoryId,
    compressedAtTurnId: memory.compressedAtTurnId,
    periodStart: memory.periodStart,
    periodEnd: memory.periodEnd
  };
}

export function createBatch2aRuntimeState(): RuntimeState {
  const state = createInitialRuntimeState({
    playerName: '周星星',
    englishName: 'Stephen Chow',
    policeNumber: '4382'
  });
  state.time = time;
  const placeId = state.location.currentPlaceId;

  state.dynamicEvents.currentMatters = {
    matter_patrol: {
      id: 'matter_patrol',
      title: '通菜街巡逻交更',
      summary: '早更巡逻已经开始，街市与后巷暂时平静，但仍有几宗街坊投诉等待核实。',
      status: 'active',
      priority: 70,
      visibility: 'known',
      source: 'police_dispatch',
      matterKind: 'police_work',
      pressureLevel: 1,
      responseWindow: 'today',
      currentHook: '值日警长要求先完成例行巡逻，再回报需要跟进的投诉。',
      consequenceHint: '如有明确违法或伤害事实，再按程序转入正式案件。',
      dueAt: { ...time, hour: 12, minute: 0 },
      relatedActorIds: ['player'],
      relatedPlaceIds: [placeId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: time,
      updatedAt: time
    },
    matter_archived: {
      id: 'matter_archived',
      title: '报案室接更手续（已完成）',
      summary: '玩家已经完成签到并领取巡逻必需文件。',
      status: 'resolved',
      priority: 20,
      visibility: 'known',
      source: 'police_dispatch',
      matterKind: 'police_work',
      pressureLevel: 0,
      responseWindow: 'open',
      currentHook: '接更手续已经完成。',
      relatedActorIds: ['player'],
      relatedPlaceIds: [placeId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: time,
      updatedAt: time
    }
  };
  state.dynamicEvents.signals = {
    signal_market: {
      id: 'signal_market',
      title: '街市摊贩议论近期巡查',
      summary: '几名摊贩说食环署近期会加强巡查，但具体时间尚未确认。',
      signalType: 'street',
      reliability: 'medium',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [],
      relatedPlaceIds: [placeId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: time,
      updatedAt: time
    }
  };

  state.cases = {
    case_player: caseFile('case_player', {
      title: '花园街持械勒索案',
      playerRole: 'assist',
      unreadActivityCount: 2,
      evidenceIds: ['evidence_bottle'],
      activityLog: [
        {
          activityId: 'activity_1',
          kind: 'instruction',
          gameTime: time,
          summary: '主办人员要求补充两名现场证人的联系方式。',
          relatedEvidenceIds: ['evidence_bottle'],
          relatedActorIds: [],
          relatedPlaceIds: [placeId],
          visibleToPlayer: true
        }
      ]
    }),
    case_related: caseFile('case_related', {
      title: '通菜街后巷走私机件案',
      playerRole: 'aware',
      leadActorName: '重案组',
      playerVisibleProgress: '案卷已经移交重案组，玩家只保留知情身份。'
    }),
    case_archived: caseFile('case_archived', {
      title: '旧楼噪音投诉记录',
      status: 'archived',
      playerRole: 'aware',
      summary: '投诉双方已经接受调解，记录按程序归档。'
    })
  };
  state.caseEvidence.evidence_bottle = {
    evidenceId: 'evidence_bottle',
    caseId: 'case_player',
    title: '破裂酒瓶与现场照片',
    evidenceType: 'physical',
    sourceSummary: '巡逻人员现场检获',
    summary: '酒瓶碎片已经装袋，现场位置和血迹分布均有照片记录。',
    relatedActorIds: [],
    relatedPlaceIds: [placeId],
    visibility: 'player_known',
    createdAt: time,
    updatedAt: time
  };

  state.dynamicEvents.newsIssues = {
    news_latest: newsIssue('news_latest', '大公报', '本港节日市面畅旺', {
      articles: [
        {
          id: 'article_1',
          section: 'local',
          headline: '旺角街市清晨人流增加',
          body: '年末临近，旺角街市清晨开始出现采购人潮，警方提醒商户看管财物并保持通道畅通。',
          playerRelated: false,
          relatedActorIds: [],
          relatedPlaceIds: [placeId],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        },
        {
          id: 'article_2',
          section: 'crime',
          headline: '警方继续调查后巷机件来源',
          body: '警方证实一批来源可疑的汽车机件已经交由专责人员调查，暂时没有公布被捕人数。',
          playerRelated: true,
          relatedActorIds: ['player'],
          relatedPlaceIds: [placeId],
          relatedCaseIds: ['case_related'],
          relatedOrganizationIds: []
        },
        {
          id: 'article_3',
          section: 'business',
          headline: '零售市道维持平稳',
          body: '多间百货公司表示节日前夕服装和家庭用品销量稳定，商户对来年市道保持审慎。',
          playerRelated: false,
          relatedActorIds: [],
          relatedPlaceIds: [],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ]
    }),
    news_important: newsIssue('news_important', '明报', '九龙旧区重建再受关注', {
      important: true,
      date: { ...time, day: 24 }
    }),
    news_archived: newsIssue('news_archived', '成报', '上周街坊消息汇编', {
      archivedAt: { ...time, day: 27 },
      date: { ...time, day: 22 },
      read: true
    })
  };

  state.memories = {};
  addMemory(state, {
    memoryId: 'memory_short_1',
    text: '你已经把小说初稿寄给报社，并在信封上留下了家中地址。',
    tier: 'short_term',
    kind: 'turn',
    relatedPlaceIds: [placeId]
  });
  addMemory(state, {
    memoryId: 'memory_short_2',
    text: '早更巡逻前，麦志强警长提醒你留意街市附近的扒窃投诉。',
    tier: 'short_term',
    kind: 'turn',
    relatedActorIds: ['player'],
    relatedPlaceIds: [placeId]
  });
  addMemory(state, {
    memoryId: 'memory_mid_1',
    text: '过去几天里，你逐步熟悉了旺角警署的值班程序，也建立了几个可靠的街坊联系。',
    tier: 'mid_term',
    kind: 'turn',
    periodStart: { ...time, day: 24 },
    periodEnd: { ...time, day: 28 }
  });
  addMemory(state, {
    memoryId: 'memory_long_1',
    text: '你希望在警队职责与个人生活之间找到自己的位置，不愿被环境推着走。',
    tier: 'long_term',
    kind: 'player',
    periodStart: { year: 1984, month: 1, day: 1, hour: 0, minute: 0 },
    periodEnd: { ...time, day: 23 }
  });

  return state;
}

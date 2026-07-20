import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../../domain/runtime/initialState';
import { createNarrativeDiagnostic } from './createNarrativeDiagnostic';

describe('createNarrativeDiagnostic', () => {
  it('includes the latest raw generation response when a generation fails', () => {
    const state = createInitialRuntimeState();
    const diagnostic = createNarrativeDiagnostic({
      state,
      lastError: 'Expected comma',
      streamingText: '正文已经流式显示。',
      lastRawNarratorResponse: '{"narrativeText":"正文","suggestedActions":["A" "B"]}'
    });

    expect(diagnostic).toContain('## 最近原始返回');
    expect(diagnostic).not.toContain('最近模型原文');
    expect(diagnostic).toContain('{"narrativeText":"正文","suggestedActions":["A" "B"]}');
    expect(diagnostic).toContain('## 最近错误');
    expect(diagnostic).toContain('Expected comma');
  });

  it('exports only the latest ten story turns for recent language diagnostics', () => {
    const state = createInitialRuntimeState();
    state.storyLog = [];
    for (let turn = 1; turn <= 12; turn += 1) {
      state.storyLog.push(
        {
          turnId: `player_${turn}`,
          speaker: 'player',
          text: `玩家行动 ${turn}`,
          gameTime: state.time
        },
        {
          turnId: `turn_${turn}`,
          speaker: 'narrator',
          text: `叙事正文 ${turn}`,
          gameTime: state.time
        }
      );
    }

    const diagnostic = createNarrativeDiagnostic({ state });

    expect(diagnostic).toContain('## 剧情正文（最近 10 回合）');
    expect(diagnostic).not.toMatch(/\bplayer_1\b/);
    expect(diagnostic).not.toMatch(/\bturn_1\b/);
    expect(diagnostic).not.toMatch(/\bplayer_2\b/);
    expect(diagnostic).not.toMatch(/\bturn_2\b/);
    expect(diagnostic).toContain('玩家行动 3');
    expect(diagnostic).toContain('叙事正文 12');
  });

  it('omits vector payloads and replaces the full memory store with a compact summary', () => {
    const state = createInitialRuntimeState();
    state.memories.vector_note = {
      memoryId: 'vector_note',
      text: '用于检查诊断导出的记忆。',
      kind: 'turn',
      tier: 'short_term',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: [],
      relatedTurnId: 'turn_99',
      gameTime: state.time,
      importance: 70,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: 'diagnostic vector text',
      embeddingVector: [987654.321, 123456.789],
      embeddingModel: 'diagnostic-model',
      embeddingUpdatedAt: '2026-07-11T00:00:00.000Z'
    };
    state.storyLog.push({
      turnId: 'turn_99',
      speaker: 'narrator',
      text: '最近正文。',
      gameTime: state.time,
      embeddingText: 'recent story embedding text',
      embeddingVector: [987654.321],
      embeddingModel: 'diagnostic-model',
      embeddingUpdatedAt: '2026-07-11T00:00:00.000Z',
      rawNarratorResponse: 'RAW_RESPONSE_SHOULD_NOT_BE_DUPLICATED'
    });

    const diagnostic = createNarrativeDiagnostic({ state });
    const runtimeSnapshot = diagnostic.split('## Runtime State Snapshot')[1] ?? '';
    const parsedRuntimeSnapshot = JSON.parse(runtimeSnapshot) as Record<string, unknown>;

    expect(runtimeSnapshot).toContain('"memorySummary"');
    expect(runtimeSnapshot).toContain('"total": 1');
    expect(runtimeSnapshot).toContain('"currentPlace"');
    expect(runtimeSnapshot).toContain('"actorSummary"');
    expect(runtimeSnapshot).toContain('"organizationSummary"');
    expect(runtimeSnapshot).toContain('"collectionCounts"');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('memories');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('actors');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('organizations');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('dynamicEvents');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('citySituationTracks');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('places');
    expect(parsedRuntimeSnapshot).not.toHaveProperty('scenes');
    expect(runtimeSnapshot).not.toContain('"embeddingVector"');
    expect(runtimeSnapshot).not.toContain('"embeddingText"');
    expect(runtimeSnapshot).not.toContain('987654.321');
    expect(runtimeSnapshot).not.toContain('RAW_RESPONSE_SHOULD_NOT_BE_DUPLICATED');
  });

  it('includes the memory projection used for prompt debugging', () => {
    const state = createInitialRuntimeState();
    state.memories.station_note = {
      memoryId: 'station_note',
      text: '何志强提醒玩家不要随便改投诉簿。',
      kind: 'turn',
      tier: 'short_term',
      relatedActorIds: ['player'],
      relatedCaseIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: [],
      gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
      importance: 80,
      visibility: 'player_known',
      certainty: 'fact',
      embeddingText: '何志强 提醒 玩家 投诉簿'
    };

    const diagnostic = createNarrativeDiagnostic({
      state,
      lastPlayerInput: '投诉簿'
    });

    expect(diagnostic).toContain('## 记忆投喂投影');
    expect(diagnostic).toContain('何志强提醒玩家不要随便改投诉簿。');
    expect(diagnostic).toContain('原因=current_place,player_input,high_importance');
  });

  it('includes weather projection diagnostics', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 }
    });
    state.environment.weather = {
      ...state.environment.weather,
      condition: 'light_rain',
      label: '细雨',
      impactSummary: '路面湿滑，霓虹反光。',
      source: 'llm',
      intensity: 40,
      tags: ['wet_road']
    };

    const diagnostic = createNarrativeDiagnostic({ state });

    expect(diagnostic).toContain('## Weather Projection');
    expect(diagnostic).toContain('condition=light_rain');
    expect(diagnostic).toContain('路面湿滑');
  });

  it('shows short, mid, and long memory projection buckets in diagnostics', () => {
    const state = createInitialRuntimeState();
    state.memories = {
      short_note: {
        memoryId: 'short_note',
        text: 'recent raw patrol note',
        kind: 'turn',
        tier: 'short_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 15 },
        importance: 30,
        visibility: 'player_known',
        certainty: 'fact',
        embeddingText: 'recent raw patrol note'
      },
      mid_note: {
        memoryId: 'mid_note',
        text: 'compressed mid-term patrol summary',
        kind: 'turn',
        tier: 'mid_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [],
        relatedOrganizationIds: [],
        gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 20 },
        importance: 50,
        visibility: 'player_known',
        certainty: 'fact',
        embeddingText: 'compressed mid-term patrol summary'
      },
      long_note: {
        memoryId: 'long_note',
        text: 'stable long-term station fact',
        kind: 'turn',
        tier: 'long_term',
        relatedActorIds: [],
        relatedCaseIds: [],
        relatedPlaceIds: [state.location.currentPlaceId],
        relatedOrganizationIds: [],
        gameTime: { year: 1988, month: 9, day: 12, hour: 21, minute: 30 },
        importance: 80,
        visibility: 'player_known',
        certainty: 'fact',
        embeddingText: 'stable long-term station fact'
      }
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'station' });
    const memorySection = diagnostic.split('## 记忆投喂投影')[1]?.split('## Asset Projection')[0] ?? '';

    expect(memorySection).toContain('### 短期记忆 short_term_history');
    expect(memorySection).toContain('recent raw patrol note');
    expect(memorySection).toContain('### 中期记忆 mid_term_history');
    expect(memorySection).toContain('compressed mid-term patrol summary');
    expect(memorySection).toContain('### 长期记忆 long_term_history');
    expect(memorySection).toContain('stable long-term station fact');
    expect(memorySection).not.toContain('highImportanceFallback');
  });

  it('includes asset projection and inventory snapshot for asset debugging', () => {
    const state = createInitialRuntimeState();
    state.assets = {
      items: {
        asset_equipped_radio: {
          itemId: 'asset_equipped_radio',
          category: 'equipment',
          name: 'Motorola radio',
          summary: 'The radio currently carried by the player.',
          relatedActorIds: [],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          importance: 1,
          visibility: 'player_known'
        },
        asset_gold_watch: {
          itemId: 'asset_gold_watch',
          category: 'valuable',
          name: 'Gold watch',
          summary: 'A watch tied to a nightclub owner.',
          relatedActorIds: [],
          relatedCaseIds: ['case_nightclub'],
          relatedPlaceIds: [],
          evidence: {
            caseId: 'case_nightclub',
            summary: 'May become evidence in the nightclub complaint.',
            disputed: false
          },
          importance: 70,
          visibility: 'player_known'
        }
      },
      equippedItemIds: ['asset_equipped_radio']
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'nightclub watch' });

    expect(diagnostic).toContain('## Asset Projection');
    expect(diagnostic).toContain('asset_equipped_radio');
    expect(diagnostic).toContain('Gold watch');
    expect(diagnostic).toContain('## Asset Inventory Snapshot');
    expect(diagnostic).toContain('equipment=1');
    expect(diagnostic).toContain('valuable=1');
    expect(diagnostic).toContain('equipped=asset_equipped_radio');
  });

  it('includes finance projection and snapshot for money debugging', () => {
    const state = createInitialRuntimeState();
    state.finance = {
      ...state.finance,
      bankBalance: 2100,
      summary: '现金不宽裕。',
      cashflows: {
        salary: {
          itemId: 'salary',
          direction: 'income',
          kind: 'salary',
          title: '警队月薪',
          amount: 4200,
          account: 'bank',
          summary: '基层警员固定月薪。',
          activeFromMonth: '1988-09',
          relatedAssetItemIds: [],
          relatedActorIds: [],
          relatedPlaceIds: [],
          source: 'opening',
          status: 'active',
          visibility: 'private'
        }
      },
      ledger: [],
      reports: []
    };

    const diagnostic = createNarrativeDiagnostic({ state });

    expect(diagnostic).toContain('## Finance Projection');
    expect(diagnostic).toContain('bankBalance=2100');
    expect(diagnostic).toContain('activeCashflows source=1 projected=1');
    expect(diagnostic).toContain('## Finance Snapshot');
    expect(diagnostic).toContain('"bankBalance": 2100');
  });

  it('includes case projection, evidence, and deferred event diagnostics', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    state.cases.case_bar_assault = {
      caseId: 'case_bar_assault',
      title: '旺角酒吧伤人案',
      caseType: 'assault',
      status: 'investigating',
      playerRole: 'assist',
      leadActorName: '林长旺',
      summary: '酒吧伤人案牵涉街面社团。',
      currentFocus: '补充现场证据。',
      playerVisibleProgress: '玩家负责递交收据和口供。',
      internalProgressSummary: '主办者仍在查其他线索。',
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedOrganizationIds: [],
      evidenceIds: ['evidence_bar_receipt'],
      activityLog: [
        {
          activityId: 'activity_bar_receipt',
          kind: 'evidence_added',
          gameTime: now,
          summary: '玩家提交了夜总会收据。',
          relatedEvidenceIds: ['evidence_bar_receipt'],
          relatedActorIds: [],
          relatedPlaceIds: [],
          visibleToPlayer: true
        }
      ],
      unreadActivityCount: 1,
      lastActivityAt: now,
      visibility: 'player_known',
      createdAt: now,
      updatedAt: now
    };
    state.caseEvidence.evidence_bar_receipt = {
      evidenceId: 'evidence_bar_receipt',
      caseId: 'case_bar_assault',
      title: '夜总会收据',
      evidenceType: 'document',
      sourceSummary: '从玩家物品转入案件材料。',
      summary: '收据显示当晚有人在场。',
      submittedByActorId: 'player',
      submittedAt: now,
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedAssetItemId: 'asset_bar_receipt',
      visibility: 'player_known',
      createdAt: now,
      updatedAt: now
    };
    state.deferredEvents.deferred_case_review = {
      eventId: 'deferred_case_review',
      sourceModule: 'case',
      relatedIds: { caseId: 'case_bar_assault' },
      title: '检控意见回复',
      summary: '检控部门会在指定时间后回复。',
      triggerAt: now,
      visibility: 'hidden',
      promptInstruction: '到期后通过 deferredEventPatches 处理检控意见。',
      status: 'pending',
      createdAt: now
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: '酒吧 证据' });

    expect(diagnostic).toContain('## Case Projection Diagnostics');
    expect(diagnostic).toContain('activeCases=1');
    expect(diagnostic).toContain('selectedCaseIds=case_bar_assault');
    expect(diagnostic).toContain('selectedEvidenceIds=evidence_bar_receipt');
    expect(diagnostic).toContain('## Deferred Event Diagnostics');
    expect(diagnostic).toContain('pendingEvents=1');
    expect(diagnostic).toContain('dueEvents=1');
    expect(diagnostic).toContain('projectedDueEventIds=deferred_case_review');
    expect(diagnostic).toContain('## Case Runtime Snapshot');
    expect(diagnostic).toContain('"case_bar_assault"');
    expect(diagnostic).toContain('"evidence_bar_receipt"');
    expect(diagnostic).toContain('"deferred_case_review"');
  });

  it('includes reputation projection and snapshot for reputation debugging', () => {
    const state = createInitialRuntimeState();
    state.player.reputation = {
      ...state.player.reputation,
      notoriety: 145,
      overallReputation: -6,
      summary: 'A complaint starts to affect the player.',
      circles: {
        ...state.player.reputation.circles,
        police: { visibility: 120, standing: -12, summary: 'The station has heard the complaint.' },
        neighborhoodMedia: { visibility: 90, standing: -20, summary: 'Residents are repeating the complaint.' }
      },
      logs: [
        {
          logId: 'rep_1',
          gameTime: { ...state.time, minute: 31 },
          turnId: 'turn_1',
          kind: 'circle',
          circle: 'police',
          visibilityDelta: 10,
          standingDelta: -5,
          summary: 'The duty sergeant heard about it.',
          reason: 'Station complaint'
        }
      ]
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'station complaint' });

    expect(diagnostic).toContain('## Reputation Projection');
    expect(diagnostic).toContain('selectedCircles=police,neighborhoodMedia');
    expect(diagnostic).toContain('## Reputation Snapshot');
    expect(diagnostic).toContain('"notoriety": 145');
  });

  it('includes institution projection diagnostics for social institution debugging', () => {
    const state = createInitialRuntimeState();
    state.actors.player.organizationRelations.push(
      {
        organizationId: 'org_tvb',
        relationType: 'informal_contact',
        roleTitle: 'assignment editor contact',
        summary: 'The player has a visible contact inside TVB.',
        visibility: 'player_known'
      },
      {
        organizationId: 'org_icac',
        relationType: 'informal_contact',
        roleTitle: 'confidential contact',
        summary: 'This hidden ICAC relation should stay out of normal projection.',
        visibility: 'hidden'
      }
    );

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'TVB contact' });

    expect(diagnostic).toContain('## Institution Projection Diagnostics');
    expect(diagnostic).toContain('projectedOrganizationIds=');
    expect(diagnostic).toContain('org_tvb');
    expect(diagnostic).toContain('actorRelations=');
    expect(diagnostic).toContain('omittedHidden=');
    expect(diagnostic.match(/## Institution Projection Diagnostics \/ 社会机构投影诊断/g) ?? []).toHaveLength(1);
    expect(diagnostic.match(/## Gray Network Projection Diagnostics \/ 社团投影诊断/g) ?? []).toHaveLength(1);
  });

  it('includes dynamic projection diagnostics for current matters and news debugging', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    state.dynamicEvents.currentMatters.matter_media_pressure = {
      id: 'matter_media_pressure',
      title: 'Tabloid pressure near Mong Kok',
      summary: 'A reporter is asking about a complaint.',
      status: 'active',
      priority: 80,
      visibility: 'known',
      source: 'media',
      matterKind: 'social',
      pressureLevel: 2,
      responseWindow: 'today',
      dueAt: now,
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    state.dynamicEvents.signals.signal_street_rumor = {
      id: 'signal_street_rumor',
      title: 'Street rumor',
      summary: 'Residents heard a club owner asked people to stay quiet.',
      signalType: 'rumor',
      reliability: 'unknown',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: now,
      updatedAt: now
    };
    state.dynamicEvents.newsIssues.news_evening_19880912 = {
      id: 'news_evening_19880912',
      date: now,
      outletName: 'Evening Daily',
      headline: 'Nightclub questions linger',
      summary: 'A newspaper issue mixes district rumors and entertainment news.',
      articles: [
        {
          id: 'article_player_related',
          section: 'local',
          headline: 'Complaint draws attention',
          body: 'Reporters are watching patrol response.',
          playerRelated: true,
          relatedActorIds: ['player'],
          relatedPlaceIds: [state.location.currentPlaceId],
          relatedCaseIds: [],
          relatedOrganizationIds: []
        }
      ],
      createdAt: now,
      updatedAt: now,
      read: false
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'read the paper' });

    expect(diagnostic).toContain('## Dynamic Projection Diagnostics');
    expect(diagnostic).toContain('matter_media_pressure');
    expect(diagnostic).toContain('due=1');
    expect(diagnostic).toContain('signal_street_rumor');
    expect(diagnostic).toContain('news_evening_19880912');
    expect(diagnostic).toContain('## Dynamic Runtime Snapshot');
    expect(diagnostic).toContain('"currentMatters"');
  });

  it('includes conflict projection diagnostics for judgement and combat debugging', () => {
    const state = createInitialRuntimeState();
    state.judgementChecks.check_alley = {
      checkId: 'check_alley',
      turnId: 'turn_1',
      gameTime: state.time,
      title: '后巷压制判定',
      category: 'melee',
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      difficulty: 55,
      score: 68,
      margin: 13,
      outcome: 'success',
      shortSummary: '玩家压住对方持刀手。',
      factors: [],
      visibility: 'player_known'
    };
    state.combatEvents.combat_alley = {
      combatId: 'combat_alley',
      turnId: 'turn_1',
      gameTime: state.time,
      title: '后巷持刀拘捕',
      type: 'armed',
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
      intensity: 70,
      combatText: '玩家侧身避刀后压腕，把对方顶向卷闸门。',
      resultSummary: '嫌疑人被控制。',
      consequenceSummary: '现场引来围观。',
      judgementCheckIds: ['check_alley'],
      relatedActorIds: ['player'],
      relatedPlaceIds: [state.location.currentPlaceId],
      relatedCaseIds: [],
      visibility: 'player_known',
      unread: true,
      createdAt: state.time
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: '后巷 拘捕' });

    expect(diagnostic).toContain('## Conflict Projection Diagnostics / 对抗与判定投影诊断');
    expect(diagnostic).toContain('projectedCombatIds=combat_alley');
    expect(diagnostic).toContain('projectedJudgementCheckIds=check_alley');
    expect(diagnostic).toContain('combatEvents source=1 projected=1');
  });

  it('includes relationship projection diagnostics for network and fate debugging', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    state.relationshipThreads.rel_lam_sing = {
      threadId: 'rel_lam_sing',
      kind: 'network',
      title: '湾仔同僚梁伟杰',
      summary: '梁伟杰和玩家共事多次。',
      relatedActorIds: ['player'],
      primaryActorId: 'player',
      relationshipRole: '同僚',
      status: 'active',
      currentPull: '他想请玩家帮忙看一次旧案资料。',
      milestones: [],
      visibility: 'player_known',
      importance: 70,
      createdAt: now,
      updatedAt: now
    };
    state.relationshipThreads.rel_hidden = {
      ...state.relationshipThreads.rel_lam_sing,
      threadId: 'rel_hidden',
      title: '隐藏关系',
      summary: '不应进入诊断投影。',
      visibility: 'hidden'
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: '梁伟杰 旧案' });

    expect(diagnostic).toContain('## Relationship Projection Diagnostics / 人脉缘份投影诊断');
    expect(diagnostic).toContain('projectedThreadIds=rel_lam_sing');
    expect(diagnostic).toContain('omittedHidden=1');
    expect(diagnostic).toContain('heartbeatThreadIds=');
    const relationshipSection = diagnostic
      .split('## Relationship Projection Diagnostics / 人脉缘份投影诊断')[1]
      .split('## Dynamic Projection Diagnostics / 动态事项与新闻投影诊断')[0];
    expect(relationshipSection).not.toContain('不应进入诊断投影');
  });

  it('includes NPC dynamic simulation projection diagnostics', () => {
    const state = createInitialRuntimeState();
    const now = state.time;
    const currentSceneId = state.location.currentSceneId;
    state.actors.npc_sergeant_chan = {
      ...state.actors.player,
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
      motivation: '维持报案室秩序',
      relationshipSummary: '值日警长，对玩家既照顾又观察',
      recentInteractionMemory: '刚提醒玩家别在柜台前谈线人'
    };
    state.actors.npc_ah_ling = {
      ...state.actors.player,
      actorId: 'npc_ah_ling',
      name: '阿玲',
      aliases: ['玲姐'],
      presence: 'absent',
      visibility: 'player_known',
      importance: 80,
      motivation: '想知道玩家是否还记得昨晚的承诺',
      relationshipSummary: '与玩家有一条暧昧但未说明的缘份线',
      recentInteractionMemory: '上次在茶餐厅分别前让玩家别忘了回电话'
    };
    if (currentSceneId) state.scenes[currentSceneId].presentActorIds.push('npc_sergeant_chan');
    state.relationshipThreads.rel_ah_ling = {
      threadId: 'rel_ah_ling',
      kind: 'fate',
      title: '阿玲的未回电话',
      summary: '阿玲等玩家回电话已有一晚。',
      relatedActorIds: ['npc_ah_ling'],
      primaryActorId: 'npc_ah_ling',
      relationshipRole: '暧昧旧识',
      status: 'active',
      currentPull: '她可能通过电话或传呼台留下口信。',
      nextNaturalBeatHint: '可以由值日警长随口提到有女人找过玩家。',
      milestones: [],
      visibility: 'player_known',
      importance: 85,
      createdAt: now,
      updatedAt: now
    };
    state.memories.mem_sergeant_recent = {
      memoryId: 'mem_sergeant_recent',
      text: '陈强记得玩家答应不在柜台前公开线人身份。',
      kind: 'actor',
      tier: 'short_term',
      relatedActorIds: ['npc_sergeant_chan'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: now,
      importance: 100,
      visibility: 'player_known',
      certainty: 'fact'
    };
    state.memories.mem_ah_ling_long = {
      memoryId: 'mem_ah_ling_long',
      text: '阿玲长期记得玩家答应重要电话一定会回。',
      kind: 'actor',
      tier: 'long_term',
      relatedActorIds: ['npc_ah_ling'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: now,
      importance: 1,
      visibility: 'player_known',
      certainty: 'fact'
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: '陈强 阿玲 电话' });

    expect(diagnostic).toContain('## NPC Dynamic Simulation Diagnostics / NPC 动态模拟投影诊断');
    expect(diagnostic).toContain('presentActorReactions selected=npc_sergeant_chan');
    expect(diagnostic).toContain('remoteNpcPresence selected=npc_ah_ling');
    expect(diagnostic).toContain('remoteCandidateIds=relationshipHeartbeat:rel_ah_ling:npc_ah_ling');
    expect(diagnostic).toContain('## NPC Memory Projection / NPC 记忆投喂诊断');
    expect(diagnostic).toContain('main memoryIds=mem_sergeant_recent,mem_ah_ling_long');
    expect(diagnostic).toContain('simulation memoryIds=mem_sergeant_recent,mem_ah_ling_long');
    expect(diagnostic).toContain('route=present core=true tier=short_term');
    expect(diagnostic).toContain('route=mentioned core=false tier=long_term');
  });

  it('includes gray network projection diagnostics and missing references', () => {
    const state = createInitialRuntimeState();
    const areaId = state.places[state.location.currentPlaceId]?.districtId ?? state.location.currentPlaceId;
    state.player.currentIdentity = 'police';
    state.grayNetworks.byAreaId[areaId] = {
      areaId,
      areaName: 'Mong Kok',
      climate: [
        {
          key: 'street_collections',
          label: 'Street collections',
          level: 'rising',
          summary: 'Small shops are being pressed for money.',
          confidence: 'medium',
          lastUpdatedTurn: 2
        }
      ],
      knownOrganizations: [
        {
          organizationId: 'org_missing_society',
          name: 'Missing Society',
          visibleName: 'Missing Society',
          summary: 'Known only as a street-level rumor.',
          knownScope: 'local street stalls',
          confidence: 'medium',
          visibility: { police: 'rumor', civilian: 'hidden', gang_member: 'known' },
          relatedActorIds: ['actor_missing_collector'],
          relatedPlaceIds: ['place_missing_lane'],
          relatedCaseIds: [],
          updatedAtTurn: 2
        }
      ],
      keyPlaces: [],
      relatedPeople: [],
      relationClues: [],
      actionRisks: [],
      suggestedActions: []
    };

    const diagnostic = createNarrativeDiagnostic({ state, lastPlayerInput: 'street collections' });

    expect(diagnostic).toContain('## Gray Network Projection Diagnostics');
    expect(diagnostic).toContain(`area=${areaId} name=Mong Kok`);
    expect(diagnostic).toContain('perspective=police available=true');
    expect(diagnostic).toContain('projectedClimate=1');
    expect(diagnostic).toContain('projectedOrganizations=1');
    expect(diagnostic).toContain('missingActors=actor_missing_collector');
    expect(diagnostic).toContain('missingPlaces=place_missing_lane');
    expect(diagnostic).toContain('missingOrganizations=org_missing_society');
    expect(diagnostic).toContain('## Gray Network Runtime Snapshot');
    expect(diagnostic).toContain('"knownOrganizations": 1');
    expect(diagnostic).toContain('Street collections');
  });

  it('exports an empty gray network snapshot concisely', () => {
    const state = createInitialRuntimeState();

    const diagnostic = createNarrativeDiagnostic({ state });

    expect(diagnostic).toContain('## Gray Network Projection Diagnostics');
    expect(diagnostic).toContain('available=false');
    expect(diagnostic).toContain('projectedClimate=0');
    expect(diagnostic).toContain('## Gray Network Runtime Snapshot');
    expect(diagnostic).toContain('- none');
  });

  it('includes city situation track review diagnostics', () => {
    const state = createInitialRuntimeState();
    state.storyLog.push({
      turnId: 'turn_city_review',
      speaker: 'narrator',
      text: 'City review happened.',
      gameTime: state.time,
      writebackDiagnostics: [
        {
          path: ['citySituationTracks'],
          code: 'city_situation_track_review',
          message: 'Advanced 1 city situation track.'
        }
      ]
    });

    const diagnostic = createNarrativeDiagnostic({
      state,
      lastRawNarratorResponse: '{}'
    });

    expect(diagnostic).toContain('city_situation_track_review');
    expect(diagnostic).toContain('Advanced 1 city situation track.');
  });
});

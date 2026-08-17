import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { DynamicContextProjection } from '../dynamic/dynamicContextProjector';
import type { RelationshipContextProjection } from '../relationship/relationshipContextProjector';
import type { Actor, CurrentMatter, DeferredEvent, NewsIssue, RuntimeState, Signal } from '../runtime/types';
import { projectRemoteNpcPresence } from './remoteNpcPresenceProjector';

describe('projectRemoteNpcPresence', () => {
  it('selects absent NPC presence candidates from relationship and dynamic signals', () => {
    const state = createInitialRuntimeState();
    addActor(state, {
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
    addActor(state, {
      actorId: 'npc_uncle_kin',
      name: '坚叔',
      presence: 'absent',
      visibility: 'player_known',
      importance: 70
    });
    addActor(state, {
      actorId: 'npc_reporter_lee',
      name: '李记者',
      presence: 'mentioned',
      visibility: 'player_known',
      importance: 64
    });
    addActor(state, {
      actorId: 'npc_editor_fong',
      name: '方编辑',
      presence: 'absent',
      visibility: 'player_known',
      importance: 62
    });
    addActor(state, {
      actorId: 'npc_brother_ming',
      name: '阿明',
      presence: 'absent',
      visibility: 'player_known',
      importance: 58
    });
    addActor(state, {
      actorId: 'npc_present_colleague',
      name: '在场同僚',
      presence: 'present',
      visibility: 'player_known',
      importance: 100
    });
    addActor(state, {
      actorId: 'npc_nearby_colleague',
      name: '附近同僚',
      presence: 'nearby',
      visibility: 'player_known',
      importance: 100
    });
    addActor(state, {
      actorId: 'npc_hidden_handler',
      name: '隐藏线人',
      presence: 'absent',
      visibility: 'hidden',
      importance: 100
    });

    const relationshipProjection: RelationshipContextProjection = {
      threads: [],
      identityRegistry: [],
      heartbeatCandidates: [
        {
          threadId: 'rel_ah_ling',
          kind: 'fate',
          title: '阿玲的未回电话',
          relatedActorIds: ['npc_ah_ling'],
          beatType: 'message',
          summary: '阿玲等玩家回电话已有一晚。',
          reason: '她可能通过电话或传呼台留下口信。',
          importance: 90
        },
        {
          threadId: 'rel_present',
          kind: 'network',
          title: '在场同僚不应远场化',
          relatedActorIds: ['npc_present_colleague'],
          beatType: 'encounter',
          summary: 'present should be skipped',
          reason: 'present should be skipped',
          importance: 99
        }
      ],
      diagnostics: {
        sourceThreadCount: 2,
        projectedThreadCount: 0,
        projectedThreadIds: [],
        heartbeatCandidateCount: 2,
        heartbeatCandidateThreadIds: ['rel_ah_ling', 'rel_present'],
        identityRegistryCount: 0,
        identityRegistryTruncatedCount: 0,
        omittedHiddenCount: 0,
        omittedIrrelevantCount: 0,
        missingActorRefs: []
      }
    };
    const dynamicProjection: DynamicContextProjection = {
      currentMatters: [
        createMatter('matter_uncle', '坚叔的夜场提醒', ['npc_uncle_kin']),
        createMatter('matter_hidden', '隐藏线人事项', ['npc_hidden_handler'])
      ],
      recentResolvedMatters: [],
      signals: [
        createSignal('signal_reporter', '记者在打听投诉', ['npc_reporter_lee']),
        createSignal('signal_nearby', '附近同僚不应远场化', ['npc_nearby_colleague'])
      ],
      newsIssues: [
        createNewsIssue('news_editor', '晚报编辑盯上夜场投诉', ['npc_editor_fong'])
      ],
      dueDeferredEvents: [
        createDeferredEvent('due_brother', '弟弟传呼', '阿明托传呼台找玩家。', 'npc_brother_ming')
      ],
      diagnostics: {
        sourceCurrentMatterCount: 2,
        projectedCurrentMatterCount: 2,
        currentMatterIds: ['matter_uncle', 'matter_hidden'],
        omittedCurrentMatterCount: 0,
        sourceRecentResolvedMatterCount: 0,
        projectedRecentResolvedMatterCount: 0,
        recentResolvedMatterIds: [],
        omittedRecentResolvedMatterCount: 0,
        sourceSignalCount: 2,
        projectedSignalCount: 2,
        signalIds: ['signal_reporter', 'signal_nearby'],
        omittedSignalCount: 0,
        sourceNewsIssueCount: 1,
        projectedNewsIssueCount: 1,
        newsIssueIds: ['news_editor'],
        omittedNewsIssueCount: 0,
        omittedHiddenCount: 0,
        dueCurrentMatterIds: [],
        dueDeferredEventIds: ['due_brother'],
        omittedDueDeferredEventCount: 0
      }
    };

    const projection = projectRemoteNpcPresence(state, relationshipProjection, dynamicProjection, {
      playerInput: '我问值日警长，阿玲有没有再打电话过来。',
      maxCandidates: 8
    });

    expect(projection.candidates.map((candidate) => candidate.actorId)).toEqual([
      'npc_ah_ling',
      'npc_brother_ming',
      'npc_uncle_kin',
      'npc_reporter_lee',
      'npc_editor_fong'
    ]);
    expect(projection.candidates.map((candidate) => candidate.source)).toEqual([
      'relationshipHeartbeat',
      'dueDynamicEvent',
      'currentMatter',
      'signal',
      'news'
    ]);
    expect(projection.candidates[0].triggerReasons).toContain('player_input_mention');
    expect(projection.candidates[0].presenceHint).toContain('未裁定建议');
    expect(projection.candidates[0].basis.join('\n')).toContain('她可能通过电话或传呼台留下口信');
    expect(projection.diagnostics.selectedActorIds).not.toContain('npc_present_colleague');
    expect(projection.diagnostics.selectedActorIds).not.toContain('npc_nearby_colleague');
    expect(projection.diagnostics.selectedActorIds).not.toContain('npc_hidden_handler');
    expect(projection.diagnostics.omittedCandidateCount).toBe(3);
  });

  it('does not mark empty player input as a player mention', () => {
    const state = createInitialRuntimeState();
    addActor(state, {
      actorId: 'npc_ah_ling',
      name: '阿玲',
      presence: 'absent',
      visibility: 'player_known',
      importance: 80
    });
    const relationshipProjection: RelationshipContextProjection = {
      threads: [],
      identityRegistry: [],
      heartbeatCandidates: [
        {
          threadId: 'rel_ah_ling',
          kind: 'fate',
          title: '阿玲的未回电话',
          relatedActorIds: ['npc_ah_ling'],
          beatType: 'message',
          summary: '阿玲等玩家回电话已有一晚。',
          reason: '她可能通过电话或传呼台留下口信。',
          importance: 90
        }
      ],
      diagnostics: {
        sourceThreadCount: 1,
        projectedThreadCount: 0,
        projectedThreadIds: [],
        heartbeatCandidateCount: 1,
        heartbeatCandidateThreadIds: ['rel_ah_ling'],
        identityRegistryCount: 0,
        identityRegistryTruncatedCount: 0,
        omittedHiddenCount: 0,
        omittedIrrelevantCount: 0,
        missingActorRefs: []
      }
    };
    const dynamicProjection: DynamicContextProjection = {
      currentMatters: [],
      recentResolvedMatters: [],
      signals: [],
      newsIssues: [],
      dueDeferredEvents: [],
      diagnostics: {
        sourceCurrentMatterCount: 0,
        projectedCurrentMatterCount: 0,
        currentMatterIds: [],
        omittedCurrentMatterCount: 0,
        sourceRecentResolvedMatterCount: 0,
        projectedRecentResolvedMatterCount: 0,
        recentResolvedMatterIds: [],
        omittedRecentResolvedMatterCount: 0,
        sourceSignalCount: 0,
        projectedSignalCount: 0,
        signalIds: [],
        omittedSignalCount: 0,
        sourceNewsIssueCount: 0,
        projectedNewsIssueCount: 0,
        newsIssueIds: [],
        omittedNewsIssueCount: 0,
        omittedHiddenCount: 0,
        dueCurrentMatterIds: [],
        dueDeferredEventIds: [],
        omittedDueDeferredEventCount: 0
      }
    };

    const projection = projectRemoteNpcPresence(state, relationshipProjection, dynamicProjection, {
      playerInput: ''
    });

    expect(projection.candidates[0].triggerReasons).not.toContain('player_input_mention');
  });

  it('routes a structured duty contact who is marked present at another place', () => {
    const state = createInitialRuntimeState();
    addActor(state, {
      actorId: 'npc_duty_sergeant_chan',
      name: '陈伟强',
      presence: 'present',
      currentPlaceId: 'place_mong_kok_police_station',
      visibility: 'player_known',
      importance: 72,
      publicIdentity: '旺角警署值日警长',
      roleProfiles: {
        police: {
          ...state.actors.player.roleProfiles.police!,
          rank: 'Sergeant',
          stationOrPost: 'Mong Kok Police Station',
          department: 'Uniform Branch'
        }
      }
    });
    state.location.currentPlaceId = 'place_portland_street';
    state.location.currentSceneId = undefined;

    const projection = projectRemoteNpcPresence(
      state,
      emptyRelationshipProjection(),
      emptyDynamicProjection(),
      {
        playerInput: '用电台向值日警长报告现场情况。',
        roleContactActorIds: ['npc_duty_sergeant_chan']
      }
    );

    expect(projection.candidates[0]).toMatchObject({
      actorId: 'npc_duty_sergeant_chan',
      actorName: '陈伟强',
      source: 'roleContact',
      sourceId: 'player_role_chain'
    });
    expect(projection.candidates[0].basis.join('\n')).toContain('Mong Kok Police Station');
    expect(projection.candidates[0].presenceHint).toContain('警队电台');
  });

  it('routes a structured triad contact through society channels instead of police channels', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const playerTriadProfile = state.actors.player.roleProfiles.triad!;
    addActor(state, {
      actorId: 'npc_triad_patron_sing',
      name: '阿成',
      currentIdentity: 'gang_member',
      publicIdentity: '庙街地区线联络人',
      presence: 'absent',
      visibility: 'player_known',
      importance: 78,
      roleProfiles: {
        police: undefined,
        civilian: undefined,
        triad: {
          ...playerTriadProfile,
          status: 'active',
          roleTitle: '地区线联络人',
          rankSummary: '资深成员',
          territorySummary: '庙街及油麻地一带'
        }
      }
    });

    const projection = projectRemoteNpcPresence(
      state,
      emptyRelationshipProjection(),
      emptyDynamicProjection(),
      {
        playerInput: '等阿成托人带话。',
        roleContactActorIds: ['npc_triad_patron_sing']
      }
    );

    expect(projection.candidates[0]).toMatchObject({
      actorId: 'npc_triad_patron_sing',
      actorName: '阿成',
      source: 'roleContact',
      sourceId: 'player_role_chain'
    });
    expect(projection.candidates[0].basis.join('\n')).toContain('当前公开社团身份的直属或同组联系人');
    expect(projection.candidates[0].basis.join('\n')).toContain('庙街及油麻地一带');
    expect(projection.candidates[0].presenceHint).toContain('托话、场所联络或街面碰头');
    expect(projection.candidates[0].presenceHint).not.toContain('警队电台');
  });
});

function emptyRelationshipProjection(): RelationshipContextProjection {
  return {
    threads: [],
    identityRegistry: [],
    heartbeatCandidates: [],
    diagnostics: {
      sourceThreadCount: 0,
      projectedThreadCount: 0,
      projectedThreadIds: [],
      heartbeatCandidateCount: 0,
      heartbeatCandidateThreadIds: [],
      identityRegistryCount: 0,
      identityRegistryTruncatedCount: 0,
      omittedHiddenCount: 0,
      omittedIrrelevantCount: 0,
      missingActorRefs: []
    }
  };
}

function emptyDynamicProjection(): DynamicContextProjection {
  return {
    currentMatters: [],
    recentResolvedMatters: [],
    signals: [],
    newsIssues: [],
    dueDeferredEvents: [],
    diagnostics: {
      sourceCurrentMatterCount: 0,
      projectedCurrentMatterCount: 0,
      currentMatterIds: [],
      omittedCurrentMatterCount: 0,
      sourceRecentResolvedMatterCount: 0,
      projectedRecentResolvedMatterCount: 0,
      recentResolvedMatterIds: [],
      omittedRecentResolvedMatterCount: 0,
      sourceSignalCount: 0,
      projectedSignalCount: 0,
      signalIds: [],
      omittedSignalCount: 0,
      sourceNewsIssueCount: 0,
      projectedNewsIssueCount: 0,
      newsIssueIds: [],
      omittedNewsIssueCount: 0,
      omittedHiddenCount: 0,
      dueCurrentMatterIds: [],
      dueDeferredEventIds: [],
      omittedDueDeferredEventCount: 0
    }
  };
}

function addActor(state: RuntimeState, overrides: Partial<Actor> & { actorId: string; name: string }): void {
  const { actorId, name, ...actorOverrides } = overrides;
  state.actors[actorId] = {
    ...state.actors.player,
    ...actorOverrides,
    actorId,
    name,
    aliases: [...(actorOverrides.aliases ?? [])],
    callName: actorOverrides.callName,
    organizationIds: [...(actorOverrides.organizationIds ?? [])],
    organizationRelations: [],
    roleProfiles: { ...state.actors.player.roleProfiles, ...actorOverrides.roleProfiles },
    attributes: { ...state.actors.player.attributes, ...actorOverrides.attributes },
    activeTraits: [],
    traitProgress: [],
    keyMemories: [],
    equipment: [],
    currentPlaceId: actorOverrides.currentPlaceId,
    currentSceneId: actorOverrides.currentSceneId,
    presence: actorOverrides.presence ?? 'absent',
    visibility: actorOverrides.visibility ?? 'player_known',
    importance: actorOverrides.importance ?? 50,
    motivation: actorOverrides.motivation ?? '普通动机',
    relationshipSummary: actorOverrides.relationshipSummary ?? '普通关系',
    recentInteractionMemory: actorOverrides.recentInteractionMemory ?? ''
  };
}

function createMatter(id: string, title: string, relatedActorIds: string[]): CurrentMatter {
  const now = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
  return {
    id,
    title,
    summary: `${title} summary`,
    status: 'active',
    priority: 75,
    visibility: 'known',
    source: 'test',
    matterKind: 'relationship',
    pressureLevel: 2,
    responseWindow: 'today',
    consequenceHint: `${title} consequence`,
    currentHook: `${title} hook`,
    unread: true,
    relatedActorIds,
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: now,
    updatedAt: now
  };
}

function createSignal(id: string, title: string, relatedActorIds: string[]): Signal {
  const now = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
  return {
    id,
    title,
    summary: `${title} summary`,
    signalType: 'rumor',
    reliability: 'medium',
    status: 'active',
    visibility: 'known',
    relatedActorIds,
    relatedPlaceIds: [],
    relatedCaseIds: [],
    relatedOrganizationIds: [],
    createdAt: now,
    updatedAt: now
  };
}

function createNewsIssue(id: string, headline: string, relatedActorIds: string[]): NewsIssue {
  const now = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
  return {
    id,
    date: now,
    outletName: '晚报',
    headline,
    summary: `${headline} summary`,
    articles: [
      {
        id: `${id}_article`,
        section: 'local',
        headline,
        body: `${headline} body`,
        playerRelated: true,
        relatedActorIds,
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: []
      }
    ],
    createdAt: now,
    updatedAt: now,
    read: false
  };
}

function createDeferredEvent(eventId: string, title: string, summary: string, actorId: string): DeferredEvent {
  const now = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };
  return {
    eventId,
    sourceModule: 'dynamic',
    relatedIds: { actorId },
    title,
    summary,
    triggerAt: now,
    visibility: 'player_visible',
    promptInstruction: `${title} prompt`,
    status: 'pending',
    createdAt: now
  };
}

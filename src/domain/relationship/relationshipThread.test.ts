import { describe, expect, it } from 'vitest';
import type { Actor, GameTime, RelationshipThread } from '../runtime/types';
import {
  applyRelationshipThreadPatch,
  buildRelationshipHeartbeatCandidates,
  removeRelationshipThreadFromState,
  sortRelationshipThreadsForPanel
} from './relationshipThread';
import { createInitialRuntimeState } from '../runtime/initialState';

const time: GameTime = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };

function createActor(actorId: string, name: string): Actor {
  return {
    actorId,
    name,
    aliases: [],
    gender: 'male',
    currentIdentity: 'civilian',
    roleProfiles: {},
    organizationIds: [],
    organizationRelations: [],
    positionSummary: '',
    presence: 'absent',
    profileSummary: '',
    appearance: '',
    clothing: '',
    equipment: [],
    personality: '',
    speechStyle: '',
    motivation: '',
    longTermGoal: '',
    values: '',
    attributes: { body: 50, action: 50, perception: 50, thinking: 50, negotiation: 50, will: 50 },
    activeTraits: [],
    traitProgress: [],
    statusSummary: '',
    relationshipSummary: '',
    attitudeTowardPlayer: '',
    interactionScore: 0,
    trustTendency: '',
    entanglementSummary: '',
    longTermMemorySummary: '',
    recentInteractionMemory: '',
    keyMemories: [],
    visibility: 'player_known',
    importance: 50
  };
}

function createThread(overrides: Partial<RelationshipThread> = {}): RelationshipThread {
  return {
    threadId: 'rel_lam',
    kind: 'network',
    title: '林长旺这条线',
    summary: '旺角警署值日警长，和玩家保持工作上的照应。',
    relatedActorIds: ['npc_lam'],
    primaryActorId: 'npc_lam',
    relationshipRole: '上级',
    status: 'active',
    currentPull: '最近会关照玩家的巡逻表现。',
    nextNaturalBeatHint: '值日室可能有一次短谈。',
    milestones: [],
    visibility: 'player_known',
    importance: 60,
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

describe('relationship thread domain', () => {
  it('creates a new relationship thread with stable defaults and milestone updates', () => {
    const result = applyRelationshipThreadPatch(
      {},
      {
        threadId: 'rel_lam',
        kind: 'network',
        title: '林长旺这条线',
        summary: '值日警长开始留意玩家。',
        relatedActorIds: ['npc_lam'],
        primaryActorId: 'npc_lam',
        relationshipRole: '上级',
        milestoneUpdates: [
          {
            milestoneId: 'ms_first_shift',
            summary: '第一次在值日室正式交代任务。',
            importance: 55,
            relatedActorIds: ['npc_lam']
          }
        ]
      },
      time,
      { npc_lam: createActor('npc_lam', '林长旺') }
    );

    expect(result.thread?.title).toBe('林长旺这条线');
    expect(result.thread?.status).toBe('active');
    expect(result.thread?.milestones[0]?.summary).toContain('值日室');
    expect(result.diagnostics).toEqual([]);
  });

  it('updates existing threads and de-duplicates milestones by milestoneId', () => {
    const existing = createThread({
      milestones: [
        {
          milestoneId: 'ms_first_shift',
          gameTime: time,
          summary: '旧摘要。',
          importance: 30,
          relatedActorIds: ['npc_lam'],
          visibility: 'player_known'
        }
      ]
    });

    const result = applyRelationshipThreadPatch(
      { rel_lam: existing },
      {
        threadId: 'rel_lam',
        summary: '林长旺对玩家更放心。',
        milestoneUpdates: [
          {
            milestoneId: 'ms_first_shift',
            summary: '更新后的值日室交代。',
            importance: 65,
            relatedActorIds: ['npc_lam']
          }
        ]
      },
      { ...time, minute: 30 },
      { npc_lam: createActor('npc_lam', '林长旺') }
    );

    expect(result.thread?.summary).toBe('林长旺对玩家更放心。');
    expect(result.thread?.milestones).toHaveLength(1);
    expect(result.thread?.milestones[0]?.importance).toBe(65);
    expect(result.thread?.updatedAt.minute).toBe(30);
  });

  it('keeps stable actor anchors and members while promoting network to fate', () => {
    const existing = createThread();
    const result = applyRelationshipThreadPatch(
      { rel_lam: existing },
      {
        threadId: 'rel_lam',
        kind: 'fate',
        relatedActorIds: ['npc_chan'],
        primaryActorId: 'npc_chan',
        visibility: 'hidden',
        summary: '本回合新增一个相关人物，但不能替换原核心人物。'
      },
      { ...time, minute: 45 },
      {
        npc_lam: createActor('npc_lam', '林长旺'),
        npc_chan: createActor('npc_chan', '陈国斌')
      }
    );

    expect(result.thread).toMatchObject({
      kind: 'fate',
      primaryActorId: 'npc_lam',
      visibility: 'player_known',
      relatedActorIds: ['npc_lam', 'npc_chan']
    });
    expect(result.diagnostics).toHaveLength(3);
  });

  it('does not downgrade a fate relationship on an ordinary network update', () => {
    const existing = createThread({ kind: 'fate' });
    const result = applyRelationshipThreadPatch(
      { rel_lam: existing },
      { threadId: 'rel_lam', kind: 'network', summary: '本回合只是普通联络。' },
      { ...time, minute: 50 },
      { npc_lam: createActor('npc_lam', '林长旺') }
    );

    expect(result.thread?.kind).toBe('fate');
    expect(result.diagnostics).toEqual([
      expect.stringContaining('remained fate')
    ]);
  });

  it('rejects incomplete new threads without losing diagnostics', () => {
    const result = applyRelationshipThreadPatch(
      {},
      {
        threadId: 'rel_incomplete',
        summary: '缺少标题和人物锚点。'
      },
      time,
      {}
    );

    expect(result.thread).toBeUndefined();
    expect(result.diagnostics[0]).toContain('requires kind, title');
    expect(result.rejectionCode).toBe('incomplete_creation');
  });

  it('rejects a new relationship until every referenced NPC has an actor archive', () => {
    const result = applyRelationshipThreadPatch(
      {},
      {
        threadId: 'rel_missing_actor',
        kind: 'network',
        title: '尚未建档的联系人',
        summary: '正文提及了这名联系人，但人物档案尚未合法建立。',
        relatedActorIds: ['player', 'npc_missing'],
        primaryActorId: 'npc_missing',
        relationshipRole: '联系人'
      },
      time,
      {}
    );

    expect(result.thread).toBeUndefined();
    expect(result.rejectionCode).toBe('missing_actor');
    expect(result.missingActorIds).toEqual(['npc_missing']);
    expect(result.diagnostics[0]).toContain('actor archive is missing');
  });

  it('updates an existing relationship without admitting a new missing actor reference', () => {
    const existing = createThread();
    const result = applyRelationshipThreadPatch(
      { rel_lam: existing },
      {
        threadId: 'rel_lam',
        summary: '林长旺继续向玩家提供工作照应。',
        relatedActorIds: ['npc_missing']
      },
      { ...time, minute: 55 },
      { npc_lam: createActor('npc_lam', '林长旺') }
    );

    expect(result.thread?.summary).toContain('继续向玩家提供工作照应');
    expect(result.thread?.relatedActorIds).toEqual(['npc_lam']);
    expect(result.diagnostics).toEqual([expect.stringContaining('ignored missing actor references')]);
  });

  it('builds remote heartbeat candidates without projecting hidden or present threads', () => {
    const candidates = buildRelationshipHeartbeatCandidates(
      [
        createThread({ threadId: 'rel_remote', relatedActorIds: ['npc_remote'], primaryActorId: 'npc_remote', importance: 80 }),
        createThread({ threadId: 'rel_present', relatedActorIds: ['npc_present'], primaryActorId: 'npc_present', importance: 90 }),
        createThread({ threadId: 'rel_hidden', relatedActorIds: ['npc_hidden'], visibility: 'hidden', importance: 100 })
      ],
      { now: time, presentActorIds: new Set(['npc_present']), maxCandidates: 5 }
    );

    expect(candidates.map((candidate) => candidate.threadId)).toEqual(['rel_remote']);
  });

  it('sorts player-facing relationship threads by freshness instead of legacy importance', () => {
    const sorted = sortRelationshipThreadsForPanel([
      createThread({ threadId: 'rel_low_new', importance: 20, updatedAt: { ...time, minute: 50 } }),
      createThread({ threadId: 'rel_high_old', importance: 90, updatedAt: { ...time, minute: 10 } })
    ]);

    expect(sorted.map((thread) => thread.threadId)).toEqual(['rel_low_new', 'rel_high_old']);
  });

  it('permanently removes only the selected relationship record from runtime state', () => {
    const state = createInitialRuntimeState();
    state.relationshipThreads.rel_lam = createThread();
    state.relationshipThreads.rel_other = createThread({ threadId: 'rel_other' });
    const actorsBefore = state.actors;
    const memoriesBefore = state.memories;
    const storyLogBefore = state.storyLog;

    const next = removeRelationshipThreadFromState(state, 'rel_lam');

    expect(next).not.toBe(state);
    expect(next.relationshipThreads.rel_lam).toBeUndefined();
    expect(next.relationshipThreads.rel_other).toBe(state.relationshipThreads.rel_other);
    expect(next.actors).toBe(actorsBefore);
    expect(next.memories).toBe(memoriesBefore);
    expect(next.storyLog).toBe(storyLogBefore);
  });

  it('returns the original state when the relationship record is already absent', () => {
    const state = createInitialRuntimeState();

    expect(removeRelationshipThreadFromState(state, 'missing_thread')).toBe(state);
  });
});

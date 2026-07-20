import { describe, expect, it } from 'vitest';
import type { Actor, GameTime, RelationshipThread } from '../runtime/types';
import {
  applyRelationshipThreadPatch,
  buildRelationshipHeartbeatCandidates,
  sortRelationshipThreadsForPanel
} from './relationshipThread';

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
});

import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState, withRuntimeDefaults } from '../runtime/initialState';
import type { Actor, RelationshipThread } from '../runtime/types';
import { applyNarratorResponse } from '../writeback/applyWriteback';
import { validateNarratorResponse } from '../writeback/validateWriteback';
import { reconcileActorRelationshipProfiles } from './relationshipActorProfile';

const time = { year: 1988, month: 9, day: 17, hour: 7, minute: 30 };

function actor(actorId: string, overrides: Partial<Actor> = {}): Actor {
  return createActorDefaults({
    actorId,
    name: actorId,
    currentIdentity: 'civilian',
    relationshipSummary: '旧关系摘要',
    attitudeTowardPlayer: '仍在观察',
    trustTendency: '有限信任',
    entanglementSummary: '暂无明确牵连',
    visibility: 'player_known',
    ...overrides
  });
}

function thread(overrides: Partial<RelationshipThread> = {}): RelationshipThread {
  return {
    threadId: 'thread_contact',
    kind: 'fate',
    title: '长期关系',
    summary: '双方已经形成稳定而明确的长期关系。',
    relatedActorIds: ['player', 'actor_contact'],
    primaryActorId: 'actor_contact',
    relationshipRole: '亲密友人',
    status: 'active',
    intimacySummary: '亲密而坦诚，愿意主动照应玩家。',
    trustSummary: '对玩家保持高度信任。',
    promiseSummary: '答应在需要时提供可靠帮助。',
    conflictSummary: '仍会为玩家冒险的方式发生争执。',
    riskSummary: '这段关系可能使双方被共同盯上。',
    currentPull: '近期仍需确认一次共同约定。',
    milestones: [],
    visibility: 'player_known',
    importance: 80,
    createdAt: time,
    updatedAt: time,
    ...overrides
  };
}

describe('relationship actor profile reconciliation', () => {
  it('projects a visible canonical relationship onto the primary actor profile', () => {
    const actors = {
      player: actor('player'),
      actor_contact: actor('actor_contact')
    };
    const projected = reconcileActorRelationshipProfiles(
      actors,
      { thread_contact: thread() },
      'player'
    );

    expect(projected.actor_contact).toMatchObject({
      relationshipSummary: '双方已经形成稳定而明确的长期关系。',
      attitudeTowardPlayer: '亲密而坦诚，愿意主动照应玩家。',
      trustTendency: '对玩家保持高度信任。'
    });
    expect(projected.actor_contact.entanglementSummary).toContain('承诺：答应在需要时提供可靠帮助。');
    expect(projected.actor_contact.entanglementSummary).toContain('风险：这段关系可能使双方被共同盯上。');
    expect(projected.player).toBe(actors.player);
  });

  it('uses the one related NPC when legacy data incorrectly names the player as primary', () => {
    const actors = {
      player: actor('player'),
      actor_contact: actor('actor_contact')
    };
    const projected = reconcileActorRelationshipProfiles(
      actors,
      { thread_contact: thread({ primaryActorId: 'player' }) },
      'player'
    );

    expect(projected.actor_contact.relationshipSummary).toBe('双方已经形成稳定而明确的长期关系。');
    expect(projected.player.relationshipSummary).toBe('旧关系摘要');
  });

  it('does not expose hidden threads or guess a primary actor for an ambiguous group relationship', () => {
    const actors = {
      player: actor('player'),
      actor_contact: actor('actor_contact'),
      actor_other: actor('actor_other')
    };
    const projected = reconcileActorRelationshipProfiles(
      actors,
      {
        hidden: thread({ threadId: 'hidden', visibility: 'hidden', summary: '隐藏关系事实。' }),
        group: thread({
          threadId: 'group',
          primaryActorId: undefined,
          relatedActorIds: ['player', 'actor_contact', 'actor_other'],
          summary: '多人关系摘要。'
        })
      },
      'player'
    );

    expect(projected).toBe(actors);
    expect(projected.actor_contact.relationshipSummary).toBe('旧关系摘要');
    expect(projected.actor_other.relationshipSummary).toBe('旧关系摘要');
  });

  it('hydrates only missing legacy fields and respects an explicit manual lock', () => {
    const actors = {
      player: actor('player'),
      actor_contact: actor('actor_contact', {
        relationshipSummary: '玩家保留的非空摘要',
        attitudeTowardPlayer: '',
        trustTendency: '',
        entanglementSummary: '',
        manualProfileOverride: {
          lockedFields: ['trustTendency'],
          updatedAt: time
        }
      })
    };
    const projected = reconcileActorRelationshipProfiles(
      actors,
      { thread_contact: thread() },
      'player',
      { mode: 'hydrate_missing' }
    );

    expect(projected.actor_contact.relationshipSummary).toBe('玩家保留的非空摘要');
    expect(projected.actor_contact.attitudeTowardPlayer).toBe('亲密而坦诚，愿意主动照应玩家。');
    expect(projected.actor_contact.trustTendency).toBe('');
    expect(projected.actor_contact.entanglementSummary).toContain('当前牵引：近期仍需确认一次共同约定。');
  });

  it('hydrates blank relationship portraits when loading an old save without rewriting nonempty text', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_contact = actor('actor_contact', {
      relationshipSummary: '',
      attitudeTowardPlayer: '',
      trustTendency: '玩家保留的信任判断',
      entanglementSummary: ''
    });
    state.relationshipThreads.thread_contact = thread();

    const loaded = withRuntimeDefaults(state);

    expect(loaded.actors.actor_contact.relationshipSummary).toBe('双方已经形成稳定而明确的长期关系。');
    expect(loaded.actors.actor_contact.attitudeTowardPlayer).toBe('亲密而坦诚，愿意主动照应玩家。');
    expect(loaded.actors.actor_contact.trustTendency).toBe('玩家保留的信任判断');
    expect(loaded.actors.actor_contact.entanglementSummary).toContain('承诺：答应在需要时提供可靠帮助。');
  });

  it('limits synchronization to relationship threads applied in the current transaction', () => {
    const actors = {
      player: actor('player'),
      actor_contact: actor('actor_contact'),
      actor_other: actor('actor_other')
    };
    const projected = reconcileActorRelationshipProfiles(
      actors,
      {
        thread_contact: thread(),
        thread_other: thread({
          threadId: 'thread_other',
          relatedActorIds: ['player', 'actor_other'],
          primaryActorId: 'actor_other',
          summary: '另一条不应在本次重写的关系。'
        })
      },
      'player',
      { threadIds: ['thread_contact'] }
    );

    expect(projected.actor_contact.relationshipSummary).toBe('双方已经形成稳定而明确的长期关系。');
    expect(projected.actor_other.relationshipSummary).toBe('旧关系摘要');
  });

  it('reconciles the actor portrait in the same foreground transaction as a relationship update', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_contact = actor('actor_contact');
    state.relationshipThreads.thread_contact = thread({
      summary: '更新前的关系摘要。',
      intimacySummary: '更新前仍有距离。',
      trustSummary: '更新前保持有限信任。'
    });
    const response = validateNarratorResponse({
      narrativeText: '两人把长期承诺说清，并确认以后会互相照应。',
      turnSummary: '双方确认了会持续履行的互助承诺。',
      writeback: {
        relationshipThreadPatches: [
          {
            threadId: 'thread_contact',
            summary: '双方已经确认长期互助关系。',
            intimacySummary: '关系亲近，愿意坦白现实顾虑。',
            trustSummary: '经过核实后形成稳定信任。',
            promiseSummary: '双方答应在遇到风险时互相通知。'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);

    expect(next.relationshipThreads.thread_contact.summary).toBe('双方已经确认长期互助关系。');
    expect(next.actors.actor_contact).toMatchObject({
      relationshipSummary: '双方已经确认长期互助关系。',
      attitudeTowardPlayer: '关系亲近，愿意坦白现实顾虑。',
      trustTendency: '经过核实后形成稳定信任。'
    });
    expect(next.actors.actor_contact.entanglementSummary).toContain('承诺：双方答应在遇到风险时互相通知。');
  });

  it('does not rewrite a portrait when no relationship thread was applied this turn', () => {
    const state = createInitialRuntimeState();
    state.actors.actor_contact = actor('actor_contact', { relationshipSummary: '人物档案当前摘要。' });
    state.relationshipThreads.thread_contact = thread({ summary: '未在本回合触及的关系线摘要。' });
    const response = validateNarratorResponse({
      narrativeText: '玩家处理了与该人物无关的普通事务。',
      turnSummary: '玩家完成了一项无关的普通事务。',
      writeback: {}
    });

    const next = applyNarratorResponse(state, response);

    expect(next.actors.actor_contact.relationshipSummary).toBe('人物档案当前摘要。');
  });
});

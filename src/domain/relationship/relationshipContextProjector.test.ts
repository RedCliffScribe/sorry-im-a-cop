import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, RelationshipThread, RuntimeState } from '../runtime/types';
import { projectRelationshipContext } from './relationshipContextProjector';

const baseTime = { year: 1988, month: 9, day: 12, hour: 21, minute: 15 };

function addActor(state: RuntimeState, actorId: string, name: string, presence: Actor['presence'] = 'absent'): void {
  state.actors[actorId] = {
    ...state.actors.player,
    actorId,
    name,
    gender: 'male',
    presence
  };
}

function thread(overrides: Partial<RelationshipThread> = {}): RelationshipThread {
  return {
    threadId: 'rel_lam',
    kind: 'network',
    title: '林长旺这条线',
    summary: '湾仔警署值日警长，和玩家保持工作照应。',
    relatedActorIds: ['npc_lam'],
    primaryActorId: 'npc_lam',
    relationshipRole: '上级',
    status: 'active',
    currentPull: '最近会关照玩家的巡逻表现。',
    nextNaturalBeatHint: '值日室可能有一次短谈。',
    milestones: [
      {
        milestoneId: 'ms_lam_intro',
        gameTime: baseTime,
        summary: '林长旺第一次提醒玩家别急着表现。',
        importance: 45,
        relatedActorIds: ['npc_lam'],
        visibility: 'player_known'
      }
    ],
    visibility: 'player_known',
    importance: 60,
    createdAt: baseTime,
    updatedAt: baseTime,
    ...overrides
  };
}

describe('relationship context projector', () => {
  it('projects relationship threads related to present actors', () => {
    const state = createInitialRuntimeState();
    addActor(state, 'npc_lam', '林长旺', 'present');
    state.relationshipThreads.rel_lam = thread();

    const projection = projectRelationshipContext(state);

    expect(projection.threads.map((item) => item.threadId)).toEqual(['rel_lam']);
    expect(projection.threads[0]?.reasons).toContain('active_actor');
  });

  it('omits hidden relationship threads from prompt projection and heartbeat candidates', () => {
    const state = createInitialRuntimeState();
    addActor(state, 'npc_lam', '林长旺');
    state.relationshipThreads.rel_hidden = thread({
      threadId: 'rel_hidden',
      visibility: 'hidden',
      title: '隐藏线'
    });

    const projection = projectRelationshipContext(state);

    expect(projection.threads).toEqual([]);
    expect(projection.heartbeatCandidates).toEqual([]);
    expect(projection.diagnostics.omittedHiddenCount).toBe(1);
  });

  it('limits projected threads but keeps deterministic priority order', () => {
    const state = createInitialRuntimeState();
    for (let index = 0; index < 7; index += 1) {
      const actorId = `npc_${index}`;
      addActor(state, actorId, `角色${index}`);
      state.relationshipThreads[`rel_${index}`] = thread({
        threadId: `rel_${index}`,
        title: `关系${index}`,
        relatedActorIds: [actorId],
        primaryActorId: actorId,
        importance: 80 - index
      });
    }

    const projection = projectRelationshipContext(state, { maxThreads: 3 });

    expect(projection.threads.map((item) => item.threadId)).toEqual(['rel_0', 'rel_1', 'rel_2']);
    expect(projection.diagnostics.projectedThreadCount).toBe(3);
  });

  it('reports missing actor references without dropping the thread', () => {
    const state = createInitialRuntimeState();
    state.relationshipThreads.rel_missing = thread({
      threadId: 'rel_missing',
      relatedActorIds: ['npc_missing'],
      primaryActorId: 'npc_missing',
      importance: 80
    });

    const projection = projectRelationshipContext(state);

    expect(projection.threads[0]?.threadId).toBe('rel_missing');
    expect(projection.diagnostics.missingActorRefs).toEqual(['rel_missing:npc_missing']);
  });

  it('builds remote heartbeat candidates for offscreen active pulls', () => {
    const state = createInitialRuntimeState();
    addActor(state, 'npc_may', 'May');
    state.relationshipThreads.rel_may = thread({
      threadId: 'rel_may',
      kind: 'fate',
      title: 'May',
      relatedActorIds: ['npc_may'],
      primaryActorId: 'npc_may',
      relationshipRole: '暧昧对象',
      promiseSummary: 'May 记得玩家说过下班后会回电话。',
      currentPull: undefined,
      nextNaturalBeatHint: undefined,
      importance: 75
    });

    const projection = projectRelationshipContext(state);

    expect(projection.heartbeatCandidates).toHaveLength(1);
    expect(projection.heartbeatCandidates[0]).toMatchObject({
      threadId: 'rel_may',
      kind: 'fate',
      beatType: 'obligation'
    });
  });
});

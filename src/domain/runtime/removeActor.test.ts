import { describe, expect, it } from 'vitest';
import { createActorDefaults } from './actorFactory';
import { createInitialRuntimeState } from './initialState';
import { removeActorFromRuntimeState } from './removeActor';

const targetActorId = 'npc_remove_target';
const keeperActorId = 'npc_remove_keeper';

describe('removeActorFromRuntimeState', () => {
  it('removes an NPC and clears active runtime references without rewriting history', () => {
    const state = createInitialRuntimeState();
    state.actors[targetActorId] = createActorDefaults({
      actorId: targetActorId,
      name: '待删除人物',
      currentIdentity: 'civilian',
      publicIdentity: '普通市民',
      presence: 'present',
      visibility: 'player_known',
      importance: 60,
      interactionScore: 10
    });
    state.actors[keeperActorId] = createActorDefaults({
      actorId: keeperActorId,
      name: '保留人物',
      currentIdentity: 'civilian',
      publicIdentity: '普通市民',
      presence: 'present',
      visibility: 'player_known',
      importance: 60,
      interactionScore: 10
    });

    const sceneId = state.location.currentSceneId!;
    state.scenes[sceneId].presentActorIds = [state.player.actorId, targetActorId, keeperActorId];
    state.pendingActorWritebackRecoveries = [
      {
        recoveryId: 'recovery_remove_target',
        sourceTurnId: 'turn_1',
        sourceGameTime: state.time,
        actorId: targetActorId,
        writebackJson: '{}',
        attemptCount: 1
      }
    ];
    state.lawIdentity.supervisorActorIds = [targetActorId, keeperActorId];
    state.policePanel.relatedActorIds = [targetActorId, keeperActorId];
    state.relationshipThreads.thread_remove_target = {
      threadId: 'thread_remove_target',
      kind: 'network',
      title: '人物关系',
      summary: '一条仍需保留的关系线。',
      relatedActorIds: [targetActorId, keeperActorId],
      primaryActorId: targetActorId,
      relationshipRole: '相识',
      status: 'active',
      milestones: [
        {
          milestoneId: 'milestone_1',
          gameTime: state.time,
          summary: '曾经共同在场。',
          importance: 50,
          relatedActorIds: [targetActorId, keeperActorId],
          visibility: 'player_known'
        }
      ],
      visibility: 'player_known',
      importance: 50,
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.currentMatters.matter_remove_target = {
      id: 'matter_remove_target',
      title: '当前事项',
      summary: '运行态事项。',
      status: 'active',
      priority: 50,
      visibility: 'known',
      source: 'test',
      relatedActorIds: [targetActorId, keeperActorId],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.dynamicEvents.signals.signal_remove_target = {
      id: 'signal_remove_target',
      title: '风声',
      summary: '运行态风声。',
      signalType: 'street',
      reliability: 'medium',
      status: 'active',
      visibility: 'known',
      relatedActorIds: [targetActorId, keeperActorId],
      relatedPlaceIds: [],
      relatedCaseIds: [],
      relatedOrganizationIds: [],
      createdAt: state.time,
      updatedAt: state.time
    };
    state.citySituationTracks.track_remove_target = {
      trackId: 'track_remove_target',
      title: '城市局势',
      trackType: 'triad_expansion',
      status: 'active',
      pressureLevel: 1,
      visibility: 'player_known',
      startedAt: state.time,
      relatedOrganizationIds: [],
      relatedPowerFigureIds: [],
      relatedPlaceIds: [],
      relatedActorIds: [targetActorId, keeperActorId],
      summary: '仍在演化的局势。',
      currentBeat: '当前进展。',
      possibleDevelopments: []
    };
    state.memories.memory_remove_target = {
      memoryId: 'memory_remove_target',
      text: '历史记忆仍然保留被删除人物的名字和经历。',
      kind: 'actor',
      relatedActorIds: [targetActorId],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: state.time,
      importance: 60,
      visibility: 'player_known',
      certainty: 'fact'
    };

    const memoriesBefore = state.memories;
    const storyLogBefore = state.storyLog;
    const newsIssuesBefore = state.dynamicEvents.newsIssues;
    const next = removeActorFromRuntimeState(state, targetActorId);

    expect(next.actors[targetActorId]).toBeUndefined();
    expect(next.actors[keeperActorId]).toBeDefined();
    expect(next.scenes[sceneId].presentActorIds).toEqual([state.player.actorId, keeperActorId]);
    expect(next.pendingActorWritebackRecoveries).toEqual([]);
    expect(next.lawIdentity.supervisorActorIds).toEqual([keeperActorId]);
    expect(next.policePanel.relatedActorIds).toEqual([keeperActorId]);
    expect(next.relationshipThreads.thread_remove_target.relatedActorIds).toEqual([keeperActorId]);
    expect(next.relationshipThreads.thread_remove_target.primaryActorId).toBe(keeperActorId);
    expect(next.relationshipThreads.thread_remove_target.milestones[0].relatedActorIds).toEqual([
      keeperActorId
    ]);
    expect(next.dynamicEvents.currentMatters.matter_remove_target.relatedActorIds).toEqual([
      keeperActorId
    ]);
    expect(next.dynamicEvents.signals.signal_remove_target.relatedActorIds).toEqual([keeperActorId]);
    expect(next.citySituationTracks.track_remove_target.relatedActorIds).toEqual([keeperActorId]);
    expect(next.memories).toBe(memoriesBefore);
    expect(next.storyLog).toBe(storyLogBefore);
    expect(next.dynamicEvents.newsIssues).toBe(newsIssuesBefore);
  });

  it('does not delete the player or mutate state for an unknown actor id', () => {
    const state = createInitialRuntimeState();

    expect(removeActorFromRuntimeState(state, state.player.actorId)).toBe(state);
    expect(removeActorFromRuntimeState(state, 'npc_missing')).toBe(state);
  });
});

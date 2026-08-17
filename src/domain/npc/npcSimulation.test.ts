import { describe, expect, it } from 'vitest';
import type { NarratorClient } from '../narrator/NarratorClient';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { MemoryItem } from '../runtime/types';
import { selectContext } from '../context/selectContext';
import {
  formatNpcSimulationPackageForPrompt,
  runNpcSimulation,
  selectNpcSimulationMemoryProjection
} from './npcSimulation';

class FakeNpcSimulationClient implements NarratorClient {
  prompt = '';

  async complete(prompt: string): Promise<unknown> {
    this.prompt = prompt;
    return {
      presentReactions: [
        {
          actorId: 'npc_sergeant_chan',
          actorName: '陈强',
          hint: '先压住话题，提醒玩家别在柜台讲线人。',
          basis: ['值日警长', '谨慎'],
          confidence: 0.8
        }
      ],
      remotePresence: [
        {
          actorId: 'npc_ah_ling',
          actorName: '阿玲',
          hint: '可能通过传呼台留下口信。',
          basis: ['未回电话'],
          confidence: 0.7
        }
      ],
      notes: ['只作为未裁定建议。']
    };
  }
}

class BrokenNpcSimulationClient implements NarratorClient {
  async complete(): Promise<unknown> {
    throw new Error('npc api down');
  }
}

describe('npc simulation auxiliary API', () => {
  it('builds a compact package from an auxiliary NPC simulation client', async () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '问问柜台是谁找我');
    const client = new FakeNpcSimulationClient();

    const result = await runNpcSimulation({
      context,
      playerInput: '问问柜台是谁找我',
      client,
      promptSettings: { overrides: { 'npc.simulation': 'CUSTOM_NPC_SIMULATION_RULES' } }
    });

    expect(client.prompt).toContain('CUSTOM_NPC_SIMULATION_RULES');
    expect(client.prompt).toContain('NPC_SIMULATION_TASK');
    expect(client.prompt).toContain('PRESENT_ACTOR_REACTION_PROJECTION');
    expect(client.prompt).toContain('NPC_SIMULATION_MEMORY_PACKET');
    expect(result.package?.presentReactions[0]).toMatchObject({
      actorId: 'npc_sergeant_chan',
      actorName: '陈强'
    });
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['npcSimulation'],
        code: 'npc_simulation_api_applied'
      })
    );
  });

  it('skips the auxiliary call and reports no diagnostics when no client is configured', async () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '继续巡逻');

    const result = await runNpcSimulation({ context, playerInput: '继续巡逻', client: null });

    expect(result.package).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps only NPC advice allowed by the foreground contract', async () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '继续处理眼前人物');
    const client = new FakeNpcSimulationClient();

    const result = await runNpcSimulation({
      context,
      playerInput: '继续处理眼前人物',
      client,
      foregroundContract: {
        planId: 'drama_plan_turn_0',
        mode: 'continue_existing',
        origin: 'main_two_pass',
        selectedSourceRefs: [],
        evidenceSourceRefs: [],
        mandatorySourceRefs: [],
        allowedActorIds: ['npc_sergeant_chan'],
        allowedOrganizationIds: [],
        allowedPlaceIds: [state.location.currentPlaceId],
        allowedCaseIds: [],
        allowedMatterIds: [],
        allowedRelationshipThreadIds: [],
        allowedCityTrackIds: [],
        maxForegroundArcs: 1,
        maxNewActors: 0,
        maxNewDurableThreads: 1
      }
    });

    expect(result.package?.presentReactions).toHaveLength(1);
    expect(result.package?.remotePresence).toEqual([]);
    expect(client.prompt).toContain('本回合前台契约');
    expect(client.prompt).toContain('presentReactions 最多返回 1 名');
  });

  it('keeps the turn on fallback prompt simulation when the auxiliary API fails', async () => {
    const state = createInitialRuntimeState();
    const context = selectContext(state, '继续巡逻');

    const result = await runNpcSimulation({ context, playerInput: '继续巡逻', client: new BrokenNpcSimulationClient() });

    expect(result.package).toBeUndefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        path: ['npcSimulation'],
        code: 'npc_simulation_api_failed',
        message: 'npc api down'
      })
    );
  });

  it('formats auxiliary suggestions for the main narrator prompt', () => {
    const text = formatNpcSimulationPackageForPrompt({
      presentReactions: [
        {
          actorId: 'npc_sergeant_chan',
          actorName: '陈强',
          hint: '提醒玩家别在柜台讲线人。',
          basis: ['谨慎', '值日警长'],
          confidence: 0.8
        }
      ],
      remotePresence: [],
      notes: ['未裁定建议']
    });

    expect(text).toContain('AUX_NPC_SIMULATION_PACKAGE');
    expect(text).toContain('npc_sergeant_chan');
    expect(text).toContain('提醒玩家别在柜台讲线人');
    expect(text).toContain('未裁定建议');
    expect(text).toContain('不是必须逐项执行的任务清单');
    expect(text).toContain('remotePresence 中的人物可以继续留在远场且不出现在正文');
  });

  it('feeds simulation only a quota-bounded subset of the main narrator NPC memory IDs', () => {
    const state = createInitialRuntimeState();
    const sceneId = state.location.currentSceneId!;
    const actorId = 'npc_simulation_memory_actor';
    state.actors[actorId] = createActorDefaults({
      actorId,
      name: '模拟记忆人物',
      currentIdentity: 'civilian',
      currentPlaceId: state.location.currentPlaceId,
      currentSceneId: sceneId,
      presence: 'present',
      importance: 90,
      visibility: 'player_known'
    });
    state.scenes[sceneId].presentActorIds = [state.player.actorId, actorId];
    const addMemories = (tier: MemoryItem['tier'], count: number) => {
      for (let index = 1; index <= count; index += 1) {
        const memoryId = `${tier}_${index}`;
        state.memories[memoryId] = {
          memoryId,
          text: `${tier} 旧事 memory ${index}`,
          kind: 'actor',
          tier,
          relatedActorIds: [actorId],
          relatedCaseIds: [],
          relatedPlaceIds: [],
          relatedOrganizationIds: [],
          gameTime: { ...state.time, minute: index },
          importance: index,
          visibility: 'player_known',
          certainty: 'fact'
        };
      }
    };
    addMemories('short_term', 6);
    addMemories('mid_term', 4);
    addMemories('long_term', 2);

    const context = selectContext(state, 'memory 模拟记忆人物');
    const projection = selectNpcSimulationMemoryProjection(context);

    expect(context.npcMemoryProjection.entries).toHaveLength(12);
    expect(projection.entries).toHaveLength(8);
    expect(projection.diagnostics.tierCounts).toEqual({ short_term: 4, mid_term: 3, long_term: 1 });
    expect(
      projection.diagnostics.selectedMemoryIds.every((memoryId) =>
        context.npcMemoryProjection.diagnostics.selectedMemoryIds.includes(memoryId)
      )
    ).toBe(true);
  });
});

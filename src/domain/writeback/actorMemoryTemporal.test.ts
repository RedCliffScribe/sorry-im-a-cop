import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyNarratorResponse } from './applyWriteback';
import { validateNarratorResponse } from './validateWriteback';

describe('actor memory temporal writeback', () => {
  it('stores absolute appointment dates and synchronizes the actor memory cache', () => {
    const state = createInitialRuntimeState({
      startTime: { year: 1988, month: 12, day: 1, hour: 23, minute: 55 }
    });
    state.actors.npc_appointment = {
      ...state.actors.player,
      actorId: 'npc_appointment',
      name: '阿玲',
      presence: 'absent',
      recentInteractionMemory: ''
    };
    const response = validateNarratorResponse({
      narrativeText: '阿玲答应在后天上午见面。',
      turnSummary: '玩家与阿玲约定后天上午见面。',
      timePatch: {
        targetTime: { year: 1988, month: 12, day: 2, hour: 0, minute: 5 },
        reason: '谈话跨过午夜。'
      },
      writeback: {
        actorMemories: [
          {
            actorId: 'npc_appointment',
            text: '玩家约我后天上午在茶餐厅见面。',
            visibility: 'player_known'
          }
        ]
      }
    });

    const next = applyNarratorResponse(state, response);
    const memory = Object.values(next.memories).find(
      (item) => item.kind === 'actor' && item.relatedActorIds.includes('npc_appointment')
    );

    expect(memory?.gameTime).toEqual({ year: 1988, month: 12, day: 2, hour: 0, minute: 5 });
    expect(memory?.text).toBe('玩家约我1988年12月3日上午在茶餐厅见面。');
    expect(memory?.temporalReferences?.[0]).toMatchObject({
      sourcePhrase: '后天上午',
      resolvedStart: { year: 1988, month: 12, day: 3, hour: 9, minute: 0 }
    });
    expect(next.actors.npc_appointment.recentInteractionMemory).toBe(memory?.text);
  });
});

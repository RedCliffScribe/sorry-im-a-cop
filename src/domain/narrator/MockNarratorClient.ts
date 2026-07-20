import type { NarratorClient, NarratorStreamOptions } from './NarratorClient';

export class MockNarratorClient implements NarratorClient {
  async complete(prompt: string, options?: NarratorStreamOptions): Promise<unknown> {
    const exactSection = prompt.split('## 玩家输入').at(-1)?.trim();
    const fallbackSection = prompt.split(/\n\n## /).at(-1)?.split('\n').slice(1).join('\n').trim();
    const playerInput = exactSection && exactSection !== prompt.trim() ? exactSection : fallbackSection || '你停了一下。';
    const narrativeText = `报案室的电话线里传来一点杂音。你刚才的动作是：${playerInput}`;
    options?.onTextDelta?.(narrativeText);

    const response = {
      narrativeText,
      turnSummary: `玩家在旺角警署报案室完成行动：${playerInput}`,
      suggestedActions: ['追问来电人的位置', '先记录时间和对方语气', '叫值班长一起听'],
      timePatch: {
        elapsedMinutes: 3,
        reason: '接起电话并听清对方开场'
      },
      writeback: {
        memories: [
          {
            text: `玩家在旺角警署报案室采取行动：${playerInput}`,
            kind: 'turn',
            importance: 35,
            visibility: 'player_known',
            certainty: 'fact'
          }
        ],
        actorMemories: [
          {
            actorId: 'player',
            text: `玩家行动：${playerInput}`,
            importance: 25,
            visibility: 'player_known'
          }
        ],
        traitProgress: [],
        traitGains: []
      }
    };
    options?.onRawText?.(JSON.stringify(response));
    return response;
  }
}

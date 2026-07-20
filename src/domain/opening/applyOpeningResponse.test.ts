import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { applyOpeningNarratorResponse } from './applyOpeningResponse';
import { validateOpeningNarratorResponse } from './openingSchema';

describe('applyOpeningNarratorResponse identity boundaries', () => {
  it('ignores police numbers on a civilian opening and persists only structured secret facts', () => {
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'nightlife_staff',
      playerName: '陈启明'
    });
    const response = validateOpeningNarratorResponse({
      narrativeText: '【旁白】夜场刚刚开门，玩家仍在整理吧台。',
      suggestedActions: ['先把当值工作做完'],
      playerPatch: {
        policeNumber: '9527',
        clothing: '旧白衬衫、黑长裤和防滑皮鞋。',
        equipment: ['零钱包', '圆珠笔', '火柴盒']
      },
      secretFacts: [
        {
          secretId: 'secret_player_family_debt',
          ownerType: 'player',
          ownerId: 'player',
          kind: 'risk',
          summary: '主角知道家中尚有一笔不能公开的债务。',
          playerCharacterKnown: true,
          publicKnown: false,
          knownByActorIds: ['player'],
          revealState: 'known_to_player_character',
          revealConditions: ['主角主动谈及家中债务。'],
          visibility: 'player_known',
          importance: 75
        }
      ]
    });

    const next = applyOpeningNarratorResponse(state, response);

    expect(next.player.currentIdentity).toBe('civilian');
    expect(next.player.policeNumber).toBeUndefined();
    expect(next.actors.player.policeNumber).toBeUndefined();
    expect(next.secretFacts.secret_player_family_debt).toMatchObject({
      ownerId: 'player',
      knownByActorIds: ['player'],
      revealState: 'known_to_player_character'
    });
    expect(next.secretFacts.secret_player_family_debt?.createdAt).toEqual(state.time);
    expect(next.secretFacts.secret_player_family_debt?.updatedAt).toEqual(state.time);
  });
});

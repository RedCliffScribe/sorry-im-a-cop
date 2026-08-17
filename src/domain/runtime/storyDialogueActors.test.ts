import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from './initialState';
import {
  createStoryDialogueSpeakerActorIds,
  deriveHistoricalActorIdAliases,
  resolveStoryDialogueActorId
} from './storyDialogueActors';

describe('story dialogue actor identity', () => {
  it('freezes a unique display label to the stable actor id', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.callName = '阿强';
    const text = `【旁白】门开了。\n【阿强】进来吧。`;
    expect(createStoryDialogueSpeakerActorIds(text, state.actors)).toEqual({ 阿强: actor.actorId });
  });

  it('uses englishName and aliases through the same conservative resolver', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.englishName = 'May Chow';
    actor.aliases = ['阿May'];
    expect(
      createStoryDialogueSpeakerActorIds('【May Chow】Wait.\n【阿May】等等。', state.actors)
    ).toEqual({ 'May Chow': actor.actorId, 阿May: actor.actorId });
  });

  it('does not treat player inner monologue as a dialogue speaker label', () => {
    const state = createInitialRuntimeState();
    expect(
      createStoryDialogueSpeakerActorIds('【旁白】门开了。\n【内心】先别出声。', state.actors)
    ).toBeUndefined();
  });

  it('does not guess when a legacy label matches more than one actor', () => {
    const state = createInitialRuntimeState();
    const first = Object.values(state.actors)[0];
    const second = { ...first, actorId: 'npc_same_name', aliases: ['阿强'] };
    state.actors[second.actorId] = second;
    first.aliases = ['阿强'];
    expect(resolveStoryDialogueActorId({
      turnId: 'turn_legacy',
      speaker: 'narrator',
      text: '【阿强】喂。',
      gameTime: state.time
    }, '阿强', state.actors)).toBeUndefined();
  });

  it('keeps using the frozen id after the actor display name changes', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    const entry = {
      turnId: 'turn_1',
      speaker: 'narrator' as const,
      text: `【${actor.name}】收到。`,
      gameTime: state.time,
      dialogueSpeakerActorIds: { [actor.name]: actor.actorId }
    };
    actor.name = '新名字';
    expect(resolveStoryDialogueActorId(entry, Object.keys(entry.dialogueSpeakerActorIds)[0], state.actors)).toBe(actor.actorId);
  });

  it('resolves a unique actor when the dialogue label adds a known police unit prefix', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '何文展';

    expect(createStoryDialogueSpeakerActorIds('【PTU何文展】收到。', state.actors)).toEqual({
      PTU何文展: actor.actorId
    });
  });

  it('does not strip a role prefix into an ambiguous actor name', () => {
    const state = createInitialRuntimeState();
    const first = Object.values(state.actors)[0];
    first.name = '何文展';
    state.actors.npc_other_ho = {
      ...first,
      actorId: 'npc_other_ho',
      aliases: [],
      callName: undefined
    };

    expect(resolveStoryDialogueActorId({
      turnId: 'turn_ambiguous_role_prefix',
      speaker: 'narrator',
      text: '【PTU何文展】收到。',
      gameTime: state.time
    }, 'PTU何文展', state.actors)).toBeUndefined();
  });

  it('remaps a frozen legacy actor id only through an authoritative alias', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    const entry = {
      turnId: 'turn_alias',
      speaker: 'narrator' as const,
      text: '【何文展】收到。',
      gameTime: state.time,
      dialogueSpeakerActorIds: { 何文展: 'npc_temporary_ho' }
    };

    expect(resolveStoryDialogueActorId(
      entry,
      '何文展',
      state.actors,
      { npc_temporary_ho: actor.actorId }
    )).toBe(actor.actorId);
  });

  it('recovers one legacy actor alias from unique frozen dialogue evidence', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '何文展';
    const entry = {
      turnId: 'turn_legacy_alias',
      speaker: 'narrator' as const,
      text: '【PTU何文展】收到。',
      gameTime: state.time,
      dialogueSpeakerActorIds: { PTU何文展: 'npc_old_ho' }
    };

    expect(deriveHistoricalActorIdAliases([entry], state.actors)).toEqual({
      npc_old_ho: actor.actorId
    });
  });

  it('does not infer a historical alias from conflicting frozen dialogue evidence', () => {
    const state = createInitialRuntimeState();
    const first = Object.values(state.actors)[0];
    first.name = '何文展';
    state.actors.npc_zhu = {
      ...first,
      actorId: 'npc_zhu',
      name: '朱华标',
      aliases: [],
      callName: undefined
    };
    const base = {
      speaker: 'narrator' as const,
      gameTime: state.time
    };

    expect(deriveHistoricalActorIdAliases([{
      ...base,
      turnId: 'turn_old_1',
      text: '【何文展】收到。',
      dialogueSpeakerActorIds: { 何文展: 'npc_old' }
    }, {
      ...base,
      turnId: 'turn_old_2',
      text: '【朱华标】收到。',
      dialogueSpeakerActorIds: { 朱华标: 'npc_old' }
    }], state.actors)).toBeUndefined();
  });
});

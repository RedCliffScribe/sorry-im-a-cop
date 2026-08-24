import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from './initialState';
import {
  applyPresentationHints,
  buildStoryBlocks,
  getStoryBlocks,
  parseStoryTextToBlocks,
  storyPresentationHintsSchema
} from './storyBlocks';

describe('story blocks', () => {
  it('characterizes tagged narration, dialogue, unknown labels, and plain lines', () => {
    expect(
      parseStoryTextToBlocks(
        '【旁白】雨还在下。\n\n【陈Sir】 收队。\n没有标签的一行。\n【广播】警方呼吁市民留意。'
      )
    ).toEqual([
      { type: 'narration', text: '雨还在下。', sourceStyle: 'tagged' },
      { type: 'dialogue', speakerLabel: '陈Sir', text: '收队。' },
      { type: 'narration', text: '没有标签的一行。', sourceStyle: 'plain' },
      { type: 'dialogue', speakerLabel: '广播', text: '警方呼吁市民留意。' }
    ]);
  });

  it('preserves the old empty-tag fallback and empty-text behavior', () => {
    expect(parseStoryTextToBlocks('【旁白】')).toEqual([
      { type: 'narration', text: '【旁白】', sourceStyle: 'tagged' }
    ]);
    expect(parseStoryTextToBlocks(' \n ')).toEqual([
      { type: 'narration', text: ' \n ', sourceStyle: 'plain' }
    ]);
  });

  it('treats inner monologue as player thinking without expanding NPC syntax', () => {
    expect(buildStoryBlocks('【内心】这个证人隐瞒了什么。', { playerActorId: 'player' })).toEqual([
      {
        type: 'inner_monologue',
        text: '这个证人隐瞒了什么。',
        actorId: 'player',
        emotion: 'thinking'
      }
    ]);
  });

  it('aligns emotion hints by block kind order rather than overall block index', () => {
    const parsed = parseStoryTextToBlocks(
      '【旁白】门开了。\n【阿强】进来。\n【内心】他在试探我。\n【阿May】先坐。\n【内心】不能急。'
    );
    expect(
      applyPresentationHints(parsed, {
        dialogueEmotions: ['serious', 'worried'],
        innerMonologueEmotions: ['secretive', 'afraid']
      })
    ).toEqual([
      { type: 'narration', text: '门开了。', sourceStyle: 'tagged' },
      { type: 'dialogue', speakerLabel: '阿强', text: '进来。', emotion: 'serious' },
      { type: 'inner_monologue', text: '他在试探我。', emotion: 'secretive' },
      { type: 'dialogue', speakerLabel: '阿May', text: '先坐。', emotion: 'worried' },
      { type: 'inner_monologue', text: '不能急。', emotion: 'afraid' }
    ]);
  });

  it('fails soft for missing, extra, and unknown emotion hints', () => {
    const parsed = parseStoryTextToBlocks('【甲】一。\n【乙】二。');
    expect(
      applyPresentationHints(parsed, { dialogueEmotions: ['furious', 'happy', 'sad'] })
    ).toEqual([
      { type: 'dialogue', speakerLabel: '甲', text: '一。', emotion: 'neutral' },
      { type: 'dialogue', speakerLabel: '乙', text: '二。', emotion: 'happy' }
    ]);
    expect(applyPresentationHints(parsed, { dialogueEmotions: ['serious'] })[1]).toMatchObject({
      emotion: 'neutral'
    });
    expect(storyPresentationHintsSchema.parse('invalid')).toBeUndefined();
  });

  it('attaches only the frozen actor mapping supplied by the existing resolver chain', () => {
    expect(
      buildStoryBlocks('【阿强】收到。\n【同名者】等等。', {
        dialogueSpeakerActorIds: { 阿强: 'npc_ah_keung' }
      })
    ).toEqual([
      {
        type: 'dialogue',
        speakerLabel: '阿强',
        speakerActorId: 'npc_ah_keung',
        text: '收到。',
        emotion: 'neutral'
      },
      {
        type: 'dialogue',
        speakerLabel: '同名者',
        text: '等等。',
        emotion: 'neutral'
      }
    ]);
  });

  it('preserves a display label while accepting the existing trimmed frozen-map key', () => {
    expect(
      buildStoryBlocks('【 阿强 】收到。', {
        dialogueSpeakerActorIds: { 阿强: 'npc_ah_keung' }
      })[0]
    ).toEqual({
      type: 'dialogue',
      speakerLabel: ' 阿强 ',
      speakerActorId: 'npc_ah_keung',
      text: '收到。',
      emotion: 'neutral'
    });
  });

  it('lazily derives legacy blocks from historical frozen mappings without mutating the entry', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '陈强';
    const historicalLabel = actor.name;
    const entry = {
      turnId: 'turn_legacy',
      speaker: 'narrator' as const,
      text: `【${historicalLabel}】收到。`,
      gameTime: state.time,
      dialogueSpeakerActorIds: { [historicalLabel]: actor.actorId }
    };
    actor.name = '改名后角色';

    expect(getStoryBlocks(entry, { actors: state.actors })).toEqual([
      {
        type: 'dialogue',
        speakerLabel: historicalLabel,
        speakerActorId: actor.actorId,
        text: '收到。',
        emotion: 'neutral'
      }
    ]);
    expect('blocks' in entry).toBe(false);
  });

  it('does not guess a legacy actor when the current label is ambiguous', () => {
    const state = createInitialRuntimeState();
    const first = Object.values(state.actors)[0];
    first.aliases = ['阿强'];
    state.actors.npc_same_alias = { ...first, actorId: 'npc_same_alias', aliases: ['阿强'] };
    const entry = {
      turnId: 'turn_ambiguous',
      speaker: 'narrator' as const,
      text: '【阿强】喂。',
      gameTime: state.time
    };

    expect(getStoryBlocks(entry, { actors: state.actors })[0]).toEqual({
      type: 'dialogue',
      speakerLabel: '阿强',
      text: '喂。',
      emotion: 'neutral'
    });
  });

  it('keeps persisted blocks authoritative when no actor context is available', () => {
    const state = createInitialRuntimeState();
    const blocks = [{
      type: 'dialogue' as const,
      speakerLabel: '历史称呼',
      text: '原话。',
      emotion: 'serious' as const
    }];
    const entry = {
      turnId: 'turn_persisted',
      speaker: 'narrator' as const,
      text: '【历史称呼】原话。',
      gameTime: state.time,
      blocks
    };
    expect(getStoryBlocks(entry)).toBe(blocks);
  });

  it('reconnects a persisted first-encounter dialogue block after the actor profile arrives', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '温碧霞';
    const entry = {
      turnId: 'turn_first_encounter',
      speaker: 'narrator' as const,
      text: '【温碧霞】你终于来了。',
      gameTime: state.time,
      blocks: [{
        type: 'dialogue' as const,
        speakerLabel: '温碧霞',
        text: '你终于来了。',
        emotion: 'happy' as const
      }]
    };

    const resolved = getStoryBlocks(entry, { actors: state.actors });

    expect(resolved).toEqual([{
      ...entry.blocks[0],
      speakerActorId: actor.actorId
    }]);
    expect(entry.blocks[0]).not.toHaveProperty('speakerActorId');
  });

  it('preserves a valid persisted actor id and canonicalizes an obsolete alias', () => {
    const state = createInitialRuntimeState();
    const actor = Object.values(state.actors)[0];
    actor.name = '改名后的角色';
    const validEntry = {
      turnId: 'turn_valid_frozen_actor',
      speaker: 'narrator' as const,
      text: '【旧称】原话。',
      gameTime: state.time,
      blocks: [{
        type: 'dialogue' as const,
        speakerLabel: '旧称',
        speakerActorId: actor.actorId,
        text: '原话。',
        emotion: 'serious' as const
      }]
    };
    expect(getStoryBlocks(validEntry, { actors: state.actors })[0]).toBe(validEntry.blocks[0]);

    const aliasEntry = {
      ...validEntry,
      turnId: 'turn_obsolete_actor_alias',
      blocks: [{ ...validEntry.blocks[0], speakerActorId: 'npc_obsolete' }]
    };
    expect(getStoryBlocks(aliasEntry, {
      actors: state.actors,
      actorIdAliases: { npc_obsolete: actor.actorId }
    })[0]).toMatchObject({ speakerActorId: actor.actorId });
  });
});

import { describe, expect, it } from 'vitest';
import { createEmptyRuntimeCustomContentState } from '../customContent/saveBinding';
import { createActorDefaults } from './actorFactory';
import { createInitialRuntimeState } from './initialState';
import {
  applyManualActorProfileEdit,
  createManualActorProfileDraft,
  filterManuallyLockedActorPatch
} from './manualActorProfile';

function createEditableState() {
  const state = createInitialRuntimeState();
  state.actors.npc_editor = createActorDefaults({
    actorId: 'npc_editor',
    name: '旧姓名',
    aliases: ['阿旧'],
    gender: 'female',
    birthDate: '1960-02-03',
    computedAge: 28,
    currentIdentity: 'civilian',
    publicIdentity: '百货公司职员',
    positionSummary: '普通职员',
    profileSummary: '旧人物简介。',
    personality: '谨慎',
    clothing: '旧衣着',
    relationshipSummary: '普通人脉',
    keyMemories: [{
      memoryId: 'memory_kept',
      text: '玩家曾经帮助过她。',
      gameTime: { ...state.time },
      importance: 60,
      source: 'scene',
      visibility: 'player_known'
    }]
  });
  return state;
}

describe('manual actor profile editing', () => {
  it('normalizes editable values while preserving identity, memories and runtime bindings', () => {
    const state = createEditableState();
    state.customContent = createEmptyRuntimeCustomContentState();
    state.customContent.characterRuntimeBindings = [{
        characterAssetId: 'character_asset_1',
        sourceRevision: 2,
        adaptationId: 'adaptation_1',
        actorId: 'npc_editor'
      }];
    const actor = state.actors.npc_editor;
    const draft = createManualActorProfileDraft(actor);
    draft.name = '  新姓名  ';
    draft.aliases = [' 阿新 ', '', '阿新', '新姐'];
    draft.equipment = [' 手袋 ', '手袋', '钥匙'];
    draft.clothing = '新衣着';

    const next = applyManualActorProfileEdit(state, actor.actorId, draft);
    const edited = next.actors.npc_editor;

    expect(edited.name).toBe('新姓名');
    expect(edited.aliases).toEqual(['阿新', '新姐']);
    expect(edited.equipment).toEqual(['手袋', '钥匙']);
    expect(edited.actorId).toBe(actor.actorId);
    expect(edited.currentIdentity).toBe(actor.currentIdentity);
    expect(edited.roleProfiles).toBe(actor.roleProfiles);
    expect(edited.keyMemories).toBe(actor.keyMemories);
    expect(next.customContent).toBe(state.customContent);
    expect(edited.manualProfileOverride?.lockedFields).toEqual(
      expect.arrayContaining(['name', 'aliases'])
    );
    expect(edited.manualProfileOverride?.lockedFields).not.toContain('clothing');
    expect(state.actors.npc_editor.name).toBe('旧姓名');
  });

  it('rejects invalid or future birth dates and clears stale computed age after a valid change', () => {
    const state = createEditableState();
    const draft = createManualActorProfileDraft(state.actors.npc_editor);
    draft.birthDate = '1988-02-31';
    expect(() => applyManualActorProfileEdit(state, 'npc_editor', draft)).toThrow('出生日期');

    draft.birthDate = '2000-01-01';
    expect(() => applyManualActorProfileEdit(state, 'npc_editor', draft)).toThrow('0–130');

    draft.birthDate = '1961-03-04';
    const next = applyManualActorProfileEdit(state, 'npc_editor', draft);
    expect(next.actors.npc_editor.birthDate).toBe('1961-03-04');
    expect(next.actors.npc_editor.computedAge).toBeUndefined();
    expect(next.actors.npc_editor.manualProfileOverride?.lockedFields).toContain('birthDate');
  });

  it('filters only fields that the player explicitly locked', () => {
    const state = createEditableState();
    const draft = createManualActorProfileDraft(state.actors.npc_editor);
    draft.name = '玩家确认姓名';
    draft.personality = '玩家确认性格';
    const next = applyManualActorProfileEdit(state, 'npc_editor', draft);

    const result = filterManuallyLockedActorPatch(next.actors.npc_editor, {
      actorId: 'npc_editor',
      name: '模型误改姓名',
      personality: '模型误改性格',
      clothing: '剧情中的新外套',
      relationshipSummary: '关系已有新进展'
    });

    expect(result.blockedFields).toEqual(expect.arrayContaining(['name', 'personality']));
    expect(result.patch).not.toHaveProperty('name');
    expect(result.patch).not.toHaveProperty('personality');
    expect(result.patch.clothing).toBe('剧情中的新外套');
    expect(result.patch.relationshipSummary).toBe('关系已有新进展');
  });
});

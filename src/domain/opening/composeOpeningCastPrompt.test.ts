import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { composeOpeningCastPrompt } from './composeOpeningCastPrompt';
import { createOpeningLocalSkeleton } from './openingLocalSkeleton';

describe('opening minimal cast prompt', () => {
  it('asks only for slot content and keeps stable actor IDs under local control', () => {
    const setup = {
      playerName: '陈志明',
      currentIdentity: 'police' as const,
      policePostingId: 'cid_headquarters'
    };
    const initialState = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state: initialState,
      openingSessionId: 'opening_prompt_contract'
    });
    const prompt = composeOpeningCastPrompt(
      { setup, initialState },
      skeleton
    );

    expect(prompt).toContain('opening_prompt_contract');
    expect(prompt).toContain('opening_actor_police_relation_1');
    expect(prompt).toContain('opening_action_1');
    expect(prompt).toContain('绝对不要创建或输出 actorId');
    expect(prompt).toContain(
      'absent/mentioned 可省略地点场景，确知远场地点时才填写'
    );
    expect(prompt).toContain(
      '不得生成完整 roleProfiles、六维、女性扩展档案、装备、记忆'
    );
    expect(prompt).not.toContain('"actorId":');
    expect(prompt).not.toContain('"equipment":');
  });

  it('requires the complete locked dramaPlan contract for a dramatic opening', () => {
    const setup = {
      playerName: '陈志明',
      currentIdentity: 'police' as const,
      policePostingId: 'cid_headquarters',
      dramaticOpeningId: 'first_shift'
    };
    const initialState = createInitialRuntimeState(setup);
    const skeleton = createOpeningLocalSkeleton({
      state: initialState,
      openingSessionId: 'opening_prompt_drama'
    });
    const prompt = composeOpeningCastPrompt({ setup, initialState }, skeleton);

    expect(prompt).toContain('"dramaPlan"');
    expect(prompt).toContain('"planId": "drama_plan_opening_first_shift"');
    expect(prompt).toContain('"planningScope": "opening"');
    expect(prompt).toContain('"supportSources": []');
    expect(prompt).toContain('不得省略，也不得改成普通开局');
  });
});

import { describe, expect, it } from 'vitest';
import { PLAYER_POLICE_SALARY_CASHFLOW_ID } from '../finance/playerSalaryCashflow';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { PlayerIdentityContextPatch } from './playerIdentityContext';
import { applyPlayerIdentityContextPatch } from './playerIdentityContext';

function policeTarget(): PlayerIdentityContextPatch['targetRoleProfile'] {
  return {
    identity: 'police',
    profile: {
      status: 'active',
      agencyId: 'org_hk_police',
      stationOrPost: '旺角警署',
      department: '军装巡逻小队',
      rank: '警员',
      assignmentSummary: '街面巡逻与报案处理。',
      supervisorActorIds: [],
      peerActorIds: [],
      authoritySummary: '拥有当前职级范围内的基层警务权限。',
      accessSummary: '可接触所属小队与当值资料。',
      dutySummary: '按更表执行巡逻和报案处理。',
      institutionalReputation: '新人，评价尚未稳定。',
      disciplinePressureSummary: '受上级链条与纪律约束。'
    }
  };
}

function triadTarget(): PlayerIdentityContextPatch['targetRoleProfile'] {
  return {
    identity: 'gang_member',
    profile: {
      status: 'active',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '庙街外围跑腿',
      rankSummary: '外围新人',
      territorySummary: '庙街与油麻地一带',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '替上线传话、跑腿，按规矩交代。',
      riskSummary: '容易被警方、对头与内部试探夹击。'
    }
  };
}

describe('player identity context', () => {
  it('atomically joins the police and synchronizes route, actor, profile, relation, panel, salary and history', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    state.finance.cashflows.cashflow_civilian_job = {
      itemId: 'cashflow_civilian_job',
      direction: 'income',
      kind: 'salary',
      title: '茶餐厅月薪',
      amount: 1800,
      account: 'bank',
      summary: '在社区茶餐厅工作的固定月薪。',
      activeFromMonth: '1984-12',
      relatedAssetItemIds: [],
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'player_known'
    };
    const result = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_join_police_1',
      kind: 'join',
      fromIdentity: 'civilian',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '4382',
      reason: '完成招募与基础训练后正式入职。',
      targetRoleProfile: policeTarget()
    });

    expect(result.applied).toBe(true);
    expect(result.state.player.currentIdentity).toBe('police');
    expect(result.state.actors.player.currentIdentity).toBe('police');
    expect(result.state.actors.player.publicIdentity).toBe('旺角警署军装巡逻警员');
    expect(result.state.player.policeNumber).toBe('4382');
    expect(result.state.actors.player.policeNumber).toBe('4382');
    expect(result.state.actors.player.roleProfiles.police?.status).toBe('active');
    expect(result.state.actors.player.roleProfiles.civilian?.status).toBe('suspended');
    expect(result.state.actors.player.organizationIds).toEqual(['org_hk_police']);
    expect(result.state.lawIdentity.status).toBe('active');
    expect(result.state.policePanel.unitName).toContain('旺角警署');
    expect(result.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('active');
    expect(result.state.finance.cashflows.cashflow_civilian_job).toMatchObject({
      title: '茶餐厅月薪',
      amount: 1800,
      status: 'active'
    });
    expect(result.state.player.identityHistory).toHaveLength(1);
    expect(result.state.player.identityHistory[0]?.transitionId).toBe('transition_join_police_1');
  });

  it('routes a police undercover operation through the gang identity while retaining the truth as a secret', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const result = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_police_undercover_1',
      kind: 'cover_enter',
      fromIdentity: 'police',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街外围跑腿',
      actualIdentitySummary: '警队派入和胜和的卧底警员。',
      reason: '接受秘密派遣，以外围新人身份进入庙街网络。',
      targetRoleProfile: triadTarget(),
      secretFactPatches: [
        {
          operation: 'upsert',
          fact: {
            secretId: 'secret_player_undercover_police_1',
            ownerType: 'player',
            ownerId: 'player',
            kind: 'identity',
            summary: '玩家实际为警队派入和胜和的卧底。',
            playerCharacterKnown: true,
            publicKnown: false,
            knownByActorIds: ['actor_police_handler'],
            revealState: 'known_to_player_character',
            revealConditions: ['身份主动公开或行动暴露。'],
            visibility: 'player_known',
            importance: 100
          }
        }
      ]
    });

    expect(result.state.player.originIdentity).toBe('police');
    expect(result.state.player.currentIdentity).toBe('gang_member');
    expect(result.state.actors.player.roleProfiles.police?.status).toBe('hidden');
    expect(result.state.actors.player.roleProfiles.triad?.status).toBe('cover');
    expect(result.state.lawIdentity.status).toBe('hidden');
    expect(result.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('paused');
    expect(result.state.secretFacts.secret_player_undercover_police_1?.publicKnown).toBe(false);
    expect(result.state.player.identityHistory[0]?.secretFactIds).toEqual(['secret_player_undercover_police_1']);
  });

  it('routes a gang operative embedded in the police through the police identity', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    const result = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_gang_inside_police_1',
      kind: 'cover_enter',
      fromIdentity: 'gang_member',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '6621',
      actualIdentitySummary: '受和胜和上线指派进入警队的社团成员。',
      reason: '以合法警员身份进入旺角警署。',
      targetRoleProfile: policeTarget(),
      secretFactPatches: [
        {
          operation: 'upsert',
          fact: {
            secretId: 'secret_player_triad_loyalty_1',
            ownerType: 'player',
            ownerId: 'player',
            kind: 'loyalty',
            summary: '玩家真实效忠和胜和上线。',
            playerCharacterKnown: true,
            publicKnown: false,
            knownByActorIds: ['actor_triad_handler'],
            revealState: 'known_to_some_actors',
            revealConditions: ['社团命令被截获或身份暴露。'],
            visibility: 'player_known',
            importance: 100
          }
        }
      ]
    });

    expect(result.state.player.originIdentity).toBe('gang_member');
    expect(result.state.player.currentIdentity).toBe('police');
    expect(result.state.actors.player.roleProfiles.triad?.status).toBe('hidden');
    expect(result.state.actors.player.roleProfiles.police?.status).toBe('cover');
    expect(result.state.player.policeNumber).toBe('6621');
    expect(result.state.actors.player.policeNumber).toBe('6621');
    expect(result.state.lawIdentity.status).toBe('active');
    expect(result.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('active');
  });

  it('is idempotent by transition id and rejects mismatched source identity without partial writes', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    const patch: PlayerIdentityContextPatch = {
      transitionId: 'transition_join_police_once',
      kind: 'join',
      fromIdentity: 'civilian',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '4382',
      reason: '正式入职。',
      targetRoleProfile: policeTarget()
    };
    const first = applyPlayerIdentityContextPatch(state, patch);
    const repeated = applyPlayerIdentityContextPatch(first.state, patch);
    const mismatched = applyPlayerIdentityContextPatch(state, { ...patch, fromIdentity: 'gang_member' });

    expect(repeated.applied).toBe(false);
    expect(repeated.idempotent).toBe(true);
    expect(repeated.state).toBe(first.state);
    expect(mismatched.applied).toBe(false);
    expect(mismatched.diagnostic).toContain('软拒绝');
    expect(mismatched.state).toBe(state);
  });

  it('allocates a stable unique police number when omitted and rejects invalid or non-police numbers', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'civilian' });
    state.actors.existing_officer = {
      ...state.actors.player,
      actorId: 'existing_officer',
      policeNumber: '4382'
    };
    const invalid = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_invalid_police_number',
      kind: 'join',
      fromIdentity: 'civilian',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '82',
      reason: '正式入职。',
      targetRoleProfile: policeTarget()
    });
    const formattedButInvalid = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_formatted_police_number',
      kind: 'join',
      fromIdentity: 'civilian',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '43-82',
      reason: '正式入职。',
      targetRoleProfile: policeTarget()
    });
    const missing = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_missing_police_number',
      kind: 'join',
      fromIdentity: 'civilian',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      reason: '正式入职。',
      targetRoleProfile: policeTarget()
    });
    const wrongTarget = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_civilian_with_police_number',
      kind: 'correction',
      fromIdentity: 'civilian',
      toIdentity: 'civilian',
      publicIdentity: '旺角茶餐厅伙计',
      policeNumber: '4382',
      reason: '修正公开职业。',
      targetRoleProfile: {
        identity: 'civilian',
        profile: state.actors.player.roleProfiles.civilian!
      }
    });

    expect(invalid.applied).toBe(false);
    expect(invalid.state).toBe(state);
    expect(formattedButInvalid.applied).toBe(false);
    expect(formattedButInvalid.state).toBe(state);
    expect(missing.applied).toBe(true);
    expect(missing.state.player.policeNumber).toMatch(/^\d{4}$/);
    expect(missing.state.player.policeNumber).not.toBe('4382');
    expect(missing.state.actors.player.policeNumber).toBe(missing.state.player.policeNumber);
    expect(
      applyPlayerIdentityContextPatch(createInitialRuntimeState({ currentIdentity: 'civilian' }), {
        transitionId: 'transition_missing_police_number',
        kind: 'join',
        fromIdentity: 'civilian',
        toIdentity: 'police',
        publicIdentity: '旺角警署军装巡逻警员',
        reason: '正式入职。',
        targetRoleProfile: policeTarget()
      }).state.player.policeNumber
    ).toBe(missing.state.player.policeNumber);
    expect(wrongTarget.applied).toBe(false);
    expect(wrongTarget.state).toBe(state);
  });
});

import { describe, expect, it } from 'vitest';
import { PLAYER_CIVILIAN_PRIMARY_INCOME_ID } from '../finance/playerCivilianIncomeCashflow';
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
    const state = createInitialRuntimeState({
      currentIdentity: 'civilian',
      civilianProfileId: 'bank_employee'
    });
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
    expect(
      result.state.actors.player.organizationRelations.find((relation) => relation.organizationId === 'org_hsbc')
    ).toMatchObject({ visibility: 'hidden', isPrimary: false });
    expect(
      result.state.actors.player.organizationRelations.find((relation) => relation.organizationId === 'org_hk_police')
    ).toMatchObject({ visibility: 'player_known', isPrimary: true });
    expect(result.state.lawIdentity.status).toBe('active');
    expect(result.state.policePanel.unitName).toContain('旺角警署');
    expect(result.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('active');
    expect(result.state.finance.cashflows[PLAYER_CIVILIAN_PRIMARY_INCOME_ID]).toMatchObject({
      title: '银行职员月薪',
      amount: 3200,
      status: 'paused'
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
    expect(result.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('active');
    expect(result.state.secretFacts.secret_player_undercover_police_1?.publicKnown).toBe(false);
    expect(result.state.player.identityHistory[0]?.secretFactIds).toEqual(['secret_player_undercover_police_1']);
  });

  it('restores a police officer after an undercover assignment and pauses income bound to the gang cover', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'police' });
    const entered = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_police_cover_enter_restore',
      kind: 'cover_enter',
      fromIdentity: 'police',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街外围跑腿',
      actualIdentitySummary: '警队派入和胜和的卧底警员。',
      reason: '进入庙街关系网。',
      targetRoleProfile: triadTarget()
    });
    entered.state.finance.cashflows.cashflow_player_triad_cover_duty = {
      itemId: 'cashflow_player_triad_cover_duty',
      direction: 'income',
      kind: 'other',
      title: '庙街看场月例',
      amount: 1600,
      account: 'cash',
      identityBinding: 'gang_member',
      summary: '卧底公开身份下的固定当值月例。',
      activeFromMonth: '1984-12',
      relatedAssetItemIds: [],
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      source: 'writeback',
      status: 'active',
      visibility: 'private'
    };

    const restored = applyPlayerIdentityContextPatch(entered.state, {
      transitionId: 'transition_police_cover_exit_restore',
      kind: 'cover_exit',
      fromIdentity: 'gang_member',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      reason: '卧底任务完成，归队复职。',
      targetRoleProfile: policeTarget()
    });

    expect(restored.applied).toBe(true);
    expect(restored.state.player.currentIdentity).toBe('police');
    expect(restored.state.actors.player.roleProfiles.police?.status).toBe('active');
    expect(restored.state.actors.player.roleProfiles.triad?.status).toBe('hidden');
    expect(restored.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]).toMatchObject({
      status: 'active',
      identityBinding: 'police'
    });
    expect(restored.state.finance.cashflows.cashflow_player_triad_cover_duty.status).toBe('paused');
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

  it('restores a gang member after a police cover ends and stops the cover salary', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member' });
    state.finance.cashflows.cashflow_player_triad_regular_duty = {
      itemId: 'cashflow_player_triad_regular_duty',
      direction: 'income',
      kind: 'other',
      title: '庙街场务月例',
      amount: 1500,
      account: 'cash',
      identityBinding: 'gang_member',
      summary: '长期场务安排的固定月例。',
      activeFromMonth: '1984-12',
      relatedAssetItemIds: [],
      relatedActorIds: ['player'],
      relatedPlaceIds: [],
      source: 'opening',
      status: 'active',
      visibility: 'private'
    };
    const entered = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_gang_police_cover_enter_restore',
      kind: 'cover_enter',
      fromIdentity: 'gang_member',
      toIdentity: 'police',
      publicIdentity: '旺角警署军装巡逻警员',
      policeNumber: '6621',
      actualIdentitySummary: '受和胜和上线指派进入警队的社团成员。',
      reason: '以合法警员身份进入警署。',
      targetRoleProfile: policeTarget()
    });
    const restored = applyPlayerIdentityContextPatch(entered.state, {
      transitionId: 'transition_gang_police_cover_exit_restore',
      kind: 'cover_exit',
      fromIdentity: 'police',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街外围跑腿',
      reason: '警队掩护任务结束，返回原社团身份。',
      targetRoleProfile: triadTarget()
    });

    expect(restored.applied).toBe(true);
    expect(restored.state.player.currentIdentity).toBe('gang_member');
    expect(restored.state.actors.player.roleProfiles.triad?.status).toBe('active');
    expect(restored.state.actors.player.roleProfiles.police?.status).toBe('hidden');
    expect(restored.state.finance.cashflows.cashflow_player_triad_regular_duty.status).toBe('active');
    expect(restored.state.finance.cashflows[PLAYER_POLICE_SALARY_CASHFLOW_ID]?.status).toBe('paused');
  });

  it('updates a formal triad role through a same-identity correction without changing the public shell', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    state.actors.actor_triad_patron = {
      ...state.actors.player,
      actorId: 'actor_triad_patron',
      name: '阿成',
      currentIdentity: 'gang_member',
      publicIdentity: '地区线联络人'
    };
    const existing = state.actors.player.roleProfiles.triad!;

    const result = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_triad_role_promotion_1',
      kind: 'correction',
      fromIdentity: 'gang_member',
      toIdentity: 'gang_member',
      publicIdentity: `${existing.societyName}庙街地区正式成员`,
      reason: '组织正式确认玩家在地区线的位置。',
      targetRoleProfile: {
        identity: 'gang_member',
        profile: {
          ...existing,
          roleTitle: '庙街地区正式成员',
          rankSummary: '正式成员',
          territorySummary: '庙街与油麻地一带',
          patronActorIds: ['actor_triad_patron']
        }
      }
    });

    expect(result.applied).toBe(true);
    expect(result.state.player.currentIdentity).toBe('gang_member');
    expect(result.state.actors.player.roleProfiles.triad).toMatchObject({
      status: 'active',
      roleTitle: '庙街地区正式成员',
      rankSummary: '正式成员',
      patronActorIds: ['actor_triad_patron']
    });
    expect(result.state.actors.player.roleProfiles.police).toBeUndefined();
  });

  it('preserves established triad relationship ids when a same-identity correction omits them as empty arrays', () => {
    const state = createInitialRuntimeState({ currentIdentity: 'gang_member', playerName: '陈启明' });
    state.actors.player.roleProfiles.triad = {
      ...state.actors.player.roleProfiles.triad!,
      patronActorIds: ['actor_triad_patron'],
      peerActorIds: ['actor_triad_peer'],
      rivalActorIds: ['actor_triad_rival']
    };

    const proposed = triadTarget();
    if (proposed.identity !== 'gang_member') throw new Error('Expected a triad target profile.');
    const result = applyPlayerIdentityContextPatch(state, {
      transitionId: 'transition_triad_same_identity_partial_correction',
      kind: 'correction',
      fromIdentity: 'gang_member',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街地区成员',
      reason: '只修正玩家在地区线中的公开职务。',
      targetRoleProfile: {
        identity: 'gang_member',
        profile: {
          ...proposed.profile,
          roleTitle: '庙街地区成员',
          patronActorIds: [],
          peerActorIds: [],
          rivalActorIds: []
        }
      }
    });

    expect(result.applied).toBe(true);
    expect(result.state.actors.player.roleProfiles.triad).toMatchObject({
      roleTitle: '庙街地区成员',
      patronActorIds: ['actor_triad_patron'],
      peerActorIds: ['actor_triad_peer'],
      rivalActorIds: ['actor_triad_rival']
    });
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

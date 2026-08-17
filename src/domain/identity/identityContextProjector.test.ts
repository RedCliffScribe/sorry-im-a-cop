import { describe, expect, it } from 'vitest';
import { composePrompt } from '../context/composePrompt';
import { selectContext } from '../context/selectContext';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { PlayerIdentityContextPatch } from './playerIdentityContext';
import { applyPlayerIdentityContextPatch } from './playerIdentityContext';

function policeTarget(): PlayerIdentityContextPatch['targetRoleProfile'] {
  return {
    identity: 'police',
    profile: {
      status: 'cover',
      agencyId: 'org_hk_police',
      stationOrPost: '旺角警署',
      department: '军装巡逻',
      rank: '警员',
      assignmentSummary: '街面巡逻与报案处理。',
      supervisorActorIds: [],
      peerActorIds: [],
      authoritySummary: '拥有基层警务权限。',
      accessSummary: '可接触当值资料。',
      dutySummary: '按更表执行巡逻。',
      institutionalReputation: '新人。',
      disciplinePressureSummary: '受纪律约束。'
    }
  };
}

function triadTarget(): PlayerIdentityContextPatch['targetRoleProfile'] {
  return {
    identity: 'gang_member',
    profile: {
      status: 'cover',
      organizationId: 'org_wo_shing_wo',
      societyName: '和胜和',
      roleTitle: '庙街外围跑腿',
      rankSummary: '外围新人',
      territorySummary: '庙街与油麻地一带',
      patronActorIds: [],
      peerActorIds: [],
      rivalActorIds: [],
      obligationSummary: '替上线传话、跑腿。',
      riskSummary: '需要同时应对警方与内部试探。'
    }
  };
}

describe('identity prompt projection', () => {
  it('uses the triad shell for a police undercover route and separates protagonist-known from director-only facts', () => {
    const initial = createInitialRuntimeState({
      currentIdentity: 'police',
      playerName: '陈启明',
      policeNumber: '9527'
    });
    const transitioned = applyPlayerIdentityContextPatch(initial, {
      transitionId: 'transition_police_undercover_prompt',
      kind: 'cover_enter',
      fromIdentity: 'police',
      toIdentity: 'gang_member',
      publicIdentity: '和胜和庙街外围跑腿',
      actualIdentitySummary: '警队派入和胜和的卧底警员。',
      reason: '接受秘密派遣进入庙街关系网。',
      targetRoleProfile: triadTarget(),
      secretFactPatches: [
        {
          operation: 'upsert',
          fact: {
            secretId: 'secret_player_undercover_police_prompt',
            ownerType: 'player',
            ownerId: 'player',
            kind: 'identity',
            summary: '玩家实际为警队派入和胜和的卧底。',
            playerCharacterKnown: true,
            publicKnown: false,
            knownByActorIds: ['actor_police_handler'],
            revealState: 'known_to_some_actors',
            revealConditions: ['主角主动向可靠联络人表明身份。'],
            visibility: 'player_known',
            importance: 100
          }
        }
      ]
    }).state;
    transitioned.secretFacts.secret_director_only_handler_risk = {
      secretId: 'secret_director_only_handler_risk',
      ownerType: 'player',
      ownerId: 'player',
      kind: 'risk',
      summary: '联络人已经被内部调查，但主角尚不知情。',
      playerCharacterKnown: false,
      publicKnown: false,
      knownByActorIds: ['actor_internal_investigator'],
      revealState: 'known_to_some_actors',
      revealConditions: ['调查正式波及联络渠道。'],
      visibility: 'hidden',
      importance: 90,
      createdAt: { ...transitioned.time },
      updatedAt: { ...transitioned.time }
    };

    const context = selectContext(transitioned, '照常去庙街交代事情');
    const prompt = composePrompt(context, '照常去庙街交代事情');
    const playerPacket = context.actorPackets.find((actor) => actor.actorId === 'player');

    expect(context.identityProjection.routeSource).toBe('player.currentIdentity');
    expect(context.identityProjection.currentShell).toMatchObject({
      currentIdentity: 'gang_member',
      publicIdentity: '和胜和庙街外围跑腿',
      publicRoleProfile: { identity: 'gang_member' }
    });
    expect(context.identityProjection.protagonistPrivateKnowledge.actualIdentitySummary).toBe(
      '警队派入和胜和的卧底警员。'
    );
    expect(context.identityProjection.protagonistPrivateKnowledge.facts.map((fact) => fact.secretId)).toContain(
      'secret_player_undercover_police_prompt'
    );
    expect(context.identityProjection.directorOnlyFacts.map((fact) => fact.secretId)).toContain(
      'secret_director_only_handler_risk'
    );
    expect(playerPacket?.actualIdentitySummary).toBeUndefined();
    expect(playerPacket?.roleProfiles.triad?.status).toBe('cover');
    expect(playerPacket?.roleProfiles.police).toBeUndefined();
    expect(playerPacket?.organizationIds).toEqual(['org_wo_shing_wo']);
    expect(context.playerSummary).not.toContain('警员编号：9527');
    expect(context.lawIdentitySummary).toBe('当前公开身份没有可用警务权限。');
    expect(context.policeProjection.available).toBe(false);
    expect(prompt).toContain('IDENTITY_CONTEXT');
    expect(prompt).toContain('CURRENT_SHELL');
    expect(prompt).toContain('PROTAGONIST_PRIVATE_KNOWLEDGE');
    expect(prompt).toContain('DIRECTOR_ONLY_FACTS');
    expect(prompt).toContain('主角与 NPC 都不会因为这里保存了事实而自动知道');
    expect(prompt).toContain('identityContextPatch');
    expect(prompt).toContain('secretFactPatches');
    expect(prompt).toContain('必须同步写 playerPatch.clothing');
    expect(prompt).toContain('assetPatch.equippedItemIds');
    expect(prompt).toContain('不得只在 narrativeText 或 playerPatch.equipment 自由文本里写领装');
  });

  it('uses the police shell for a triad operative embedded in the police while hiding the triad profile from actor packets', () => {
    const initial = createInitialRuntimeState({
      currentIdentity: 'gang_member',
      triadProfileId: 'wo_shing_wo_temple_street_runner',
      playerName: '陈启明'
    });
    const transitioned = applyPlayerIdentityContextPatch(initial, {
      transitionId: 'transition_triad_inside_police_prompt',
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
            secretId: 'secret_player_triad_loyalty_prompt',
            ownerType: 'player',
            ownerId: 'player',
            kind: 'loyalty',
            summary: '玩家真实效忠和胜和上线。',
            playerCharacterKnown: true,
            publicKnown: false,
            knownByActorIds: ['actor_triad_handler'],
            revealState: 'known_to_some_actors',
            revealConditions: ['命令被截获或身份暴露。'],
            visibility: 'player_known',
            importance: 100
          }
        }
      ]
    }).state;

    const context = selectContext(transitioned, '回警署当值');
    const playerPacket = context.actorPackets.find((actor) => actor.actorId === 'player');

    expect(context.identityProjection.currentShell.currentIdentity).toBe('police');
    expect(context.identityProjection.currentShell.publicRoleProfile?.identity).toBe('police');
    expect(playerPacket?.roleProfiles.police?.status).toBe('cover');
    expect(playerPacket?.roleProfiles.triad).toBeUndefined();
    expect(playerPacket?.actualIdentitySummary).toBeUndefined();
    expect(playerPacket?.organizationIds).toEqual(['org_hk_police']);
    expect(context.lawIdentitySummary).toContain('active');
    expect(context.policeProjection.available).toBe(true);
    expect(context.identityProjection.protagonistPrivateKnowledge.facts[0]?.knownByActorIds).toEqual([
      'actor_triad_handler'
    ]);
  });
});

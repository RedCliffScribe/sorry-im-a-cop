import { describe, expect, it } from 'vitest';
import { createActorDefaults } from '../runtime/actorFactory';
import { createInitialRuntimeState } from '../runtime/initialState';
import type { Actor, GameTime, RuntimeState } from '../runtime/types';
import { applyPregnancyLifecycle, type PregnancyRiskPatchInput } from './pregnancyLifecycle';

function adultFemale(actorId = 'npc_adult_female'): Actor {
  return createActorDefaults({
    actorId,
    name: '测试女性',
    gender: 'female',
    birthDate: '1960-04-12',
    computedAge: 24,
    currentIdentity: 'civilian',
    publicIdentity: '市民',
    roleProfiles: {},
    positionSummary: '市民',
    profileSummary: '用于怀孕生命周期测试的成年女性。',
    appearance: '成年女性。',
    clothing: '日常衣着。',
    personality: '冷静。',
    speechStyle: '简洁。',
    motivation: '维持正常生活。',
    longTermGoal: '生活安定。',
    values: '重视家庭。',
    femaleProfile: {
      adultPrivateProfile: {
        enabled: true,
        ageConfirmedAdult: false,
        profileStatus: 'ready',
        womb: {
          status: '未受孕',
          cervixStatus: '紧闭',
          records: []
        }
      }
    },
    visibility: 'player_known'
  });
}

function createFixture(actor = adultFemale()) {
  const state = createInitialRuntimeState();
  return {
    state,
    actors: {
      ...state.actors,
      [actor.actorId]: actor
    },
    relationshipThreads: { ...state.relationshipThreads }
  };
}

function risk(actorId = 'npc_adult_female', overrides: Partial<PregnancyRiskPatchInput> = {}): PregnancyRiskPatchInput {
  return {
    actorId,
    riskType: 'unprotected',
    summary: '本回合发生了明确的无保护受孕风险。',
    fatherActorId: 'player',
    fatherName: '玩家',
    ...overrides
  };
}

function run(
  fixture: ReturnType<typeof createFixture>,
  options: Partial<Parameters<typeof applyPregnancyLifecycle>[0]> = {}
) {
  return applyPregnancyLifecycle({
    actors: fixture.actors,
    relationshipThreads: fixture.relationshipThreads,
    currentTime: fixture.state.time,
    worldpackId: fixture.state.world.worldpackId,
    playerActorId: fixture.state.player.actorId,
    mode: 'standard',
    ...options
  });
}

function wombOf(actors: RuntimeState['actors'], actorId = 'npc_adult_female') {
  return actors[actorId].femaleProfile?.adultPrivateProfile?.womb;
}

function daysAfter(time: GameTime, days: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day + days, time.hour, time.minute));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

describe('pregnancy lifecycle', () => {
  it('rejects new risk when the feature is off while keeping the state unchanged', () => {
    const fixture = createFixture();
    const result = run(fixture, { mode: 'off', riskPatches: [risk()] });

    expect(wombOf(result.actors)?.pregnancy).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: 'pregnancy_feature_disabled' })
    ]);
  });

  it('requires a confirmed adult female private profile', () => {
    const fixture = createFixture(
      adultFemale('npc_minor')
    );
    fixture.actors.npc_minor = {
      ...fixture.actors.npc_minor,
      birthDate: '1972-01-01',
      computedAge: 12
    };

    const result = run(fixture, { riskPatches: [risk('npc_minor')] });

    expect(wombOf(result.actors, 'npc_minor')?.pregnancy).toBeUndefined();
    expect(result.diagnostics[0]?.code).toBe('pregnancy_actor_ineligible');
  });

  it('creates a stable delayed-check opportunity without rerolling on reload', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const replay = run(fixture, { riskPatches: [risk()] });
    const firstPregnancy = wombOf(first.actors)?.pregnancy;
    const replayPregnancy = wombOf(replay.actors)?.pregnancy;

    expect(firstPregnancy?.status).toBe('pending_check');
    expect(firstPregnancy?.checkDueAt).toEqual(expect.objectContaining({ year: expect.any(Number) }));
    expect(firstPregnancy?.pregnancyId).toBe(replayPregnancy?.pregnancyId);
    expect(firstPregnancy?.rollPercent).toBe(replayPregnancy?.rollPercent);
    expect(firstPregnancy?.checkDueAt).toEqual(replayPregnancy?.checkDueAt);
  });

  it('uses settings as a chance multiplier and caps repeated exposure without rerolling', () => {
    const fixture = createFixture();
    const low = run(fixture, { mode: 'low', riskPatches: [risk()] });
    const high = run(fixture, { mode: 'high', riskPatches: [risk()] });
    expect(wombOf(low.actors)?.pregnancy?.chancePercent).toBeLessThan(
      wombOf(high.actors)?.pregnancy?.chancePercent ?? 0
    );

    let actors = high.actors;
    const original = wombOf(actors)?.pregnancy;
    for (let index = 0; index < 20; index += 1) {
      actors = run(
        { ...fixture, actors },
        {
          mode: 'high',
          riskPatches: [
            risk('npc_adult_female', {
              riskType: index % 2 === 0 ? 'tryingToConceive' : 'reducedRisk',
              summary: `重复风险 ${index}`
            })
          ]
        }
      ).actors;
    }
    const merged = wombOf(actors)?.pregnancy;
    expect(merged?.pregnancyId).toBe(original?.pregnancyId);
    expect(merged?.rollPercent).toBe(original?.rollPercent);
    expect(merged?.chancePercent).toBeLessThanOrEqual(30);
    expect(merged?.riskTypes).toEqual(expect.arrayContaining(['unprotected', 'tryingToConceive', 'reducedRisk']));
    expect(wombOf(actors)?.records).toHaveLength(12);
  });

  it('resolves a failed opportunity at the scheduled check and enforces cooldown', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const womb = wombOf(registered.actors)!;
    const pregnancy = womb.pregnancy!;
    const forcedFailureActors = {
      ...registered.actors,
      npc_adult_female: {
        ...registered.actors.npc_adult_female,
        femaleProfile: {
          ...registered.actors.npc_adult_female.femaleProfile!,
          adultPrivateProfile: {
            ...registered.actors.npc_adult_female.femaleProfile!.adultPrivateProfile!,
            womb: {
              ...womb,
              pregnancy: { ...pregnancy, chancePercent: 0 }
            }
          }
        }
      }
    };
    const checked = run(
      { ...fixture, actors: forcedFailureActors },
      { currentTime: pregnancy.checkDueAt }
    );

    expect(wombOf(checked.actors)?.pregnancy).toBeUndefined();
    expect(wombOf(checked.actors)?.lastPregnancyCheck?.result).toBe('negative');

    const cooldownAttempt = run(
      { ...fixture, actors: checked.actors },
      { currentTime: daysAfter(pregnancy.checkDueAt, 10), riskPatches: [risk()] }
    );
    expect(cooldownAttempt.diagnostics[0]?.code).toBe('pregnancy_check_cooldown');
  });

  it('advances a successful opportunity through confirmation and live birth', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    let actors = {
      ...registered.actors,
      npc_adult_female: {
        ...registered.actors.npc_adult_female,
        femaleProfile: {
          ...registered.actors.npc_adult_female.femaleProfile!,
          adultPrivateProfile: {
            ...registered.actors.npc_adult_female.femaleProfile!.adultPrivateProfile!,
            womb: {
              ...sourceWomb,
              pregnancy: { ...pregnancy, chancePercent: 100 }
            }
          }
        }
      }
    };

    let result = run({ ...fixture, actors }, { currentTime: pregnancy.checkDueAt });
    expect(wombOf(result.actors)?.pregnancy?.status).toBe('suspected');

    result = run({ ...fixture, actors: result.actors }, { currentTime: pregnancy.confirmationDueAt });
    expect(wombOf(result.actors)?.pregnancy?.status).toBe('confirmed');

    result = run({ ...fixture, actors: result.actors }, { currentTime: pregnancy.deliveryWindowAt });
    expect(wombOf(result.actors)?.pregnancy?.status).toBe('delivery_due');

    result = run(
      { ...fixture, actors: result.actors, relationshipThreads: result.relationshipThreads },
      {
        currentTime: pregnancy.dueAt,
        resolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'live_birth',
            summary: '测试女性平安生下一名女婴。',
            childName: '测试宝宝',
            childGender: 'female',
            fatherActorId: 'player'
          }
        ]
      }
    );

    const postpartum = wombOf(result.actors)?.pregnancy;
    expect(postpartum?.status).toBe('postpartum');
    expect(postpartum?.childActorId).toBeDefined();
    expect(result.actors[postpartum!.childActorId!]).toMatchObject({
      name: '测试宝宝',
      gender: 'female',
      parentActorIds: expect.arrayContaining(['npc_adult_female', 'player'])
    });
    expect(result.actors.npc_adult_female.childActorIds).toContain(postpartum?.childActorId);
    expect(wombOf(result.actors)?.pregnancyHistory?.at(-1)?.outcome).toBe('live_birth');
    expect(Object.values(result.relationshipThreads)).toEqual([
      expect.objectContaining({ relationshipRole: '亲子与家庭' })
    ]);
  });

  it('rejects premature delivery, but safely closes an overdue pregnancy and then clears postpartum state', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    const early = run(
      { ...fixture, actors: registered.actors },
      {
        currentTime: fixture.state.time,
        resolutionPatches: [
          { actorId: 'npc_adult_female', outcome: 'live_birth', summary: '过早的活产写回。' }
        ]
      }
    );
    expect(early.diagnostics[0]?.code).toBe('pregnancy_delivery_too_early');

    const forcedSuccessActors = {
      ...registered.actors,
      npc_adult_female: {
        ...registered.actors.npc_adult_female,
        femaleProfile: {
          ...registered.actors.npc_adult_female.femaleProfile!,
          adultPrivateProfile: {
            ...registered.actors.npc_adult_female.femaleProfile!.adultPrivateProfile!,
            womb: {
              ...sourceWomb,
              pregnancy: { ...pregnancy, chancePercent: 100 }
            }
          }
        }
      }
    };
    const overdue = run(
      { ...fixture, actors: forcedSuccessActors },
      { currentTime: pregnancy.deliveryDeadlineAt }
    );
    const postpartum = wombOf(overdue.actors)?.pregnancy;
    expect(postpartum?.status).toBe('postpartum');

    const recovered = run(
      { ...fixture, actors: overdue.actors, relationshipThreads: overdue.relationshipThreads },
      { currentTime: postpartum!.postpartumUntil }
    );
    expect(wombOf(recovered.actors)?.pregnancy).toBeUndefined();
    expect(wombOf(recovered.actors)?.pregnancyHistory?.at(-1)?.outcome).toBe('live_birth');
  });

  it('keeps a hidden father out of player-facing child text and family threads', () => {
    const fixture = createFixture();
    fixture.actors.npc_secret_father = createActorDefaults({
      actorId: 'npc_secret_father',
      name: '隐藏父亲姓名',
      gender: 'male',
      computedAge: 30,
      currentIdentity: 'civilian',
      publicIdentity: '市民',
      roleProfiles: {},
      positionSummary: '市民',
      profileSummary: '隐藏人物。',
      visibility: 'hidden'
    });
    const registered = run(fixture, {
      riskPatches: [
        risk('npc_adult_female', {
          fatherActorId: 'npc_secret_father',
          fatherName: '隐藏父亲姓名',
          fatherVisibility: 'hidden'
        })
      ]
    });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    const forcedSuccessActors = {
      ...registered.actors,
      npc_adult_female: {
        ...registered.actors.npc_adult_female,
        femaleProfile: {
          ...registered.actors.npc_adult_female.femaleProfile!,
          adultPrivateProfile: {
            ...registered.actors.npc_adult_female.femaleProfile!.adultPrivateProfile!,
            womb: { ...sourceWomb, pregnancy: { ...pregnancy, chancePercent: 100 } }
          }
        }
      }
    };
    const delivered = run(
      { ...fixture, actors: forcedSuccessActors },
      { currentTime: pregnancy.deliveryDeadlineAt }
    );
    const childActorId = wombOf(delivered.actors)?.pregnancy?.childActorId;
    const child = delivered.actors[childActorId!];
    const familyThread = Object.values(delivered.relationshipThreads)[0];

    expect(child.parentActorIds).toContain('npc_secret_father');
    expect(delivered.actors.npc_secret_father.childActorIds).toContain(childActorId);
    expect(child.relationshipSummary).not.toContain('隐藏父亲姓名');
    expect(familyThread.relatedActorIds).not.toContain('npc_secret_father');
  });

  it('only accepts an explicit ended outcome after a positive check', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    const early = run(
      { ...fixture, actors: registered.actors },
      {
        resolutionPatches: [
          { actorId: 'npc_adult_female', outcome: 'pregnancy_ended', summary: '不应接受。' }
        ]
      }
    );
    expect(early.diagnostics[0]?.code).toBe('pregnancy_resolution_too_early');

    const forcedSuccessActors = {
      ...registered.actors,
      npc_adult_female: {
        ...registered.actors.npc_adult_female,
        femaleProfile: {
          ...registered.actors.npc_adult_female.femaleProfile!,
          adultPrivateProfile: {
            ...registered.actors.npc_adult_female.femaleProfile!.adultPrivateProfile!,
            womb: { ...sourceWomb, pregnancy: { ...pregnancy, chancePercent: 100 } }
          }
        }
      }
    };
    const suspected = run(
      { ...fixture, actors: forcedSuccessActors },
      { currentTime: pregnancy.checkDueAt }
    );
    const ended = run(
      { ...fixture, actors: suspected.actors },
      {
        currentTime: daysAfter(pregnancy.checkDueAt, 1),
        resolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_ended',
            summary: '剧情明确确认妊娠已经终止。'
          }
        ]
      }
    );
    expect(wombOf(ended.actors)?.pregnancy).toBeUndefined();
    expect(wombOf(ended.actors)?.pregnancyHistory?.at(-1)).toMatchObject({
      outcome: 'pregnancy_ended',
      summary: '剧情明确确认妊娠已经终止。'
    });
  });
});

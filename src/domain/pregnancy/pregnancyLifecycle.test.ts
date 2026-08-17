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

function forceCurrentChance(
  actors: RuntimeState['actors'],
  chancePercent: number,
  actorId = 'npc_adult_female'
): RuntimeState['actors'] {
  const actor = actors[actorId];
  const adultPrivateProfile = actor.femaleProfile?.adultPrivateProfile;
  const womb = adultPrivateProfile?.womb;
  const pregnancy = womb?.pregnancy;
  if (!adultPrivateProfile || !womb || !pregnancy) return actors;
  return {
    ...actors,
    [actorId]: {
      ...actor,
      femaleProfile: {
        ...actor.femaleProfile,
        adultPrivateProfile: {
          ...adultPrivateProfile,
          womb: {
            ...womb,
            pregnancy: { ...pregnancy, chancePercent }
          }
        }
      }
    }
  };
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

function hoursAfter(time: GameTime, hours: number): GameTime {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day, time.hour + hours, time.minute));
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

  it('keeps a recent cervix status and restores the normal state after 12 game hours', () => {
    const fixture = createFixture();
    const observedAt = fixture.state.time;
    const actor = fixture.actors.npc_adult_female;
    const adultPrivateProfile = actor.femaleProfile?.adultPrivateProfile;
    const womb = adultPrivateProfile?.womb;
    expect(adultPrivateProfile && womb).toBeTruthy();
    if (!adultPrivateProfile || !womb) return;

    const actors = {
      ...fixture.actors,
      [actor.actorId]: {
        ...actor,
        femaleProfile: {
          ...actor.femaleProfile,
          adultPrivateProfile: {
            ...adultPrivateProfile,
            updatedAt: observedAt,
            womb: {
              ...womb,
              cervixStatus: '本回合形成的短期状态',
              cervixStatusUpdatedAt: observedAt
            }
          }
        }
      }
    };

    const recent = run({ ...fixture, actors }, { currentTime: hoursAfter(observedAt, 11) });
    expect(wombOf(recent.actors)?.cervixStatus).toBe('本回合形成的短期状态');

    const expiredAt = hoursAfter(observedAt, 12);
    const expired = run({ ...fixture, actors }, { currentTime: expiredAt });
    expect(wombOf(expired.actors)?.cervixStatus).toBe('紧闭');
    expect(wombOf(expired.actors)?.cervixStatusUpdatedAt).toEqual(expiredAt);
  });

  it('uses the legacy private-profile update time when an old save has no dedicated cervix timestamp', () => {
    const fixture = createFixture();
    const observedAt = fixture.state.time;
    const actor = fixture.actors.npc_adult_female;
    const adultPrivateProfile = actor.femaleProfile?.adultPrivateProfile;
    const womb = adultPrivateProfile?.womb;
    expect(adultPrivateProfile && womb).toBeTruthy();
    if (!adultPrivateProfile || !womb) return;

    const actors = {
      ...fixture.actors,
      [actor.actorId]: {
        ...actor,
        femaleProfile: {
          ...actor.femaleProfile,
          adultPrivateProfile: {
            ...adultPrivateProfile,
            updatedAt: observedAt,
            womb: {
              ...womb,
              cervixStatus: '旧存档短期状态'
            }
          }
        }
      }
    };

    const result = run({ ...fixture, actors }, { currentTime: hoursAfter(observedAt, 12) });
    expect(wombOf(result.actors)?.cervixStatus).toBe('紧闭');
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

  it('merges same-day risks but schedules risks from different days separately', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const firstPregnancy = wombOf(first.actors)?.pregnancy;
    const secondTime = daysAfter(fixture.state.time, 1);
    const second = run(
      { ...fixture, actors: first.actors },
      {
        currentTime: secondTime,
        riskPatches: [risk('npc_adult_female', { summary: '第二天再次发生风险。' })]
      }
    );
    const womb = wombOf(second.actors);
    const queued = womb?.pendingPregnancyChecks?.[0];

    expect(womb?.pregnancy?.pregnancyId).toBe(firstPregnancy?.pregnancyId);
    expect(womb?.pendingPregnancyChecks).toHaveLength(1);
    expect(queued?.registeredAt).toEqual(secondTime);
    expect(queued?.checkDueAt).toEqual(daysAfter(firstPregnancy!.checkDueAt, 1));
    expect(queued?.pregnancyId).not.toBe(firstPregnancy?.pregnancyId);
  });

  it('keeps every same-window paternity candidate while accepting legacy father fields', () => {
    const fixture = createFixture();
    const registered = run(fixture, {
      riskPatches: [
        risk('npc_adult_female', {
          paternityCandidates: [
            { actorId: 'player', name: '玩家', visibility: 'player_known' },
            { actorId: 'npc_other_candidate', name: '陈先生', visibility: 'player_known' }
          ],
          fatherActorId: 'player',
          fatherName: '玩家',
          fatherVisibility: 'player_known'
        })
      ]
    });
    const womb = wombOf(registered.actors);

    expect(womb?.pregnancy?.paternityCandidates).toEqual([
      { actorId: 'player', name: '玩家', visibility: 'player_known' },
      { actorId: 'npc_other_candidate', name: '陈先生', visibility: 'player_known' }
    ]);
    expect(womb?.records.at(-1)?.paternityCandidates).toEqual(womb?.pregnancy?.paternityCandidates);
  });

  it('merges repeated risks into an already queued opportunity from the same later day', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const secondTime = daysAfter(fixture.state.time, 1);
    const second = run(
      { ...fixture, actors: first.actors },
      {
        currentTime: secondTime,
        riskPatches: [risk('npc_adult_female', { summary: '第二天第一次风险。' })]
      }
    );
    const queuedBefore = wombOf(second.actors)?.pendingPregnancyChecks?.[0];
    const repeated = run(
      { ...fixture, actors: second.actors },
      {
        currentTime: secondTime,
        riskPatches: [
          risk('npc_adult_female', {
            riskType: 'tryingToConceive',
            summary: '第二天再次发生风险。'
          })
        ]
      }
    );
    const repeatedWomb = wombOf(repeated.actors);
    const queuedAfter = repeatedWomb?.pendingPregnancyChecks?.[0];

    expect(repeatedWomb?.pendingPregnancyChecks).toHaveLength(1);
    expect(queuedAfter?.pregnancyId).toBe(queuedBefore?.pregnancyId);
    expect(queuedAfter?.rollPercent).toBe(queuedBefore?.rollPercent);
    expect(queuedAfter?.chancePercent).toBeGreaterThan(queuedBefore?.chancePercent ?? 0);
    expect(queuedAfter?.riskTypes).toEqual(expect.arrayContaining(['unprotected', 'tryingToConceive']));
  });

  it('promotes the next scheduled check after an earlier negative result', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const second = run(
      { ...fixture, actors: first.actors },
      {
        currentTime: daysAfter(fixture.state.time, 1),
        riskPatches: [risk('npc_adult_female', { summary: '第二天再次发生风险。' })]
      }
    );
    const womb = wombOf(second.actors)!;
    const firstPregnancy = womb.pregnancy!;
    const queuedPregnancy = womb.pendingPregnancyChecks![0];
    const checked = run(
      { ...fixture, actors: forceCurrentChance(second.actors, 0) },
      { currentTime: firstPregnancy.checkDueAt }
    );
    const checkedWomb = wombOf(checked.actors);

    expect(checkedWomb?.lastPregnancyCheck?.result).toBe('negative');
    expect(checkedWomb?.pregnancy?.pregnancyId).toBe(queuedPregnancy.pregnancyId);
    expect(checkedWomb?.pregnancy?.status).toBe('pending_check');
    expect(checkedWomb?.pendingPregnancyChecks).toBeUndefined();
  });

  it('clears every later scheduled check after an earlier positive result', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const second = run(
      { ...fixture, actors: first.actors },
      {
        currentTime: daysAfter(fixture.state.time, 1),
        riskPatches: [risk('npc_adult_female', { summary: '第二天再次发生风险。' })]
      }
    );
    const firstPregnancy = wombOf(second.actors)?.pregnancy;
    expect(firstPregnancy).toBeDefined();
    if (!firstPregnancy) throw new Error('预期第一笔怀孕风险已建立待判定状态。');
    const checked = run(
      { ...fixture, actors: forceCurrentChance(second.actors, 100) },
      { currentTime: firstPregnancy.checkDueAt }
    );
    const checkedWomb = wombOf(checked.actors);

    expect(checkedWomb?.lastPregnancyCheck?.result).toBe('positive');
    expect(checkedWomb?.pregnancy?.status).toBe('suspected');
    expect(checkedWomb?.pendingPregnancyChecks).toBeUndefined();
  });

  it('continues through multiple dated checks and clears the remaining queue on the first positive result', () => {
    const fixture = createFixture();
    const first = run(fixture, { riskPatches: [risk()] });
    const second = run(
      { ...fixture, actors: first.actors },
      {
        currentTime: daysAfter(fixture.state.time, 1),
        riskPatches: [risk('npc_adult_female', { summary: '第二天风险。' })]
      }
    );
    const third = run(
      { ...fixture, actors: second.actors },
      {
        currentTime: daysAfter(fixture.state.time, 2),
        riskPatches: [risk('npc_adult_female', { summary: '第三天风险。' })]
      }
    );
    const firstDueAt = wombOf(third.actors)?.pregnancy?.checkDueAt;
    expect(firstDueAt).toBeDefined();
    if (!firstDueAt) throw new Error('预期第一笔怀孕风险已建立验孕日期。');

    const firstChecked = run(
      { ...fixture, actors: forceCurrentChance(third.actors, 0) },
      { currentTime: firstDueAt }
    );
    const secondPregnancy = wombOf(firstChecked.actors)?.pregnancy;
    expect(secondPregnancy).toBeDefined();
    if (!secondPregnancy) throw new Error('预期第一笔阴性后已提升第二笔待判定。');

    const secondChecked = run(
      { ...fixture, actors: forceCurrentChance(firstChecked.actors, 100) },
      { currentTime: secondPregnancy.checkDueAt }
    );
    const finalWomb = wombOf(secondChecked.actors);

    expect(finalWomb?.lastPregnancyCheck?.result).toBe('positive');
    expect(finalWomb?.pregnancy?.status).toBe('suspected');
    expect(finalWomb?.pendingPregnancyChecks).toBeUndefined();
  });

  it('accepts a new risk immediately after an earlier negative result', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const womb = wombOf(registered.actors)!;
    const pregnancy = womb.pregnancy!;
    const checked = run(
      { ...fixture, actors: forceCurrentChance(registered.actors, 0) },
      { currentTime: pregnancy.checkDueAt }
    );

    expect(wombOf(checked.actors)?.pregnancy).toBeUndefined();
    expect(wombOf(checked.actors)?.lastPregnancyCheck?.result).toBe('negative');

    const nextAttempt = run(
      { ...fixture, actors: checked.actors },
      { currentTime: daysAfter(pregnancy.checkDueAt, 1), riskPatches: [risk()] }
    );
    expect(nextAttempt.diagnostics).toEqual([]);
    expect(wombOf(nextAttempt.actors)?.pregnancy?.status).toBe('pending_check');
  });

  it('preserves paternity candidates in the durable record after a negative result', () => {
    const fixture = createFixture();
    const registered = run(fixture, {
      riskPatches: [
        risk('npc_adult_female', {
          paternityCandidates: [
            { actorId: 'player', name: '玩家', visibility: 'player_known' },
            { actorId: 'npc_other_candidate', name: '陈先生', visibility: 'player_known' }
          ]
        })
      ]
    });
    const pregnancy = wombOf(registered.actors)?.pregnancy;
    expect(pregnancy).toBeDefined();
    if (!pregnancy) throw new Error('预期已建立待判定风险。');

    const checked = run(
      { ...fixture, actors: forceCurrentChance(registered.actors, 0) },
      { currentTime: pregnancy.checkDueAt }
    );
    const negativeRecord = wombOf(checked.actors)?.records.find(
      (record) => record.pregnancyId === pregnancy.pregnancyId && record.pregnancyCheckResult === 'negative'
    );

    expect(negativeRecord?.paternityCandidates).toEqual(pregnancy.paternityCandidates);
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
    expect(wombOf(result.actors)?.pregnancyHistory?.at(-1)?.paternityCandidates).toEqual([
      expect.objectContaining({ actorId: 'player' })
    ]);
    expect(Object.values(result.relationshipThreads)).toEqual([
      expect.objectContaining({ relationshipRole: '亲子与家庭' })
    ]);
  });

  it('accepts an explicit hospital confirmation before the automatic confirmation date', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    const suspected = run(
      { ...fixture, actors: forceCurrentChance(registered.actors, 100) },
      { currentTime: pregnancy.checkDueAt }
    );
    const confirmedAt = daysAfter(pregnancy.checkDueAt, 1);

    const confirmed = run(
      { ...fixture, actors: suspected.actors },
      {
        currentTime: confirmedAt,
        resolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_confirmed',
            summary: '医院检查已经明确确认妊娠。'
          }
        ]
      }
    );

    expect(confirmed.diagnostics).toEqual([]);
    expect(wombOf(confirmed.actors)?.status).toBe('已确认怀孕');
    expect(wombOf(confirmed.actors)?.pregnancy).toMatchObject({
      pregnancyId: pregnancy.pregnancyId,
      status: 'confirmed',
      confirmedAt
    });
    expect(wombOf(confirmed.actors)?.records.at(-1)).toMatchObject({
      description: '医院检查已经明确确认妊娠。',
      pregnancyId: pregnancy.pregnancyId,
      pregnancyCheckResult: 'positive'
    });
  });

  it('does not allow medical confirmation before a positive pregnancy check', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const attempted = run(
      { ...fixture, actors: registered.actors },
      {
        resolutionPatches: [
          {
            actorId: 'npc_adult_female',
            outcome: 'pregnancy_confirmed',
            summary: '没有阳性结果时不应确认。'
          }
        ]
      }
    );

    expect(attempted.diagnostics[0]?.code).toBe('pregnancy_confirmation_too_early');
    expect(wombOf(attempted.actors)?.pregnancy?.status).toBe('pending_check');
  });

  it('continues recording risk contact during an active pregnancy without creating another pregnancy', () => {
    const fixture = createFixture();
    const registered = run(fixture, { riskPatches: [risk()] });
    const sourceWomb = wombOf(registered.actors)!;
    const pregnancy = sourceWomb.pregnancy!;
    const suspected = run(
      { ...fixture, actors: forceCurrentChance(registered.actors, 100) },
      { currentTime: pregnancy.checkDueAt }
    );
    const beforeRecords = wombOf(suspected.actors)?.records.length ?? 0;
    const contactTime = daysAfter(pregnancy.checkDueAt, 1);

    const recorded = run(
      { ...fixture, actors: suspected.actors },
      {
        currentTime: contactTime,
        riskPatches: [
          risk('npc_adult_female', {
            summary: '活动孕期内发生的明确成人接触仍应留下记录。'
          })
        ]
      }
    );

    expect(recorded.diagnostics).toEqual([]);
    expect(wombOf(recorded.actors)?.pregnancy).toMatchObject({
      pregnancyId: pregnancy.pregnancyId,
      status: 'suspected'
    });
    expect(wombOf(recorded.actors)?.pendingPregnancyChecks).toBeUndefined();
    expect(wombOf(recorded.actors)?.records).toHaveLength(beforeRecords + 1);
    expect(wombOf(recorded.actors)?.records.at(-1)).toMatchObject({
      date: `${contactTime.year}-${String(contactTime.month).padStart(2, '0')}-${String(contactTime.day).padStart(2, '0')}`,
      description: '活动孕期内发生的明确成人接触仍应留下记录。'
    });
    expect(wombOf(recorded.actors)?.records.at(-1)?.pregnancyCheckDate).toBeUndefined();
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

    const nextRisk = run(
      { ...fixture, actors: ended.actors },
      {
        currentTime: daysAfter(pregnancy.checkDueAt, 2),
        riskPatches: [risk()]
      }
    );
    expect(nextRisk.diagnostics).toEqual([]);
    expect(wombOf(nextRisk.actors)?.pregnancy).toMatchObject({ status: 'pending_check' });
    expect(wombOf(nextRisk.actors)?.pregnancy?.pregnancyId).not.toBe(pregnancy.pregnancyId);
  });
});

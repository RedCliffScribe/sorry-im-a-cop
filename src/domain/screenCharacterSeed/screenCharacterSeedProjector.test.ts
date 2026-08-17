import { describe, expect, it } from 'vitest';
import { createInitialRuntimeState } from '../runtime/initialState';
import { hkLateColonialScreenCharacterSeeds } from './hkLateColonialScreenCharacterSeeds';
import {
  actorMatchesScreenCharacterIdentity,
  findScreenCharacterIdentityMatch,
  findScreenCharacterIdentityMatches,
  screenCharacterMatchFromStoredActor
} from './screenCharacterIdentityLock';
import {
  projectScreenCharacterSeedContext,
  validateScreenCharacterSeeds
} from './screenCharacterSeedProjector';
import { createActorDefaults } from '../runtime/actorFactory';

describe('screen character seed projection', () => {
  it('hard-gates all screen-character candidates when the world-level switch is off', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1986;
    state.world.screenCharacterSeedsEnabled = false;

    const projection = projectScreenCharacterSeedContext(state, '去找李马克谈谈码头那批货');

    expect(projection.characters).toEqual([]);
    expect(projection.rules).toEqual([
      '当前存档已关闭银幕角色种子。不得引用、激活或新建银幕角色候选。'
    ]);
    expect(projection.diagnostics.selectedTextChars).toBe(0);
  });

  it('keeps a validated performer-free role catalog in its own namespace', () => {
    const validation = validateScreenCharacterSeeds(hkLateColonialScreenCharacterSeeds);
    const serialized = JSON.stringify(hkLateColonialScreenCharacterSeeds);

    expect(validation).toMatchObject({
      total: 216,
      workCount: 45,
      errors: []
    });
    expect(new Set(hkLateColonialScreenCharacterSeeds.map((card) => card.id)).size).toBe(216);
    expect(serialized).not.toMatch(/performerName|portrayedBy|playedBy/u);
    expect(serialized).not.toMatch(/周润发|刘德华|张国荣|梁朝伟|郑伊健|成龙/u);
    expect(serialized).not.toMatch(/firstReleaseYear|releaseYear/u);
    expect(hkLateColonialScreenCharacterSeeds.map((card) => card.sourceWorkId)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/_(?:19|20)\d{2}$/u)])
    );
  });

  it('uses only in-world availability for chronology-separated works', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1994;

    const projection = projectScreenCharacterSeedContext(state, '找大D、乐哥和吉米仔谈谈社团生意');
    expect(projection.characters.map((character) => character.canonicalCharacterId)).toEqual(
      expect.arrayContaining([
        'screen_film_election_big_d',
        'screen_film_election_lam_lok',
        'screen_film_election_jimmy_lee'
      ])
    );

    const bigD = projection.characters.find(
      (character) => character.canonicalCharacterId === 'screen_film_election_big_d'
    );
    expect(bigD).toMatchObject({
      sourceWorkTitle: '黑社会',
      availableYears: { from: 1994, to: 1996 }
    });
    expect(bigD).not.toHaveProperty('firstReleaseYear');
    expect(bigD?.worldpackPlacementAnchor).toContain('后来围绕话事人');
    expect(projection.rules.join('\n')).toMatch(/WORLD_TIME_LOCK/u);
    expect(projection.rules.join('\n')).toMatch(/never leak later promotions/u);

    state.time.year = 1993;
    expect(projectScreenCharacterSeedContext(state, '找大D和乐少').characters).toHaveLength(0);
  });

  it('keeps a curated worldpack placement anchor without any source release year', () => {
    const source = hkLateColonialScreenCharacterSeeds.find(
      (card) => card.id === 'screen_film_election_big_d'
    );
    expect(source).toBeDefined();
    if (!source) return;

    expect(source.worldpackPlacementAnchor).toContain('九十年代中期前史落点');
    expect(source).not.toHaveProperty('firstReleaseYear');
  });

  it('rejects source release metadata and release years encoded in work ids', () => {
    const source = hkLateColonialScreenCharacterSeeds[0];
    const validation = validateScreenCharacterSeeds([
      {
        ...source,
        sourceWorkId: 'work_tv_police_cadet_1984',
        firstReleaseYear: 1984
      } as unknown as typeof source
    ]);

    expect(validation.errors).toContain(`${source.id}: sourceWorkId must not encode a release year`);
    expect(validation.errors).toContain(`${source.id}: source release metadata is not allowed`);
  });

  it('recalls one character and its related ensemble only inside worldpack availability', () => {
    const state = createInitialRuntimeState();
    state.time.year = 1986;

    const direct = projectScreenCharacterSeedContext(state, '去找李马克谈谈码头那批货');
    const mark = direct.characters.find((character) => character.displayName === '李马克');
    expect(mark).toMatchObject({
      canonicalCharacterId: 'screen_film_better_tomorrow_mark_lee',
      runtimeActorId: 'npc_screen_screen_film_better_tomorrow_mark_lee',
      sourceWorkId: 'work_film_better_tomorrow'
    });

    const ensemble = projectScreenCharacterSeedContext(state, '打听英雄本色那几个人最近的动向');
    expect(
      ensemble.characters.filter((character) => character.sourceWorkId === 'work_film_better_tomorrow').length
    ).toBeGreaterThanOrEqual(3);
    expect(ensemble.characters.length).toBeLessThanOrEqual(8);
    expect(ensemble.diagnostics.selectedTextChars).toBeLessThanOrEqual(
      ensemble.diagnostics.estimatedTokenBudget
    );

    state.time.year = 1995;
    expect(projectScreenCharacterSeedContext(state, '去找陈浩南').characters).toHaveLength(0);
    state.time.year = 1996;
    expect(projectScreenCharacterSeedContext(state, '去找陈浩南').characters.map((character) => character.displayName)).toContain(
      '陈浩南'
    );
  });

  it('does not guess when a short alias maps to more than one role', () => {
    const matches = findScreenCharacterIdentityMatches('Tony');
    expect(matches.length).toBeGreaterThan(1);
    expect(findScreenCharacterIdentityMatch('Tony')).toBeUndefined();
    expect(findScreenCharacterIdentityMatch('李马克')?.runtimeActorId).toBe(
      'npc_screen_screen_film_better_tomorrow_mark_lee'
    );
    expect(findScreenCharacterIdentityMatches('大飞').length).toBeGreaterThan(1);
    expect(findScreenCharacterIdentityMatch('大飞')).toBeUndefined();
  });

  it('recognizes only canonical runtime or stored identities as an existing role Actor', () => {
    const match = findScreenCharacterIdentityMatch('李马克');
    expect(match).toBeDefined();
    if (!match) return;

    const ordinarySameName = createActorDefaults({
      actorId: 'npc_unrelated_mark_lee',
      name: '李马克',
      currentIdentity: 'civilian'
    });
    const screenActor = createActorDefaults({
      actorId: match.runtimeActorId,
      name: match.displayName,
      currentIdentity: 'civilian',
      worldpackActorData: {
        hk1988: {
          screenCharacterIdentity: {
            canonicalCharacterId: match.canonicalCharacterId,
            seedCharacterId: match.seedCharacterId,
            sourceWorkId: match.sourceWorkId,
            displayName: match.displayName
          }
        }
      }
    });

    expect(actorMatchesScreenCharacterIdentity(ordinarySameName, match)).toBe(false);
    expect(actorMatchesScreenCharacterIdentity(screenActor, match)).toBe(true);
    expect(screenCharacterMatchFromStoredActor(screenActor)?.canonicalCharacterId).toBe(
      match.canonicalCharacterId
    );
  });
});

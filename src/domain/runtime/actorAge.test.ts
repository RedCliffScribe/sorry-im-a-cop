import { describe, expect, it } from 'vitest';
import {
  deriveActorAgeAt,
  normalizeActorAgeAt,
  normalizeActorBirthDate,
  parseActorBirthDate
} from './actorAge';
import { createActorDefaults } from './actorFactory';

const at = (year: number, month: number, day: number) => ({ year, month, day, hour: 12, minute: 0 });

describe('actor age derivation', () => {
  it('changes age only when the birthday is reached', () => {
    const actor = { birthDate: '1965-05-20', computedAge: 90 };

    expect(deriveActorAgeAt(actor, at(1989, 5, 19))).toBe(23);
    expect(deriveActorAgeAt(actor, at(1989, 5, 20))).toBe(24);
    expect(deriveActorAgeAt(actor, at(1989, 12, 31))).toBe(24);
  });

  it('supports forward and backward year changes without trusting a stale cache', () => {
    const actor = { birthDate: '1972-01-15', computedAge: 99 };

    expect(deriveActorAgeAt(actor, at(1988, 12, 31))).toBe(16);
    expect(deriveActorAgeAt(actor, at(1989, 1, 14))).toBe(16);
    expect(deriveActorAgeAt(actor, at(1989, 1, 15))).toBe(17);
    expect(deriveActorAgeAt(actor, at(1987, 1, 15))).toBe(15);
  });

  it('uses March 1 as the anniversary of a leap-day birth in a non-leap year', () => {
    const actor = { birthDate: '1972-02-29' };

    expect(deriveActorAgeAt(actor, at(1988, 2, 29))).toBe(16);
    expect(deriveActorAgeAt(actor, at(1989, 2, 28))).toBe(16);
    expect(deriveActorAgeAt(actor, at(1989, 3, 1))).toBe(17);
  });

  it('strictly rejects impossible calendar dates and future births', () => {
    expect(parseActorBirthDate('1988-02-31')).toBeUndefined();
    expect(parseActorBirthDate('1987-02-29')).toBeUndefined();
    expect(parseActorBirthDate('1988-13-01')).toBeUndefined();
    expect(parseActorBirthDate('')).toBeUndefined();
    expect(deriveActorAgeAt({ birthDate: '1990-01-01' }, at(1989, 1, 1))).toBeUndefined();
  });

  it('canonicalizes valid dates and retains a bounded fallback age only when no valid birth date exists', () => {
    expect(normalizeActorBirthDate('1965-5-2')).toBe('1965-05-02');
    expect(deriveActorAgeAt({ computedAge: 0 }, at(1989, 1, 1))).toBe(0);
    expect(deriveActorAgeAt({ computedAge: 131 }, at(1989, 1, 1))).toBeUndefined();
    expect(deriveActorAgeAt({ computedAge: 23.5 }, at(1989, 1, 1))).toBeUndefined();
  });

  it('normalizes the cached age from a valid birth date and removes an invalid birth date', () => {
    const actor = createActorDefaults({
      actorId: 'npc_age_test',
      name: '年龄测试人物',
      currentIdentity: 'civilian',
      birthDate: '1965-5-20',
      computedAge: 90
    });
    const normalized = normalizeActorAgeAt(actor, at(1989, 2, 1));

    expect(normalized.birthDate).toBe('1965-05-20');
    expect(normalized.computedAge).toBe(23);

    const invalid = normalizeActorAgeAt(
      { ...actor, birthDate: '1988-02-31', computedAge: 22 },
      at(1989, 2, 1)
    );
    expect(invalid.birthDate).toBeUndefined();
    expect(invalid.computedAge).toBe(22);
  });
});

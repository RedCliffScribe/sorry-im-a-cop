import type { Actor, GameTime } from './types';

function parseBirthDate(value: string | undefined): { year: number; month: number; day: number } | undefined {
  const match = value?.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;

  return { year, month, day };
}

export function deriveActorAgeAt(actor: Pick<Actor, 'birthDate' | 'computedAge'>, currentTime: GameTime): number | undefined {
  const birthDate = parseBirthDate(actor.birthDate);
  if (birthDate) {
    let age = currentTime.year - birthDate.year;
    if (currentTime.month < birthDate.month || (currentTime.month === birthDate.month && currentTime.day < birthDate.day)) {
      age -= 1;
    }
    return age >= 0 ? age : undefined;
  }

  return typeof actor.computedAge === 'number' && Number.isFinite(actor.computedAge) ? actor.computedAge : undefined;
}

export function isAdultFemaleActorAt(actor: Actor, currentTime: GameTime): boolean {
  if (actor.gender !== 'female') return false;
  const age = deriveActorAgeAt(actor, currentTime);
  return typeof age === 'number' && age >= 18;
}

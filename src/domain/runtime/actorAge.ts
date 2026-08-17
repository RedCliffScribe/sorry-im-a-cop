import type { Actor, GameTime, RuntimeState } from './types';

export interface ActorBirthDateParts {
  year: number;
  month: number;
  day: number;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export function parseActorBirthDate(value: string | undefined): ActorBirthDateParts | undefined {
  const match = value?.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return undefined;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return undefined;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return undefined;

  return { year, month, day };
}

export function normalizeActorBirthDate(value: string | undefined): string | undefined {
  const parsed = parseActorBirthDate(value);
  if (!parsed) return undefined;
  return `${String(parsed.year).padStart(4, '0')}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

function validFallbackAge(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 130 ? value : undefined;
}

export function deriveActorAgeAt(actor: Pick<Actor, 'birthDate' | 'computedAge'>, currentTime: GameTime): number | undefined {
  const birthDate = parseActorBirthDate(actor.birthDate);
  if (birthDate) {
    let age = currentTime.year - birthDate.year;
    if (currentTime.month < birthDate.month || (currentTime.month === birthDate.month && currentTime.day < birthDate.day)) {
      age -= 1;
    }
    return age >= 0 ? age : undefined;
  }

  return validFallbackAge(actor.computedAge);
}

export function normalizeActorAgeAt(actor: Actor, currentTime: GameTime, birthDateOverride?: string): Actor {
  const normalizedBirthDate = normalizeActorBirthDate(birthDateOverride ?? actor.birthDate);
  const derivedAge = normalizedBirthDate
    ? deriveActorAgeAt({ birthDate: normalizedBirthDate }, currentTime)
    : undefined;
  const fallbackAge = validFallbackAge(actor.computedAge);
  const nextActor = { ...actor };

  if (normalizedBirthDate && derivedAge !== undefined) {
    nextActor.birthDate = normalizedBirthDate;
    nextActor.computedAge = derivedAge;
    return nextActor;
  }

  delete nextActor.birthDate;
  if (fallbackAge === undefined) {
    delete nextActor.computedAge;
  } else {
    nextActor.computedAge = fallbackAge;
  }
  return nextActor;
}

export function normalizeRuntimeActorAges({
  actors,
  player,
  currentTime
}: {
  actors: RuntimeState['actors'];
  player: RuntimeState['player'];
  currentTime: GameTime;
}): Pick<RuntimeState, 'actors' | 'player'> {
  const playerActor = actors[player.actorId];
  const profileBirthDate = normalizeActorBirthDate(player.birthDate);
  const actorBirthDate = normalizeActorBirthDate(playerActor?.birthDate);
  const usableProfileBirthDate =
    profileBirthDate && deriveActorAgeAt({ birthDate: profileBirthDate }, currentTime) !== undefined
      ? profileBirthDate
      : undefined;
  const usableActorBirthDate =
    actorBirthDate && deriveActorAgeAt({ birthDate: actorBirthDate }, currentTime) !== undefined
      ? actorBirthDate
      : undefined;
  const authoritativePlayerBirthDate = usableProfileBirthDate ?? usableActorBirthDate;

  const normalizedActors = Object.fromEntries(
    Object.entries(actors).map(([actorId, actor]) => [
      actorId,
      normalizeActorAgeAt(
        actor,
        currentTime,
        actorId === player.actorId ? authoritativePlayerBirthDate : undefined
      )
    ])
  ) as RuntimeState['actors'];

  const normalizedPlayer = { ...player };
  if (authoritativePlayerBirthDate) {
    normalizedPlayer.birthDate = authoritativePlayerBirthDate;
  } else {
    delete normalizedPlayer.birthDate;
  }

  return {
    actors: normalizedActors,
    player: normalizedPlayer
  };
}

export function isAdultFemaleActorAt(actor: Actor, currentTime: GameTime): boolean {
  if (actor.gender !== 'female') return false;
  const age = deriveActorAgeAt(actor, currentTime);
  return typeof age === 'number' && age >= 18;
}

import type { GameTime } from '../runtime/types';

export function gameTimeToEpochMinutes(time: GameTime): number {
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute) / 60_000);
}

export function compareGameTimes(left: GameTime, right: GameTime): number {
  return gameTimeToEpochMinutes(left) - gameTimeToEpochMinutes(right);
}

export function addGameMinutes(time: GameTime, minutes: number): GameTime {
  const date = new Date((gameTimeToEpochMinutes(time) + minutes) * 60_000);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes()
  };
}

export function addGameHours(time: GameTime, hours: number): GameTime {
  return addGameMinutes(time, Math.round(hours * 60));
}

export function elapsedGameHours(from: GameTime, to: GameTime): number {
  return (gameTimeToEpochMinutes(to) - gameTimeToEpochMinutes(from)) / 60;
}

export function gameDateKey(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

export function gameTimeKey(time: GameTime): string {
  return `${gameDateKey(time)}T${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

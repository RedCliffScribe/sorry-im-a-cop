import type { DeferredEvent, GameTime, RuntimeState } from '../runtime/types';

function gameTimeValue(time: GameTime): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

export function isGameTimeDue(triggerAt: GameTime, currentTime: GameTime): boolean {
  return gameTimeValue(triggerAt) <= gameTimeValue(currentTime);
}

export function selectDueDeferredEvents(state: RuntimeState, limit = 3): DeferredEvent[] {
  return Object.values(state.deferredEvents)
    .filter((event) => event.status === 'pending')
    .filter((event) => isGameTimeDue(event.triggerAt, state.time))
    .sort((left, right) => gameTimeValue(left.triggerAt) - gameTimeValue(right.triggerAt) || left.eventId.localeCompare(right.eventId))
    .slice(0, limit);
}

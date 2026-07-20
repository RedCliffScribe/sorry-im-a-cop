import type { Actor, RuntimeState } from './types';

export function getPresentActors(state: RuntimeState): Actor[] {
  return Object.values(state.actors).filter((actor) => actor.presence === 'present');
}

export function getVisibleActors(state: RuntimeState): Actor[] {
  return Object.values(state.actors).filter((actor) => actor.visibility !== 'hidden');
}

export function getCurrentPlace(state: RuntimeState) {
  return state.places[state.location.currentPlaceId];
}

export function getCurrentScene(state: RuntimeState) {
  if (!state.location.currentSceneId) return undefined;
  return state.scenes[state.location.currentSceneId];
}

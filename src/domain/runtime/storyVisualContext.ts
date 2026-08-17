import type {
  GameTime,
  RuntimeEnvironmentState,
  RuntimeState,
  StoryVisualContextSnapshot
} from './types';

function formatTime(time: GameTime): string {
  return `${time.year}年${time.month}月${time.day}日 ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

export function createStoryVisualContext(input: {
  time: GameTime;
  environment: RuntimeEnvironmentState;
  location: RuntimeState['location'];
  places: RuntimeState['places'];
  scenes: RuntimeState['scenes'];
}): StoryVisualContextSnapshot {
  const place = input.places[input.location.currentPlaceId];
  const scene = input.location.currentSceneId ? input.scenes[input.location.currentSceneId] : undefined;
  const locationDescription = [
    place?.name,
    scene?.name,
    scene?.summary,
    scene?.temporaryState
  ].map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join('；');
  const weatherDescription = [
    input.environment.weather.label,
    input.environment.weather.impactSummary
  ].map((part) => part?.trim()).filter(Boolean).join('；');

  return {
    timeDescription: formatTime(input.time),
    locationDescription: locationDescription || input.location.currentPlaceId,
    ...(weatherDescription ? { weatherDescription } : {}),
    presentActorIds: [...(scene?.presentActorIds ?? [])],
    structuredEnvironment: {
      weatherCondition: input.environment.weather.condition,
      weatherIntensity: input.environment.weather.intensity,
      placeId: input.location.currentPlaceId,
      ...(input.location.currentSceneId
        ? { sceneId: input.location.currentSceneId }
        : {})
    }
  };
}

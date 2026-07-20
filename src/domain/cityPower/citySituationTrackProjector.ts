import type { CitySituationTrack, RuntimeState } from '../runtime/types';

export interface CitySituationTrackProjectionEntry {
  trackId: string;
  title: string;
  trackType: CitySituationTrack['trackType'];
  status: CitySituationTrack['status'];
  pressureLevel: number;
  visibility: CitySituationTrack['visibility'];
  currentBeat: string;
  summary: string;
  possibleDevelopments: string[];
  relatedOrganizationIds: string[];
  relatedPlaceIds: string[];
  relatedActorIds: string[];
  score: number;
  reasons: string[];
}

export interface CitySituationTrackProjection {
  tracks: CitySituationTrackProjectionEntry[];
  diagnostics: {
    selectedTrackIds: string[];
    omittedTrackCount: number;
    omittedHiddenCount: number;
  };
}

export interface CitySituationTrackProjectionOptions {
  relatedPlaceIds?: string[];
  relatedOrganizationIds?: string[];
  relatedActorIds?: string[];
}

function gameTimeValue(time: { year: number; month: number; day: number; hour: number; minute: number }): number {
  return (((time.year * 100 + time.month) * 100 + time.day) * 100 + time.hour) * 100 + time.minute;
}

function isScheduled(track: CitySituationTrack, state: RuntimeState): boolean {
  if (!track.nextReviewAt) return false;
  return gameTimeValue(track.nextReviewAt) <= gameTimeValue(state.time);
}

function textMatchesInput(track: CitySituationTrack, input: string): boolean {
  if (!input) return false;
  const haystacks = [track.title, track.summary, track.currentBeat, ...track.possibleDevelopments]
    .map((text) => text.trim().toLowerCase())
    .filter(Boolean);

  return haystacks.some((text) => {
    if (input.includes(text)) return true;
    for (let length = 4; length >= 2; length -= 1) {
      for (let index = 0; index <= text.length - length; index += 1) {
        const term = text.slice(index, index + length);
        if (input.includes(term)) return true;
      }
    }
    return false;
  });
}

function intersects(left: string[], right: string[] | undefined): boolean {
  if (!right?.length) return false;
  const rightSet = new Set(right);
  return left.some((id) => rightSet.has(id));
}

function projectTrack(
  state: RuntimeState,
  track: CitySituationTrack,
  input: string,
  options: CitySituationTrackProjectionOptions
): CitySituationTrackProjectionEntry {
  const reasons: string[] = [];
  let score = track.pressureLevel * 10;

  if (track.visibility === 'player_known') {
    score += 60;
    reasons.push('player_known');
  }
  if (track.visibility === 'public') {
    score += 30;
    reasons.push('public');
  }
  if (isScheduled(track, state)) {
    score += 20;
    reasons.push('scheduled_due');
  } else if (track.nextReviewAt) {
    score += 10;
    reasons.push('scheduled');
  }
  if (textMatchesInput(track, input)) {
    score += 30;
    reasons.push('input_text');
  }
  if (intersects(track.relatedPlaceIds, options.relatedPlaceIds)) {
    score += 40;
    reasons.push('place');
  }
  if (intersects(track.relatedOrganizationIds, options.relatedOrganizationIds)) {
    score += 40;
    reasons.push('organization');
  }
  if (intersects(track.relatedActorIds, options.relatedActorIds)) {
    score += 40;
    reasons.push('actor');
  }

  return {
    trackId: track.trackId,
    title: track.title,
    trackType: track.trackType,
    status: track.status,
    pressureLevel: track.pressureLevel,
    visibility: track.visibility,
    currentBeat: track.currentBeat,
    summary: track.summary,
    possibleDevelopments: [...track.possibleDevelopments],
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedActorIds: [...track.relatedActorIds],
    score,
    reasons
  };
}

export function projectCitySituationTrackContext(
  state: RuntimeState,
  playerInput: string,
  options: CitySituationTrackProjectionOptions = {}
): CitySituationTrackProjection {
  const input = playerInput.trim().toLowerCase();
  const candidates: CitySituationTrackProjectionEntry[] = [];
  let omittedHiddenCount = 0;

  for (const track of Object.values(state.citySituationTracks ?? {})) {
    if (track.status === 'resolved') continue;
    if (track.visibility === 'hidden') {
      omittedHiddenCount += 1;
      continue;
    }
    candidates.push(projectTrack(state, track, input, options));
  }

  const tracks = candidates
    .sort((left, right) => right.score - left.score || left.trackId.localeCompare(right.trackId))
    .slice(0, 4);

  return {
    tracks,
    diagnostics: {
      selectedTrackIds: tracks.map((track) => track.trackId),
      omittedTrackCount: Math.max(0, candidates.length - tracks.length),
      omittedHiddenCount
    }
  };
}

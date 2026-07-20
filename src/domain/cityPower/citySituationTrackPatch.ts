import type {
  CitySituationTrack,
  CitySituationTrackPatch,
  GameTime,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import { hkLateColonialPowerFigures } from './hkLateColonialPowerFigures';

export interface CitySituationTrackPatchResult {
  tracks: RuntimeState['citySituationTracks'];
  diagnostics: StoryDiagnosticIssue[];
}

const defaultTrackCadenceDays: Record<CitySituationTrack['trackType'], number> = {
  film_production: 21,
  triad_expansion: 14,
  leadership_transition: 21,
  police_operation: 7,
  icac_investigation: 14,
  government_policy: 30,
  media_campaign: 14,
  market_pressure: 21,
  public_safety: 7,
  labor_dispute: 14
};

const knownPowerFigureIds = new Set(hkLateColonialPowerFigures.map((figure) => figure.canonicalSeedId));

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function trimText(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function cloneTrack(track: CitySituationTrack): CitySituationTrack {
  return {
    ...track,
    startedAt: cloneGameTime(track.startedAt),
    ...(track.nextReviewAt ? { nextReviewAt: cloneGameTime(track.nextReviewAt) } : {}),
    relatedOrganizationIds: [...track.relatedOrganizationIds],
    relatedPowerFigureIds: [...track.relatedPowerFigureIds],
    relatedPlaceIds: [...track.relatedPlaceIds],
    relatedActorIds: [...track.relatedActorIds],
    possibleDevelopments: [...track.possibleDevelopments]
  };
}

function filterExistingIds(
  ids: string[] | undefined,
  exists: (id: string) => boolean,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] | undefined {
  if (!ids) return undefined;
  const kept: string[] = [];
  for (const id of ids) {
    if (exists(id)) {
      kept.push(id);
      continue;
    }
    diagnostics.push({
      path,
      code: 'city_situation_track_bad_reference',
      message: `City situation track reference "${id}" was ignored because it does not exist.`
    });
  }
  return [...new Set(kept)];
}

function relationIdsForPatch(
  existing: CitySituationTrack | undefined,
  patchIds: string[] | undefined,
  exists: (id: string) => boolean,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  const filtered = filterExistingIds(patchIds, exists, path, diagnostics);
  if (filtered === undefined) return existing ? [...existing.relatedOrganizationIds] : [];
  if (existing && filtered.length === 0) return [...existing.relatedOrganizationIds];
  return filtered;
}

function patchPlaceIds(
  existing: CitySituationTrack | undefined,
  patch: CitySituationTrackPatch,
  state: RuntimeState,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  const filtered = filterExistingIds(
    patch.relatedPlaceIds,
    (id) => Boolean(state.places[id]),
    [...path, 'relatedPlaceIds'],
    diagnostics
  );
  if (filtered === undefined) return existing ? [...existing.relatedPlaceIds] : [];
  if (existing && filtered.length === 0) return [...existing.relatedPlaceIds];
  return filtered;
}

function patchActorIds(
  existing: CitySituationTrack | undefined,
  patch: CitySituationTrackPatch,
  state: RuntimeState,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  const filtered = filterExistingIds(
    patch.relatedActorIds,
    (id) => Boolean(state.actors[id]),
    [...path, 'relatedActorIds'],
    diagnostics
  );
  if (filtered === undefined) return existing ? [...existing.relatedActorIds] : [];
  if (existing && filtered.length === 0) return [...existing.relatedActorIds];
  return filtered;
}

function patchPowerFigureIds(
  existing: CitySituationTrack | undefined,
  patch: CitySituationTrackPatch,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  const filtered = filterExistingIds(
    patch.relatedPowerFigureIds,
    (id) => knownPowerFigureIds.has(id),
    [...path, 'relatedPowerFigureIds'],
    diagnostics
  );
  if (filtered === undefined) return existing ? [...existing.relatedPowerFigureIds] : [];
  if (existing && filtered.length === 0) return [...existing.relatedPowerFigureIds];
  return filtered;
}

function patchOrganizationIds(
  existing: CitySituationTrack | undefined,
  patch: CitySituationTrackPatch,
  state: RuntimeState,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): string[] {
  const filtered = filterExistingIds(
    patch.relatedOrganizationIds,
    (id) => Boolean(state.organizations[id]),
    [...path, 'relatedOrganizationIds'],
    diagnostics
  );
  if (filtered === undefined) return existing ? [...existing.relatedOrganizationIds] : [];
  if (existing && filtered.length === 0) return [...existing.relatedOrganizationIds];
  return filtered;
}

function createOrUpdateTrack(
  state: RuntimeState,
  existing: CitySituationTrack | undefined,
  patch: CitySituationTrackPatch,
  path: Array<string | number>,
  diagnostics: StoryDiagnosticIssue[]
): CitySituationTrack | undefined {
  if (!existing && (!patch.title || !patch.trackType || !patch.summary)) {
    diagnostics.push({
      path,
      code: 'incomplete_city_situation_track_patch',
      message: `City situation track "${patch.trackId}" was ignored because a new track requires title, trackType and summary.`
    });
    return undefined;
  }

  const trackType = patch.trackType ?? existing!.trackType;
  const summary = trimText(patch.summary, 280) ?? existing?.summary ?? '';
  const currentBeat = trimText(patch.currentBeat, 220) ?? existing?.currentBeat ?? summary;
  const cadenceDays = clamp(patch.cadenceDays ?? existing?.cadenceDays ?? defaultTrackCadenceDays[trackType], 1, 90);

  return {
    trackId: patch.trackId,
    title: trimText(patch.title, 80) ?? existing?.title ?? patch.trackId,
    trackType,
    status: patch.status ?? existing?.status ?? 'latent',
    pressureLevel: clamp(patch.pressureLevel ?? existing?.pressureLevel ?? 1, 0, 5),
    visibility: patch.visibility ?? existing?.visibility ?? 'rumor',
    startedAt: patch.startedAt ? cloneGameTime(patch.startedAt) : existing?.startedAt ? cloneGameTime(existing.startedAt) : cloneGameTime(state.time),
    ...(patch.nextReviewAt
      ? { nextReviewAt: cloneGameTime(patch.nextReviewAt) }
      : existing?.nextReviewAt
        ? { nextReviewAt: cloneGameTime(existing.nextReviewAt) }
        : {}),
    cadenceDays,
    relatedOrganizationIds: patchOrganizationIds(existing, patch, state, path, diagnostics),
    relatedPowerFigureIds: patchPowerFigureIds(existing, patch, path, diagnostics),
    relatedPlaceIds: patchPlaceIds(existing, patch, state, path, diagnostics),
    relatedActorIds: patchActorIds(existing, patch, state, path, diagnostics),
    summary,
    currentBeat,
    possibleDevelopments:
      patch.possibleDevelopments && patch.possibleDevelopments.length
        ? patch.possibleDevelopments.map((item) => trimText(item, 80)).filter((item): item is string => Boolean(item))
        : existing
          ? [...existing.possibleDevelopments]
          : [],
    ...(existing?.lastOutputTurnId ? { lastOutputTurnId: existing.lastOutputTurnId } : {})
  };
}

export function applyCitySituationTrackPatches(
  state: RuntimeState,
  patches: CitySituationTrackPatch[] = []
): CitySituationTrackPatchResult {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const tracks = Object.fromEntries(
    Object.entries(state.citySituationTracks ?? {}).map(([trackId, track]) => [trackId, cloneTrack(track)])
  ) as RuntimeState['citySituationTracks'];

  patches.forEach((patch, index) => {
    const path = ['writeback', 'citySituationTrackPatches', index];
    const existing = tracks[patch.trackId];

    if (patch.operation === 'resolve') {
      if (!existing) {
        diagnostics.push({
          path,
          code: 'missing_city_situation_track',
          message: `City situation track "${patch.trackId}" could not be resolved because it does not exist.`
        });
        return;
      }
      tracks[patch.trackId] = { ...existing, status: 'resolved' };
      return;
    }

    if (patch.operation === 'update' && !existing) {
      diagnostics.push({
        path,
        code: 'missing_city_situation_track',
        message: `City situation track "${patch.trackId}" could not be updated because it does not exist.`
      });
      return;
    }

    const nextTrack = createOrUpdateTrack(state, existing, patch, path, diagnostics);
    if (nextTrack) {
      tracks[nextTrack.trackId] = nextTrack;
    }
  });

  return { tracks, diagnostics };
}

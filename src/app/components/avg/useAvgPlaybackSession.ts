import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveAvgPresentation,
  type AvgPlayerPortraitMode,
  type AvgPresentationCarryState,
  type AvgPresentationSequence
} from '../../../domain/avgPresentation';
import type { RuntimeState, StoryEntry } from '../../../domain/runtime/types';
import type { AvgVisualOverrideRepository } from '../../../domain/avgVisualOverride';
import type {
  ActiveAvgResourceSession,
  AvgPresentationResourceRuntime
} from './avgPresentationResourceRuntime';
import {
  readAvgEnvironmentDevPreview,
  readAvgFixedIdentityDevPreview
} from './avgEnvironmentDevPreview';

const BOOTSTRAP_ENTRY_LIMIT = 8;

export type AvgPlaybackStatus = 'idle' | 'resolving' | 'ready' | 'error';
export type AvgResourceStatus = 'loading' | 'ready' | 'unavailable' | 'error';

export interface AvgPlaybackSessionState {
  activeStoryEntry?: StoryEntry;
  sequence?: AvgPresentationSequence;
  frameIndex: number;
  status: AvgPlaybackStatus;
  error?: string;
}

interface UseAvgPlaybackSessionInput {
  entries: readonly StoryEntry[];
  runtimeState: RuntimeState;
  saveId: string;
  playbackRevision?: number;
  enabled: boolean;
  resourceRuntime?: AvgPresentationResourceRuntime;
  resourceRevision?: number;
  playerPortraitMode?: AvgPlayerPortraitMode;
  overrideRepository?: AvgVisualOverrideRepository;
  overrideRevision?: number;
}

interface PlaybackObservation {
  saveId: string;
  playbackRevision: number;
  turnCounter: number;
  entryKey?: string;
  resourceToken: string;
  playerPortraitMode: AvgPlayerPortraitMode;
  overrideRevision: number;
}

function latestNarratorEntry(entries: readonly StoryEntry[]): StoryEntry | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.speaker === 'narrator' && entry.turnId !== 'streaming_narrator') {
      return entry;
    }
  }
  return undefined;
}

function storyEntryKey(entry: StoryEntry | undefined): string | undefined {
  if (!entry) return undefined;
  return `${entry.turnId}\u001f${entry.gameTime.year}-${entry.gameTime.month}-${entry.gameTime.day}-${entry.gameTime.hour}-${entry.gameTime.minute}\u001f${entry.text}`;
}

function narratorEntriesThrough(
  entries: readonly StoryEntry[],
  target: StoryEntry
): StoryEntry[] {
  const targetIndex = entries.lastIndexOf(target);
  return entries
    .slice(0, targetIndex < 0 ? entries.length : targetIndex + 1)
    .filter((entry) => entry.speaker === 'narrator')
    .slice(-BOOTSTRAP_ENTRY_LIMIT);
}

async function resolveBootstrapSequence(input: {
  entries: readonly StoryEntry[];
  target: StoryEntry;
  runtimeState: RuntimeState;
  saveId: string;
  resourceSession?: ActiveAvgResourceSession;
  playerPortraitMode: AvgPlayerPortraitMode;
  overrideRepository?: AvgVisualOverrideRepository;
}): Promise<AvgPresentationSequence> {
  const runtimeState = readAvgFixedIdentityDevPreview(input.runtimeState);
  let carry: AvgPresentationCarryState | undefined;
  let latest: AvgPresentationSequence | undefined;
  for (const entry of narratorEntriesThrough(input.entries, input.target)) {
    const preview = readAvgEnvironmentDevPreview(entry);
    latest = await resolveAvgPresentation({
      saveId: input.saveId,
      storyEntry: preview.storyEntry,
      runtimeState,
      resourceResolver: input.resourceSession?.resolver,
      activePack: input.resourceSession?.activePack,
      overrideRepository: input.overrideRepository,
      playerPortraitMode: input.playerPortraitMode,
      ...(preview.sceneInput ? { sceneInput: preview.sceneInput } : {}),
      previousPresentation: carry
    });
    carry = latest.finalPresentation;
  }
  if (latest) return latest;
  const preview = readAvgEnvironmentDevPreview(input.target);
  return resolveAvgPresentation({
    saveId: input.saveId,
    storyEntry: preview.storyEntry,
    runtimeState,
    resourceResolver: input.resourceSession?.resolver,
    activePack: input.resourceSession?.activePack,
    overrideRepository: input.overrideRepository,
    playerPortraitMode: input.playerPortraitMode,
    ...(preview.sceneInput ? { sceneInput: preview.sceneInput } : {})
  });
}

export function useAvgPlaybackSession({
  entries,
  runtimeState,
  saveId,
  playbackRevision = 0,
  enabled,
  resourceRuntime,
  resourceRevision = 0,
  playerPortraitMode = 'hidden',
  overrideRepository,
  overrideRevision = 0
}: UseAvgPlaybackSessionInput) {
  const [resourceSession, setResourceSession] = useState<ActiveAvgResourceSession>();
  const [resourceStatus, setResourceStatus] = useState<AvgResourceStatus>(
    resourceRuntime ? 'loading' : 'unavailable'
  );
  const [resourceError, setResourceError] = useState<string>();
  const [retryToken, setRetryToken] = useState(0);
  const [session, setSession] = useState<AvgPlaybackSessionState>({
    frameIndex: 0,
    status: 'idle'
  });
  const latestEntry = useMemo(() => latestNarratorEntry(entries), [entries]);
  const entryKey = storyEntryKey(latestEntry);
  const requestIdRef = useRef(0);
  const carryRef = useRef<AvgPresentationCarryState | undefined>(undefined);
  const frameIndexRef = useRef(0);
  const observationRef = useRef<PlaybackObservation | undefined>(undefined);
  const needsBootstrapRef = useRef(true);
  const sawEmptyLogRef = useRef(!latestEntry);
  frameIndexRef.current = session.frameIndex;

  useEffect(() => {
    let active = true;
    if (!resourceRuntime) {
      setResourceSession(undefined);
      setResourceStatus('unavailable');
      setResourceError(undefined);
      return () => undefined;
    }

    resourceRuntime.reset();
    setResourceSession(undefined);
    setResourceStatus('loading');
    setResourceError(undefined);
    void resourceRuntime.loadActivePack(runtimeState.world.worldpackId).then(
      (loaded) => {
        if (!active) return;
        setResourceSession(loaded);
        setResourceStatus(loaded ? 'ready' : 'unavailable');
      },
      (reason) => {
        if (!active) return;
        setResourceSession(undefined);
        setResourceStatus('error');
        setResourceError(reason instanceof Error ? reason.message : String(reason));
      }
    );
    return () => {
      active = false;
    };
  }, [resourceRevision, resourceRuntime, runtimeState.world.worldpackId]);

  useEffect(() => () => resourceRuntime?.reset(), [resourceRuntime]);

  const resourceToken = `${resourceRevision}:${resourceSession?.selectionToken ?? resourceStatus}`;

  useEffect(() => {
    if (!latestEntry) {
      sawEmptyLogRef.current = true;
      carryRef.current = undefined;
      observationRef.current = {
        saveId,
        playbackRevision,
        turnCounter: runtimeState.turnCounter,
        resourceToken,
        playerPortraitMode,
        overrideRevision
      };
      setSession({ frameIndex: 0, status: 'idle' });
      return;
    }
    if (!enabled) {
      needsBootstrapRef.current = true;
      return;
    }
    if (resourceStatus === 'loading') return;

    const previous = observationRef.current;
    const saveChanged = Boolean(previous && previous.saveId !== saveId);
    const playbackReset = Boolean(
      previous && previous.playbackRevision !== playbackRevision
    );
    const rolledBack = Boolean(previous && runtimeState.turnCounter < previous.turnCounter);
    const resourceChanged = Boolean(previous && previous.resourceToken !== resourceToken);
    const playerPortraitModeChanged = Boolean(
      previous && previous.playerPortraitMode !== playerPortraitMode
    );
    const overrideChanged = Boolean(
      previous && previous.overrideRevision !== overrideRevision
    );
    const entryChanged = previous?.entryKey !== entryKey;
    const shouldResolve =
      needsBootstrapRef.current ||
      !previous ||
      saveChanged ||
      playbackReset ||
      rolledBack ||
      resourceChanged ||
      playerPortraitModeChanged ||
      overrideChanged ||
      entryChanged;
    if (!shouldResolve) return;

    const appearedAfterEmptyLog =
      sawEmptyLogRef.current && entryChanged && !previous?.entryKey;
    const shouldStartAtBeginning = appearedAfterEmptyLog || (
      !saveChanged &&
      !playbackReset &&
      !rolledBack &&
      !resourceChanged &&
      entryChanged &&
      Boolean(previous?.entryKey) &&
      !needsBootstrapRef.current
    );
    const requestId = ++requestIdRef.current;
    const preservedFrameIndex = frameIndexRef.current;
    if (
      saveChanged ||
      playbackReset ||
      rolledBack ||
      resourceChanged ||
      playerPortraitModeChanged ||
      overrideChanged ||
      needsBootstrapRef.current
    ) {
      carryRef.current = undefined;
      setSession({ activeStoryEntry: latestEntry, frameIndex: 0, status: 'resolving' });
    } else {
      setSession((current) => ({
        ...current,
        activeStoryEntry: latestEntry,
        status: 'resolving',
        error: undefined
      }));
    }
    observationRef.current = {
      saveId,
      playbackRevision,
      turnCounter: runtimeState.turnCounter,
      entryKey,
      resourceToken,
      playerPortraitMode,
      overrideRevision
    };
    needsBootstrapRef.current = false;
    sawEmptyLogRef.current = false;

    const preview = readAvgEnvironmentDevPreview(latestEntry);
    const previewRuntimeState = readAvgFixedIdentityDevPreview(runtimeState);
    const resolution = shouldStartAtBeginning
      ? resolveAvgPresentation({
          saveId,
          storyEntry: preview.storyEntry,
          runtimeState: previewRuntimeState,
          resourceResolver: resourceSession?.resolver,
          activePack: resourceSession?.activePack,
          overrideRepository,
          playerPortraitMode,
          ...(preview.sceneInput ? { sceneInput: preview.sceneInput } : {}),
          previousPresentation: carryRef.current
        })
      : resolveBootstrapSequence({
          entries,
          target: latestEntry,
          runtimeState,
          saveId,
          resourceSession,
          playerPortraitMode,
          overrideRepository
        });

    void resolution.then(
      (sequence) => {
        if (requestId !== requestIdRef.current) return;
        carryRef.current = sequence.finalPresentation;
        const finalIndex = Math.max(0, sequence.frames.length - 1);
        const resolvedFrameIndex = playerPortraitModeChanged || overrideChanged
          ? Math.min(preservedFrameIndex, finalIndex)
          : shouldStartAtBeginning ? 0 : finalIndex;
        setSession({
          activeStoryEntry: latestEntry,
          sequence,
          frameIndex: resolvedFrameIndex,
          status: 'ready'
        });
      },
      (reason) => {
        if (requestId !== requestIdRef.current) return;
        setSession({
          activeStoryEntry: latestEntry,
          frameIndex: 0,
          status: 'error',
          error: reason instanceof Error ? reason.message : String(reason)
        });
      }
    );
  }, [
    enabled,
    entries,
    entryKey,
    latestEntry,
    resourceSession,
    resourceStatus,
    resourceToken,
    runtimeState,
    saveId,
    playbackRevision,
    playerPortraitMode,
    overrideRepository,
    overrideRevision,
    retryToken
  ]);

  const next = useCallback(() => {
    setSession((current) => {
      if (!current.sequence?.frames.length) return current;
      return {
        ...current,
        frameIndex: Math.min(current.frameIndex + 1, current.sequence.frames.length - 1)
      };
    });
  }, []);

  const previous = useCallback(() => {
    setSession((current) => ({
      ...current,
      frameIndex: Math.max(0, current.frameIndex - 1)
    }));
  }, []);

  const replay = useCallback(() => {
    setSession((current) => ({ ...current, frameIndex: 0 }));
  }, []);

  const complete = useCallback(() => {
    setSession((current) => {
      if (!current.sequence?.frames.length) return current;
      return { ...current, frameIndex: current.sequence.frames.length - 1 };
    });
  }, []);

  const retry = useCallback(() => {
    needsBootstrapRef.current = true;
    setRetryToken((value) => value + 1);
  }, []);

  return {
    session,
    resourceSession,
    resourceStatus,
    resourceError,
    next,
    previous,
    replay,
    complete,
    retry
  };
}

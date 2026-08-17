import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import type { NarratorClient } from '../narrator/NarratorClient';
import type {
  BackgroundEvolutionRunRecord,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import { applyBackgroundEvolution } from './applyBackgroundEvolution';
import { stableBackgroundIdFragment } from './ids';
import { createBackgroundEvolutionPrompt } from './prompt';
import {
  BackgroundEvolutionProtocolError,
  parseBackgroundEvolutionWriteback
} from './protocol';
import type { BackgroundEvolutionSelection } from './selection';
import { addGameHours, cloneGameTime, compareGameTimes } from './time';
import { advanceSignalLifecycle } from '../dynamic/signalLifecycle';

export interface RunBackgroundEvolutionInput {
  state: RuntimeState;
  selection: BackgroundEvolutionSelection;
  client?: NarratorClient | null;
  foregroundTurnId: string;
  signal?: AbortSignal;
}

export interface RunBackgroundEvolutionResult {
  state: RuntimeState;
  diagnostics: StoryDiagnosticIssue[];
  status: BackgroundEvolutionRunRecord['status'];
  aborted: boolean;
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value ?? '');
  }
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(
    signal?.aborted ||
      (error instanceof DOMException && error.name === 'AbortError') ||
      (error instanceof Error && error.name === 'AbortError')
  );
}

function runId(foregroundTurnId: string, selection: BackgroundEvolutionSelection): string {
  const suffix = selection.selectedReviewKeys[0] ?? selection.reason;
  return `background_run_${stableBackgroundIdFragment(foregroundTurnId)}_${stableBackgroundIdFragment(suffix)}`;
}

function withLastRun(
  state: RuntimeState,
  record: BackgroundEvolutionRunRecord
): RuntimeState {
  return {
    ...state,
    backgroundEvolution: {
      ...state.backgroundEvolution,
      lastRun: record
    }
  };
}

function reviewWasApplied(state: RuntimeState, reviewKey: string): boolean {
  return (
    Object.values(state.backgroundEvolution.npcTracks).some(
      (track) => track.lastAppliedReviewKey === reviewKey
    ) ||
    Object.values(state.backgroundEvolution.organizationTracks).some(
      (track) => track.lastAppliedReviewKey === reviewKey
    ) ||
    state.backgroundEvolution.recentOutcomes.some(
      (outcome) => outcome.sourceReviewKey === reviewKey
    )
  );
}

function deferUnansweredCandidates(
  state: RuntimeState,
  selection: BackgroundEvolutionSelection,
  foregroundTurnId: string
): RuntimeState {
  const next = structuredClone(state);
  const npcReviewCooldownUntil = {
    ...(next.backgroundEvolution.npcReviewCooldownUntil ?? {})
  };

  for (const candidate of selection.npcCandidates) {
    if (reviewWasApplied(next, candidate.reviewKey)) {
      delete npcReviewCooldownUntil[candidate.actorId];
      continue;
    }
    npcReviewCooldownUntil[candidate.actorId] = addGameHours(next.time, 24);
    if (!candidate.trackId) continue;
    const track = next.backgroundEvolution.npcTracks[candidate.trackId];
    if (!track || compareGameTimes(track.nextReviewAt, next.time) > 0) continue;
    track.nextReviewAt = addGameHours(
      next.time,
      candidate.relatedCaseIds.length > 0 ? 6 : 24
    );
  }

  for (const candidate of selection.cityCandidates) {
    const track = next.citySituationTracks[candidate.trackId];
    if (
      !track ||
      track.lastOutputTurnId === foregroundTurnId ||
      !track.nextReviewAt ||
      compareGameTimes(track.nextReviewAt, next.time) > 0
    ) {
      continue;
    }
    track.nextReviewAt = addGameHours(next.time, 24);
  }

  next.backgroundEvolution.npcReviewCooldownUntil = npcReviewCooldownUntil;
  return next;
}

function baseRecord(
  state: RuntimeState,
  selection: BackgroundEvolutionSelection,
  foregroundTurnId: string
): BackgroundEvolutionRunRecord {
  return {
    runId: runId(foregroundTurnId, selection),
    reason: selection.reason,
    status: 'running',
    requestedAt: cloneGameTime(state.time),
    selectedReviewKeys: [...selection.selectedReviewKeys],
    appliedPatchCount: 0,
    droppedPatchCount: 0
  };
}

export async function runBackgroundEvolution({
  state,
  selection,
  client,
  foregroundTurnId,
  signal
}: RunBackgroundEvolutionInput): Promise<RunBackgroundEvolutionResult> {
  const startedAt = Date.now();
  const record = baseRecord(state, selection, foregroundTurnId);
  const lifecycleState = advanceSignalLifecycle(state).state;
  if (selection.selectedReviewKeys.length === 0) {
    const lastRun: BackgroundEvolutionRunRecord = {
      ...record,
      status: 'skipped',
      finishedAt: cloneGameTime(state.time),
      durationMs: Date.now() - startedAt,
      errorReason: 'no_candidates'
    };
    return { state: withLastRun(lifecycleState, lastRun), diagnostics: [], status: 'skipped', aborted: false };
  }
  if (!client) {
    const lastRun: BackgroundEvolutionRunRecord = {
      ...record,
      status: 'skipped',
      finishedAt: cloneGameTime(state.time),
      durationMs: Date.now() - startedAt,
      errorReason: 'route_disabled'
    };
    return {
      state: withLastRun(lifecycleState, lastRun),
      diagnostics: [
        {
          path: ['backgroundEvolution'],
          code: 'background_evolution_disabled',
          message: '后台演化存在到期候选，但功能路由已停用。'
        }
      ],
      status: 'skipped',
      aborted: false
    };
  }

  const prompt = createBackgroundEvolutionPrompt(state, selection);
  let rawText = '';
  try {
    const raw = await client.complete(prompt, {
      signal,
      onRawText: (value) => {
        rawText = value;
      }
    });
    const parsed = parseBackgroundEvolutionWriteback(raw);
    const applied = applyBackgroundEvolution({
      state,
      selection,
      writeback: parsed.writeback,
      foregroundTurnId
    });
    const outputText = rawText || serialize(raw);
    const lastRun: BackgroundEvolutionRunRecord = {
      ...record,
      status: 'succeeded',
      finishedAt: cloneGameTime(state.time),
      appliedPatchCount: applied.appliedPatchCount,
      droppedPatchCount: applied.droppedPatchCount + parsed.droppedItemCount,
      inputTokens: estimateNarrativeTokens(prompt),
      outputTokens: estimateNarrativeTokens(outputText),
      durationMs: Date.now() - startedAt
    };
    const deferredState = deferUnansweredCandidates(
      applied.state,
      selection,
      foregroundTurnId
    );
    const reviewedState =
      selection.organizationCandidates.length > 0
        ? {
            ...deferredState,
            backgroundEvolution: {
              ...deferredState.backgroundEvolution,
              lastOrganizationReviewAt: cloneGameTime(deferredState.time)
            }
          }
        : deferredState;
    const appliedState =
      applied.appliedPatchCount > 0
        ? {
            ...reviewedState,
            backgroundEvolution: {
              ...reviewedState.backgroundEvolution,
              lastAppliedAt: cloneGameTime(reviewedState.time)
            }
          }
        : reviewedState;
    return {
      state: withLastRun(appliedState, lastRun),
      diagnostics: [...parsed.diagnostics, ...applied.diagnostics],
      status: 'succeeded',
      aborted: false
    };
  } catch (error) {
    const aborted = isAbort(error, signal);
    const errorReason =
      error instanceof BackgroundEvolutionProtocolError
        ? error.message
        : error instanceof Error
          ? error.message
          : aborted
            ? '后台演化已中止。'
            : '后台演化 API 失败。';
    const lastRun: BackgroundEvolutionRunRecord = {
      ...record,
      status: aborted ? 'aborted' : 'failed',
      finishedAt: cloneGameTime(state.time),
      durationMs: Date.now() - startedAt,
      inputTokens: estimateNarrativeTokens(prompt),
      outputTokens: rawText ? estimateNarrativeTokens(rawText) : 0,
      errorReason
    };
    return {
      state: withLastRun(lifecycleState, lastRun),
      diagnostics: [
        {
          path: ['backgroundEvolution'],
          code: aborted ? 'background_evolution_aborted' : 'background_evolution_failed',
          message: aborted ? `后台演化已中止；主回合已保留。${errorReason ? ` ${errorReason}` : ''}` : `后台演化失败；主回合已保留。${errorReason}`
        }
      ],
      status: lastRun.status,
      aborted
    };
  }
}

import { applyCustomContentDramaExecution } from '../customContent/dramaExecution';
import { recordDramaTurn } from '../drama/runtime';
import { normalizeDramaticContentSettings } from '../drama/settings';
import type { DramaticContentSettings } from '../drama/types';
import type { RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import { applyOpeningNarratorResponse } from './applyOpeningResponse';
import {
  openingBlueprintSchema,
  type OpeningBlueprint,
  type OpeningCoreActor
} from './openingBlueprintSchema';
import { validateOpeningBlueprintQuality } from './openingBlueprintQualityGate';
import { lockOpeningCastDraft, type LockedOpeningCast } from './openingCastDraft';
import {
  createOpeningDramaReceipt,
  dramaDiagnosticsToStoryIssues,
  normalizeOpeningDramaPlan,
  validateOpeningDramaExecutionTrace,
  validateOpeningDramaPlan
} from './openingDrama';
import {
  openingInitializationSchema,
  type OpeningInitialization
} from './openingInitializationSchema';
import { mergeOpeningPhases } from './mergeOpeningPhases';
import type { OpeningSessionDraft } from './openingSessionDraft';
import { validateOpeningPhaseConsistency } from './validateOpeningPhaseConsistency';
import { resolveOpeningCustomContentSupport } from '../drama/customContentProviders';

export interface OpeningFinalizationMetrics {
  inputTokens: number;
  outputTokens: number;
  responseMs: number;
}

function readyProfiles(draft: OpeningSessionDraft): OpeningCoreActor[] {
  if (!draft.castDraft) throw new Error('开局草稿缺少最小人物蓝图');
  return draft.castDraft.actors.map((actor) => {
    const checkpoint = draft.actorProfiles[actor.slotId];
    if (!checkpoint || checkpoint.status !== 'ready') {
      throw new Error(`人物 ${actor.slotId} 尚未完成档案补全`);
    }
    return checkpoint.profile;
  });
}

function defaultPlayerPresentation(
  state: RuntimeState
): OpeningBlueprint['playerPresentationPatch'] {
  const playerActor = state.actors[state.player.actorId];
  return {
    ...(state.player.name.trim() ? { name: state.player.name } : {}),
    ...(state.player.englishName
      ? { englishName: state.player.englishName }
      : {}),
    ...(state.player.policeNumber
      ? { policeNumber: state.player.policeNumber }
      : {}),
    clothing: playerActor?.clothing ?? '符合当前身份与场景的开局衣着。',
    equipment: playerActor?.equipment ?? [],
    statusSummary: playerActor?.statusSummary ?? '准备开始本局。'
  };
}

export function createOpeningBlueprintFromSession(
  draft: OpeningSessionDraft,
  state: RuntimeState,
  playerPresentationPatch: OpeningBlueprint['playerPresentationPatch'] =
    defaultPlayerPresentation(state),
  validateQuality = true
): { blueprint: OpeningBlueprint; cast: LockedOpeningCast } {
  if (!draft.castDraft) throw new Error('开局草稿缺少最小人物蓝图');
  const cast = lockOpeningCastDraft(draft.castDraft, draft.skeleton, state);
  const actors = readyProfiles(draft);
  const actorIds = new Map(
    cast.actors.map((actor) => [actor.slotId, actor.actorId])
  );
  const raw = {
    openingSessionId: draft.openingSessionId,
    openingFacts: {
      placeId: draft.skeleton.currentPlaceId,
      sceneId: draft.skeleton.currentSceneId,
      ...draft.castDraft.openingFacts
    },
    playerPresentationPatch,
    initialActors: actors,
    dramaPlan: draft.castDraft.dramaPlan,
    actionIntents: draft.castDraft.actionIntents.map((action) => ({
      actionId: action.actionId,
      intent: action.intent,
      relatedActorIds: action.relatedActorSlotIds.map((slotId) => {
        const actorId = actorIds.get(slotId);
        if (!actorId) throw new Error(`行动引用了未知人物槽位 ${slotId}`);
        return actorId;
      }),
      requiredFacts: action.requiredFacts
    }))
  };
  const blueprint = openingBlueprintSchema.parse(raw);
  return {
    blueprint: validateQuality
      ? validateOpeningBlueprintQuality(blueprint, state)
      : blueprint,
    cast
  };
}

export function createOpeningInitializationFromSession(
  draft: OpeningSessionDraft
): OpeningInitialization {
  if (!draft.narrativeDraft) throw new Error('开局草稿缺少正文阶段');
  if (!draft.runtimeDraft) throw new Error('开局草稿缺少运行态阶段');
  const {
    playerPresentationPatch: _playerPresentationPatch,
    ...runtime
  } = draft.runtimeDraft;
  return openingInitializationSchema.parse({
    ...runtime,
    narrativeText: draft.narrativeDraft.narrativeText,
    presentationHints: draft.narrativeDraft.presentationHints,
    suggestedActions: draft.narrativeDraft.suggestedActions,
    dramaExecutionTrace: draft.narrativeDraft.dramaExecutionTrace
  });
}

function stageDiagnosticsToStoryIssues(
  draft: OpeningSessionDraft
): StoryDiagnosticIssue[] {
  return draft.diagnostics
    .filter(
      (diagnostic) =>
        diagnostic.status === 'recovered' || diagnostic.status === 'failed'
    )
    .map((diagnostic) => ({
      path: diagnostic.path?.map(String) ?? ['opening', diagnostic.stage],
      code: diagnostic.code ?? `opening_${diagnostic.stage}_${diagnostic.status}`,
      message: diagnostic.message
    }));
}

export function finalizeOpeningSession({
  draft,
  state,
  metrics,
  rawNarratorResponse,
  dramaticContentSettings
}: {
  draft: OpeningSessionDraft;
  state: RuntimeState;
  metrics: OpeningFinalizationMetrics;
  rawNarratorResponse?: string;
  dramaticContentSettings?: DramaticContentSettings;
}): RuntimeState {
  if (draft.stage !== 'runtime_ready') {
    throw new Error(`只有 runtime_ready 草稿可以提交，当前为 ${draft.stage}`);
  }
  if (!draft.runtimeDraft) throw new Error('runtime_ready 草稿缺少运行态');
  const { blueprint: rawBlueprint } = createOpeningBlueprintFromSession(
    draft,
    state,
    draft.runtimeDraft.playerPresentationPatch
  );
  const customSupport = resolveOpeningCustomContentSupport({ state });
  const planResult = validateOpeningDramaPlan({
    openingId: state.world.dramaticOpeningId,
    rawPlan: rawBlueprint.dramaPlan,
    allowedSupportSourceRef: customSupport?.source.ref
  });
  const blueprint = normalizeOpeningDramaPlan(rawBlueprint, planResult.plan);
  const initialization = validateOpeningPhaseConsistency(
    state,
    blueprint,
    createOpeningInitializationFromSession(draft)
  );
  const traceResult = validateOpeningDramaExecutionTrace({
    rawTrace: initialization.dramaExecutionTrace,
    plan: planResult.plan,
    blueprint,
    initialization
  });
  const dramaDiagnostics = [
    ...planResult.diagnostics,
    ...traceResult.diagnostics
  ];
  const merged = mergeOpeningPhases(blueprint, initialization);
  const warnings = [
    ...stageDiagnosticsToStoryIssues(draft),
    ...dramaDiagnosticsToStoryIssues(dramaDiagnostics)
  ];
  if (warnings.length > 0) {
    merged.validationWarnings = [
      ...(merged.validationWarnings ?? []),
      ...warnings
    ];
  }

  const applied = applyOpeningNarratorResponse(state, merged, {
    rawNarratorResponse,
    turnMetrics: metrics
  });
  const withCustomExecution = applyCustomContentDramaExecution({
    stateBeforeWriteback: state,
    stateAfterWriteback: applied,
    plan: planResult.plan,
    trace: traceResult.trace
  });
  const openingId = state.world.dramaticOpeningId;
  if (!openingId && dramaDiagnostics.length === 0) return withCustomExecution;

  return recordDramaTurn(
    withCustomExecution,
    traceResult.trace,
    dramaDiagnostics,
    openingId
      ? createOpeningDramaReceipt({
          settings: normalizeDramaticContentSettings(
            state.dramaticContent?.settings ?? dramaticContentSettings
          ),
          plan: planResult.plan,
          trace: traceResult.trace,
          diagnostics: dramaDiagnostics,
          inputCharacterCount: 0,
          planningDurationMs: metrics.responseMs,
          storypackInfluence: state.world.storypackInfluence,
          screenCharacterSeedsEnabled:
            state.world.screenCharacterSeedsEnabled !== false
        })
      : undefined
  );
}

import { z } from 'zod';
import { compileCreativeNarratorRequest } from '../prompts/creativePromptCompiler';
import { normalizeDramaticContentSettings } from '../drama/settings';
import { estimateNarrativeTokens } from '../narrator/estimateNarrativeTokens';
import type {
  NarratorAttemptRecord,
  NarratorClient,
  NarratorDetailedCompletion,
  NarratorInput,
  NarratorRequestPurpose,
  NarratorStreamOptions
} from '../narrator/NarratorClient';
import {
  NarratorAttemptError,
  NarratorTruncatedError
} from '../narrator/NarratorErrors';
import {
  resolveOpeningRepairStageBudget,
  resolveRequestOutputBudget
} from '../narrator/narratorLimits';
import {
  measureNarrativeLength,
  type NarrativeLengthMeasurement
} from '../narrator/narrativeLengthGuard';
import {
  createInitialRuntimeState,
  type OpeningSetup
} from '../runtime/initialState';
import type { RuntimeState } from '../runtime/types';
import type { NarrativeLengthLevel } from '../settings/narrativeLength';
import type {
  NarrativePerspective,
  PlayerPortrayalMode,
  PromptSettings,
  TavernManagementSettings
} from '../settings/types';
import type { DramaticContentSettings } from '../drama/types';
import type { AppLocale } from '../localization/appLocale';
import {
  applyOpeningActorEnrichmentRepair,
  createOpeningActorEnrichmentRepairStateSignature,
  extractOpeningActorEnrichmentProfile,
  readOpeningActorEnrichmentCandidates,
  validateOpeningActorEnrichment,
  type OpeningActorEnrichmentCandidate
} from './openingActorEnrichmentSchema';
import {
  composeOpeningActorEnrichmentPrompt,
  createOpeningActorEnrichmentRepairPrompt
} from './composeOpeningActorEnrichmentPrompt';
import {
  composeOpeningCastPrompt,
  createOpeningCastFieldRepairPrompt
} from './composeOpeningCastPrompt';
import {
  getOpeningBlueprintQualityIssues,
  getOpeningBlueprintQualityRepairPaths
} from './openingBlueprintQualityGate';
import {
  applyOpeningCastFieldRepair,
  getOpeningCastRepairIssues,
  lockOpeningCastDraft,
  type LockedOpeningCast
} from './openingCastDraft';
import type { OpeningExecutionStage } from './openingExecutionStage';
import { classifyOpeningFailure } from './openingFailureClassification';
import { OpeningCivilianEmployerContractError } from './openingCivilianEmployerContract';
import {
  createOpeningBlueprintFromSession,
  finalizeOpeningSession
} from './openingFinalization';
import { extractCompleteOpeningActionPreview } from './extractOpeningActionPreview';
import {
  applyOpeningNarrativeTraceRepair,
  composeOpeningNarrativePhasePrompt,
  createConservativeOpeningNarrativeTrace,
  createOpeningNarrativePhaseRetryPrompt,
  createOpeningNarrativeTraceRepairPrompt,
  normalizeOpeningNarrativeDramaTrace,
  validateOpeningNarrativeDraft
} from './openingNarrativePhase';
import {
  applyOpeningRuntimeDomainRepair,
  composeOpeningRuntimeInitializationPrompt,
  createOpeningRuntimeDomainRepairPrompt,
  validateOpeningRuntimeCandidate
} from './openingRuntimeInitialization';
import { IndexedDbOpeningSessionRepository } from './IndexedDbOpeningSessionRepository';
import {
  beginOrResumeOpeningSession,
  persistOpeningCastStage
} from './openingSessionCoordinator';
import { reconcileOpeningSessionCivilianEmployerContract } from './openingSessionEmployerMigration';
import type { OpeningSessionRepository } from './openingSessionRepository';
import {
  appendOpeningStageDiagnostic,
  createOpeningStageDiagnostic,
  markOpeningSessionCommitted,
  saveOpeningActorProfileCheckpoint,
  saveOpeningNarrativeCheckpoint,
  saveOpeningRuntimeCheckpoint,
  type OpeningSessionDraft
} from './openingSessionDraft';

const OPENING_STAGE_BUDGETS = {
  cast: 10_240,
  profiles: 12_288,
  narrative: 32_768,
  runtime: 8_192
} as const;

function openingNarrativeBudget(
  level: NarrativeLengthLevel | undefined
): number {
  if (level === 'compact') return 8_192;
  if (level === 'standard' || level === undefined) return 12_288;
  if (level === 'long') return 24_576;
  return OPENING_STAGE_BUDGETS.narrative;
}

function openingRepairBudget(client: NarratorClient): number {
  return resolveOpeningRepairStageBudget(client.configuredMaxTokens);
}

export interface RunOpeningV2Input {
  setup?: OpeningSetup;
  initialState?: RuntimeState;
  narrator: NarratorClient;
  repairNarrator?: NarratorClient;
  sessionRepository?: OpeningSessionRepository;
  narrativeLengthLevel?: NarrativeLengthLevel;
  narrativePerspective?: NarrativePerspective;
  playerPortrayalMode?: PlayerPortrayalMode;
  locale?: AppLocale;
  promptSettings?: PromptSettings;
  tavernSettings?: TavernManagementSettings;
  dramaticContentSettings?: DramaticContentSettings;
  onNarrativeDelta?: (delta: string) => void;
  onNarrativeReset?: () => void;
  onRawText?: (rawText: string) => void;
  onStageChange?: (stage: OpeningExecutionStage) => void;
  onStageDetail?: (message: string | null) => void;
  onActionPreview?: (actions: string[]) => void;
  onAttempt?: (attempt: NarratorAttemptRecord) => void;
  onReasoningText?: (reasoningText: string) => void;
  onSessionChange?: (openingSessionId: string) => void;
}

interface RequestCallbacks {
  onTextDelta?: (delta: string) => void;
  onRawDelta?: (delta: string) => void;
  onRawText?: (rawText: string) => void;
  onReasoningText?: (reasoningText: string) => void;
}

function fallbackAttempt(
  narrator: NarratorClient,
  purpose: NarratorRequestPurpose,
  stageMaxTokens: number,
  rawText: string
): NarratorAttemptRecord {
  const now = new Date().toISOString();
  const outputBudget = resolveRequestOutputBudget({
    configuredMaxTokens: narrator.configuredMaxTokens,
    stageMaxTokens
  });
  return {
    attemptId: `opening_v2_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    purpose,
    stream: false,
    requestedMaxTokens: outputBudget.requestedMaxTokens,
    outputBudget,
    finishReason: 'unknown',
    rawText,
    parseStatus: 'success',
    startedAt: now,
    finishedAt: now
  };
}

async function completeDetailed(
  narrator: NarratorClient,
  input: NarratorInput,
  purpose: NarratorRequestPurpose,
  stageMaxTokens: number,
  callbacks: RequestCallbacks
): Promise<NarratorDetailedCompletion> {
  const options: NarratorStreamOptions = {
    requestPurpose: purpose,
    stageMaxTokens,
    onTextDelta: callbacks.onTextDelta,
    onRawDelta: callbacks.onRawDelta,
    onRawText: callbacks.onRawText,
    onReasoningText: callbacks.onReasoningText
  };
  if (narrator.completeDetailed) {
    return narrator.completeDetailed(input, options);
  }
  let rawText = '';
  const value = await narrator.complete(input, {
    ...options,
    onRawText: (text) => {
      rawText = text;
      callbacks.onRawText?.(text);
    }
  });
  const serialized = rawText || JSON.stringify(value);
  return {
    value,
    attempt: fallbackAttempt(narrator, purpose, stageMaxTokens, serialized)
  };
}

function jsonRepairPrompt(rawText: string): string {
  return `只修复以下开局阶段结果的 JSON 语法。不得补写新事实，不得改写正文或人物。
只返回修复后的完整 JSON object，不要 Markdown。

${rawText}`;
}

function errorText(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map(
        (issue) =>
          `${issue.path.map(String).join('.') || 'response'}：${issue.message}`
      )
      .join('；');
  }
  return error instanceof Error ? error.message : String(error);
}

export async function runOpeningV2({
  setup = {},
  initialState,
  narrator,
  repairNarrator = narrator,
  sessionRepository = new IndexedDbOpeningSessionRepository(),
  narrativeLengthLevel,
  narrativePerspective,
  playerPortrayalMode,
  locale,
  promptSettings,
  tavernSettings,
  dramaticContentSettings,
  onNarrativeDelta,
  onNarrativeReset,
  onRawText,
  onStageChange,
  onStageDetail,
  onActionPreview,
  onAttempt,
  onReasoningText,
  onSessionChange
}: RunOpeningV2Input): Promise<RuntimeState> {
  const baseState = initialState ?? createInitialRuntimeState(setup);
  const openingState: RuntimeState = dramaticContentSettings
    ? {
        ...baseState,
        dramaticContent: {
          ...(baseState.dramaticContent ?? {
            instances: [],
            recentDiagnostics: []
          }),
          settings: normalizeDramaticContentSettings(dramaticContentSettings)
        }
      }
    : baseState;
  const requestStartedAt = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let lastRawText = '';
  let draft: OpeningSessionDraft;
  const capabilityFallbackAttemptIds = new Set<string>();

  const compilePrompt = (prompt: string): NarratorInput => {
    const compilation = compileCreativeNarratorRequest({
      runtimePrompt: prompt,
      promptSettings,
      tavernSettings,
      scope: 'opening',
      playerName: openingState.player.name
    });
    inputTokens += estimateNarrativeTokens(
      compilation.messages.map((message) => message.content).join('\n')
    );
    return compilation.request;
  };

  const recordAttempt = (attempt: NarratorAttemptRecord) => {
    outputTokens +=
      attempt.usage?.completionTokens ??
      estimateNarrativeTokens(attempt.rawText);
    onAttempt?.(attempt);
  };

  const saveDiagnostic = async (
    diagnostic: Parameters<typeof createOpeningStageDiagnostic>[0]
  ) => {
    draft = appendOpeningStageDiagnostic(
      draft,
      createOpeningStageDiagnostic(diagnostic)
    );
    await sessionRepository.save(draft);
  };

  const recordProviderCapabilityFallback = async (
    attempt: NarratorAttemptRecord
  ) => {
    const fallback = attempt.providerCapabilityFallback;
    if (!fallback || capabilityFallbackAttemptIds.has(attempt.attemptId)) return;
    capabilityFallbackAttemptIds.add(attempt.attemptId);
    const stage =
      attempt.purpose === 'opening_cast' ||
      attempt.purpose === 'opening_cast_field_repair'
        ? 'cast'
        : attempt.purpose === 'opening_actor_enrichment' ||
            attempt.purpose === 'opening_actor_enrichment_repair'
          ? 'profiles'
          : attempt.purpose === 'opening_narrative' ||
              attempt.purpose === 'opening_narrative_trace_repair'
            ? 'narrative'
            : attempt.purpose === 'opening_runtime' ||
                attempt.purpose === 'opening_runtime_domain_repair'
              ? 'runtime'
              : 'consistency';
    await saveDiagnostic({
      stage,
      status: 'recovered',
      code: 'opening_provider_capability_rejected',
      message: `服务商明确拒绝 response_format=json_object（HTTP ${fallback.rejectedStatus}），当前阶段已自动改用纯 JSON 提示并继续。`
    });
  };

  const request = async ({
    prompt,
    purpose,
    maxTokens,
    client = narrator,
    compile = true,
    callbacks = {},
    truncatedRetryPrompt
  }: {
    prompt: string;
    purpose: NarratorRequestPurpose;
    maxTokens: number;
    client?: NarratorClient;
    compile?: boolean;
    callbacks?: RequestCallbacks;
    truncatedRetryPrompt?: string;
  }): Promise<unknown> => {
    try {
      const completion = await completeDetailed(
        client,
        compile ? compilePrompt(prompt) : prompt,
        purpose,
        maxTokens,
        {
          ...callbacks,
          onRawText: (rawText) => {
            lastRawText = rawText;
            onRawText?.(rawText);
            callbacks.onRawText?.(rawText);
          },
          onReasoningText
        }
      );
      recordAttempt(completion.attempt);
      await recordProviderCapabilityFallback(completion.attempt);
      return completion.value;
    } catch (error) {
      if (error instanceof NarratorAttemptError) {
        recordAttempt(error.attempt);
        await recordProviderCapabilityFallback(error.attempt);
      }
      if (
        error instanceof NarratorTruncatedError &&
        truncatedRetryPrompt
      ) {
        onStageDetail?.(
          '局部修复输出被截断，正在保留同一修复目标并用精简上下文重试一次。'
        );
        try {
          const retried = await completeDetailed(
            client,
            compile
              ? compilePrompt(truncatedRetryPrompt)
              : truncatedRetryPrompt,
            purpose,
            maxTokens,
            {}
          );
          recordAttempt(retried.attempt);
          await recordProviderCapabilityFallback(retried.attempt);
          return retried.value;
        } catch (retryError) {
          if (retryError instanceof NarratorAttemptError) {
            recordAttempt(retryError.attempt);
            await recordProviderCapabilityFallback(retryError.attempt);
          }
          throw retryError;
        }
      }
      const repairable =
        error instanceof NarratorAttemptError &&
        !(error instanceof NarratorTruncatedError) &&
        error.attempt.parseStatus === 'malformed_json' &&
        error.attempt.rawText.trim().length > 0;
      if (!repairable || !(error instanceof NarratorAttemptError)) throw error;

      onStageChange?.('repairing_opening_json');
      onStageDetail?.('当前阶段 JSON 语法异常，正在做一次小型结构修复。');
      const repaired = await completeDetailed(
        repairNarrator,
        jsonRepairPrompt(error.attempt.rawText),
        'opening_json_repair',
        openingRepairBudget(repairNarrator),
        {}
      );
      recordAttempt(repaired.attempt);
      return repaired.value;
    }
  };

  onStageChange?.('preparing_opening');
  onStageDetail?.(null);
  onActionPreview?.([]);
  const session = await beginOrResumeOpeningSession({
    setup,
    state: openingState,
    repository: sessionRepository
  });
  draft = session.draft;
  const employerMigration = reconcileOpeningSessionCivilianEmployerContract({
    draft,
    state: openingState
  });
  if (employerMigration.changed) {
    draft = employerMigration.draft;
    await sessionRepository.save(draft);
    onStageChange?.('repairing_opening_cast_fields');
    onStageDetail?.(
      '当前工作关系缺少可用机构，正在保留已通过内容并改建普通社会关系人物。'
    );
    for (const diagnostic of employerMigration.diagnostics) {
      await saveDiagnostic({
        stage: 'cast',
        status: 'recovered',
        code: diagnostic.code,
        path: diagnostic.path,
        message: diagnostic.message
      });
    }
  }
  onSessionChange?.(draft.openingSessionId);
  onStageDetail?.(
    session.resumed
      ? `已从 ${draft.stage} 检查点继续，不会重新生成已通过阶段。`
      : null
  );

  try {
  let cast: LockedOpeningCast;
  if (!draft.castDraft) {
    onStageChange?.('generating_opening_cast');
    const prompt = composeOpeningCastPrompt(
      {
        setup,
        initialState: openingState,
        narrativeLengthLevel,
        narrativePerspective,
        playerPortrayalMode,
        locale,
        promptSettings
      },
      draft.skeleton
    );
    let rawCast = await request({
      prompt,
      purpose: 'opening_cast',
      maxTokens: OPENING_STAGE_BUDGETS.cast
    });
    const castInput = {
      setup,
      initialState: openingState,
      narrativeLengthLevel,
      narrativePerspective,
      playerPortrayalMode,
      locale,
      promptSettings
    };
    const analysis = getOpeningCastRepairIssues(
      rawCast,
      draft.skeleton,
      openingState
    );
    rawCast = analysis.normalized;
    if (analysis.localChanges.length > 0) {
      await saveDiagnostic({
        stage: 'cast',
        status: 'recovered',
        message: `已在本地规范化最小人物蓝图：${analysis.localChanges.join('；')}`
      });
      const removedUnknownOrganizations = analysis.localChanges.filter(
        (change) => change.includes('移除模型提供的未知可选机构')
      );
      if (removedUnknownOrganizations.length > 0) {
        await saveDiagnostic({
          stage: 'cast',
          status: 'recovered',
          code: 'opening_unknown_optional_organization_removed',
          path: ['castDraft', 'actors', 'organizationIds'],
          message: removedUnknownOrganizations.join('；')
        });
      }
    }
    try {
      cast = lockOpeningCastDraft(rawCast, draft.skeleton, openingState);
    } catch (error) {
      if (analysis.issues.length === 0) throw error;
      await saveDiagnostic({
        stage: 'cast',
        status: 'recovered',
        code: 'opening_schema_failed',
        message: `首份最小人物蓝图只需修复 ${analysis.issues.length} 个局部路径：${analysis.issues
          .map((issue) => `${issue.path} ${issue.message}`)
          .join('；')}`
      });
      onStageChange?.('repairing_opening_cast_fields');
      onStageDetail?.(
        `正在保留首份人物与行动，只修复：${analysis.issues
          .map((issue) => issue.path)
          .join('、')}`
      );
      const rawRepair = await request({
        prompt: createOpeningCastFieldRepairPrompt({
          input: castInput,
          skeleton: draft.skeleton,
          rawCast,
          issues: analysis.issues
        }),
        purpose: 'opening_cast_field_repair',
        maxTokens: openingRepairBudget(repairNarrator),
        client: repairNarrator,
        compile: false
      });
      rawCast = applyOpeningCastFieldRepair(
        rawCast,
        rawRepair,
        analysis.issues.map((issue) => issue.path),
        draft.skeleton,
        openingState
      );
      onStageChange?.('validating_opening_cast');
      cast = lockOpeningCastDraft(rawCast, draft.skeleton, openingState);
      await saveDiagnostic({
        stage: 'cast',
        status: 'recovered',
        code: 'opening_schema_failed',
        message: `已保留首份最小人物蓝图，只应用局部修复：${analysis.issues
          .map((issue) => issue.path)
          .join('、')}`
      });
    }
    onStageChange?.('validating_opening_cast');
    const persisted = await persistOpeningCastStage({
      draft,
      rawCast,
      state: openingState,
      repository: sessionRepository
    });
    draft = persisted.draft;
    cast = persisted.lockedCast;
  } else {
    cast = lockOpeningCastDraft(draft.castDraft, draft.skeleton, openingState);
  }

  const pendingSlotIds = () =>
    cast.actors
      .filter(
        (actor) => draft.actorProfiles[actor.slotId]?.status !== 'ready'
      )
      .map((actor) => actor.slotId);

  const requestEnrichmentBatch = async (
    targetSlotIds: string[]
  ): Promise<OpeningActorEnrichmentCandidate[]> => {
    const prompt = composeOpeningActorEnrichmentPrompt(
      {
        setup,
        initialState: openingState,
        narrativeLengthLevel,
        narrativePerspective,
        playerPortrayalMode,
        locale,
        promptSettings
      },
      draft.skeleton,
      cast,
      targetSlotIds
    );
    const raw = await request({
      prompt,
      purpose: 'opening_actor_enrichment',
      maxTokens: OPENING_STAGE_BUDGETS.profiles
    });
    return readOpeningActorEnrichmentCandidates(
      raw,
      draft.openingSessionId
    );
  };

  const validateAndSaveActor = async (
    candidate: OpeningActorEnrichmentCandidate
  ) => {
    onStageChange?.('validating_opening_profiles');
    let validation = validateOpeningActorEnrichment(
      candidate,
      cast,
      openingState
    );
    let rawProfile = validation.normalizedProfile;
    const recordedProfileDiagnostics = new Set<string>();
    const recordProfileDiagnostics = async () => {
      for (const diagnostic of [
        ...validation.keyMemoryDiagnostics,
        ...validation.recentInteractionMemoryDiagnostics,
        ...validation.employerDiagnostics
      ]) {
        const key = `${diagnostic.code}:${diagnostic.path.join('.')}:${diagnostic.message}`;
        if (recordedProfileDiagnostics.has(key)) continue;
        recordedProfileDiagnostics.add(key);
        await saveDiagnostic({
          stage: 'profiles',
          status: 'recovered',
          code: diagnostic.code,
          path: [
            'actorProfiles',
            candidate.actorSlotId,
            ...diagnostic.path
          ],
          message: `人物 ${candidate.actorSlotId}：${diagnostic.message}`
        });
      }
    };
    await recordProfileDiagnostics();
    if (!validation.actor) {
      const lockedActor = cast.actors.find(
        (actor) => actor.slotId === candidate.actorSlotId
      );
      if (!lockedActor) throw new Error('人物补全引用了未知槽位');
      if (validation.employerContractStatus === 'upstream_contract_invalid') {
        throw new OpeningCivilianEmployerContractError({
          actorId: lockedActor.actorId,
          name: lockedActor.name
        });
      }
      const repairedPaths = new Set<string>();
      let employerSelectionAttempted = false;
      let noProgressCount = 0;
      for (let repairAttempt = 1; repairAttempt <= 5 && !validation.actor; repairAttempt += 1) {
        if (validation.repairPaths.length === 0) {
          throw new Error(
            `人物 ${candidate.actorSlotId} 无法局部修复：${validation.issues.join('；')}`
          );
        }
        const repairsEmployerSelection =
          validation.employerContractStatus === 'repair_required' &&
          validation.repairPaths.includes(
            'roleProfiles.civilian.employerOrganizationId'
          );
        if (repairsEmployerSelection && employerSelectionAttempted) {
          throw new Error(
            `人物 ${candidate.actorSlotId} 的雇主选择未返回合法候选；该受限字段只允许修复一次。`
          );
        }
        if (repairsEmployerSelection) employerSelectionAttempted = true;
        const beforeRepairState =
          createOpeningActorEnrichmentRepairStateSignature(
            rawProfile,
            validation.repairPaths
          );
        const beforeProblemState = JSON.stringify({
          paths: [...validation.repairPaths].sort(),
          issues: [...validation.issues].sort()
        });
        validation.repairPaths.forEach((path) => repairedPaths.add(path));
        onStageChange?.('repairing_opening_profile');
        onStageDetail?.(
          `正在只修复 ${lockedActor.name} 的 ${validation.repairPaths.join('、')}（第 ${repairAttempt}/5 次）。`
        );
        const rawRepair = await request({
          prompt: createOpeningActorEnrichmentRepairPrompt({
            actorSlotId: candidate.actorSlotId,
            lockedActor,
            rawProfile,
            issues: validation.issues,
            allowedPaths: validation.repairPaths,
            allowedEmployerOrganizationIds:
              validation.allowedEmployerOrganizationIds
          }),
          purpose: 'opening_actor_enrichment_repair',
          maxTokens: openingRepairBudget(repairNarrator),
          client: repairNarrator,
          compile: false
        });
        rawProfile = applyOpeningActorEnrichmentRepair(
          rawProfile,
          rawRepair,
          candidate.actorSlotId,
          validation.repairPaths
        );
        validation = validateOpeningActorEnrichment(
          { ...candidate, rawProfile },
          cast,
          openingState
        );
        rawProfile = validation.normalizedProfile;
        await recordProfileDiagnostics();
        if (
          validation.employerContractStatus === 'upstream_contract_invalid'
        ) {
          throw new OpeningCivilianEmployerContractError({
            actorId: lockedActor.actorId,
            name: lockedActor.name
          });
        }
        if (!validation.actor) {
          const afterRepairState =
            createOpeningActorEnrichmentRepairStateSignature(
              rawProfile,
              validation.repairPaths
            );
          const afterProblemState = JSON.stringify({
            paths: [...validation.repairPaths].sort(),
            issues: [...validation.issues].sort()
          });
          noProgressCount =
            beforeRepairState === afterRepairState ||
            beforeProblemState === afterProblemState
              ? noProgressCount + 1
              : 0;
          if (noProgressCount >= 2) {
            throw new Error(
              `人物 ${candidate.actorSlotId} 的局部修复连续两次没有有效进展，已停止重复请求：${validation.issues.join('；')}`
            );
          }
        }
      }
      if (!validation.actor) {
        throw new Error(
          `人物 ${candidate.actorSlotId} 在局部修复后仍失败：${validation.issues.join('；')}`
        );
      }
      await saveDiagnostic({
        stage: 'profiles',
        status: 'recovered',
        code: 'opening_quality_gate_failed',
        path: ['actorProfiles', candidate.actorSlotId],
        message: `人物 ${lockedActor.name} 仅修复了：${[...repairedPaths].join('、')}`
      });
    }
    draft = saveOpeningActorProfileCheckpoint(
      draft,
      candidate.actorSlotId,
      validation.actor
    );
    await sessionRepository.save(draft);
  };

  if (pendingSlotIds().length > 0) {
    onStageChange?.('generating_opening_profiles');
    const targets = pendingSlotIds();
    let candidates: OpeningActorEnrichmentCandidate[];
    try {
      candidates = await requestEnrichmentBatch(targets);
    } catch (error) {
      await saveDiagnostic({
        stage: 'profiles',
        status: 'recovered',
        code: 'opening_schema_failed',
        message: `人物补全批次外层结构无效，已只重试待补人物：${errorText(error)}`
      });
      candidates = await requestEnrichmentBatch(targets);
    }
    const bySlot = new Map<string, OpeningActorEnrichmentCandidate>();
    for (const candidate of candidates) {
      if (bySlot.has(candidate.actorSlotId)) {
        throw new Error(`人物补全重复返回槽位 ${candidate.actorSlotId}`);
      }
      bySlot.set(candidate.actorSlotId, candidate);
    }
    for (const slotId of targets) {
      let candidate = bySlot.get(slotId);
      if (!candidate) {
        const targeted = await requestEnrichmentBatch([slotId]);
        candidate = targeted.find((item) => item.actorSlotId === slotId);
      }
      if (!candidate) throw new Error(`人物补全缺少槽位 ${slotId}`);
      await validateAndSaveActor(candidate);
    }
  }

  for (let qualityRepairAttempt = 1; qualityRepairAttempt <= 3; qualityRepairAttempt += 1) {
    const unvalidatedBlueprint = createOpeningBlueprintFromSession(
      draft,
      openingState,
      undefined,
      false
    ).blueprint;
    const qualityIssues = getOpeningBlueprintQualityIssues(
      unvalidatedBlueprint,
      openingState
    );
    if (qualityIssues.length === 0) break;
    const paths = getOpeningBlueprintQualityRepairPaths(
      unvalidatedBlueprint,
      qualityIssues
    );
    const byIndex = new Map<number, string[]>();
    for (const path of paths) {
      const match = /^initialActors\.(\d+)\.(.+)$/.exec(path);
      if (!match) continue;
      const index = Number(match[1]);
      byIndex.set(index, [...(byIndex.get(index) ?? []), match[2]]);
    }
    if (byIndex.size === 0) {
      throw new Error(`人物整体质量无法安全局部修复：${qualityIssues.join('；')}`);
    }
    for (const [index, repairPaths] of byIndex) {
      const actor = unvalidatedBlueprint.initialActors[index];
      const lockedActor = cast.actors[index];
      const rawProfile = extractOpeningActorEnrichmentProfile(actor);
      onStageChange?.('repairing_opening_profile');
      onStageDetail?.(
        `正在修复人物整体区分度（第 ${qualityRepairAttempt}/3 轮）。`
      );
      const rawRepair = await request({
        prompt: createOpeningActorEnrichmentRepairPrompt({
          actorSlotId: lockedActor.slotId,
          lockedActor,
          rawProfile,
          issues: qualityIssues.filter((issue) => issue.startsWith(actor.name) || issue.startsWith('全部开局人物')),
          allowedPaths: repairPaths
        }),
        purpose: 'opening_actor_enrichment_repair',
        maxTokens: openingRepairBudget(repairNarrator),
        client: repairNarrator,
        compile: false
      });
      const repairedProfile = applyOpeningActorEnrichmentRepair(
        rawProfile,
        rawRepair,
        lockedActor.slotId,
        repairPaths
      );
      await validateAndSaveActor({
        actorSlotId: lockedActor.slotId,
        rawProfile: repairedProfile
      });
    }
  }
  createOpeningBlueprintFromSession(draft, openingState);

  if (!draft.narrativeDraft) {
    onStageChange?.('generating_opening_narrative');
    const profiles = cast.actors.map((actor) => {
      const checkpoint = draft.actorProfiles[actor.slotId];
      if (!checkpoint || checkpoint.status !== 'ready') {
        throw new Error(`人物 ${actor.slotId} 尚未完成`);
      }
      return checkpoint.profile;
    });
    const prompt = composeOpeningNarrativePhasePrompt({
      input: {
        setup,
        initialState: openingState,
        narrativeLengthLevel,
        narrativePerspective,
        playerPortrayalMode,
        locale,
        promptSettings
      },
      skeleton: draft.skeleton,
      cast,
      actorProfiles: profiles,
      narrativeLengthLevel
    });
    let streamedRaw = '';
    const callbacks: RequestCallbacks = {
      onTextDelta: onNarrativeDelta,
      onRawDelta: (delta) => {
        streamedRaw += delta;
        const actions = extractCompleteOpeningActionPreview(streamedRaw);
        if (actions.length > 0) {
          onStageChange?.('preparing_action_preview');
          onActionPreview?.(actions);
        }
      }
    };
    let rawNarrative: unknown;
    let narrative;
    let measurement: NarrativeLengthMeasurement;
    let retryIssue: string | undefined;
    try {
      rawNarrative = await request({
        prompt,
        purpose: 'opening_narrative',
        maxTokens: openingNarrativeBudget(narrativeLengthLevel),
        callbacks
      });
      narrative = validateOpeningNarrativeDraft(
        rawNarrative,
        draft.skeleton,
        cast
      );
      measurement = measureNarrativeLength(
        narrative.narrativeText,
        narrativeLengthLevel ?? 'standard',
        'opening'
      );
      if (measurement.severelyShort) {
        retryIssue = `正文 ${measurement.actual} 字，低于重生成阈值 ${measurement.retryBelow} 字`;
        throw new Error(retryIssue);
      }
    } catch (error) {
      retryIssue ??= errorText(error);
      await saveDiagnostic({
        stage: 'narrative',
        status: 'recovered',
        code: retryIssue.includes('重生成阈值')
          ? 'opening_narrative_too_short'
          : 'opening_schema_failed',
        message: `正文阶段首份候选未通过，已只重试正文：${retryIssue}`
      });
      onNarrativeReset?.();
      onActionPreview?.([]);
      streamedRaw = '';
      onStageChange?.('regenerating_opening_narrative');
      rawNarrative = await request({
        prompt: createOpeningNarrativePhaseRetryPrompt({
          originalPrompt: prompt,
          issues: [retryIssue],
          compact: error instanceof NarratorTruncatedError
        }),
        purpose: 'opening_narrative',
        maxTokens: openingNarrativeBudget(narrativeLengthLevel),
        callbacks
      });
      narrative = validateOpeningNarrativeDraft(
        rawNarrative,
        draft.skeleton,
        cast
      );
      measurement = measureNarrativeLength(
        narrative.narrativeText,
        narrativeLengthLevel ?? 'standard',
        'opening'
      );
    }
    if (measurement.actual < measurement.minimum) {
      await saveDiagnostic({
        stage: 'narrative',
        status: 'recovered',
        code: 'opening_narrative_too_short',
        path: ['narrativeText'],
        message: `最终正文 ${measurement.actual} 字，低于档位最低 ${measurement.minimum} 字，按软恢复合同保留。`
      });
    }
    const traceNormalization = normalizeOpeningNarrativeDramaTrace(
      narrative.dramaExecutionTrace,
      cast
    );
    const {
      dramaExecutionTrace: _rawDramaExecutionTrace,
      ...narrativeWithoutTrace
    } = narrative;
    if (traceNormalization.issues.length > 0) {
      onStageChange?.('repairing_opening_narrative_trace');
      onStageDetail?.('正文已保留，正在只修复戏剧执行回执。');
      try {
        const rawTraceRepair = await request({
          prompt: createOpeningNarrativeTraceRepairPrompt({
            cast,
            narrative,
            issues: traceNormalization.issues
          }),
          purpose: 'opening_narrative_trace_repair',
          maxTokens: openingRepairBudget(repairNarrator),
          client: repairNarrator,
          compile: false
        });
        const repairedTrace = applyOpeningNarrativeTraceRepair(
          rawTraceRepair,
          cast
        );
        narrative = {
          ...narrativeWithoutTrace,
          dramaExecutionTrace: repairedTrace
        };
        await saveDiagnostic({
          stage: 'narrative',
          status: 'recovered',
          code: 'opening_schema_failed',
          path: ['dramaExecutionTrace'],
          message: '正文与行动保持不变，仅修复了戏剧执行回执。'
        });
      } catch (error) {
        const conservativeTrace = createConservativeOpeningNarrativeTrace(cast);
        narrative = conservativeTrace
          ? {
              ...narrativeWithoutTrace,
              dramaExecutionTrace: conservativeTrace
            }
          : narrativeWithoutTrace;
        await saveDiagnostic({
          stage: 'narrative',
          status: 'recovered',
          code: 'opening_schema_failed',
          path: ['dramaExecutionTrace'],
          message: `戏剧执行回执小型修复失败，已保守记为未采用并保留正文：${errorText(error)}`
        });
      }
    } else {
      narrative = traceNormalization.trace
        ? {
            ...narrativeWithoutTrace,
            dramaExecutionTrace: traceNormalization.trace
          }
        : narrativeWithoutTrace;
      if (traceNormalization.locallyNormalized) {
        await saveDiagnostic({
          stage: 'narrative',
          status: 'recovered',
          path: ['dramaExecutionTrace'],
          message: '已按锁定 DramaPlan 在本地规范化戏剧执行回执。'
        });
      }
    }
    draft = saveOpeningNarrativeCheckpoint(draft, narrative);
    await sessionRepository.save(draft);
    onNarrativeReset?.();
    onNarrativeDelta?.(narrative.narrativeText);
    onActionPreview?.(narrative.suggestedActions.map((action) => action.text));
  } else {
    onNarrativeReset?.();
    onNarrativeDelta?.(draft.narrativeDraft.narrativeText);
    onActionPreview?.(
      draft.narrativeDraft.suggestedActions.map((action) => action.text)
    );
  }

  if (!draft.runtimeDraft) {
    onStageChange?.('generating_opening_state');
    const { blueprint } = createOpeningBlueprintFromSession(
      draft,
      openingState
    );
    const prompt = composeOpeningRuntimeInitializationPrompt({
      blueprint,
      narrative: draft.narrativeDraft!,
      state: openingState
    });
    let rawRuntime = await request({
      prompt,
      purpose: 'opening_runtime',
      maxTokens: OPENING_STAGE_BUDGETS.runtime
    });
    let validation = validateOpeningRuntimeCandidate(
      rawRuntime,
      draft.openingSessionId,
      openingState,
      blueprint
    );
    if (!validation.value) {
      onStageChange?.('repairing_opening_runtime_domain');
      const repairedDomains = new Set<string>();
      const attemptsByDomain = new Map<string, number>();
      let totalRepairAttempts = 0;
      while (!validation.value) {
        const issue = validation.issues[0];
        if (!issue) {
          throw new Error('开局运行态校验失败，但没有返回可修复字段');
        }
        const domainAttempts = attemptsByDomain.get(issue.domain) ?? 0;
        if (domainAttempts >= 2 || totalRepairAttempts >= 28) {
          throw new Error(
            `开局运行态 ${issue.domain} 局部修复后仍失败：${issue.message}`
          );
        }
        attemptsByDomain.set(issue.domain, domainAttempts + 1);
        totalRepairAttempts += 1;
        repairedDomains.add(issue.domain);
        onStageDetail?.(
          `只修复运行态领域 ${issue.domain}：${issue.paths.join('、') || '该领域'}。`
        );
        const promptInput = {
          blueprint,
          narrative: draft.narrativeDraft!,
          state: openingState,
          rawRuntime,
          acceptedDomains: validation.acceptedDomains,
          issue
        };
        const rawRepair = await request({
          prompt: createOpeningRuntimeDomainRepairPrompt(promptInput),
          truncatedRetryPrompt: createOpeningRuntimeDomainRepairPrompt({
            ...promptInput,
            compact: true
          }),
          purpose: 'opening_runtime_domain_repair',
          maxTokens: openingRepairBudget(repairNarrator),
          client: repairNarrator,
          compile: false
        });
        rawRuntime = applyOpeningRuntimeDomainRepair(
          rawRuntime,
          rawRepair,
          [issue]
        );
        validation = validateOpeningRuntimeCandidate(
          rawRuntime,
          draft.openingSessionId,
          openingState,
          blueprint
        );
      }
      await saveDiagnostic({
        stage: 'runtime',
        status: 'recovered',
        code: 'opening_runtime_domain_failed',
        message: `只修复了运行态领域：${[...repairedDomains].join('、')}`
      });
    }
    draft = saveOpeningRuntimeCheckpoint(draft, validation.value);
    await sessionRepository.save(draft);
  }

  onStageChange?.('validating_opening_data');
  const finalState = finalizeOpeningSession({
    draft,
    state: openingState,
    metrics: {
      inputTokens,
      outputTokens,
      responseMs: Date.now() - requestStartedAt
    },
    rawNarratorResponse: lastRawText,
    dramaticContentSettings
  });
  onStageChange?.('applying_opening');
  draft = markOpeningSessionCommitted(draft);
  await sessionRepository.save(draft);
  onSessionChange?.(draft.openingSessionId);
  onStageDetail?.(null);
  return finalState;
  } catch (error) {
    const stage =
      !draft.castDraft
        ? 'cast'
        : Object.values(draft.actorProfiles).some(
              (checkpoint) => checkpoint.status !== 'ready'
            )
          ? 'profiles'
          : !draft.narrativeDraft
            ? 'narrative'
            : !draft.runtimeDraft
              ? 'runtime'
              : 'consistency';
    const attempt =
      error instanceof NarratorAttemptError ? error.attempt : undefined;
    try {
      await saveDiagnostic({
        stage,
        status: 'failed',
        code: classifyOpeningFailure({
          stage,
          error,
          attempt,
          runtimeDomainFailed:
            stage === 'runtime' &&
            /运行态|runtime domain/i.test(errorText(error))
        }),
        message: errorText(error)
      });
    } catch {
      // Preserve the original stage failure if diagnostic persistence is also unavailable.
    }
    throw error;
  }
}

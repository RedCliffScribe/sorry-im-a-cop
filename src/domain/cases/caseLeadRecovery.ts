import type { NarratorClient } from '../narrator/NarratorClient';
import type { Actor, ActorId, RuntimeState, StoryDiagnosticIssue } from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';

type CasePatch = NarratorResponse['writeback']['casePatches'][number];
type ActorPatch = NarratorResponse['writeback']['actorPatches'][number];

const externalLeadRoles = new Set<CasePatch['playerRole']>(['assist', 'execute']);

interface CaseLeadActorSummary {
  actorId: ActorId;
  name: string;
  publicIdentity?: string;
  positionSummary?: string;
}

export interface ExternalCaseLeadRepairCandidate {
  caseId: string;
  playerRole: NonNullable<CasePatch['playerRole']>;
  allowedLeadActorIds: ActorId[];
}

export interface ExternalCaseLeadNormalizationResult {
  response: NarratorResponse;
  candidates: ExternalCaseLeadRepairCandidate[];
}

export interface ExternalCaseLeadRepairResult {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
}

interface ParsedCaseLeadRepair {
  caseId: string;
  decision: 'set' | 'leave_unknown';
  leadActorId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function canonicalActorId(actorId: string, aliases: Readonly<Record<string, string>>): string {
  let current = actorId;
  const visited = new Set<string>();
  while (aliases[current] && !visited.has(current)) {
    visited.add(current);
    current = aliases[current];
  }
  return current;
}

function actorSummaryFromRuntime(actor: Actor): CaseLeadActorSummary {
  return {
    actorId: actor.actorId,
    name: actor.name,
    publicIdentity: actor.publicIdentity,
    positionSummary: actor.positionSummary
  };
}

function actorSummaryFromPatch(patch: ActorPatch): CaseLeadActorSummary | undefined {
  const name = nonEmptyString(patch.name);
  if (!name) return undefined;
  return {
    actorId: patch.actorId,
    name,
    publicIdentity: nonEmptyString(patch.publicIdentity),
    positionSummary: nonEmptyString(patch.positionSummary)
  };
}

function buildActorIndex({
  state,
  response,
  actorIdAliases
}: {
  state: RuntimeState;
  response: NarratorResponse;
  actorIdAliases: Readonly<Record<string, string>>;
}): Map<ActorId, CaseLeadActorSummary> {
  const actors = new Map<ActorId, CaseLeadActorSummary>();
  Object.values(state.actors).forEach((actor) => {
    const canonicalId = canonicalActorId(actor.actorId, actorIdAliases);
    const canonicalActor = state.actors[canonicalId] ?? actor;
    actors.set(canonicalId, actorSummaryFromRuntime(canonicalActor));
  });
  response.writeback.actorPatches.forEach((patch) => {
    const summary = actorSummaryFromPatch(patch);
    if (!summary) return;
    const canonicalId = canonicalActorId(summary.actorId, actorIdAliases);
    const existing = actors.get(canonicalId);
    actors.set(canonicalId, {
      actorId: canonicalId,
      name: existing?.name ?? summary.name,
      publicIdentity: existing?.publicIdentity ?? summary.publicIdentity,
      positionSummary: existing?.positionSummary ?? summary.positionSummary
    });
  });
  return actors;
}

function relatedActorIdsForCase(
  state: RuntimeState,
  patch: CasePatch,
  actorIdAliases: Readonly<Record<string, string>>
): ActorId[] {
  const existing = state.cases[patch.caseId];
  const activityActorIds = (patch.activityLog ?? []).flatMap((activity) => [
    activity.actorId,
    ...(activity.relatedActorIds ?? [])
  ]);
  return [...new Set([
    ...(patch.involvedActorIds ?? []),
    ...(patch.relatedActorIds ?? []),
    ...(existing?.relatedActorIds ?? []),
    ...activityActorIds
  ].flatMap((actorId) => actorId ? [canonicalActorId(actorId, actorIdAliases)] : []))];
}

export function normalizeExternalCaseLeadWritebacks({
  state,
  response,
  actorIdAliases = {}
}: {
  state: RuntimeState;
  response: NarratorResponse;
  actorIdAliases?: Readonly<Record<string, string>>;
}): ExternalCaseLeadNormalizationResult {
  const actorIndex = buildActorIndex({ state, response, actorIdAliases });
  const candidates: ExternalCaseLeadRepairCandidate[] = [];
  const casePatches = response.writeback.casePatches.map((patch) => {
    const existing = state.cases[patch.caseId];
    const playerRole = patch.playerRole ?? existing?.playerRole;
    const requestedLeadActorId = patch.leadActorId
      ? canonicalActorId(patch.leadActorId, actorIdAliases)
      : undefined;
    const knownRequestedLead = requestedLeadActorId
      ? actorIndex.get(requestedLeadActorId)
      : undefined;

    if (knownRequestedLead && requestedLeadActorId !== state.player.actorId) {
      return {
        ...patch,
        leadActorId: requestedLeadActorId,
        leadActorName: knownRequestedLead.name
      };
    }

    const existingLeadActorId = existing?.leadActorId
      ? canonicalActorId(existing.leadActorId, actorIdAliases)
      : undefined;
    const existingLeadIsUsable = Boolean(
      existingLeadActorId &&
      existingLeadActorId !== state.player.actorId &&
      actorIndex.has(existingLeadActorId)
    );
    if (!playerRole || !externalLeadRoles.has(playerRole) || existingLeadIsUsable) {
      return patch;
    }

    const allowedLeadActorIds = relatedActorIdsForCase(
      state,
      patch,
      actorIdAliases
    ).filter((actorId) => actorId !== state.player.actorId && actorIndex.has(actorId));
    if (allowedLeadActorIds.length > 0) {
      candidates.push({
        caseId: patch.caseId,
        playerRole,
        allowedLeadActorIds
      });
    }
    return patch;
  });

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        casePatches
      }
    },
    candidates
  };
}

export function createExternalCaseLeadRepairPrompt({
  state,
  response,
  candidates,
  actorIdAliases = {}
}: {
  state: RuntimeState;
  response: NarratorResponse;
  candidates: ExternalCaseLeadRepairCandidate[];
  actorIdAliases?: Readonly<Record<string, string>>;
}): string {
  const actorIndex = buildActorIndex({ state, response, actorIdAliases });
  const candidateIds = new Set(candidates.map((candidate) => candidate.caseId));
  const allowedIds = new Set(candidates.flatMap((candidate) => candidate.allowedLeadActorIds));
  const cases = response.writeback.casePatches
    .filter((patch) => candidateIds.has(patch.caseId))
    .map((patch) => ({
      caseId: patch.caseId,
      title: patch.title ?? state.cases[patch.caseId]?.title,
      playerRole: patch.playerRole ?? state.cases[patch.caseId]?.playerRole,
      leadActorId: patch.leadActorId,
      leadActorName: patch.leadActorName,
      summary: patch.summary,
      currentFocus: patch.currentFocus,
      playerVisibleProgress: patch.playerVisibleProgress,
      relatedActorIds: patch.relatedActorIds,
      involvedActorIds: patch.involvedActorIds,
      activityLog: patch.activityLog?.map((activity) => ({
        kind: activity.kind,
        summary: activity.summary,
        actorId: activity.actorId,
        relatedActorIds: activity.relatedActorIds
      }))
    }));
  const actors = [...allowedIds].flatMap((actorId) => {
    const actor = actorIndex.get(actorId);
    return actor ? [actor] : [];
  });

  return [
    '你是案件主办者字段修复器。只修复本回合已经明确成立的外部主办者引用，不改正文和任何其他写回。',
    '只返回 JSON：{"caseLeadRepairs":[{"caseId":"case_x","decision":"set|leave_unknown","leadActorId":"actor_x","reason":"简短依据"}]}。',
    '规则：',
    '1. 只有 turnSummary 或结构化案件更新明确说明某个既有人物是该案主办、主管、负责探员时，decision 才能为 set。',
    '2. leadActorId 必须从该案件 allowedLeadActorIds 中选择；禁止按姓名新造 ID，禁止选择玩家本人。',
    '3. 信息只说明协办、参与、支援、上级在场或一般关系时，decision=leave_unknown。',
    '4. 每个 candidateCases 必须且只能返回一条决定；不得返回 casePatches、正文、人物或其他字段。',
    '',
    `turnSummary=${JSON.stringify(response.turnSummary)}`,
    `candidateCases=${JSON.stringify(cases)}`,
    `allowedActors=${JSON.stringify(actors)}`,
    `allowedIdsByCase=${JSON.stringify(candidates)}`
  ].join('\n');
}

export function parseExternalCaseLeadRepairResponse(value: unknown): ParsedCaseLeadRepair[] {
  const container = isRecord(value) && isRecord(value.writeback) ? value.writeback : value;
  const rawRepairs = isRecord(container) && Array.isArray(container.caseLeadRepairs)
    ? container.caseLeadRepairs
    : [];
  return rawRepairs.flatMap((item) => {
    if (!isRecord(item)) return [];
    const caseId = nonEmptyString(item.caseId);
    const decision = nonEmptyString(item.decision)?.toLowerCase().replace(/[\s-]+/g, '_');
    if (!caseId || (decision !== 'set' && decision !== 'leave_unknown')) return [];
    return [{
      caseId,
      decision,
      leadActorId: nonEmptyString(item.leadActorId)
    } satisfies ParsedCaseLeadRepair];
  });
}

export function mergeExternalCaseLeadRepairs({
  state,
  response,
  candidates,
  repairs,
  actorIdAliases = {}
}: {
  state: RuntimeState;
  response: NarratorResponse;
  candidates: ExternalCaseLeadRepairCandidate[];
  repairs: ParsedCaseLeadRepair[];
  actorIdAliases?: Readonly<Record<string, string>>;
}): ExternalCaseLeadRepairResult {
  const actorIndex = buildActorIndex({ state, response, actorIdAliases });
  const candidatesById = new Map(candidates.map((candidate) => [candidate.caseId, candidate]));
  const repairsById = new Map<string, ParsedCaseLeadRepair>();
  const duplicateIds = new Set<string>();
  repairs.forEach((repair) => {
    if (repairsById.has(repair.caseId)) duplicateIds.add(repair.caseId);
    else repairsById.set(repair.caseId, repair);
  });
  duplicateIds.forEach((caseId) => repairsById.delete(caseId));

  const diagnostics: StoryDiagnosticIssue[] = [];
  const casePatches = response.writeback.casePatches.map((patch) => {
    const candidate = candidatesById.get(patch.caseId);
    const repair = repairsById.get(patch.caseId);
    if (!candidate || !repair || repair.decision === 'leave_unknown') return patch;
    const requestedActorId = repair.leadActorId
      ? canonicalActorId(repair.leadActorId, actorIdAliases)
      : undefined;
    const allowed = requestedActorId && candidate.allowedLeadActorIds.includes(requestedActorId);
    const actor = requestedActorId ? actorIndex.get(requestedActorId) : undefined;
    if (!allowed || !actor || requestedActorId === state.player.actorId) {
      diagnostics.push({
        path: ['writebackRepair', 'caseLead', patch.caseId, 'leadActorId'],
        code: 'case_external_lead_repair_rejected',
        message: `案件 ${patch.caseId} 的主办者修复未引用该案允许的既有人物，已保留原案件写回。`
      });
      return patch;
    }
    return {
      ...patch,
      leadActorId: requestedActorId,
      leadActorName: actor.name
    };
  });

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        casePatches
      }
    },
    diagnostics
  };
}

export async function repairExternalCaseLeadWritebacks({
  state,
  response,
  writebackRepair,
  actorIdAliases = {}
}: {
  state: RuntimeState;
  response: NarratorResponse;
  writebackRepair?: NarratorClient | null;
  actorIdAliases?: Readonly<Record<string, string>>;
}): Promise<ExternalCaseLeadRepairResult> {
  const normalized = normalizeExternalCaseLeadWritebacks({ state, response, actorIdAliases });
  if (normalized.candidates.length === 0 || !writebackRepair) {
    return { response: normalized.response, diagnostics: [] };
  }

  try {
    const repairRaw = await writebackRepair.complete(
      createExternalCaseLeadRepairPrompt({
        state,
        response: normalized.response,
        candidates: normalized.candidates,
        actorIdAliases
      }),
      {
        requestPurpose: 'main_turn_case_lead_repair',
        stageMaxTokens: 4_096
      }
    );
    return mergeExternalCaseLeadRepairs({
      state,
      response: normalized.response,
      candidates: normalized.candidates,
      repairs: parseExternalCaseLeadRepairResponse(repairRaw),
      actorIdAliases
    });
  } catch (error) {
    return {
      response: normalized.response,
      diagnostics: [{
        path: ['writebackRepair', 'caseLead'],
        code: 'case_external_lead_repair_failed',
        message: error instanceof Error ? error.message : '案件外部主办者字段修复失败。'
      }]
    };
  }
}

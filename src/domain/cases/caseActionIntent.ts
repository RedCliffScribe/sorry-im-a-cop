import type { NarratorClient } from '../narrator/NarratorClient';
import type {
  CaseFile,
  CasePlayerRole,
  CaseStatus,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import type { NarratorResponse } from '../writeback/schema';

type CasePatch = NarratorResponse['writeback']['casePatches'][number];

export interface CaseActionIntent {
  kind: 'archive_request';
  caseId: string;
}

export interface ResolvedCaseActionIntent extends CaseActionIntent {
  title: string;
  currentStatus: CaseStatus;
  playerRole: CasePlayerRole;
}

export interface CaseActionIntentRepairResult {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
}

interface ParsedArchiveDecision {
  decision: 'archive' | 'defer' | 'reject';
  reason: string;
}

interface ParsedArchiveDecisionWithCaseId extends ParsedArchiveDecision {
  caseId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function inputRequestsArchive(input: string): boolean {
  return /归档|封存|结案归档|archive/i.test(input);
}

interface CaseTitleReference {
  title: string;
  index: number;
}

interface CaseTitleMatch {
  caseFile: CaseFile;
  index: number;
  end: number;
}

function bracketedCaseTitleReferences(input: string): CaseTitleReference[] {
  return Array.from(input.matchAll(/【([^】]+)】/g)).flatMap((match) => {
    const title = match[1]?.trim();
    return title && match.index !== undefined
      ? [{ title, index: match.index }]
      : [];
  });
}

function leadCasesByTitle(state: RuntimeState): Map<string, CaseFile[]> {
  const byTitle = new Map<string, CaseFile[]>();
  for (const caseFile of Object.values(state.cases)) {
    if (caseFile.playerRole !== 'lead') continue;
    byTitle.set(caseFile.title, [...(byTitle.get(caseFile.title) ?? []), caseFile]);
  }
  return byTitle;
}

function namedLeadCases(state: RuntimeState, input: string): CaseFile[] {
  const byTitle = leadCasesByTitle(state);
  const bracketedReferences = bracketedCaseTitleReferences(input);
  if (bracketedReferences.length > 0) {
    const seenCaseIds = new Set<string>();
    const bracketedMatches = bracketedReferences.flatMap((reference) => {
      const matches = byTitle.get(reference.title) ?? [];
      if (matches.length !== 1 || seenCaseIds.has(matches[0].caseId)) return [];
      seenCaseIds.add(matches[0].caseId);
      return [matches[0]];
    });
    if (bracketedMatches.length > 0) return bracketedMatches;
    const includesAmbiguousCaseTitle = bracketedReferences.some(
      (reference) => (byTitle.get(reference.title)?.length ?? 0) > 1
    );
    if (includesAmbiguousCaseTitle) return [];
  }

  const candidates: CaseTitleMatch[] = [];
  for (const [title, matches] of byTitle) {
    if (!title || matches.length !== 1) continue;
    let searchFrom = 0;
    while (searchFrom < input.length) {
      const index = input.indexOf(title, searchFrom);
      if (index < 0) break;
      candidates.push({
        caseFile: matches[0],
        index,
        end: index + title.length
      });
      searchFrom = index + Math.max(1, title.length);
    }
  }

  const nonOverlappingMatches: CaseTitleMatch[] = [];
  for (const candidate of candidates.sort((left, right) => {
    const lengthDifference = (right.end - right.index) - (left.end - left.index);
    return lengthDifference || left.index - right.index;
  })) {
    const overlapsLongerMatch = nonOverlappingMatches.some(
      (selected) => candidate.index < selected.end && candidate.end > selected.index
    );
    if (!overlapsLongerMatch) nonOverlappingMatches.push(candidate);
  }

  const earliestMatchByCaseId = new Map<string, CaseTitleMatch>();
  for (const match of nonOverlappingMatches) {
    const existing = earliestMatchByCaseId.get(match.caseFile.caseId);
    if (!existing || match.index < existing.index) earliestMatchByCaseId.set(match.caseFile.caseId, match);
  }
  return [...earliestMatchByCaseId.values()]
    .sort((left, right) => left.index - right.index)
    .map((match) => match.caseFile);
}

function inputNamesCase(state: RuntimeState, input: string, caseFile: CaseFile): boolean {
  const bracketedReferences = bracketedCaseTitleReferences(input);
  const byTitle = leadCasesByTitle(state);
  const includesKnownCaseTitle = bracketedReferences.some((reference) => byTitle.has(reference.title));
  if (includesKnownCaseTitle) {
    return bracketedReferences.some((reference) => reference.title === caseFile.title);
  }
  return namedLeadCases(state, input).some((namedCase) => namedCase.caseId === caseFile.caseId);
}

function inputCaseReferenceIndex(input: string, title: string): number {
  return bracketedCaseTitleReferences(input).find((reference) => reference.title === title)?.index
    ?? input.indexOf(title);
}

export function inferCaseActionIntent(state: RuntimeState, playerInput: string): CaseActionIntent | undefined {
  const matches = inferCaseActionIntents(state, playerInput);
  return matches.length === 1 ? matches[0] : undefined;
}

export function inferCaseActionIntents(state: RuntimeState, playerInput: string): CaseActionIntent[] {
  if (!inputRequestsArchive(playerInput)) return [];
  return namedLeadCases(state, playerInput)
    .map((caseFile) => ({ kind: 'archive_request', caseId: caseFile.caseId }));
}

export function resolveCaseActionIntent({
  state,
  playerInput,
  intent
}: {
  state: RuntimeState;
  playerInput: string;
  intent?: CaseActionIntent;
}): ResolvedCaseActionIntent | undefined {
  const resolved = resolveCaseActionIntents({ state, playerInput, intent });
  return resolved.length === 1 ? resolved[0] : undefined;
}

export function resolveCaseActionIntents({
  state,
  playerInput,
  intent
}: {
  state: RuntimeState;
  playerInput: string;
  intent?: CaseActionIntent;
}): ResolvedCaseActionIntent[] {
  if (!inputRequestsArchive(playerInput)) return [];
  const candidates = [intent, ...inferCaseActionIntents(state, playerInput)].filter(
    (candidate): candidate is CaseActionIntent => Boolean(candidate)
  );
  const validCandidates = candidates.filter((item) => {
    const caseFile = state.cases[item.caseId];
    return item.kind === 'archive_request'
      && caseFile?.playerRole === 'lead'
      && inputNamesCase(state, playerInput, caseFile);
  });
  const uniqueCandidates = Array.from(new Map(validCandidates.map((candidate) => [candidate.caseId, candidate])).values());
  return uniqueCandidates.map((candidate) => {
    const caseFile = state.cases[candidate.caseId];
    return {
      ...candidate,
      title: caseFile.title,
      currentStatus: caseFile.status,
      playerRole: caseFile.playerRole
    };
  }).sort((left, right) => inputCaseReferenceIndex(playerInput, left.title) - inputCaseReferenceIndex(playerInput, right.title));
}

export function formatCaseActionIntentForPrompt(intent: ResolvedCaseActionIntent): string {
  return [
    'CASE_ACTION_INTENT',
    `kind=${intent.kind}`,
    `caseId=${intent.caseId}`,
    `title=${intent.title}`,
    `currentStatus=${intent.currentStatus}`,
    `playerRole=${intent.playerRole}`,
    'Rule: 这是玩家从案件面板明确提交的结构化行动，必须在本回合给出可见结果，不能只在正文中描写。',
    'Rule: 若归档已经正式成立，必须逐字复用 caseId 并写 casePatches.status="archived"，同时写一条 kind="archived" 的可见 activityLog。',
    'Rule: 若手续、证据或程序条件尚未满足，保持原 status，并在同一 caseId 的可见 activityLog 中明确记录未归档原因和下一步；不得静默忽略。',
    'Rule: 不得新建另一个案件，不得把“申请归档”本身当作已经批准归档。'
  ].join('\n');
}

export function formatCaseActionIntentsForPrompt(intents: ResolvedCaseActionIntent[]): string {
  return intents.map((intent, index) => [
    `CASE_ACTION_INTENT_${index + 1}`,
    formatCaseActionIntentForPrompt(intent)
  ].join('\n')).join('\n\n');
}

function archiveActivity(summary: string): NonNullable<CasePatch['activityLog']>[number] {
  return {
    kind: 'archived',
    summary,
    relatedEvidenceIds: [],
    relatedActorIds: [],
    relatedPlaceIds: [],
    visibleToPlayer: true
  };
}

function resultActivity(summary: string): NonNullable<CasePatch['activityLog']>[number] {
  return {
    kind: 'instruction',
    summary,
    relatedEvidenceIds: [],
    relatedActorIds: [],
    relatedPlaceIds: [],
    visibleToPlayer: true
  };
}

function mergeIntentPatch(
  response: NarratorResponse,
  intent: ResolvedCaseActionIntent,
  decision: ParsedArchiveDecision
): NarratorResponse {
  const existingIndex = response.writeback.casePatches.findIndex((patch) => patch.caseId === intent.caseId);
  const existingPatch = existingIndex >= 0 ? response.writeback.casePatches[existingIndex] : undefined;
  const alreadyHasArchiveActivity = existingPatch?.activityLog?.some((activity) => activity.kind === 'archived');
  const alreadyHasResultActivity = existingPatch?.activityLog?.some(
    (activity) => activity.visibleToPlayer && activity.summary.includes(decision.reason)
  );
  const nextActivity = decision.decision === 'archive'
    ? alreadyHasArchiveActivity
      ? []
      : [archiveActivity(`案件已归档：${decision.reason}`)]
    : alreadyHasResultActivity
      ? []
      : [resultActivity(`归档申请${decision.decision === 'reject' ? '未获批准' : '暂缓处理'}：${decision.reason}`)];
  const mergedPatch: CasePatch = {
    ...(existingPatch ?? { caseId: intent.caseId }),
    ...(decision.decision === 'archive' ? { status: 'archived' as const } : {}),
    activityLog: [...(existingPatch?.activityLog ?? []), ...nextActivity]
  };
  const casePatches = [...response.writeback.casePatches];
  if (existingIndex >= 0) casePatches[existingIndex] = mergedPatch;
  else casePatches.push(mergedPatch);
  return {
    ...response,
    writeback: {
      ...response.writeback,
      casePatches
    }
  };
}

function parseArchiveDecision(value: unknown): ParsedArchiveDecision | undefined {
  const container = isRecord(value) && isRecord(value.caseArchiveDecision)
    ? value.caseArchiveDecision
    : value;
  if (!isRecord(container)) return undefined;
  const decision = nonEmptyString(container.decision)?.toLowerCase();
  const reason = nonEmptyString(container.reason);
  if (!reason || (decision !== 'archive' && decision !== 'defer' && decision !== 'reject')) return undefined;
  return { decision, reason };
}

function parseArchiveDecisions(
  value: unknown,
  intents: ResolvedCaseActionIntent[]
): ParsedArchiveDecisionWithCaseId[] {
  const candidateIds = new Set(intents.map((intent) => intent.caseId));
  const rawDecisions = isRecord(value) && Array.isArray(value.caseArchiveDecisions)
    ? value.caseArchiveDecisions
    : Array.isArray(value)
      ? value
      : undefined;
  if (!rawDecisions) {
    if (intents.length !== 1) return [];
    const legacyDecision = parseArchiveDecision(value);
    return legacyDecision ? [{ caseId: intents[0].caseId, ...legacyDecision }] : [];
  }

  const decisions = new Map<string, ParsedArchiveDecisionWithCaseId>();
  for (const rawDecision of rawDecisions) {
    if (!isRecord(rawDecision)) continue;
    const caseId = nonEmptyString(rawDecision.caseId);
    const decision = parseArchiveDecision(rawDecision);
    if (!caseId || !candidateIds.has(caseId) || !decision || decisions.has(caseId)) continue;
    decisions.set(caseId, { caseId, ...decision });
  }
  return Array.from(decisions.values());
}

export function createCaseArchiveDecisionPrompt({
  state,
  response,
  intent,
  playerInput
}: {
  state: RuntimeState;
  response: NarratorResponse;
  intent: ResolvedCaseActionIntent;
  playerInput: string;
}): string {
  const caseFile = state.cases[intent.caseId];
  const matchingPatch = response.writeback.casePatches.find((patch) => patch.caseId === intent.caseId);
  return [
    'CASE_ARCHIVE_DECISION_TASK',
    '你只核验本回合玩家的案件归档申请是否已经获得正式结果，不改正文，不创建案件，也不补造证据。',
    '只返回 JSON：{"caseArchiveDecision":{"decision":"archive|defer|reject","reason":"简短且玩家可见的事实理由"}}。',
    'archive：本回合事实已经明确完成归档、封存或结案手续。',
    'defer：案件可能可以归档，但本回合仍缺手续、材料、审批或明确结论。',
    'reject：本回合明确拒绝归档，或案件仍需继续办理。',
    '不得仅因玩家提出申请就选择 archive；不得引用未出现在本回合正文、摘要或结构化写回中的事实。',
    `playerInput=${JSON.stringify(playerInput)}`,
    `case=${JSON.stringify({
      caseId: caseFile.caseId,
      title: caseFile.title,
      status: caseFile.status,
      playerRole: caseFile.playerRole,
      currentFocus: caseFile.currentFocus,
      playerVisibleProgress: caseFile.playerVisibleProgress
    })}`,
    `turnSummary=${JSON.stringify(response.turnSummary)}`,
    `narrativeExcerpt=${JSON.stringify(response.narrativeText.slice(-2400))}`,
    `matchingCasePatch=${JSON.stringify(matchingPatch ?? null)}`
  ].join('\n');
}

export function createCaseArchiveDecisionsPrompt({
  state,
  response,
  intents,
  playerInput
}: {
  state: RuntimeState;
  response: NarratorResponse;
  intents: ResolvedCaseActionIntent[];
  playerInput: string;
}): string {
  return [
    'CASE_ARCHIVE_DECISIONS_TASK',
    '你只核验本回合玩家逐项提出的案件归档申请是否已经获得正式结果，不改正文，不创建案件，也不补造证据。',
    '只返回 JSON：{"caseArchiveDecisions":[{"caseId":"逐字复用候选ID","decision":"archive|defer|reject","reason":"简短且玩家可见的事实理由"}]}。',
    '必须为每一个候选 caseId 恰好返回一项；不得遗漏、重复或返回候选以外的案件。',
    'archive：本回合事实已经明确完成归档、封存或结案手续。',
    'defer：案件可能可以归档，但本回合仍缺手续、材料、审批或明确结论。',
    'reject：本回合明确拒绝归档，或案件仍需继续办理。',
    '不得仅因玩家提出申请就选择 archive；不得引用未出现在本回合正文、摘要或结构化写回中的事实。',
    `playerInput=${JSON.stringify(playerInput)}`,
    `cases=${JSON.stringify(intents.map((intent) => {
      const caseFile = state.cases[intent.caseId];
      return {
        caseId: caseFile.caseId,
        title: caseFile.title,
        status: caseFile.status,
        playerRole: caseFile.playerRole,
        currentFocus: caseFile.currentFocus,
        playerVisibleProgress: caseFile.playerVisibleProgress,
        matchingCasePatch: response.writeback.casePatches.find((patch) => patch.caseId === intent.caseId) ?? null
      };
    }))}`,
    `turnSummary=${JSON.stringify(response.turnSummary)}`,
    `narrativeExcerpt=${JSON.stringify(response.narrativeText.slice(-3200))}`
  ].join('\n');
}

export async function repairCaseActionIntent({
  state,
  response,
  intent,
  playerInput,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  intent?: ResolvedCaseActionIntent;
  playerInput: string;
  writebackRepair?: NarratorClient | null;
}): Promise<CaseActionIntentRepairResult> {
  return repairCaseActionIntents({
    state,
    response,
    intents: intent ? [intent] : [],
    playerInput,
    writebackRepair
  });
}

export async function repairCaseActionIntents({
  state,
  response,
  intents,
  playerInput,
  writebackRepair
}: {
  state: RuntimeState;
  response: NarratorResponse;
  intents: ResolvedCaseActionIntent[];
  playerInput: string;
  writebackRepair?: NarratorClient | null;
}): Promise<CaseActionIntentRepairResult> {
  let nextResponse = response;
  const diagnostics: StoryDiagnosticIssue[] = [];
  const unresolvedIntents: ResolvedCaseActionIntent[] = [];

  for (const intent of intents) {
    const caseFile = state.cases[intent.caseId];
    if (!caseFile || caseFile.playerRole !== 'lead' || caseFile.status === 'archived') continue;
    const matchingPatch = nextResponse.writeback.casePatches.find((patch) => patch.caseId === intent.caseId);
    if (matchingPatch?.status === 'archived') {
      nextResponse = mergeIntentPatch(nextResponse, intent, {
        decision: 'archive',
        reason: '本回合结构化案件写回已确认归档。'
      });
      continue;
    }
    unresolvedIntents.push(intent);
  }

  if (unresolvedIntents.length === 0) return { response: nextResponse, diagnostics };
  if (!writebackRepair) {
    for (const intent of unresolvedIntents) {
      const unresolved = unresolvedCaseActionResult(nextResponse, intent, '本回合未能取得归档核验结果，案件保持原状态。');
      nextResponse = unresolved.response;
      diagnostics.push(...unresolved.diagnostics);
    }
    return { response: nextResponse, diagnostics };
  }

  try {
    const raw = await writebackRepair.complete(
      createCaseArchiveDecisionsPrompt({ state, response: nextResponse, intents: unresolvedIntents, playerInput }),
      {
        requestPurpose: 'main_turn_case_action_repair',
        stageMaxTokens: 4_096
      }
    );
    const decisions = new Map(parseArchiveDecisions(raw, unresolvedIntents).map((decision) => [decision.caseId, decision]));
    for (const intent of unresolvedIntents) {
      const decision = decisions.get(intent.caseId);
      if (decision) {
        nextResponse = mergeIntentPatch(nextResponse, intent, decision);
        continue;
      }
      const unresolved = unresolvedCaseActionResult(nextResponse, intent, '归档核验遗漏此案件或返回格式无效，案件保持原状态。');
      nextResponse = unresolved.response;
      diagnostics.push(...unresolved.diagnostics);
    }
    return { response: nextResponse, diagnostics };
  } catch (error) {
    const reason = error instanceof Error ? `归档核验失败：${error.message}` : '归档核验失败，案件保持原状态。';
    for (const intent of unresolvedIntents) {
      const unresolved = unresolvedCaseActionResult(nextResponse, intent, reason);
      nextResponse = unresolved.response;
      diagnostics.push(...unresolved.diagnostics);
    }
    return { response: nextResponse, diagnostics };
  }
}

function unresolvedCaseActionResult(
  response: NarratorResponse,
  intent: ResolvedCaseActionIntent,
  reason: string
): CaseActionIntentRepairResult {
  return {
    response: mergeIntentPatch(response, intent, { decision: 'defer', reason }),
    diagnostics: [{
      path: ['writebackRepair', 'caseAction', intent.caseId],
      code: 'case_archive_intent_unresolved',
      message: reason
    }]
  };
}

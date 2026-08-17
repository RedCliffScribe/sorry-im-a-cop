import type {
  RuntimeState,
  StoryDiagnosticIssue,
  Visibility
} from '../runtime/types';
import {
  casePatchSchema,
  type NarratorResponse
} from '../writeback/schema';

type CasePatch = NarratorResponse['writeback']['casePatches'][number];

export interface CaseWritebackIntentRecovery {
  response: NarratorResponse;
  diagnostics: StoryDiagnosticIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizedToken(value: unknown): string | undefined {
  return nonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, '_');
}

function stringList(value: unknown): string[] | undefined {
  const source = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const result = [...new Set(source.flatMap((item) => {
    const normalized = nonEmptyString(item);
    return normalized ? [normalized] : [];
  }))];
  return result.length > 0 ? result : undefined;
}

const statusAliases: Readonly<Record<string, CasePatch['status']>> = {
  intake: 'intake',
  pending: 'intake',
  received: 'intake',
  '受理': 'intake',
  '受理中': 'intake',
  investigating: 'investigating',
  investigation: 'investigating',
  under_investigation: 'investigating',
  active: 'investigating',
  ongoing: 'investigating',
  open: 'investigating',
  '调查': 'investigating',
  '调查中': 'investigating',
  '办理中': 'investigating',
  submitted_to_prosecutions: 'submitted_to_prosecutions',
  submitted_to_prosecution: 'submitted_to_prosecutions',
  prosecution_submitted: 'submitted_to_prosecutions',
  '已提交检控': 'submitted_to_prosecutions',
  prosecution_review: 'prosecution_review',
  '检控审查': 'prosecution_review',
  charged: 'charged',
  '已控告': 'charged',
  '已提出控罪': 'charged',
  court_scheduled: 'court_scheduled',
  '已排期开庭': 'court_scheduled',
  tried: 'tried',
  '已审理': 'tried',
  sentenced: 'sentenced',
  '已判决': 'sentenced',
  returned: 'returned',
  '退回补充': 'returned',
  archived: 'archived',
  closed: 'archived',
  sealed: 'archived',
  '已归档': 'archived',
  cold: 'cold',
  dormant: 'cold',
  suspended: 'cold',
  '暂缓': 'cold'
};

const playerRoleAliases: Readonly<Record<string, CasePatch['playerRole']>> = {
  lead: 'lead',
  main: 'lead',
  primary: 'lead',
  officer_in_charge: 'lead',
  handler: 'lead',
  '主办': 'lead',
  '负责人': 'lead',
  assist: 'assist',
  assistant: 'assist',
  support: 'assist',
  co_lead: 'assist',
  '协办': 'assist',
  '协助': 'assist',
  execute: 'execute',
  assigned: 'execute',
  assigned_officer: 'execute',
  handling: 'execute',
  '执行': 'execute',
  '承办': 'execute',
  involved: 'involved',
  participant: 'involved',
  related: 'involved',
  '关联': 'involved',
  '参与': 'involved',
  aware: 'aware',
  informed: 'aware',
  observer: 'aware',
  rumor: 'aware',
  '知情': 'aware'
};

const legacyAccessRoles: Readonly<Record<string, CasePatch['playerRole']>> = {
  none: 'aware',
  rumor: 'aware',
  partial: 'involved',
  assigned: 'execute',
  full: 'lead'
};

const activityKindAliases = new Set([
  'created',
  'evidence_added',
  'status_changed',
  'lead_changed',
  'actor_added',
  'place_added',
  'instruction',
  'prosecution_update',
  'court_update',
  'archived',
  'note'
]);

const activityKindMap: Readonly<Record<string, string>> = {
  creation: 'created',
  opened: 'created',
  evidence: 'evidence_added',
  evidence_update: 'evidence_added',
  progress: 'note',
  update: 'note',
  status_update: 'status_changed',
  assignment: 'instruction',
  prosecution: 'prosecution_update',
  court: 'court_update',
  archive: 'archived',
  '建立': 'created',
  '新增证据': 'evidence_added',
  '进展': 'note',
  '状态变化': 'status_changed',
  '指示': 'instruction',
  '检控进展': 'prosecution_update',
  '法院进展': 'court_update',
  '归档': 'archived'
};

const visibilityAliases: Readonly<Record<string, Visibility>> = {
  public: 'public',
  player_known: 'player_known',
  known: 'player_known',
  visible: 'player_known',
  private: 'private',
  hidden: 'hidden',
  secret: 'hidden',
  '公开': 'public',
  '玩家已知': 'player_known',
  '已知': 'player_known',
  '私密': 'private',
  '隐藏': 'hidden'
};

export function getRawCasePatches(value: unknown): unknown[] {
  if (!isRecord(value) || !isRecord(value.writeback)) return [];
  const patches = value.writeback.casePatches;
  if (patches === undefined) return [];
  return Array.isArray(patches) ? patches : [patches];
}

function pushNormalizationDiagnostic(
  diagnostics: StoryDiagnosticIssue[],
  index: number,
  field: string,
  from: unknown,
  to: unknown
) {
  diagnostics.push({
    path: ['writeback', 'casePatches', index, field],
    code: 'case_intent_field_normalized',
    message: `Case intent field ${field} was normalized from ${JSON.stringify(from)} to ${JSON.stringify(to)}.`
  });
}

function normalizeActivityLog(
  value: unknown,
  index: number,
  diagnostics: StoryDiagnosticIssue[]
): unknown[] | undefined {
  const source = Array.isArray(value) ? value : isRecord(value) ? [value] : [];
  const result: unknown[] = [];
  source.forEach((item, activityIndex) => {
    if (!isRecord(item) || !nonEmptyString(item.summary)) {
      diagnostics.push({
        path: ['writeback', 'casePatches', index, 'activityLog', activityIndex],
        code: 'case_intent_activity_removed',
        message: 'Case activity intent was removed because it did not contain a non-empty summary.'
      });
      return;
    }
    const normalized = { ...item };
    const token = normalizedToken(item.kind);
    const kind = token && activityKindAliases.has(token)
      ? token
      : token
        ? activityKindMap[token]
        : undefined;
    if (kind) {
      normalized.kind = kind;
      if (item.kind !== kind) {
        pushNormalizationDiagnostic(
          diagnostics,
          index,
          `activityLog.${activityIndex}.kind`,
          item.kind,
          kind
        );
      }
    } else {
      normalized.kind = 'note';
      if (item.kind !== undefined) {
        pushNormalizationDiagnostic(
          diagnostics,
          index,
          `activityLog.${activityIndex}.kind`,
          item.kind,
          'note'
        );
      }
    }
    for (const field of ['relatedEvidenceIds', 'relatedActorIds', 'relatedPlaceIds'] as const) {
      const list = stringList(item[field]);
      if (list) normalized[field] = list;
      else delete normalized[field];
    }
    result.push(normalized);
  });
  return result.length > 0 ? result : undefined;
}

function normalizeCasePatchIntent(
  value: unknown,
  index: number
): { patch?: CasePatch; diagnostics: StoryDiagnosticIssue[] } {
  const diagnostics: StoryDiagnosticIssue[] = [];
  if (!isRecord(value) || !nonEmptyString(value.caseId)) {
    return {
      diagnostics: [{
        path: ['writeback', 'casePatches', index],
        code: 'case_intent_recovery_rejected',
        message: 'Case intent could not be recovered because it lacks a stable caseId.'
      }]
    };
  }

  const normalized: Record<string, unknown> = { ...value, caseId: nonEmptyString(value.caseId) };
  const statusToken = normalizedToken(value.status);
  if (statusToken) {
    const status = statusAliases[statusToken];
    if (status) {
      normalized.status = status;
      if (value.status !== status) {
        pushNormalizationDiagnostic(diagnostics, index, 'status', value.status, status);
      }
    } else {
      delete normalized.status;
      diagnostics.push({
        path: ['writeback', 'casePatches', index, 'status'],
        code: 'case_intent_field_removed',
        message: `Unrecognized case status ${JSON.stringify(value.status)} was ignored; canonical state will retain its existing/default status.`
      });
    }
  }

  const roleToken = normalizedToken(value.playerRole);
  const legacyAccessToken = normalizedToken(value.playerAccessLevel);
  const playerRole = roleToken
    ? playerRoleAliases[roleToken]
    : legacyAccessToken
      ? legacyAccessRoles[legacyAccessToken]
      : undefined;
  if (playerRole) {
    normalized.playerRole = playerRole;
    if (value.playerRole !== playerRole) {
      pushNormalizationDiagnostic(
        diagnostics,
        index,
        'playerRole',
        value.playerRole ?? value.playerAccessLevel,
        playerRole
      );
    }
  } else if (value.playerRole !== undefined) {
    delete normalized.playerRole;
    diagnostics.push({
      path: ['writeback', 'casePatches', index, 'playerRole'],
      code: 'case_intent_field_removed',
      message: `Unrecognized case playerRole ${JSON.stringify(value.playerRole)} was ignored; canonical state will retain its existing/default role.`
    });
  }

  const visibilityToken = normalizedToken(value.visibility);
  if (visibilityToken) {
    const visibility = visibilityAliases[visibilityToken];
    if (visibility) normalized.visibility = visibility;
    else delete normalized.visibility;
  }

  for (const field of [
    'involvedActorIds',
    'relatedActorIds',
    'relatedOrganizationIds',
    'relatedPlaceIds',
    'evidenceIds'
  ] as const) {
    const list = stringList(value[field]);
    if (list) normalized[field] = list;
    else delete normalized[field];
  }

  const activityLog = normalizeActivityLog(value.activityLog, index, diagnostics);
  if (activityLog) normalized.activityLog = activityLog;
  else delete normalized.activityLog;

  if (typeof value.unreadActivityCount === 'string' && /^\d+$/.test(value.unreadActivityCount.trim())) {
    normalized.unreadActivityCount = Number(value.unreadActivityCount);
    pushNormalizationDiagnostic(
      diagnostics,
      index,
      'unreadActivityCount',
      value.unreadActivityCount,
      normalized.unreadActivityCount
    );
  }

  const parsed = casePatchSchema.safeParse(normalized);
  if (!parsed.success) {
    diagnostics.push(...parsed.error.issues.map((issue) => ({
      path: ['writeback', 'casePatches', index, ...issue.path.map((segment) => String(segment))],
      code: issue.code,
      message: issue.message
    })));
    return { diagnostics };
  }
  return { patch: parsed.data, diagnostics };
}

export function recoverCaseWritebackIntents(
  state: RuntimeState,
  response: NarratorResponse
): CaseWritebackIntentRecovery {
  const rawPatches = response.rawCasePatches ?? [];
  if (rawPatches.length === 0) return { response, diagnostics: [] };

  const diagnostics: StoryDiagnosticIssue[] = [];
  const patchesById = new Map(
    response.writeback.casePatches.map((patch) => [patch.caseId, patch])
  );

  rawPatches.forEach((rawPatch, index) => {
    const normalized = normalizeCasePatchIntent(rawPatch, index);
    diagnostics.push(...normalized.diagnostics);
    if (!normalized.patch) return;

    const existingPatch = patchesById.get(normalized.patch.caseId);
    if (existingPatch) {
      patchesById.set(normalized.patch.caseId, {
        ...normalized.patch,
        ...existingPatch,
        playerRole: existingPatch.playerRole ?? normalized.patch.playerRole,
        status: existingPatch.status ?? normalized.patch.status,
        visibility: existingPatch.visibility ?? normalized.patch.visibility
      });
      return;
    }

    const existingCase = state.cases[normalized.patch.caseId];
    if (!existingCase && (!normalized.patch.title || !normalized.patch.summary)) {
      diagnostics.push({
        path: ['writeback', 'casePatches', index],
        code: 'case_intent_recovery_rejected',
        message: `New case intent ${normalized.patch.caseId} was not restored because a new case requires title and summary.`
      });
      return;
    }

    patchesById.set(normalized.patch.caseId, normalized.patch);
    diagnostics.push({
      path: ['writeback', 'casePatches', index],
      code: 'case_intent_recovered',
      message: `Case intent ${normalized.patch.caseId} was restored without regenerating the turn.`
    });
  });

  return {
    response: {
      ...response,
      writeback: {
        ...response.writeback,
        casePatches: [...patchesById.values()]
      }
    },
    diagnostics
  };
}

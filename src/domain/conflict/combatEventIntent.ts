import type {
  CombatEventOutcome,
  CombatEventType,
  GameTime,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import {
  combatEventPatchSchema,
  type NarratorResponse
} from '../writeback/schema';

type CombatEventPatch =
  NarratorResponse['writeback']['combatEventPatches'][number];

export interface CombatEventIntentNormalization {
  patch?: CombatEventPatch;
  diagnostics: StoryDiagnosticIssue[];
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => {
    const normalized = nonEmptyString(item);
    return normalized ? [normalized] : [];
  }))];
}

function cloneGameTime(value: GameTime): GameTime {
  return { ...value };
}

const combatOutcomeAliases: Readonly<Record<string, CombatEventOutcome>> = {
  player_advantage: 'player_advantage',
  player_advantaged: 'player_advantage',
  opponent_advantage: 'opponent_advantage',
  opponent_advantaged: 'opponent_advantage',
  enemy_advantage: 'opponent_advantage',
  player_wounded: 'player_wounded',
  wounded_grappling: 'player_wounded',
  opponent_subdued: 'opponent_subdued',
  opponent_escaped: 'opponent_escaped',
  enemy_escaped: 'opponent_escaped',
  stalemate: 'stalemate',
  interrupted: 'interrupted',
  escalated: 'escalated',
  other: 'other'
};

function normalizeCombatOutcome(value: unknown): CombatEventOutcome | undefined {
  const token = nonEmptyString(value)?.toLowerCase().replace(/[\s-]+/g, '_');
  return token ? combatOutcomeAliases[token] : undefined;
}

export function getRawCombatEventPatches(value: unknown): unknown[] {
  if (!isRecord(value) || !isRecord(value.writeback)) return [];
  const patches = value.writeback.combatEventPatches;
  if (patches === undefined) return [];
  return Array.isArray(patches) ? patches : [patches];
}

export function normalizeCombatEventIntent({
  value,
  state,
  turnId,
  gameTime,
  combatIntent,
  canonicalCheckId,
  fallbackResultSummary,
  fallbackConsequenceSummary,
  placeNames = {}
}: {
  value: unknown;
  state: RuntimeState;
  turnId: string;
  gameTime: GameTime;
  combatIntent: Exclude<CombatEventType, 'other'> | 'other';
  canonicalCheckId: string;
  fallbackResultSummary: string;
  fallbackConsequenceSummary?: string;
  placeNames?: Readonly<Record<string, string>>;
}): CombatEventIntentNormalization {
  const diagnostics: StoryDiagnosticIssue[] = [];
  if (!isRecord(value)) {
    return {
      diagnostics,
      issues: ['combatEventPatches 项必须是对象。']
    };
  }

  const rawLocationId = nonEmptyString(value.locationId);
  const locationId = rawLocationId ?? state.location.currentPlaceId;
  if (!rawLocationId) {
    diagnostics.push({
      path: ['locationId'],
      code: 'combat_event_local_normalized',
      message: `对抗记录缺少 locationId；已使用本回合当前地点 ${locationId}。`
    });
  }

  const rawLocationSummary = nonEmptyString(value.locationSummary);
  const locationSummary =
    rawLocationSummary ??
    placeNames[locationId] ??
    state.places[locationId]?.name;
  if (!rawLocationSummary && locationSummary) {
    diagnostics.push({
      path: ['locationSummary'],
      code: 'combat_event_local_normalized',
      message: `对抗记录缺少 locationSummary；已从稳定地点 ${locationId} 补为“${locationSummary}”。`
    });
  }

  const rawCombatId = nonEmptyString(value.combatId);
  const combatId = rawCombatId ?? `combat_${turnId}_1`;
  if (!rawCombatId) {
    diagnostics.push({
      path: ['combatId'],
      code: 'combat_event_local_normalized',
      message: `对抗记录缺少 combatId；已生成本回合稳定 ID ${combatId}。`
    });
  }

  if (value.turnId !== turnId) {
    diagnostics.push({
      path: ['turnId'],
      code: 'combat_event_local_normalized',
      message: `对抗记录 turnId 已对齐为当前回合 ${turnId}。`
    });
  }
  if (value.createdAt === undefined) {
    diagnostics.push({
      path: ['createdAt'],
      code: 'combat_event_local_normalized',
      message: '对抗记录缺少 createdAt；已使用本回合结算时间。'
    });
  }
  if (value.gameTime === undefined) {
    diagnostics.push({
      path: ['gameTime'],
      code: 'combat_event_local_normalized',
      message: '对抗记录缺少 gameTime；已使用本回合结算时间。'
    });
  }
  if (value.type !== combatIntent) {
    diagnostics.push({
      path: ['type'],
      code: 'combat_event_local_normalized',
      message: `对抗记录 type 已对齐为正文前预检确认的 ${combatIntent}。`
    });
  }

  const outcome = normalizeCombatOutcome(value.outcome);
  if (outcome && outcome !== value.outcome) {
    diagnostics.push({
      path: ['outcome'],
      code: 'combat_event_local_normalized',
      message: `对抗记录 outcome 的有限别名 ${String(value.outcome)} 已归一化为 ${outcome}。`
    });
  }
  const rawResultSummary = nonEmptyString(value.resultSummary);
  const resultSummary = rawResultSummary ?? fallbackResultSummary;
  if (!rawResultSummary && resultSummary) {
    diagnostics.push({
      path: ['resultSummary'],
      code: 'combat_event_local_normalized',
      message: '对抗记录缺少 resultSummary；已沿用正文前本地判定摘要。'
    });
  }
  const rawConsequenceSummary = nonEmptyString(value.consequenceSummary);
  const consequenceSummary =
    rawConsequenceSummary ?? fallbackConsequenceSummary;
  if (!rawConsequenceSummary && consequenceSummary) {
    diagnostics.push({
      path: ['consequenceSummary'],
      code: 'combat_event_local_normalized',
      message: '对抗记录缺少 consequenceSummary；已沿用正文前本地判定后果。'
    });
  }

  const participantActorIds = Array.isArray(value.participants)
    ? value.participants.flatMap((participant) => {
        if (!isRecord(participant)) return [];
        const actorId = nonEmptyString(participant.actorId);
        return actorId ? [actorId] : [];
      })
    : [];
  const relatedActorIds = [
    ...new Set([...stringArray(value.relatedActorIds), ...participantActorIds])
  ];
  const relatedPlaceIds = [
    ...new Set([...stringArray(value.relatedPlaceIds), locationId])
  ];

  const candidate = {
    ...value,
    combatId,
    turnId,
    gameTime: cloneGameTime(gameTime),
    type: combatIntent,
    locationId,
    ...(locationSummary ? { locationSummary } : {}),
    ...(outcome ? { outcome } : {}),
    resultSummary,
    ...(consequenceSummary ? { consequenceSummary } : {}),
    judgementCheckIds: [canonicalCheckId],
    relatedActorIds,
    relatedPlaceIds,
    relatedCaseIds: stringArray(value.relatedCaseIds),
    createdAt: cloneGameTime(gameTime)
  };
  const parsed = combatEventPatchSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      diagnostics,
      issues: parsed.error.issues.map(
        (issue) =>
          `writeback.combatEventPatches.${issue.path.join('.')}：${issue.message}`
      )
    };
  }
  return {
    patch: parsed.data,
    diagnostics,
    issues: []
  };
}

import type { PromptContext } from '../context/selectContext';
import type { StructuredNarratorRequest } from '../narrator/NarratorClient';
import type {
  JudgementCheck,
  JudgementFactor,
  JudgementOutcome,
  RuntimeState,
  StoryDiagnosticIssue
} from '../runtime/types';
import { normalizeJudgementCheckIntent } from './judgementIntent';
import {
  collectLocalJudgementSources,
  resolveLocalJudgementIntent,
  type LocalJudgementIntent,
  type LocalJudgementSourceSnapshot
} from './localJudgement';
import {
  judgementPreflightFactorProposalSchema,
  judgementPreflightSchema,
  type JudgementPreflight,
  type JudgementPreflightEvidenceKind,
  type JudgementPreflightFactorProposal
} from './judgementPreflightSchema';

const preflightEnvelopeSchemaKeys = new Set([
  'hasJudgement',
  'required',
  'reasonSummary',
  'reason',
  'title',
  'category',
  'primaryAttribute',
  'secondaryAttribute',
  'difficultyTier',
  'stakesSummary',
  'targetActorId',
  'targetOrganizationId',
  'combatIntent',
  'majorConflict',
  'factorProposals',
  'factors',
  'sourceType',
  'sourceId',
  'evidenceRef',
  'kind',
  'refId',
  'polarity',
  'magnitude'
]);

const magnitudeValues = {
  minor: 3,
  moderate: 6,
  major: 10
} as const;

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function snapshotValue(value: unknown, depth = 0): unknown {
  if (depth >= 6) return '[depth-limited]';
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((item) => snapshotValue(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return String(value);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => preflightEnvelopeSchemaKeys.has(key))
      .slice(0, 30)
      .map(([key, item]) => [key, snapshotValue(item, depth + 1)])
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function compactText(value: string, maximum = 600): string {
  const normalized = value.trim();
  return normalized.length <= maximum
    ? normalized
    : `${normalized.slice(0, maximum)}…`;
}

function preflightContextSnapshot({
  state,
  context,
  sources
}: {
  state: RuntimeState;
  context: PromptContext;
  sources: LocalJudgementSourceSnapshot;
}) {
  return {
    time: context.currentTime,
    place: context.currentPlace
      ? {
          placeId: context.currentPlace.placeId,
          name: context.currentPlace.name,
          summary: compactText(context.currentPlace.summary)
        }
      : undefined,
    scene: context.currentScene
      ? {
          sceneId: context.currentScene.sceneId,
          name: context.currentScene.name,
          summary: compactText(context.currentScene.summary)
        }
      : undefined,
    weather: {
      refId: 'current_weather',
      label: state.environment.weather.label,
      condition: state.environment.weather.condition,
      impactSummary: compactText(state.environment.weather.impactSummary)
    },
    player: {
      actorId: state.player.actorId,
      attributes: state.player.attributes,
      vitals: state.player.vitals
    },
    presentActors: context.presentActors.slice(0, 12).map((actor) => ({
      actorId: actor.actorId,
      name: actor.name,
      identity: actor.publicIdentity ?? actor.currentIdentity,
      statusSummary: compactText(actor.statusSummary)
    })),
    relevantCases: context.relevantCases.slice(0, 8).map((caseFile) => ({
      caseId: caseFile.caseId,
      title: caseFile.title,
      status: caseFile.status,
      summary: compactText(caseFile.summary)
    })),
    currentMatters: Object.values(state.dynamicEvents.currentMatters)
      .filter((matter) => matter.status === 'active')
      .slice(0, 12)
      .map((matter) => ({
        id: matter.id,
        title: matter.title,
        summary: compactText(matter.summary)
      })),
    memories: context.memories.slice(0, 12).map((memory) => ({
      memoryId: memory.memoryId,
      text: compactText(memory.text),
      turnId: memory.relatedTurnId
    })),
    organizations: Object.values(state.organizations)
      .filter((organization) => organization.visibility !== 'hidden')
      .slice(0, 20)
      .map((organization) => ({
        organizationId: organization.organizationId,
        name: organization.name
      })),
    availableTraits: sources.traits,
    equippedItems: sources.equipment
  };
}

export function createJudgementPreflightRequest({
  state,
  context,
  playerInput
}: {
  state: RuntimeState;
  context: PromptContext;
  playerInput: string;
}): StructuredNarratorRequest {
  const sources = collectLocalJudgementSources(state);
  return {
    messages: [
      {
        role: 'system',
        source: 'game_protocol',
        content:
          '你是回合判定预检器。你只判断玩家当前行动是否需要一次核心判定，并提出可核验因素；本地系统独占骰点、目标值和最终结果。'
      },
      {
        role: 'user',
        source: 'runtime_context',
        content: [
          'JUDGEMENT_PREFLIGHT',
          '只返回一个 JSON object，不要 Markdown、代码块、正文、解释或思考过程。',
          '严格形状：',
          '{"hasJudgement":true,"reasonSummary":"为何需要判定","title":"简短判定标题","category":"observation|chase|melee|armed|firearm|crowd|negotiation|endurance|will|thinking|other","primaryAttribute":"body|action|perception|thinking|negotiation|will","secondaryAttribute":"可选六维","difficultyTier":"easy|standard|hard|dangerous|extreme","stakesSummary":"成功与失败会造成的差异","targetActorId":"可选既有人物ID","targetOrganizationId":"可选既有机构ID","combatIntent":"none|chase|melee|armed|firearm|crowd","factorProposals":[{"sourceType":"trait|equipment|status|environment|preparation|other","sourceId":"特质或装备必须填写稳定ID","evidenceRef":{"kind":"trait|equipment|player_vitals|actor|organization|current_place|current_scene|current_weather|case|memory|current_matter|story_turn|player_input","refId":"真实ID"},"polarity":"advantage|disadvantage","magnitude":"minor|moderate|major","reason":"为何直接影响本次行动"}]}',
          '无真实不确定性，或失败不会令局面产生实际差异时，返回 {"hasJudgement":false,"reasonSummary":"无需判定的原因","combatIntent":"none","factorProposals":[]}。',
          '例行、无阻力、事实已经保证的行动不得判定；每回合最多一次核心判定。',
          '不得为了制造判定而自行添加玩家输入和结构化上下文中不存在的阻力、时间压力、模糊资料、抄写错误或失败后果。只有“人可能一般性犯错”不是判定依据；把已经核准且清晰可见的资料照抄、放回物品、正常交接等确定动作必须 hasJudgement=false。',
          '主属性按本次不确定性的核心能力选择：body=持续力量、耐力与承受；action=速度、协调、闪避与精细动作；perception=发现、辨认与追踪感官线索；thinking=比较既有事实、推理、分析与专业判断；negotiation=说服、盘问、谈判与社交施压；will=抵抗恐惧、诱惑、威吓与精神压力。不要仅因行动中“看见文字”就把时序推理归为 perception。',
          '场景难度只描述行动本身的客观成功概率，不描述失败后果有多严重：easy=有明显有利条件且仍存在小概率失败；standard=受训者在正常条件下的常规挑战；hard=存在明确阻力、时间压力或技术难点；dangerous=存在压倒性阻力或显著劣势，受训者也很容易失败；extreme=在当前条件下近乎不可能。枪战、坠落或其他后果严重的场景不会仅因危险性自动成为 dangerous/extreme；条件可控的受训职责仍可为 standard/hard。不得把存档 gameDifficulty 当成 difficultyTier。',
          'category 表示事件类型，primaryAttribute 表示主要能力；二者可以不同。只有会形成真实追逐、近战、持械、枪战或群体冲突记录时才设置对应 combatIntent，否则必须为 none。',
          '不得返回 presetRoll、effectiveTarget、outcome、difficulty、score、margin、narrativeText、writeback 或任何状态变化。',
          'factorProposals 只提议结构化证据，不得填写任意数值。minor/moderate/major 将由本地映射为 3/6/10。',
          '因素必须同时满足“来源真实存在”与“直接影响本次不确定性”，不能因为上下文里列出了来源就机械添加。trait 只引用 availableTraits，且结构化 scopes 必须适用于本次 category 或 primaryAttribute；equipment 只引用 equippedItems，且必须在本次行动中实际发挥对应功能。',
          'status/environment/preparation/other 必须提供 evidenceRef，且 refId 必须来自下方上下文；没有证据就不要提出。current_weather 只有行动或目标实际暴露在天气中才可采用，室内文书、谈话或推理不得因为外面有天气而加减；current_place/current_scene 也必须有直接影响行动的具体现场条件，不能只因玩家身处该处就添加。',
          'player_vitals/actor 状态只有当前确实存在伤病、疲劳、受限或其他直接条件时才可采用，“状态正常”不是奖励。preparation 必须引用挑战发生前已经完成的明确准备事实；仅把本回合行动本身换句话重述，不算额外准备。',
          `playerInput=${JSON.stringify(playerInput)}`,
          `context=${JSON.stringify(preflightContextSnapshot({ state, context, sources }))}`
        ].join('\n')
      }
    ]
  };
}

export function createJudgementPreflightRepairRequest({
  baseRequest,
  rawValue,
  missingFields
}: {
  baseRequest: StructuredNarratorRequest;
  rawValue: unknown;
  missingFields: string[];
}): StructuredNarratorRequest {
  return {
    messages: [
      ...baseRequest.messages,
      {
        role: 'user',
        source: 'repair_protocol',
        content: [
          'JUDGEMENT_PREFLIGHT_REPAIR',
          '上一份预检没有通过小型合同。只重新返回预检 JSON，不得生成正文或任何写回。',
          `missingFields=${JSON.stringify(missingFields)}`,
          `previous=${JSON.stringify(snapshotValue(rawValue))}`
        ].join('\n')
      }
    ]
  };
}

export interface JudgementPreflightNormalization {
  preflight?: JudgementPreflight;
  missingFields: string[];
  diagnostics: StoryDiagnosticIssue[];
  rawSnapshot: unknown;
}

function normalizeCombatIntent(value: unknown): JudgementPreflight['combatIntent'] {
  if (
    value === 'chase' ||
    value === 'melee' ||
    value === 'armed' ||
    value === 'firearm' ||
    value === 'crowd'
  ) {
    return value;
  }
  return 'none';
}

function normalizeFactorProposals(
  value: unknown,
  diagnostics: StoryDiagnosticIssue[]
): JudgementPreflightFactorProposal[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push({
      path: ['factorProposals'],
      code: 'judgement_evidence_rejected',
      message: '判定因素提案不是数组，本地未采用任何因素。'
    });
    return [];
  }
  return value.flatMap((candidate, index) => {
    const parsed = judgementPreflightFactorProposalSchema.safeParse(candidate);
    if (parsed.success) return [parsed.data];
    diagnostics.push({
      path: ['factorProposals', index],
      code: 'judgement_evidence_rejected',
      message: `第 ${index + 1} 项判定因素缺少合法来源、证据、方向、强度或原因，本地未采用。`
    });
    return [];
  });
}

export function normalizeJudgementPreflight({
  value,
  turnId,
  gameTime
}: {
  value: unknown;
  turnId: string;
  gameTime: RuntimeState['time'];
}): JudgementPreflightNormalization {
  const raw = asRecord(value);
  const diagnostics: StoryDiagnosticIssue[] = [];
  const rawSnapshot = snapshotValue(value);
  if (!raw) {
    return {
      missingFields: ['response'],
      diagnostics: [
        {
          path: [],
          code: 'judgement_intent_failed',
          message: '判定预检返回值不是对象。'
        }
      ],
      rawSnapshot
    };
  }
  const hasJudgement =
    typeof raw.hasJudgement === 'boolean'
      ? raw.hasJudgement
      : typeof raw.required === 'boolean'
        ? raw.required
        : undefined;
  if (hasJudgement === undefined) {
    return {
      missingFields: ['hasJudgement'],
      diagnostics: [
        {
          path: ['hasJudgement'],
          code: 'judgement_intent_failed',
          message: '判定预检缺少 hasJudgement 布尔值。'
        }
      ],
      rawSnapshot
    };
  }
  const reasonSummary =
    nonEmptyString(raw.reasonSummary) ?? nonEmptyString(raw.reason);
  if (!reasonSummary) {
    return {
      missingFields: ['reasonSummary'],
      diagnostics: [
        {
          path: ['reasonSummary'],
          code: 'judgement_intent_failed',
          message: '判定预检缺少原因摘要。'
        }
      ],
      rawSnapshot
    };
  }
  if (!hasJudgement) {
    return {
      missingFields: [],
      diagnostics,
      rawSnapshot,
      preflight: {
        hasJudgement: false,
        reasonSummary,
        combatIntent: 'none',
        factorProposals: []
      }
    };
  }

  const combatIntent = normalizeCombatIntent(
    raw.combatIntent ?? (raw.majorConflict === true ? raw.category : undefined)
  );
  const categoryValue =
    ['combat', 'fight', 'physical_combat'].includes(
      nonEmptyString(raw.category)?.toLowerCase() ?? ''
    ) && combatIntent !== 'none'
      ? combatIntent
      : raw.category;
  const targetActorId = nonEmptyString(raw.targetActorId);
  const normalization = normalizeJudgementCheckIntent({
    value: {
      title: nonEmptyString(raw.title) ?? reasonSummary,
      category: categoryValue,
      primaryAttribute: raw.primaryAttribute,
      secondaryAttribute: raw.secondaryAttribute,
      difficultyTier: raw.difficultyTier,
      shortSummary: reasonSummary,
      targetSummary: nonEmptyString(raw.stakesSummary),
      relatedActorIds: targetActorId ? [targetActorId] : [],
      factors: []
    },
    turnId,
    gameTime,
    fallbackCheckId: `check_${turnId}_1`,
    combatEventPatches: []
  });
  diagnostics.push(...normalization.diagnostics);
  if (normalization.missingFields.length > 0 || !normalization.intent) {
    return {
      missingFields: normalization.missingFields,
      diagnostics,
      rawSnapshot
    };
  }

  const factorProposals = normalizeFactorProposals(
    raw.factorProposals ?? raw.factors,
    diagnostics
  );
  const candidate = {
    hasJudgement: true,
    reasonSummary,
    title: normalization.intent.title,
    category: normalization.intent.category,
    primaryAttribute: normalization.intent.primaryAttribute,
    secondaryAttribute: normalization.intent.secondaryAttribute,
    difficultyTier: normalization.intent.difficultyTier,
    stakesSummary:
      nonEmptyString(raw.stakesSummary) ?? normalization.intent.targetSummary,
    targetActorId,
    targetOrganizationId: nonEmptyString(raw.targetOrganizationId),
    combatIntent,
    factorProposals
  };
  const parsed = judgementPreflightSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      missingFields: parsed.error.issues.map(
        (issue) => issue.path.join('.') || 'response'
      ),
      diagnostics,
      rawSnapshot
    };
  }
  return {
    preflight: parsed.data,
    missingFields: [],
    diagnostics,
    rawSnapshot
  };
}

function evidenceExists(
  state: RuntimeState,
  kind: JudgementPreflightEvidenceKind,
  refId: string
): boolean {
  switch (kind) {
    case 'trait':
      return state.player.activeTraits.some(
        (trait) =>
          trait.traitId === refId &&
          (trait.status === 'active' || trait.status === 'weakened') &&
          trait.visibility !== 'hidden'
      );
    case 'equipment':
      return (
        state.assets.equippedItemIds.includes(refId) &&
        state.assets.items[refId]?.category === 'equipment'
      );
    case 'player_vitals':
      return refId === 'player_vitals';
    case 'actor':
      return Boolean(state.actors[refId]);
    case 'organization':
      return Boolean(state.organizations[refId]);
    case 'current_place':
      return refId === state.location.currentPlaceId;
    case 'current_scene':
      return Boolean(state.location.currentSceneId) && refId === state.location.currentSceneId;
    case 'current_weather':
      return refId === 'current_weather';
    case 'case':
      return Boolean(state.cases[refId]);
    case 'memory':
      return Boolean(state.memories[refId]);
    case 'current_matter':
      return state.dynamicEvents.currentMatters[refId]?.status === 'active';
    case 'story_turn':
      return state.storyLog.some((entry) => entry.turnId === refId);
    case 'player_input':
      return refId === 'current_input';
  }
}

function evidenceAllowedForSource(
  sourceType: JudgementPreflightFactorProposal['sourceType'],
  kind: JudgementPreflightEvidenceKind
): boolean {
  if (sourceType === 'status') {
    return kind === 'player_vitals' || kind === 'actor';
  }
  if (sourceType === 'environment') {
    return (
      kind === 'current_place' ||
      kind === 'current_scene' ||
      kind === 'current_weather'
    );
  }
  if (sourceType === 'preparation') {
    return (
      kind === 'current_matter' ||
      kind === 'memory' ||
      kind === 'story_turn' ||
      kind === 'player_input'
    );
  }
  if (sourceType === 'other') {
    return !['trait', 'equipment', 'player_input'].includes(kind);
  }
  return kind === sourceType;
}

function factorLabel(
  state: RuntimeState,
  proposal: JudgementPreflightFactorProposal
): string {
  if (proposal.sourceType === 'trait' && proposal.sourceId) {
    return (
      state.player.activeTraits.find((trait) => trait.traitId === proposal.sourceId)
        ?.name ?? '特质'
    );
  }
  if (proposal.sourceType === 'equipment' && proposal.sourceId) {
    return state.assets.items[proposal.sourceId]?.name ?? '装备';
  }
  const evidence = proposal.evidenceRef;
  if (!evidence) return proposal.reason.slice(0, 24);
  switch (evidence.kind) {
    case 'player_vitals':
      return '身体状态';
    case 'current_weather':
      return state.environment.weather.label;
    case 'current_place':
      return state.places[evidence.refId]?.name ?? '当前地点';
    case 'current_scene':
      return state.scenes[evidence.refId]?.name ?? '当前场景';
    case 'actor':
      return state.actors[evidence.refId]?.name ?? '人物状态';
    case 'organization':
      return state.organizations[evidence.refId]?.name ?? '机构事实';
    case 'case':
      return state.cases[evidence.refId]?.title ?? '案件事实';
    case 'memory':
      return '既有记忆';
    case 'current_matter':
      return state.dynamicEvents.currentMatters[evidence.refId]?.title ?? '当前事项';
    case 'story_turn':
      return '既有回合事实';
    case 'player_input':
      return '本回合明确准备';
    case 'trait':
      return '特质';
    case 'equipment':
      return '装备';
  }
}

const traitScopeAliasesByAttribute: Record<
  NonNullable<JudgementCheck['primaryAttribute']>,
  ReadonlySet<string>
> = {
  body: new Set([
    'body',
    'endurance',
    'stamina',
    'strength',
    'physical',
    '体魄',
    '耐力',
    '力量'
  ]),
  action: new Set([
    'action',
    'chase',
    'melee',
    'armed',
    'firearm',
    'firearms',
    'crowd',
    'emergency',
    'reflex',
    'agility',
    '行动',
    '追逐',
    '格斗',
    '枪械',
    '应急'
  ]),
  perception: new Set([
    'perception',
    'observation',
    'investigation',
    'suspicion',
    'search',
    'notice',
    '感知',
    '观察',
    '调查',
    '搜索'
  ]),
  thinking: new Set([
    'thinking',
    'investigation',
    'suspicion',
    'reasoning',
    'analysis',
    'paperwork',
    'memory',
    'discipline',
    '思考',
    '推理',
    '分析',
    '文书',
    '程序'
  ]),
  negotiation: new Set([
    'negotiation',
    'social',
    'empathy',
    'informant',
    'community',
    'relationship',
    'favor',
    'rumor',
    '交涉',
    '社交',
    '同理',
    '线人',
    '社区',
    '关系'
  ]),
  will: new Set([
    'will',
    'pressure',
    'discipline',
    'internal',
    'self_control',
    'mental',
    '意志',
    '压力',
    '纪律',
    '自制'
  ])
};

function traitScopeApplies({
  state,
  sourceId,
  category,
  primaryAttribute
}: {
  state: RuntimeState;
  sourceId: string;
  category: NonNullable<JudgementPreflight['category']>;
  primaryAttribute: NonNullable<JudgementPreflight['primaryAttribute']>;
}): boolean {
  const trait = state.player.activeTraits.find(
    (candidate) => candidate.traitId === sourceId
  );
  if (!trait) return false;
  const acceptedScopes = traitScopeAliasesByAttribute[primaryAttribute];
  return trait.scopes.some((scope) => {
    const normalized = scope.trim().toLowerCase().replace(/[\s-]+/g, '_');
    return (
      normalized === category ||
      acceptedScopes.has(normalized) ||
      ['all', 'any', 'general', '通用'].includes(normalized) ||
      (category === 'other' && normalized === 'other')
    );
  });
}

function validateFactorProposals({
  state,
  proposals,
  category,
  primaryAttribute
}: {
  state: RuntimeState;
  proposals: JudgementPreflightFactorProposal[];
  category: NonNullable<JudgementPreflight['category']>;
  primaryAttribute: NonNullable<JudgementPreflight['primaryAttribute']>;
}): {
  factors: JudgementFactor[];
  diagnostics: StoryDiagnosticIssue[];
} {
  const diagnostics: StoryDiagnosticIssue[] = [];
  const factors: JudgementFactor[] = [];
  const usedEvidence = new Set<string>();
  proposals.forEach((proposal, index) => {
    const evidence =
      proposal.sourceType === 'trait' || proposal.sourceType === 'equipment'
        ? {
            kind: proposal.sourceType,
            refId: proposal.sourceId ?? ''
          }
        : proposal.evidenceRef;
    if (
      !evidence ||
      !evidence.refId ||
      !evidenceAllowedForSource(proposal.sourceType, evidence.kind) ||
      !evidenceExists(state, evidence.kind, evidence.refId)
    ) {
      diagnostics.push({
        path: ['factorProposals', index],
        code: 'judgement_evidence_rejected',
        message: `第 ${index + 1} 项${proposal.sourceType}因素没有可核验的结构化证据，未参与目标值。`
      });
      return;
    }
    if (
      proposal.sourceType === 'trait' &&
      !traitScopeApplies({
        state,
        sourceId: evidence.refId,
        category,
        primaryAttribute
      })
    ) {
      diagnostics.push({
        path: ['factorProposals', index],
        code: 'judgement_evidence_rejected',
        message: `第 ${index + 1} 项特质来源虽存在，但其结构化作用域不适用于本次 ${primaryAttribute}/${category} 判定，未参与目标值。`
      });
      return;
    }
    const evidenceKey = `${evidence.kind}:${evidence.refId}`;
    if (usedEvidence.has(evidenceKey)) {
      diagnostics.push({
        path: ['factorProposals', index],
        code: 'judgement_evidence_rejected',
        message: `第 ${index + 1} 项因素重复使用证据 ${evidenceKey}，未重复计算。`
      });
      return;
    }
    usedEvidence.add(evidenceKey);
    const magnitude = magnitudeValues[proposal.magnitude];
    factors.push({
      sourceType: proposal.sourceType,
      sourceId: evidence.refId,
      label: factorLabel(state, proposal),
      value: proposal.polarity === 'advantage' ? magnitude : -magnitude,
      reason: proposal.reason
    });
  });
  return { factors, diagnostics };
}

export interface JudgementResolutionEnvelope {
  checkId: string;
  category: JudgementCheck['category'];
  primaryAttribute: NonNullable<JudgementCheck['primaryAttribute']>;
  secondaryAttribute?: JudgementCheck['secondaryAttribute'];
  difficultyTier: NonNullable<JudgementCheck['difficultyTier']>;
  factors: JudgementFactor[];
  effectiveTarget: number;
  presetRoll: number;
  outcome: JudgementOutcome;
  margin: number;
  stakesSummary: string;
  combatIntent: JudgementPreflight['combatIntent'];
  canonicalCheck: JudgementCheck;
  intent: LocalJudgementIntent;
  diagnostics: StoryDiagnosticIssue[];
}

export function resolveJudgementPreflight({
  state,
  preflight,
  turnId,
  gameTime,
  presetRoll,
  normalizationDiagnostics = []
}: {
  state: RuntimeState;
  preflight: JudgementPreflight;
  turnId: string;
  gameTime: RuntimeState['time'];
  presetRoll: number;
  normalizationDiagnostics?: StoryDiagnosticIssue[];
}): JudgementResolutionEnvelope | undefined {
  if (!preflight.hasJudgement) return undefined;
  const evidence = validateFactorProposals({
    state,
    proposals: preflight.factorProposals,
    category: preflight.category!,
    primaryAttribute: preflight.primaryAttribute!
  });
  const targetDiagnostics: StoryDiagnosticIssue[] = [];
  if (preflight.targetActorId && !state.actors[preflight.targetActorId]) {
    targetDiagnostics.push({
      path: ['targetActorId'],
      code: 'judgement_evidence_rejected',
      message: `判定预检引用的人物 ${preflight.targetActorId} 不存在，本地未采用该目标引用。`
    });
  }
  if (
    preflight.targetOrganizationId &&
    !state.organizations[preflight.targetOrganizationId]
  ) {
    targetDiagnostics.push({
      path: ['targetOrganizationId'],
      code: 'judgement_evidence_rejected',
      message: `判定预检引用的机构 ${preflight.targetOrganizationId} 不存在，本地未采用该目标引用。`
    });
  }
  const relatedActorIds = [
    state.player.actorId,
    ...(preflight.targetActorId && state.actors[preflight.targetActorId]
      ? [preflight.targetActorId]
      : [])
  ];
  const intent: LocalJudgementIntent = {
    checkId: `check_${turnId}_1`,
    turnId,
    gameTime,
    title: preflight.title ?? preflight.reasonSummary,
    category: preflight.category!,
    ...(preflight.stakesSummary
      ? { targetSummary: preflight.stakesSummary }
      : {}),
    relatedActorIds: [...new Set(relatedActorIds)],
    relatedPlaceIds: [state.location.currentPlaceId],
    relatedCaseIds: [],
    primaryAttribute: preflight.primaryAttribute!,
    ...(preflight.secondaryAttribute
      ? { secondaryAttribute: preflight.secondaryAttribute }
      : {}),
    difficultyTier: preflight.difficultyTier!,
    shortSummary: preflight.reasonSummary,
    ...(preflight.stakesSummary
      ? { consequenceSummary: preflight.stakesSummary }
      : {}),
    factors: evidence.factors,
    visibility: 'player_known'
  };
  const resolution = resolveLocalJudgementIntent({
    state,
    intent,
    expectedRoll: presetRoll
  });
  if (resolution.issues.length > 0 || !resolution.check) {
    throw new Error(
      `judgement_resolution_failed：${resolution.issues.join('；') || '本地未能建立规范判定记录'}`
    );
  }
  const check = resolution.check;
  return {
    checkId: check.checkId,
    category: check.category,
    primaryAttribute: check.primaryAttribute!,
    secondaryAttribute: check.secondaryAttribute,
    difficultyTier: check.difficultyTier!,
    factors: check.factors,
    effectiveTarget: check.effectiveTarget!,
    presetRoll: check.presetRoll!,
    outcome: check.outcome,
    margin: check.margin,
    stakesSummary: preflight.stakesSummary ?? preflight.reasonSummary,
    combatIntent: preflight.combatIntent,
    canonicalCheck: check,
    intent: {
      ...intent,
      rulesetVersion: 'v1.1-local-d100',
      factors: check.factors
    },
    diagnostics: [
      ...normalizationDiagnostics,
      ...evidence.diagnostics,
      ...targetDiagnostics,
      ...resolution.diagnostics
    ]
  };
}

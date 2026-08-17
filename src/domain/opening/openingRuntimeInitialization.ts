import { z } from 'zod';
import type { RuntimeState } from '../runtime/types';
import {
  completeOpeningEconomySchema,
  completeOpeningHomeBaseSchema,
  openingInitializationSchema,
  openingPlayerStatePatchSchema
} from './openingInitializationSchema';
import type { OpeningBlueprint } from './openingBlueprintSchema';
import {
  preNormalizeOpeningIdentityMatterCandidates,
  resolveOpeningIdentityMatterContract,
  type OpeningCurrentMatterPatch
} from './openingIdentityMatterContract';
import type { OpeningNarrativeDraft, OpeningRuntimeDraft } from './openingSessionDraft';
import { openingRuntimeDraftSchema } from './openingSessionDraft';

export type OpeningRuntimeDomainName =
  | 'playerPresentationPatch'
  | 'economy'
  | 'homeBase'
  | 'playerStateExtras'
  | 'memory'
  | 'finance'
  | 'secretFacts'
  | 'pressure'
  | 'grayLedger'
  | 'case'
  | 'caseEvidence'
  | 'currentMatter'
  | 'deferredEvent'
  | 'asset';

const runtimeRepairEnvelopeSchema = z
  .object({
    domains: z.record(z.string(), z.unknown())
  })
  .strict();

const playerStateExtrasSchema = openingPlayerStatePatchSchema.omit({
  economy: true,
  homeBase: true
});

const runtimeDomainSchemas: Record<
  Exclude<
    OpeningRuntimeDomainName,
    'economy' | 'homeBase' | 'playerStateExtras'
  >,
  z.ZodType
> = {
  playerPresentationPatch:
    openingRuntimeDraftSchema.shape.playerPresentationPatch,
  memory: openingInitializationSchema.shape.memories.unwrap(),
  finance: openingInitializationSchema.shape.financePatch.unwrap(),
  secretFacts: openingInitializationSchema.shape.secretFacts.unwrap(),
  pressure: openingInitializationSchema.shape.pressureSeeds.unwrap(),
  grayLedger: openingInitializationSchema.shape.grayLedger.unwrap(),
  case: openingInitializationSchema.shape.casePatches.unwrap(),
  caseEvidence:
    openingInitializationSchema.shape.caseEvidencePatches.unwrap(),
  currentMatter:
    openingInitializationSchema.shape.currentMatterPatches.unwrap(),
  deferredEvent:
    openingInitializationSchema.shape.deferredEventPatches.unwrap(),
  asset: openingInitializationSchema.shape.assetPatch.unwrap()
};

const optionalTopLevelDomains: Array<{
  domain: Exclude<
    OpeningRuntimeDomainName,
    | 'playerPresentationPatch'
    | 'economy'
    | 'homeBase'
    | 'playerStateExtras'
    | 'memory'
  >;
  field: keyof OpeningRuntimeDraft;
}> = [
  { domain: 'finance', field: 'financePatch' },
  { domain: 'secretFacts', field: 'secretFacts' },
  { domain: 'pressure', field: 'pressureSeeds' },
  { domain: 'grayLedger', field: 'grayLedger' },
  { domain: 'case', field: 'casePatches' },
  { domain: 'caseEvidence', field: 'caseEvidencePatches' },
  { domain: 'currentMatter', field: 'currentMatterPatches' },
  { domain: 'deferredEvent', field: 'deferredEventPatches' },
  { domain: 'asset', field: 'assetPatch' }
];

export interface OpeningRuntimeDomainIssue {
  domain: OpeningRuntimeDomainName;
  paths: string[];
  message: string;
}

export interface OpeningRuntimeCandidateValidation {
  value?: OpeningRuntimeDraft;
  acceptedDomains: Partial<Record<OpeningRuntimeDomainName, unknown>>;
  issues: OpeningRuntimeDomainIssue[];
  normalizedPaths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatIssues(error: z.ZodError): { paths: string[]; message: string } {
  return {
    paths: [
      ...new Set(
        error.issues.map((issue) => issue.path.map(String).join('.')).filter(Boolean)
      )
    ],
    message: error.issues
      .map(
        (issue) =>
          `${issue.path.map(String).join('.') || 'value'}：${issue.message}`
      )
      .join('；')
  };
}

function parseDomain(
  domain: OpeningRuntimeDomainName,
  schema: z.ZodType,
  raw: unknown,
  acceptedDomains: Partial<Record<OpeningRuntimeDomainName, unknown>>,
  issues: OpeningRuntimeDomainIssue[]
): void {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    acceptedDomains[domain] = parsed.data;
    return;
  }
  const detail = formatIssues(parsed.error);
  issues.push({ domain, ...detail });
}

const currentMatterStatusAliases: Record<string, string> = {
  active: 'active',
  active_matter: 'active',
  ongoing: 'active',
  进行中: 'active',
  活跃: 'active',
  dormant: 'dormant',
  paused: 'dormant',
  暂停: 'dormant',
  休眠: 'dormant',
  resolved: 'resolved',
  completed: 'resolved',
  已解决: 'resolved',
  已完成: 'resolved',
  archived: 'archived',
  已归档: 'archived'
};

const currentMatterVisibilityAliases: Record<string, string> = {
  known: 'known',
  player_known: 'known',
  player_visible: 'known',
  visible: 'known',
  玩家已知: 'known',
  已知: 'known',
  hidden: 'hidden',
  concealed: 'hidden',
  隐藏: 'hidden'
};

const currentMatterKindAliases: Record<string, string> = {
  personal: 'personal',
  personal_matter: 'personal',
  个人: 'personal',
  个人事务: 'personal',
  police_work: 'police_work',
  police_duty: 'police_work',
  警务: 'police_work',
  警务工作: 'police_work',
  当值工作: 'police_work',
  livelihood: 'livelihood',
  livelihood_matter: 'livelihood',
  营生: 'livelihood',
  生计: 'livelihood',
  relationship: 'relationship',
  relationship_matter: 'relationship',
  关系: 'relationship',
  人际关系: 'relationship',
  family: 'family',
  family_matter: 'family',
  家庭: 'family',
  家庭事务: 'family',
  social: 'social',
  social_matter: 'social',
  社会: 'social',
  社交: 'social',
  risk: 'risk',
  risk_matter: 'risk',
  风险: 'risk',
  opportunity: 'opportunity',
  opportunity_matter: 'opportunity',
  机会: 'opportunity',
  case: 'case',
  case_matter: 'case',
  案件: 'case',
  world: 'world',
  world_matter: 'world',
  世界: 'world',
  城市动态: 'world'
};

const currentMatterResponseWindowAliases: Record<string, string> = {
  now: 'now',
  immediate: 'now',
  立即: 'now',
  现在: 'now',
  today: 'today',
  当日: 'today',
  今天: 'today',
  soon: 'soon',
  近期: 'soon',
  尽快: 'soon',
  open: 'open',
  open_ended: 'open',
  开放: 'open',
  无固定期限: 'open'
};

function aliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeAliasField(
  value: Record<string, unknown>,
  field: string,
  aliases: Record<string, string>,
  index: number,
  normalizedPaths: string[]
): void {
  const current = value[field];
  if (typeof current !== 'string') return;
  const normalized = aliases[aliasKey(current)];
  if (!normalized || normalized === current) return;
  value[field] = normalized;
  normalizedPaths.push(`currentMatterPatches.${index}.${field}`);
}

function normalizeIntegerStringField(
  value: Record<string, unknown>,
  field: string,
  minimum: number,
  maximum: number,
  index: number,
  normalizedPaths: string[]
): void {
  const current = value[field];
  if (typeof current !== 'string') return;
  const trimmed = current.trim();
  if (!/^-?\d+$/.test(trimmed)) return;
  const parsed = Number(trimmed);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    return;
  }
  value[field] = parsed;
  normalizedPaths.push(`currentMatterPatches.${index}.${field}`);
}

function normalizeCurrentMatterDomain(
  raw: unknown,
  identity: RuntimeState['player']['currentIdentity']
): { value: unknown; normalizedPaths: string[] } {
  let value = raw;
  const normalizedPaths: string[] = [];
  if (!Array.isArray(value) && isRecord(value)) {
    if (Array.isArray(value.currentMatterPatches)) {
      value = value.currentMatterPatches;
      normalizedPaths.push('currentMatterPatches');
    } else if (typeof value.id === 'string' && value.id.trim()) {
      value = [value];
      normalizedPaths.push('currentMatterPatches');
    }
  }
  if (!Array.isArray(value)) return { value, normalizedPaths };

  const locallyNormalized = value.map((candidate, index) => {
    if (!isRecord(candidate)) return candidate;
    const next = { ...candidate };
    normalizeIntegerStringField(
      next,
      'priority',
      0,
      100,
      index,
      normalizedPaths
    );
    normalizeIntegerStringField(
      next,
      'pressureLevel',
      0,
      3,
      index,
      normalizedPaths
    );
    normalizeAliasField(
      next,
      'status',
      currentMatterStatusAliases,
      index,
      normalizedPaths
    );
    normalizeAliasField(
      next,
      'visibility',
      currentMatterVisibilityAliases,
      index,
      normalizedPaths
    );
    normalizeAliasField(
      next,
      'matterKind',
      currentMatterKindAliases,
      index,
      normalizedPaths
    );
    normalizeAliasField(
      next,
      'responseWindow',
      currentMatterResponseWindowAliases,
      index,
      normalizedPaths
    );
    return next;
  });
  const identityNormalization =
    preNormalizeOpeningIdentityMatterCandidates({
      identity,
      matters: locallyNormalized
    });
  normalizedPaths.push(...identityNormalization.normalizedPaths);
  return {
    value: identityNormalization.matters,
    normalizedPaths: [...new Set(normalizedPaths)]
  };
}

function normalizeEconomyDomain(
  raw: unknown
): { value: unknown; normalizedPaths: string[] } {
  if (!isRecord(raw)) return { value: raw, normalizedPaths: [] };
  const value = { ...raw };
  const normalizedPaths: string[] = [];
  for (const field of [
    'cashOnHand',
    'bankBalance',
    'monthlyPressure'
  ] as const) {
    const candidate = value[field];
    if (
      typeof candidate === 'string' &&
      candidate.trim() !== '' &&
      Number.isFinite(Number(candidate)) &&
      Number.isInteger(Number(candidate))
    ) {
      value[field] = Number(candidate);
      normalizedPaths.push(`playerStatePatch.economy.${field}`);
    }
  }
  if (typeof value.financeSummary === 'string') {
    const trimmed = value.financeSummary.trim();
    if (trimmed !== value.financeSummary) {
      value.financeSummary = trimmed;
      normalizedPaths.push('playerStatePatch.economy.financeSummary');
    }
  }
  return { value, normalizedPaths };
}

function requiresCurrentMatter(state: RuntimeState): boolean {
  return (
    state.player.currentIdentity === 'civilian' ||
    state.player.currentIdentity === 'gang_member'
  );
}

export function validateOpeningRuntimeCandidate(
  raw: unknown,
  openingSessionId: string,
  state: RuntimeState,
  blueprint: OpeningBlueprint
): OpeningRuntimeCandidateValidation {
  const record = isRecord(raw) ? raw : {};
  const acceptedDomains: Partial<Record<OpeningRuntimeDomainName, unknown>> = {};
  const issues: OpeningRuntimeDomainIssue[] = [];
  const normalizedPaths: string[] = [];

  if (record.openingSessionId !== openingSessionId) {
    normalizedPaths.push('openingSessionId');
  }

  parseDomain(
    'playerPresentationPatch',
    runtimeDomainSchemas.playerPresentationPatch,
    record.playerPresentationPatch,
    acceptedDomains,
    issues
  );

  const playerState = isRecord(record.playerStatePatch)
    ? record.playerStatePatch
    : {};
  const economyNormalization = normalizeEconomyDomain(playerState.economy);
  normalizedPaths.push(...economyNormalization.normalizedPaths);
  parseDomain(
    'economy',
    completeOpeningEconomySchema,
    economyNormalization.value,
    acceptedDomains,
    issues
  );
  parseDomain(
    'homeBase',
    completeOpeningHomeBaseSchema,
    playerState.homeBase,
    acceptedDomains,
    issues
  );
  const extras = Object.fromEntries(
    Object.entries(playerState).filter(
      ([key]) => key !== 'economy' && key !== 'homeBase'
    )
  );
  parseDomain(
    'playerStateExtras',
    playerStateExtrasSchema,
    extras,
    acceptedDomains,
    issues
  );

  parseDomain(
    'memory',
    runtimeDomainSchemas.memory,
    record.memories,
    acceptedDomains,
    issues
  );
  const memories = acceptedDomains.memory;
  if (
    Array.isArray(memories) &&
    memories.filter(
      (memory) => isRecord(memory) && memory.kind === 'turn'
    ).length !== 1
  ) {
    delete acceptedDomains.memory;
    issues.push({
      domain: 'memory',
      paths: ['memories'],
      message: 'memories 必须且只能有一条 kind=turn 的开局事实摘要'
    });
  }

  for (const { domain, field } of optionalTopLevelDomains) {
    const rawValue = record[field];
    const normalized =
      domain === 'currentMatter'
        ? normalizeCurrentMatterDomain(
            rawValue,
            state.player.currentIdentity
          )
        : { value: rawValue, normalizedPaths: [] };
    const value = normalized.value;
    normalizedPaths.push(...normalized.normalizedPaths);
    if (
      value === undefined ||
      (Array.isArray(value) && value.length === 0)
    ) {
      continue;
    }
    parseDomain(
      domain,
      runtimeDomainSchemas[domain],
      value,
      acceptedDomains,
      issues
    );
  }

  if (Array.isArray(acceptedDomains.currentMatter)) {
    const matterResolution = resolveOpeningIdentityMatterContract({
      identity: state.player.currentIdentity,
      blueprint,
      matters: acceptedDomains.currentMatter as OpeningCurrentMatterPatch[]
    });
    normalizedPaths.push(...matterResolution.normalizedPaths);
    if (matterResolution.issues.length > 0) {
      delete acceptedDomains.currentMatter;
      issues.push({
        domain: 'currentMatter',
        paths: matterResolution.issues.map((issue) => issue.path),
        message: matterResolution.issues
          .map((issue) => issue.message)
          .join('；')
      });
    } else {
      acceptedDomains.currentMatter = matterResolution.matters;
    }
  }

  if (
    requiresCurrentMatter(state) &&
    acceptedDomains.currentMatter === undefined &&
    !issues.some((issue) => issue.domain === 'currentMatter')
  ) {
    issues.push({
      domain: 'currentMatter',
      paths: ['currentMatterPatches'],
      message: '当前身份必须建立开局事项'
    });
  }

  if (issues.length > 0) {
    return { acceptedDomains, issues, normalizedPaths };
  }

  const playerStateExtras =
    (acceptedDomains.playerStateExtras as Record<string, unknown>) ?? {};
  const assembled: Record<string, unknown> = {
    openingSessionId,
    playerPresentationPatch: acceptedDomains.playerPresentationPatch,
    playerStatePatch: {
      ...playerStateExtras,
      economy: acceptedDomains.economy,
      homeBase: acceptedDomains.homeBase
    },
    memories: acceptedDomains.memory
  };
  for (const { domain, field } of optionalTopLevelDomains) {
    if (acceptedDomains[domain] !== undefined) {
      assembled[field] = acceptedDomains[domain];
    }
  }
  return {
    value: openingRuntimeDraftSchema.parse(assembled),
    acceptedDomains,
    issues: [],
    normalizedPaths
  };
}

export function applyOpeningRuntimeDomainRepair(
  originalRaw: unknown,
  rawRepair: unknown,
  issues: readonly OpeningRuntimeDomainIssue[]
): Record<string, unknown> {
  const original = isRecord(originalRaw)
    ? JSON.parse(JSON.stringify(originalRaw)) as Record<string, unknown>
    : {};
  const repair = runtimeRepairEnvelopeSchema.parse(rawRepair);
  const allowed = new Set(issues.map((issue) => issue.domain));
  const returned = Object.keys(repair.domains);
  for (const domain of returned) {
    if (!allowed.has(domain as OpeningRuntimeDomainName)) {
      throw new Error(`运行态修复试图修改未授权领域：${domain}`);
    }
  }
  for (const domain of allowed) {
    if (!Object.hasOwn(repair.domains, domain)) {
      throw new Error(`运行态修复仍缺少领域：${domain}`);
    }
    const value = repair.domains[domain];
    if (domain === 'economy' || domain === 'homeBase') {
      const playerState = isRecord(original.playerStatePatch)
        ? original.playerStatePatch
        : {};
      original.playerStatePatch = {
        ...playerState,
        [domain]: mergeOpeningRuntimeRepairValue(
          playerState[domain],
          value
        )
      };
    } else if (domain === 'playerStateExtras') {
      const playerState = isRecord(original.playerStatePatch)
        ? original.playerStatePatch
        : {};
      original.playerStatePatch = {
        ...(mergeOpeningRuntimeRepairValue(
          Object.fromEntries(
            Object.entries(playerState).filter(
              ([key]) => key !== 'economy' && key !== 'homeBase'
            )
          ),
          value
        ) as Record<string, unknown>),
        economy: playerState.economy,
        homeBase: playerState.homeBase
      };
    } else {
      const field = optionalTopLevelDomains.find(
        (candidate) => candidate.domain === domain
      )?.field;
      if (domain === 'memory') {
        original.memories = mergeOpeningRuntimeRepairValue(
          original.memories,
          value
        );
      }
      else if (domain === 'playerPresentationPatch') {
        original.playerPresentationPatch = mergeOpeningRuntimeRepairValue(
          original.playerPresentationPatch,
          value
        );
      } else if (field) {
        original[field] = mergeOpeningRuntimeRepairValue(
          original[field],
          value
        );
      }
    }
  }
  return original;
}

function mergeOpeningRuntimeRepairValue(
  original: unknown,
  repair: unknown
): unknown {
  if (repair === null && original !== undefined && original !== null) {
    return original;
  }
  if (!isRecord(original) || !isRecord(repair)) {
    return repair;
  }
  const merged: Record<string, unknown> = { ...original };
  for (const [key, value] of Object.entries(repair)) {
    merged[key] = mergeOpeningRuntimeRepairValue(original[key], value);
  }
  return merged;
}

export function composeOpeningRuntimeInitializationPrompt({
  blueprint,
  narrative,
  state
}: {
  blueprint: OpeningBlueprint;
  narrative: OpeningNarrativeDraft;
  state: RuntimeState;
}): string {
  const civilianRelationActorIds = blueprint.initialActors
    .filter(
      (actor) =>
        actor.playerRoleRelation === 'civilian_work_relation' ||
        actor.playerRoleRelation === 'civilian_social_relation'
    )
    .map((actor) => actor.actorId);
  const identityMatter =
    state.player.currentIdentity === 'civilian'
      ? `必须且只能建立一条 matterKind="livelihood" 的营生事项；relatedActorIds 必须关联至少一名以下已锁定的职业或稳定社会关系人物：${JSON.stringify(civilianRelationActorIds)}。`
      : state.player.currentIdentity === 'gang_member'
        ? '必须且只能建立一条 source="triad_responsibility" 的组织责任事项，并关联直属上线和同组人物。'
        : '警察身份只有确实存在的当值工作才建立 police_work 事项。';

  return `你正在完成已锁定开局的独立运行态初始化。

已通过严格校验的人物蓝图：
${JSON.stringify(blueprint)}

已通过篇幅与行动合同的正文：
${JSON.stringify(narrative)}

只返回运行态 JSON，不得重写正文、行动、人物或 DramaExecutionTrace。
必须生成：
- playerPresentationPatch：玩家本幕具体衣着、最多三件随身装备和状态；
- playerStatePatch.economy：cashOnHand、bankBalance、monthlyPressure、financeSummary；
- playerStatePatch.homeBase：placeId、placeName、regionId、housingType、summary、householdSummary；
- memories：必须且只能有一条 kind="turn" 的开局事实摘要。

${identityMatter}

确有必要时才输出 financePatch、secretFacts、pressureSeeds、grayLedger、
casePatches、caseEvidencePatches、currentMatterPatches、deferredEventPatches、
assetPatch；没有内容时必须省略，不能用占位或空对象。
所有人物、机构、地点和场景引用只能使用蓝图或既有 Runtime 中的稳定 ID。
经济、住所和事项必须符合玩家身份、出身、正文和 opening facts；不得保留
“待生成”、unknown 等占位。

只返回严格 JSON：
{
  "openingSessionId": ${JSON.stringify(blueprint.openingSessionId)},
  "playerPresentationPatch": {
    "name": ${JSON.stringify(state.player.name)},
    "englishName": ${JSON.stringify(state.player.englishName)},
    "policeNumber": ${JSON.stringify(state.player.policeNumber)},
    "clothing": "本幕具体衣着",
    "equipment": [],
    "statusSummary": "本幕开始时的外显状态"
  },
  "playerStatePatch": {
    "economy": {
      "cashOnHand": 0,
      "bankBalance": 0,
      "monthlyPressure": 30,
      "financeSummary": "具体经济摘要"
    },
    "homeBase": {
      "placeId": "稳定住所 ID",
      "placeName": "住所名称",
      "regionId": "真实地区 ID",
      "housingType": "住房类型",
      "summary": "具体住所摘要",
      "householdSummary": "同住与家庭情况"
    }
  },
  "memories": [
    {
      "text": "本次开局唯一事实摘要",
      "kind": "turn",
      "relatedActorIds": ["player"],
      "relatedCaseIds": [],
      "relatedPlaceIds": [${JSON.stringify(blueprint.openingFacts.placeId)}],
      "relatedOrganizationIds": [],
      "importance": 70,
      "visibility": "player_known",
      "certainty": "fact"
    }
  ]
}`;
}

function readOpeningRuntimeDomainValue(
  rawRuntime: unknown,
  domain: OpeningRuntimeDomainName
): unknown {
  const record = isRecord(rawRuntime) ? rawRuntime : {};
  const playerState = isRecord(record.playerStatePatch)
    ? record.playerStatePatch
    : {};
  if (domain === 'economy' || domain === 'homeBase') {
    return playerState[domain];
  }
  if (domain === 'playerStateExtras') {
    return Object.fromEntries(
      Object.entries(playerState).filter(
        ([key]) => key !== 'economy' && key !== 'homeBase'
      )
    );
  }
  if (domain === 'playerPresentationPatch') {
    return record.playerPresentationPatch;
  }
  if (domain === 'memory') return record.memories;
  const field = optionalTopLevelDomains.find(
    (candidate) => candidate.domain === domain
  )?.field;
  return field ? record[field] : undefined;
}

function currentMatterRepairContract(
  state: RuntimeState,
  blueprint: OpeningBlueprint
): string {
  const lockedActors = blueprint.initialActors.map((actor) => ({
    actorId: actor.actorId,
    name: actor.name,
    playerRoleRelation: actor.playerRoleRelation,
    organizationIds: actor.organizationIds
  }));
  const identityRule =
    state.player.currentIdentity === 'gang_member'
      ? `- 社团开局：只能返回一条 source="triad_responsibility"、matterKind="social"、status="active"、visibility="known" 的组织责任。
- relatedActorIds 必须同时包含直属上线与同组成员：${JSON.stringify(
          lockedActors
            .filter(
              (actor) =>
                actor.playerRoleRelation === 'triad_patron' ||
                actor.playerRoleRelation === 'triad_peer'
            )
            .map((actor) => actor.actorId)
        )}。`
      : state.player.currentIdentity === 'civilian'
        ? `- 市民开局：只能返回一条 matterKind="livelihood"、status="active"、visibility="known" 的营生事项。
- relatedActorIds 至少关联以下一名职业或稳定社会关系人物：${JSON.stringify(
            lockedActors
              .filter(
                (actor) =>
                  actor.playerRoleRelation === 'civilian_work_relation' ||
                  actor.playerRoleRelation === 'civilian_social_relation'
              )
              .map((actor) => actor.actorId)
          )}。`
        : '- 警察身份只修复正文已经明确成立的当值事项，不得凭空新增任务。';
  const exampleMatter =
    state.player.currentIdentity === 'gang_member'
      ? {
          source: 'triad_responsibility',
          matterKind: 'social',
          relatedActorIds: lockedActors
            .filter(
              (actor) =>
                actor.playerRoleRelation === 'triad_patron' ||
                actor.playerRoleRelation === 'triad_peer'
            )
            .map((actor) => actor.actorId)
        }
      : state.player.currentIdentity === 'civilian'
        ? {
            source: 'opening_livelihood',
            matterKind: 'livelihood',
            relatedActorIds: lockedActors
              .filter(
                (actor) =>
                  actor.playerRoleRelation === 'civilian_work_relation' ||
                  actor.playerRoleRelation === 'civilian_social_relation'
              )
              .slice(0, 1)
              .map((actor) => actor.actorId)
          }
        : {
            source: 'opening',
            matterKind: 'personal',
            relatedActorIds: []
          };

  return `currentMatter 领域合同：
- domains.currentMatter 必须是 JSON 数组，不能是字符串、单个对象或 currentMatterPatches 包装。
${identityRule}
- 每一项至少提供 id、title、summary、status、priority、visibility、source、matterKind。
- status 只允许 active|dormant|resolved|archived。
- priority 只允许 0–100 整数，不能使用“高”“紧急”等文字。
- visibility 只允许 known|hidden。
- matterKind 只允许 personal|police_work|livelihood|relationship|family|social|risk|opportunity|case|world。
- pressureLevel 只允许 0|1|2|3；responseWindow 只允许 now|today|soon|open。
- 引用只能来自以下锁定人物和机构，不得虚构稳定 ID：
${JSON.stringify(lockedActors)}
- 没有真实引用时使用 []；不得返回 null。
- 完整格式示例：
${JSON.stringify({
  domains: {
    currentMatter: [
      {
        id: 'matter_opening_1',
        title: '当前事项',
        summary: '事项如何来自已经成立的开局事实',
        status: 'active',
        priority: 70,
        visibility: 'known',
        source: exampleMatter.source,
        matterKind: exampleMatter.matterKind,
        pressureLevel: 1,
        responseWindow: 'soon',
        relatedActorIds: exampleMatter.relatedActorIds,
        relatedPlaceIds: [],
        relatedCaseIds: [],
        relatedOrganizationIds: []
      }
    ]
  }
})}`;
}

function runtimeDomainRepairContract(
  domain: OpeningRuntimeDomainName,
  state: RuntimeState,
  blueprint: OpeningBlueprint,
  originalValue: unknown,
  paths: readonly string[]
): string {
  if (domain === 'economy') {
    const requiresFullObject = !isRecord(originalValue);
    return `economy 领域合同：
- domains.economy 必须是 JSON object。
- 完整字段为 cashOnHand、bankBalance、monthlyPressure、financeSummary。
- cashOnHand 与 bankBalance 是非负整数；monthlyPressure 是 0 到 100 整数；financeSummary 是非空具体摘要。
-${
      requiresFullObject
        ? ' 原值不是对象，必须返回上述四个完整字段。'
        : ` 原值中其他合法字段由本地保留；只返回这些失败字段：${JSON.stringify(
            paths
          )}。`
    }
- 不得返回 null、待生成或 unknown。`;
  }
  if (domain === 'currentMatter') {
    return currentMatterRepairContract(state, blueprint);
  }
  return `${domain} 领域合同：
- 只返回修复路径 ${JSON.stringify(paths)} 所需的最小值。
- 原值中已经合法的字段由本地保留；不得用 null 覆盖合法字段。
- 数组领域必须返回完整数组；对象领域可以只返回失败字段。`;
}

export function createOpeningRuntimeDomainRepairPrompt(input: {
  blueprint: OpeningBlueprint;
  narrative: OpeningNarrativeDraft;
  state: RuntimeState;
  rawRuntime: unknown;
  acceptedDomains: Partial<Record<OpeningRuntimeDomainName, unknown>>;
  issue: OpeningRuntimeDomainIssue;
  compact?: boolean;
}): string {
  const originalValue = readOpeningRuntimeDomainValue(
    input.rawRuntime,
    input.issue.domain
  );
  const narrativeLimit = input.compact ? 1_200 : 3_600;
  const relevantFacts = {
    openingFacts: input.blueprint.openingFacts,
    narrativeExcerpt: input.narrative.narrativeText.slice(0, narrativeLimit),
    suggestedActions: input.narrative.suggestedActions,
    playerIdentity: input.state.player.currentIdentity,
    playerName: input.state.player.name
  };

  return `只修复一个开局运行态领域，不得返回正文、人物、行动或其他领域。
只返回 {"domains":{${JSON.stringify(input.issue.domain)}:修复值}}，不得 Markdown。

失败领域：${input.issue.domain}
失败路径：${JSON.stringify(input.issue.paths)}
失败原因：${input.issue.message}

该领域原始候选：
${JSON.stringify(originalValue)}

已经通过且必须保持不变的领域名称：
${JSON.stringify(Object.keys(input.acceptedDomains))}

本次修复所需的锁定事实：
${JSON.stringify(relevantFacts)}

${runtimeDomainRepairContract(
  input.issue.domain,
  input.state,
  input.blueprint,
  originalValue,
  input.issue.paths
)}

只返回 ${input.issue.domain} 一次；不得附带其他 domains。`;
}

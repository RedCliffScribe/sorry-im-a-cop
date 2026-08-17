import { z } from 'zod';
import type { OpeningBlueprint } from './openingBlueprintSchema';

const blueprintRepairSchema = z
  .object({
    repairs: z
      .array(
        z
          .object({
            path: z.string().min(1),
            value: z
              .unknown()
              .refine((value) => value !== undefined, 'value 字段必须明确提供')
          })
          .strict()
      )
      .min(1)
      .max(24)
  })
  .strict();

const topLevelKeys = new Set([
  'openingSessionId',
  'openingFacts',
  'playerPresentationPatch',
  'initialActors',
  'dramaPlan',
  'actionIntents'
]);

const openingFactKeys = new Set([
  'placeId',
  'sceneId',
  'situationSummary',
  'centralMatter',
  'playerDecisionBoundary'
]);

const playerPresentationKeys = new Set([
  'name',
  'englishName',
  'policeNumber',
  'clothing',
  'equipment',
  'statusSummary'
]);

const actorKeys = new Set([
  'actorId',
  'name',
  'englishName',
  'aliases',
  'callName',
  'gender',
  'birthDate',
  'computedAge',
  'visualAgeAnchor',
  'currentIdentity',
  'publicIdentity',
  'actualIdentitySummary',
  'roleProfiles',
  'playerRoleRelation',
  'organizationIds',
  'positionSummary',
  'profileSummary',
  'appearance',
  'clothing',
  'equipment',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values',
  'attributes',
  'relationshipSummary',
  'attitudeTowardPlayer',
  'interactionScore',
  'trustTendency',
  'entanglementSummary',
  'longTermMemorySummary',
  'recentInteractionMemory',
  'statusSummary',
  'bodyConditionSummary',
  'presence',
  'currentPlaceId',
  'currentSceneId',
  'visibility',
  'importance',
  'femaleProfile',
  'keyMemories',
  'worldpackActorData'
]);

const actionKeys = new Set([
  'actionId',
  'intent',
  'relatedActorIds',
  'requiredFacts'
]);

const actorArrayFields = [
  'aliases',
  'organizationIds',
  'equipment'
] as const;

const referenceArrayPaths = [
  ['police', 'supervisorActorIds'],
  ['police', 'peerActorIds'],
  ['triad', 'patronActorIds'],
  ['triad', 'peerActorIds'],
  ['triad', 'rivalActorIds'],
  ['civilian', 'livelihoodActorIds']
] as const;

const numericActorFields = ['computedAge', 'interactionScore', 'importance'] as const;
const numericAttributeFields = [
  'body',
  'action',
  'perception',
  'thinking',
  'negotiation',
  'will'
] as const;

export interface OpeningBlueprintNormalization {
  value: unknown;
  repairedPaths: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function removeUnknownKeys(
  record: Record<string, unknown>,
  allowed: Set<string>,
  prefix: string,
  repairedPaths: string[]
): void {
  for (const key of Object.keys(record)) {
    if (allowed.has(key)) continue;
    delete record[key];
    repairedPaths.push(`${prefix}.${key}`);
  }
}

function trimEnum(
  record: Record<string, unknown>,
  key: string,
  prefix: string,
  repairedPaths: string[]
): void {
  const value = record[key];
  if (typeof value !== 'string') return;
  const normalized = value.trim().toLowerCase();
  if (normalized === value) return;
  record[key] = normalized;
  repairedPaths.push(`${prefix}.${key}`);
}

function normalizeArrayField(
  record: Record<string, unknown>,
  key: string,
  prefix: string,
  repairedPaths: string[],
  defaultEmpty = false
): void {
  const value = record[key];
  if (value === undefined && defaultEmpty) {
    record[key] = [];
    repairedPaths.push(`${prefix}.${key}`);
    return;
  }
  if (value === null && defaultEmpty) {
    record[key] = [];
    repairedPaths.push(`${prefix}.${key}`);
    return;
  }
  if (typeof value === 'string' && value.trim()) {
    record[key] = [value.trim()];
    repairedPaths.push(`${prefix}.${key}`);
  }
}

function normalizeIntegerField(
  record: Record<string, unknown>,
  key: string,
  prefix: string,
  repairedPaths: string[]
): void {
  const value = record[key];
  if (typeof value !== 'string' || !/^-?\d+$/.test(value.trim())) return;
  const parsed = Number(value.trim());
  if (!Number.isSafeInteger(parsed)) return;
  record[key] = parsed;
  repairedPaths.push(`${prefix}.${key}`);
}

function normalizeOptionalNull(
  record: Record<string, unknown>,
  key: string,
  prefix: string,
  repairedPaths: string[]
): void {
  if (record[key] !== null) return;
  delete record[key];
  repairedPaths.push(`${prefix}.${key}`);
}

function addOrganizationId(
  actor: Record<string, unknown>,
  organizationId: unknown,
  path: string,
  repairedPaths: string[]
): void {
  if (typeof organizationId !== 'string' || !organizationId.trim()) return;
  if (!Array.isArray(actor.organizationIds)) return;
  const normalizedId = organizationId.trim();
  if (actor.organizationIds.includes(normalizedId)) return;
  actor.organizationIds.push(normalizedId);
  repairedPaths.push(path);
}

function normalizeActor(
  actor: Record<string, unknown>,
  index: number,
  openingFacts: Record<string, unknown> | undefined,
  repairedPaths: string[]
): void {
  const prefix = `initialActors.${index}`;
  removeUnknownKeys(actor, actorKeys, prefix, repairedPaths);

  for (const key of ['englishName', 'callName', 'bodyConditionSummary'] as const) {
    normalizeOptionalNull(actor, key, prefix, repairedPaths);
  }
  for (const key of actorArrayFields) {
    normalizeArrayField(actor, key, prefix, repairedPaths, true);
  }
  if (actor.keyMemories === undefined || actor.keyMemories === null) {
    actor.keyMemories = [];
    repairedPaths.push(`${prefix}.keyMemories`);
  }
  if (actor.worldpackActorData === undefined || actor.worldpackActorData === null) {
    actor.worldpackActorData = {};
    repairedPaths.push(`${prefix}.worldpackActorData`);
  }
  for (const key of numericActorFields) {
    normalizeIntegerField(actor, key, prefix, repairedPaths);
  }
  if (isRecord(actor.attributes)) {
    for (const key of numericAttributeFields) {
      normalizeIntegerField(actor.attributes, key, `${prefix}.attributes`, repairedPaths);
    }
  }

  trimEnum(actor, 'currentIdentity', prefix, repairedPaths);
  trimEnum(actor, 'presence', prefix, repairedPaths);
  trimEnum(actor, 'visibility', prefix, repairedPaths);
  if (actor.currentIdentity === 'triad') {
    actor.currentIdentity = 'gang_member';
    repairedPaths.push(`${prefix}.currentIdentity`);
  }

  if (isRecord(actor.roleProfiles)) {
    const roleProfiles = actor.roleProfiles;
    if (roleProfiles.triad === undefined && isRecord(roleProfiles.gang_member)) {
      roleProfiles.triad = roleProfiles.gang_member;
      delete roleProfiles.gang_member;
      repairedPaths.push(`${prefix}.roleProfiles.triad`);
    }
    for (const [profileName, field] of referenceArrayPaths) {
      const profile = roleProfiles[profileName];
      if (!isRecord(profile)) continue;
      normalizeArrayField(
        profile,
        field,
        `${prefix}.roleProfiles.${profileName}`,
        repairedPaths,
        true
      );
    }
    const police = isRecord(roleProfiles.police) ? roleProfiles.police : undefined;
    const triad = isRecord(roleProfiles.triad) ? roleProfiles.triad : undefined;
    const civilian = isRecord(roleProfiles.civilian) ? roleProfiles.civilian : undefined;
    addOrganizationId(
      actor,
      police?.agencyId,
      `${prefix}.organizationIds`,
      repairedPaths
    );
    addOrganizationId(
      actor,
      triad?.organizationId,
      `${prefix}.organizationIds`,
      repairedPaths
    );
    addOrganizationId(
      actor,
      civilian?.employerOrganizationId,
      `${prefix}.organizationIds`,
      repairedPaths
    );
  }

  const projected = actor.presence === 'present' || actor.presence === 'nearby';
  if (projected && openingFacts) {
    if (
      (actor.currentPlaceId === undefined || actor.currentPlaceId === null) &&
      typeof openingFacts.placeId === 'string' &&
      openingFacts.placeId
    ) {
      actor.currentPlaceId = openingFacts.placeId;
      repairedPaths.push(`${prefix}.currentPlaceId`);
    }
    if (
      (actor.currentSceneId === undefined || actor.currentSceneId === null) &&
      typeof openingFacts.sceneId === 'string' &&
      openingFacts.sceneId
    ) {
      actor.currentSceneId = openingFacts.sceneId;
      repairedPaths.push(`${prefix}.currentSceneId`);
    }
  }

  if (isRecord(actor.femaleProfile) && 'adultPrivateProfile' in actor.femaleProfile) {
    delete actor.femaleProfile.adultPrivateProfile;
    repairedPaths.push(`${prefix}.femaleProfile.adultPrivateProfile`);
  }
}

export function normalizeOpeningBlueprintCandidate(
  raw: unknown
): OpeningBlueprintNormalization {
  if (!isRecord(raw)) return { value: raw, repairedPaths: [] };

  const value = cloneJsonValue(raw);
  const repairedPaths: string[] = [];
  removeUnknownKeys(value, topLevelKeys, 'response', repairedPaths);

  const openingFacts = isRecord(value.openingFacts) ? value.openingFacts : undefined;
  if (openingFacts) {
    removeUnknownKeys(openingFacts, openingFactKeys, 'openingFacts', repairedPaths);
  }
  if (isRecord(value.playerPresentationPatch)) {
    removeUnknownKeys(
      value.playerPresentationPatch,
      playerPresentationKeys,
      'playerPresentationPatch',
      repairedPaths
    );
    normalizeArrayField(
      value.playerPresentationPatch,
      'equipment',
      'playerPresentationPatch',
      repairedPaths,
      true
    );
    for (const key of ['englishName', 'policeNumber'] as const) {
      normalizeOptionalNull(
        value.playerPresentationPatch,
        key,
        'playerPresentationPatch',
        repairedPaths
      );
    }
  }
  if (Array.isArray(value.initialActors)) {
    value.initialActors.forEach((actor, index) => {
      if (isRecord(actor)) normalizeActor(actor, index, openingFacts, repairedPaths);
    });
  }
  if (Array.isArray(value.actionIntents)) {
    value.actionIntents.forEach((action, index) => {
      if (!isRecord(action)) return;
      const prefix = `actionIntents.${index}`;
      removeUnknownKeys(action, actionKeys, prefix, repairedPaths);
      normalizeArrayField(action, 'relatedActorIds', prefix, repairedPaths, true);
      normalizeArrayField(action, 'requiredFacts', prefix, repairedPaths, true);
    });
  }

  return {
    value,
    repairedPaths: [...new Set(repairedPaths)]
  };
}

function splitRepairPath(path: string): Array<string | number> {
  return path.split('.').map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function isAllowedRepairPath(path: string): boolean {
  if (path === 'openingSessionId') return true;
  if (/^openingFacts\.[A-Za-z][A-Za-z0-9_]*$/.test(path)) return true;
  if (/^playerPresentationPatch\.[A-Za-z][A-Za-z0-9_]*$/.test(path)) return true;
  if (/^initialActors\.\d+\.[A-Za-z][A-Za-z0-9_.]*$/.test(path)) return true;
  if (/^actionIntents\.\d+\.[A-Za-z][A-Za-z0-9_.]*$/.test(path)) return true;
  return false;
}

export function normalizeOpeningBlueprintRepairPaths(paths: readonly string[]): string[] {
  return [
    ...new Set(
      paths
        .map((path) => path.replace(/\[(\d+)\]/g, '.$1').replace(/^response\./, ''))
        .filter(isAllowedRepairPath)
    )
  ];
}

function readPath(raw: unknown, path: string): unknown {
  let current = raw;
  for (const segment of splitRepairPath(path)) {
    if (!isRecord(current) && !Array.isArray(current)) return undefined;
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function writePath(raw: unknown, path: string, value: unknown): void {
  const segments = splitRepairPath(path);
  let current = raw;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!isRecord(current) && !Array.isArray(current)) {
      throw new Error(`无法定位修复字段 ${path}`);
    }
    const next = (current as Record<string | number, unknown>)[segment];
    if (!isRecord(next) && !Array.isArray(next)) {
      throw new Error(`无法定位修复字段 ${path}`);
    }
    current = next;
  }
  if (!isRecord(current) && !Array.isArray(current)) {
    throw new Error(`无法定位修复字段 ${path}`);
  }
  (current as Record<string | number, unknown>)[segments.at(-1)!] = cloneJsonValue(value);
}

export function applyOpeningBlueprintFieldRepairs(
  baseCandidate: unknown,
  rawRepair: unknown,
  allowedPaths: readonly string[]
): unknown {
  const parsed = blueprintRepairSchema.parse(rawRepair);
  const normalizedAllowedPaths = new Set(normalizeOpeningBlueprintRepairPaths(allowedPaths));
  const seen = new Set<string>();
  const value = cloneJsonValue(baseCandidate);

  for (const repair of parsed.repairs) {
    const path = repair.path.replace(/\[(\d+)\]/g, '.$1').replace(/^response\./, '');
    if (!normalizedAllowedPaths.has(path)) {
      throw new Error(`蓝图字段修复试图修改未授权路径：${path}`);
    }
    if (seen.has(path)) {
      throw new Error(`蓝图字段修复重复返回路径：${path}`);
    }
    seen.add(path);
    writePath(value, path, repair.value);
  }

  const missing = [...normalizedAllowedPaths].filter((path) => !seen.has(path));
  if (missing.length > 0) {
    throw new Error(`蓝图字段修复仍缺少：${missing.join('、')}`);
  }
  return value;
}

function actorIndexFromPath(path: string): number | undefined {
  const match = /^initialActors\.(\d+)\./.exec(path);
  return match ? Number(match[1]) : undefined;
}

function actionIndexFromPath(path: string): number | undefined {
  const match = /^actionIntents\.(\d+)\./.exec(path);
  return match ? Number(match[1]) : undefined;
}

function expectedRepairValue(path: string): string {
  if (path.endsWith('.attributes')) {
    return '对象，且必须完整包含 body/action/perception/thinking/negotiation/will 六个 0–100 整数';
  }
  if (/\.attributes\.(?:body|action|perception|thinking|negotiation|will)$/.test(path)) {
    return '0–100 的整数';
  }
  if (path.endsWith('.femaleProfile')) {
    return '公开档案对象，包含 appearanceDescription/bodyDescription/clothingStyle/personalityCore/affectionProgressionCondition/relationshipProgressionCondition/emotionalBoundary/source，全部文本非空，且不得含 adultPrivateProfile';
  }
  if (path.endsWith('.roleProfiles.police')) {
    return '警队档案对象，至少完整包含 status/agencyId/stationOrPost/department/rank/assignmentSummary/postRole/supervisorActorIds/peerActorIds/authoritySummary/accessSummary/dutySummary/institutionalReputation/disciplinePressureSummary';
  }
  if (path.endsWith('.roleProfiles.triad')) {
    return '社团档案对象，至少完整包含 status/organizationId/societyName/roleTitle/rankSummary/territorySummary/patronActorIds/peerActorIds/rivalActorIds/obligationSummary/riskSummary';
  }
  if (path.endsWith('.roleProfiles.civilian')) {
    return '市民档案对象，至少完整包含 status/employmentStatusId/publicOccupation/positionSummary/dutySummary/decisionScopeSummary/accessSummary/sectorIds/roleTags/livelihoodActorIds/communitySummary/familyEconomicSummary/legalStatusSummary；受雇者还要 employerOrganizationId';
  }
  if (
    /\.(?:aliases|organizationIds|equipment|relatedActorIds|requiredFacts|supervisorActorIds|peerActorIds|patronActorIds|rivalActorIds|livelihoodActorIds)$/.test(
      path
    )
  ) {
    return '字符串数组；无内容时使用 []';
  }
  if (path.endsWith('.playerRoleRelation')) {
      return 'police_supervisor/police_peer/triad_patron/triad_peer/civilian_work_relation/civilian_social_relation 之一';
  }
  if (path.endsWith('.presence')) {
    return 'present/nearby/mentioned/absent 之一';
  }
  if (path.endsWith('.visibility')) {
    return '合法可见性枚举字符串';
  }
  if (
    /\.(?:computedAge|interactionScore|importance)$/.test(path)
  ) {
    return '合法范围内的整数，不得使用字符串数字';
  }
  if (
    /\.(?:currentPlaceId|currentSceneId|actorId|actionId|openingSessionId)$/.test(
      path
    )
  ) {
    return '非空稳定 ID 字符串';
  }
  if (path.includes('.roleProfiles.')) {
    return '符合该角色档案语义的非空字段；文本字段不得省略或使用占位语';
  }
  return '与局部上下文一致的完整字段值；文本必须非空且不得使用占位语';
}

export function createOpeningBlueprintFieldRepairPrompt(input: {
  candidate: unknown;
  issues: readonly string[];
  allowedPaths: readonly string[];
}): string {
  const allowedPaths = normalizeOpeningBlueprintRepairPaths(input.allowedPaths);
  const candidate = isRecord(input.candidate) ? input.candidate : {};
  const actors = Array.isArray(candidate.initialActors) ? candidate.initialActors : [];
  const actions = Array.isArray(candidate.actionIntents) ? candidate.actionIntents : [];
  const actorIndexes = [...new Set(allowedPaths.map(actorIndexFromPath).filter((v) => v !== undefined))];
  const actionIndexes = [
    ...new Set(allowedPaths.map(actionIndexFromPath).filter((v) => v !== undefined))
  ];
  const actorDirectory = actors.map((actor, index) => {
    const record = isRecord(actor) ? actor : {};
    return {
      index,
      actorId: record.actorId,
      name: record.name,
      currentIdentity: record.currentIdentity,
      publicIdentity: record.publicIdentity,
      positionSummary: record.positionSummary,
      presence: record.presence
    };
  });
  const repairContext = {
    openingFacts: candidate.openingFacts,
    playerPresentationPatch: allowedPaths.some((path) =>
      path.startsWith('playerPresentationPatch.')
    )
      ? candidate.playerPresentationPatch
      : undefined,
    actorDirectory,
    affectedActors: actorIndexes.map((index) => ({ index, actor: actors[index] })),
    affectedActions: actionIndexes.map((index) => ({ index, action: actions[index] })),
    currentValues: Object.fromEntries(
      allowedPaths.map((path) => [path, readPath(candidate, path)])
    ),
    requiredValueShapes: Object.fromEntries(
      allowedPaths.map((path) => [path, expectedRepairValue(path)])
    )
  };

  return `你只负责修补一份已经生成的 OpeningBlueprint 中被列出的局部字段。
不得重新生成整份蓝图，不得返回正文、人物数组、行动数组或未列出的字段。
不得新增、删除或替换人物与行动；不得修改 openingSessionId、actorId、actionId，除非该路径明确列入允许清单。
远场人物规则：absent/mentioned 可以没有 currentPlaceId/currentSceneId，不得复制玩家当前位置冒充远场位置。
在场人物规则：present/nearby 的 currentPlaceId/currentSceneId 必须与 openingFacts 对齐。
只返回严格 JSON：
{"repairs":[{"path":"允许清单中的精确路径","value":"该字段完整的新值"}]}

校验问题：
${input.issues.map((issue) => `- ${issue}`).join('\n')}

唯一允许修改的路径：
${allowedPaths.map((path) => `- ${path}`).join('\n')}

局部上下文：
${JSON.stringify(repairContext)}

每个允许路径必须且只能返回一次。不要返回 Markdown。`;
}

export function describeOpeningBlueprintNormalization(paths: readonly string[]): string {
  if (paths.length === 0) return '';
  return `已在本地规范化 ${paths.length} 处可确定格式，不需要重新生成整份人物蓝图。`;
}

export type OpeningBlueprintRepair = z.infer<typeof blueprintRepairSchema>;
export type { OpeningBlueprint };

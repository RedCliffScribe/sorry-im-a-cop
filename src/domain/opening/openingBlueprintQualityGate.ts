import type { RuntimeState } from '../runtime/types';
import type { OpeningBlueprint, OpeningCoreActor } from './openingBlueprintSchema';

export class OpeningBlueprintQualityError extends Error {
  constructor(
    readonly issues: string[],
    readonly repairPaths: string[] = []
  ) {
    super(`开局人物设定未通过校验：${issues.join('；')}`);
    this.name = 'OpeningBlueprintQualityError';
  }
}

const placeholderPatterns = [
  /待生成/,
  /尚未生成/,
  /随剧情(?:逐渐)?明确/,
  /开局生成人物/,
  /暂无明确/,
  /需要通过后续/,
  /unknown/i,
  /to be determined/i,
  /\bTBD\b/i
];

const coreTextFields: Array<keyof OpeningCoreActor> = [
  'name',
  'visualAgeAnchor',
  'publicIdentity',
  'actualIdentitySummary',
  'positionSummary',
  'profileSummary',
  'appearance',
  'clothing',
  'personality',
  'speechStyle',
  'motivation',
  'longTermGoal',
  'values',
  'relationshipSummary',
  'attitudeTowardPlayer',
  'trustTendency',
  'entanglementSummary',
  'longTermMemorySummary',
  'recentInteractionMemory',
  'statusSummary'
];

function normalized(value: string): string {
  return value.trim().replace(/\s+/g, '').toLowerCase();
}

function hasFemalePublicProfile(actor: OpeningCoreActor): boolean {
  if (actor.gender !== 'female') return true;
  const profile = actor.femaleProfile as Record<string, unknown> | undefined;
  if (!profile) return false;
  if (profile.adultPrivateProfile !== undefined) return false;
  const required = [
    'appearanceDescription',
    'bodyDescription',
    'clothingStyle',
    'personalityCore',
    'affectionProgressionCondition',
    'relationshipProgressionCondition',
    'emotionalBoundary'
  ];
  return required.every((key) => typeof profile[key] === 'string' && String(profile[key]).trim().length > 0);
}

function roleContractIssues(state: RuntimeState, blueprint: OpeningBlueprint): string[] {
  const issues: string[] = [];
  const player = state.actors[state.player.actorId];
  if (state.player.currentIdentity === 'gang_member') {
    const organizationId = player?.roleProfiles.triad?.organizationId;
    const patrons = blueprint.initialActors.filter(
      (actor) =>
        actor.playerRoleRelation === 'triad_patron' &&
        actor.roleProfiles.triad &&
        (!organizationId || actor.organizationIds.includes(organizationId))
    );
    const peers = blueprint.initialActors.filter(
      (actor) =>
        actor.playerRoleRelation === 'triad_peer' &&
        actor.roleProfiles.triad &&
        (!organizationId || actor.organizationIds.includes(organizationId))
    );
    if (patrons.length !== 1) issues.push('社团开局必须且只能有一名直属上线');
    if (peers.length !== 1) issues.push('社团开局必须且只能有一名同组成员');
  }
  if (state.player.currentIdentity === 'civilian') {
    const playerEmployerOrganizationId =
      player?.roleProfiles.civilian?.employerOrganizationId;
    if (
      playerEmployerOrganizationId &&
      state.organizations[playerEmployerOrganizationId]
    ) {
      const workRelations = blueprint.initialActors.filter(
        (actor) =>
          actor.playerRoleRelation === 'civilian_work_relation' &&
          actor.organizationIds.includes(playerEmployerOrganizationId) &&
          Boolean(actor.roleProfiles.civilian)
      );
      if (workRelations.length < 1) {
        issues.push('有正式雇主的市民开局至少需要一名稳定职业关系人物');
      }
    } else {
      const socialRelations = blueprint.initialActors.filter(
        (actor) =>
          actor.playerRoleRelation === 'civilian_social_relation' &&
          Boolean(actor.roleProfiles.civilian)
      );
      if (socialRelations.length < 1) {
        issues.push('没有正式雇主的市民开局至少需要一名稳定社会关系人物');
      }
    }
  }
  if (state.player.currentIdentity === 'police') {
    const policeRelations = blueprint.initialActors.filter(
      (actor) =>
        (actor.playerRoleRelation === 'police_supervisor' ||
          actor.playerRoleRelation === 'police_peer') &&
        Boolean(actor.roleProfiles.police)
    );
    if (policeRelations.length < 1) issues.push('警察开局至少需要一名警队工作关系人物');
  }
  return issues;
}

function requireProfileText(
  actor: OpeningCoreActor,
  profileName: 'police' | 'triad' | 'civilian',
  profile: Record<string, unknown>,
  fields: string[],
  issues: string[]
): void {
  for (const field of fields) {
    const value = profile[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      issues.push(`${actor.name}.roleProfiles.${profileName}.${field} 缺失`);
    }
  }
}

function actorRoleProfileIssues(
  actor: OpeningCoreActor,
  state: RuntimeState
): string[] {
  const issues: string[] = [];
  const expectedProfile =
    actor.currentIdentity === 'gang_member'
      ? 'triad'
      : actor.currentIdentity;
  const profile = actor.roleProfiles[expectedProfile];
  if (!profile) {
    return [`${actor.name} 缺少与 currentIdentity 对应的 ${expectedProfile} 角色档案`];
  }

  const profileRecord = profile as unknown as Record<string, unknown>;
  if (profileRecord.status === 'none') {
    issues.push(`${actor.name}.roleProfiles.${expectedProfile}.status 不能为 none`);
  }

  if (expectedProfile === 'police') {
    requireProfileText(
      actor,
      'police',
      profileRecord,
      [
        'agencyId',
        'stationOrPost',
        'department',
        'rank',
        'assignmentSummary',
        'postRole',
        'authoritySummary',
        'accessSummary',
        'dutySummary',
        'institutionalReputation',
        'disciplinePressureSummary'
      ],
      issues
    );
    const agencyId = String(profileRecord.agencyId ?? '');
    if (agencyId && !actor.organizationIds.includes(agencyId)) {
      issues.push(`${actor.name} 的警队 agencyId 未进入 organizationIds`);
    }
  } else if (expectedProfile === 'triad') {
    requireProfileText(
      actor,
      'triad',
      profileRecord,
      [
        'organizationId',
        'societyName',
        'roleTitle',
        'rankSummary',
        'territorySummary',
        'obligationSummary',
        'riskSummary'
      ],
      issues
    );
    const organizationId = String(profileRecord.organizationId ?? '');
    if (organizationId && !actor.organizationIds.includes(organizationId)) {
      issues.push(`${actor.name} 的社团 organizationId 未进入 organizationIds`);
    }
  } else {
    requireProfileText(
      actor,
      'civilian',
      profileRecord,
      [
        'employmentStatusId',
        'publicOccupation',
        'positionSummary',
        'dutySummary',
        'decisionScopeSummary',
        'accessSummary',
        'communitySummary',
        'familyEconomicSummary',
        'legalStatusSummary'
      ],
      issues
    );
    const employerOrganizationId = String(profileRecord.employerOrganizationId ?? '');
    if (
      actor.playerRoleRelation === 'civilian_work_relation' &&
      !employerOrganizationId
    ) {
      issues.push(`${actor.name} 的市民工作关系缺少 employerOrganizationId`);
    }
    if (
      employerOrganizationId &&
      !actor.organizationIds.includes(employerOrganizationId)
    ) {
      issues.push(`${actor.name} 的雇主 organizationId 未进入 organizationIds`);
    }
    if (
      employerOrganizationId &&
      !state.organizations[employerOrganizationId]
    ) {
      issues.push(`${actor.name} 的雇主 organizationId 未登记为真实机构`);
    }
  }

  return issues;
}

function actorRoleReferenceIssues(
  actor: OpeningCoreActor,
  knownActorIds: Set<string>
): string[] {
  const issues: string[] = [];
  const referenceGroups: Array<[string, unknown]> = [
    ['roleProfiles.police.supervisorActorIds', actor.roleProfiles.police?.supervisorActorIds],
    ['roleProfiles.police.peerActorIds', actor.roleProfiles.police?.peerActorIds],
    ['roleProfiles.triad.patronActorIds', actor.roleProfiles.triad?.patronActorIds],
    ['roleProfiles.triad.peerActorIds', actor.roleProfiles.triad?.peerActorIds],
    ['roleProfiles.triad.rivalActorIds', actor.roleProfiles.triad?.rivalActorIds],
    ['roleProfiles.civilian.livelihoodActorIds', actor.roleProfiles.civilian?.livelihoodActorIds]
  ];

  for (const [field, value] of referenceGroups) {
    if (!Array.isArray(value)) continue;
    for (const actorId of value) {
      if (typeof actorId === 'string' && actorId && !knownActorIds.has(actorId)) {
        issues.push(`${actor.name}.${field} 引用了未知人物 ${actorId}`);
      }
    }
  }
  return issues;
}

export function getOpeningActorQualityIssues(
  actor: OpeningCoreActor,
  state: RuntimeState,
  knownActorIds = new Set<string>([
    ...Object.keys(state.actors),
    actor.actorId
  ])
): string[] {
  const issues: string[] = [];
  for (const field of coreTextFields) {
    const value = actor[field];
    if (
      typeof value === 'string' &&
      placeholderPatterns.some((pattern) => pattern.test(value))
    ) {
      issues.push(`${actor.name}.${String(field)} 使用了占位内容`);
    }
  }
  if (
    (actor.presence === 'present' || actor.presence === 'nearby') &&
    (!actor.currentPlaceId || !actor.currentSceneId)
  ) {
    issues.push(`${actor.name} 在场但缺少有效地点或场景`);
  }
  if (!hasFemalePublicProfile(actor)) {
    issues.push(`${actor.name} 缺少完整女性公开档案或错误包含成人私密档案`);
  }
  issues.push(...actorRoleProfileIssues(actor, state));
  issues.push(...actorRoleReferenceIssues(actor, knownActorIds));
  return [...new Set(issues)];
}

export function getOpeningActorQualityRepairPaths(
  actor: OpeningCoreActor,
  issues: readonly string[]
): string[] {
  const paths: string[] = [];
  const prefix = `${actor.name}.`;
  for (const issue of issues) {
    if (issue.startsWith(prefix)) {
      const fieldMatch = /^([A-Za-z][A-Za-z0-9_.]*) (?:缺失|不能为|使用了|引用了)/.exec(
        issue.slice(prefix.length)
      );
      if (fieldMatch) {
        paths.push(fieldMatch[1]);
        continue;
      }
    }
    if (!issue.startsWith(actor.name)) continue;
    if (issue.includes('缺少与 currentIdentity 对应的')) {
      const profile =
        actor.currentIdentity === 'gang_member'
          ? 'triad'
          : actor.currentIdentity;
      paths.push(`roleProfiles.${profile}`);
      continue;
    }
    if (issue.includes('在场但缺少有效地点或场景')) {
      paths.push('currentPlaceId', 'currentSceneId');
      continue;
    }
    if (issue.includes('缺少完整女性公开档案')) {
      paths.push('femaleProfile');
      continue;
    }
    if (issue.includes('市民工作关系缺少 employerOrganizationId')) {
      paths.push('roleProfiles.civilian.employerOrganizationId');
      continue;
    }
    if (issue.includes('警队 agencyId 未进入 organizationIds')) {
      paths.push('roleProfiles.police.agencyId');
      continue;
    }
    if (issue.includes('社团 organizationId 未进入 organizationIds')) {
      paths.push('roleProfiles.triad.organizationId');
      continue;
    }
    if (issue.includes('雇主 organizationId 未进入 organizationIds')) {
      paths.push('roleProfiles.civilian.employerOrganizationId');
      continue;
    }
    if (issue.includes('雇主 organizationId 未登记为真实机构')) {
      paths.push('roleProfiles.civilian.employerOrganizationId');
      continue;
    }
    const referenceMatch = /\.(roleProfiles\.[A-Za-z0-9_.]+) 引用了未知人物/.exec(
      issue
    );
    if (referenceMatch) paths.push(referenceMatch[1]);
  }
  return [...new Set(paths)];
}

export function getOpeningBlueprintQualityIssues(
  blueprint: OpeningBlueprint,
  state: RuntimeState
): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const identities = new Set<string>();
  const knownActorIds = new Set([
    ...Object.keys(state.actors),
    ...blueprint.initialActors.map((actor) => actor.actorId)
  ]);

  for (const actor of blueprint.initialActors) {
    if (ids.has(actor.actorId)) issues.push(`重复 actorId：${actor.actorId}`);
    ids.add(actor.actorId);

    const nameKey = normalized(actor.name);
    if (names.has(nameKey)) issues.push(`重复人物姓名：${actor.name}`);
    names.add(nameKey);

    const identityKey = normalized(`${actor.name}|${actor.publicIdentity}|${actor.positionSummary}`);
    if (identities.has(identityKey)) issues.push(`重复稳定身份：${actor.name}`);
    identities.add(identityKey);

    issues.push(...getOpeningActorQualityIssues(actor, state, knownActorIds));
  }

  const differentiatingFields: Array<keyof OpeningCoreActor> = [
    'personality',
    'speechStyle',
    'motivation',
    'values'
  ];
  if (blueprint.initialActors.length > 1) {
    for (const field of differentiatingFields) {
      const values = blueprint.initialActors.map((actor) => normalized(String(actor[field])));
      if (new Set(values).size === 1) {
        issues.push(`全部开局人物的 ${String(field)} 完全相同`);
      }
    }
    const attributeSignatures = blueprint.initialActors.map((actor) =>
      JSON.stringify(actor.attributes)
    );
    if (new Set(attributeSignatures).size === 1) {
      issues.push('全部开局人物使用了完全相同的六维属性');
    }
  }

  const actionIds = new Set<string>();
  for (const action of blueprint.actionIntents) {
    if (actionIds.has(action.actionId)) issues.push(`重复 actionId：${action.actionId}`);
    actionIds.add(action.actionId);
    for (const actorId of action.relatedActorIds) {
      if (!ids.has(actorId) && !state.actors[actorId]) {
        issues.push(`行动 ${action.actionId} 引用了未知人物 ${actorId}`);
      }
    }
  }

  issues.push(...roleContractIssues(state, blueprint));
  return [...new Set(issues)];
}

function findActorIndex(blueprint: OpeningBlueprint, actorName: string): number {
  return blueprint.initialActors.findIndex((actor) => actor.name === actorName);
}

function directActorIssuePath(
  blueprint: OpeningBlueprint,
  issue: string
): string | undefined {
  for (const actor of blueprint.initialActors) {
    const prefix = `${actor.name}.`;
    if (!issue.startsWith(prefix)) continue;
    const fieldMatch = /^([A-Za-z][A-Za-z0-9_.]*) (?:缺失|不能为|使用了|引用了)/.exec(
      issue.slice(prefix.length)
    );
    if (!fieldMatch) continue;
    const index = findActorIndex(blueprint, actor.name);
    if (index >= 0) return `initialActors.${index}.${fieldMatch[1]}`;
  }
  return undefined;
}

export function getOpeningBlueprintQualityRepairPaths(
  blueprint: OpeningBlueprint,
  issues: readonly string[]
): string[] {
  const paths: string[] = [];

  for (const issue of issues) {
    const directPath = directActorIssuePath(blueprint, issue);
    if (directPath) {
      paths.push(directPath);
      continue;
    }

    const actor = blueprint.initialActors.find((candidate) =>
      issue.startsWith(candidate.name)
    );
    const actorIndex = actor ? findActorIndex(blueprint, actor.name) : -1;
    if (actor && actorIndex >= 0) {
      const actorPaths = getOpeningActorQualityRepairPaths(actor, [issue]);
      if (actorPaths.length > 0) {
        paths.push(
          ...actorPaths.map(
            (path) => `initialActors.${actorIndex}.${path}`
          )
        );
        continue;
      }
    }

    const identicalField = /^全部开局人物的 ([A-Za-z][A-Za-z0-9_]*) 完全相同$/.exec(
      issue
    );
    if (identicalField) {
      blueprint.initialActors.slice(1).forEach((_, index) => {
        paths.push(`initialActors.${index + 1}.${identicalField[1]}`);
      });
      continue;
    }
    if (issue === '全部开局人物使用了完全相同的六维属性') {
      blueprint.initialActors.slice(1).forEach((_, index) => {
        paths.push(`initialActors.${index + 1}.attributes`);
      });
      continue;
    }

    const duplicateAction = /^重复 actionId：(.+)$/.exec(issue);
    if (duplicateAction) {
      const duplicateIndexes = blueprint.actionIntents
        .map((action, index) => ({ action, index }))
        .filter(({ action }) => action.actionId === duplicateAction[1])
        .slice(1);
      duplicateIndexes.forEach(({ index }) => paths.push(`actionIntents.${index}.actionId`));
      continue;
    }
    const unknownActionActor = /^行动 (.+) 引用了未知人物/.exec(issue);
    if (unknownActionActor) {
      const actionIndex = blueprint.actionIntents.findIndex(
        (action) => action.actionId === unknownActionActor[1]
      );
      if (actionIndex >= 0) paths.push(`actionIntents.${actionIndex}.relatedActorIds`);
      continue;
    }

    if (issue === '警察开局至少需要一名警队工作关系人物') {
      const index = blueprint.initialActors.findIndex((candidate) =>
        Boolean(candidate.roleProfiles.police)
      );
      if (index >= 0) paths.push(`initialActors.${index}.playerRoleRelation`);
      continue;
    }
    if (issue === '有正式雇主的市民开局至少需要一名稳定职业关系人物') {
      const index = blueprint.initialActors.findIndex((candidate) =>
        Boolean(candidate.roleProfiles.civilian)
      );
      if (index >= 0) paths.push(`initialActors.${index}.playerRoleRelation`);
      continue;
    }
    if (issue === '没有正式雇主的市民开局至少需要一名稳定社会关系人物') {
      const index = blueprint.initialActors.findIndex((candidate) =>
        Boolean(candidate.roleProfiles.civilian)
      );
      if (index >= 0) paths.push(`initialActors.${index}.playerRoleRelation`);
      continue;
    }
    if (issue === '社团开局必须且只能有一名直属上线') {
      const index = blueprint.initialActors.findIndex((candidate) =>
        Boolean(candidate.roleProfiles.triad)
      );
      if (index >= 0) paths.push(`initialActors.${index}.playerRoleRelation`);
      continue;
    }
    if (issue === '社团开局必须且只能有一名同组成员') {
      let index = -1;
      for (let candidateIndex = blueprint.initialActors.length - 1; candidateIndex >= 0; candidateIndex -= 1) {
        if (blueprint.initialActors[candidateIndex].roleProfiles.triad) {
          index = candidateIndex;
          break;
        }
      }
      if (index >= 0) paths.push(`initialActors.${index}.playerRoleRelation`);
    }
  }

  return [...new Set(paths)];
}

export function validateOpeningBlueprintQuality(
  blueprint: OpeningBlueprint,
  state: RuntimeState
): OpeningBlueprint {
  const issues = getOpeningBlueprintQualityIssues(blueprint, state);
  if (issues.length > 0) {
    throw new OpeningBlueprintQualityError(
      issues,
      getOpeningBlueprintQualityRepairPaths(blueprint, issues)
    );
  }
  return blueprint;
}

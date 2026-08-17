import type { RuntimeState } from '../runtime/types';
import type { OpeningCoreActor } from './openingBlueprintSchema';
import type { OpeningRecoveryCode } from './openingFailureClassification';

export type OpeningCivilianEmploymentStatus =
  | 'employed'
  | 'unemployed'
  | 'self_employed'
  | 'freelance'
  | 'retired'
  | 'homemaker'
  | 'student'
  | 'dependent'
  | 'unknown';

export type OpeningCivilianEmployerResolutionStatus =
  | 'not_applicable'
  | 'linked'
  | 'locally_inferred'
  | 'unresolved_allowed'
  | 'repair_required'
  | 'upstream_contract_invalid';

export interface OpeningCivilianEmployerDiagnostic {
  code: OpeningRecoveryCode;
  path: Array<string | number>;
  message: string;
}

export interface OpeningCivilianEmployerResolution {
  actor: OpeningCoreActor;
  status: OpeningCivilianEmployerResolutionStatus;
  employmentStatus: OpeningCivilianEmploymentStatus;
  allowedEmployerOrganizationIds: string[];
  diagnostics: OpeningCivilianEmployerDiagnostic[];
}

const statusAliases = new Map<string, OpeningCivilianEmploymentStatus>([
  ['employed', 'employed'],
  ['employee', 'employed'],
  ['salaried', 'employed'],
  ['full_time', 'employed'],
  ['part_time', 'employed'],
  ['working', 'employed'],
  ['受雇', 'employed'],
  ['在职', 'employed'],
  ['有业', 'employed'],
  ['雇员', 'employed'],
  ['职员', 'employed'],
  ['全职', 'employed'],
  ['兼职', 'employed'],
  ['unemployed', 'unemployed'],
  ['jobless', 'unemployed'],
  ['无业', 'unemployed'],
  ['失业', 'unemployed'],
  ['待业', 'unemployed'],
  ['self_employed', 'self_employed'],
  ['selfemployed', 'self_employed'],
  ['business_owner', 'self_employed'],
  ['owner', 'self_employed'],
  ['自雇', 'self_employed'],
  ['自营', 'self_employed'],
  ['个体经营', 'self_employed'],
  ['freelance', 'freelance'],
  ['freelancer', 'freelance'],
  ['contractor', 'freelance'],
  ['自由职业', 'freelance'],
  ['自由职业者', 'freelance'],
  ['retired', 'retired'],
  ['退休', 'retired'],
  ['homemaker', 'homemaker'],
  ['housewife', 'homemaker'],
  ['househusband', 'homemaker'],
  ['家庭主妇', 'homemaker'],
  ['家庭主夫', 'homemaker'],
  ['家庭照料者', 'homemaker'],
  ['student', 'student'],
  ['pupil', 'student'],
  ['学生', 'student'],
  ['dependent', 'dependent'],
  ['dependant', 'dependent'],
  ['受供养', 'dependent'],
  ['家属', 'dependent']
]);

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeStatusKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function classifyOpeningCivilianEmploymentStatus(
  value: string | undefined
): OpeningCivilianEmploymentStatus {
  if (!value?.trim()) return 'unknown';
  return statusAliases.get(normalizeStatusKey(value)) ?? 'unknown';
}

function validOrganizationIds(
  actor: OpeningCoreActor,
  state: RuntimeState
): string[] {
  return [
    ...new Set(
      actor.organizationIds.filter((organizationId) =>
        Object.hasOwn(state.organizations, organizationId)
      )
    )
  ];
}

function playerCivilianEmployerOrganizationIds(
  state: RuntimeState
): string[] {
  const player = state.actors[state.player.actorId];
  const directEmployer =
    player?.roleProfiles.civilian?.employerOrganizationId;
  const workRelations =
    player?.organizationRelations
      .filter((relation) =>
        /^(?:employee|manager|owner|contractor)$/i.test(
          relation.relationType
        )
      )
      .map((relation) => relation.organizationId) ?? [];
  return [
    ...new Set(
      [directEmployer, ...workRelations].filter(
        (organizationId): organizationId is string =>
          Boolean(
            organizationId && state.organizations[organizationId]
          )
      )
    )
  ];
}

function withoutEmployer(actor: OpeningCoreActor): OpeningCoreActor {
  const next = clone(actor);
  if (next.roleProfiles.civilian) {
    delete next.roleProfiles.civilian.employerOrganizationId;
  }
  return next;
}

function withEmployer(
  actor: OpeningCoreActor,
  employerOrganizationId: string
): OpeningCoreActor {
  const next = clone(actor);
  if (next.roleProfiles.civilian) {
    next.roleProfiles.civilian.employerOrganizationId =
      employerOrganizationId;
  }
  return next;
}

export function resolveOpeningCivilianEmployerContract({
  actor,
  state
}: {
  actor: OpeningCoreActor;
  state: RuntimeState;
}): OpeningCivilianEmployerResolution {
  const civilian = actor.roleProfiles.civilian;
  if (actor.currentIdentity !== 'civilian' || !civilian) {
    return {
      actor,
      status: 'not_applicable',
      employmentStatus: 'unknown',
      allowedEmployerOrganizationIds: [],
      diagnostics: []
    };
  }

  const diagnostics: OpeningCivilianEmployerDiagnostic[] = [];
  const employmentStatus = classifyOpeningCivilianEmploymentStatus(
    civilian.employmentStatusId
  );
  const isWorkRelation =
    actor.playerRoleRelation === 'civilian_work_relation';
  const actorOrganizationIds = validOrganizationIds(actor, state);
  const playerEmployerOrganizationIds =
    playerCivilianEmployerOrganizationIds(state);
  const allowedEmployerOrganizationIds = isWorkRelation
    ? actorOrganizationIds.filter((organizationId) =>
        playerEmployerOrganizationIds.includes(organizationId)
      )
    : actorOrganizationIds;
  const suppliedEmployerOrganizationId = civilian.employerOrganizationId;
  const suppliedEmployerIsValid =
    Boolean(suppliedEmployerOrganizationId) &&
    allowedEmployerOrganizationIds.includes(suppliedEmployerOrganizationId!);
  let normalizedActor = actor;
  const employmentMustNotHaveEmployer = [
    'unemployed',
    'retired',
    'homemaker',
    'student',
    'dependent'
  ].includes(employmentStatus);

  if (suppliedEmployerIsValid && employmentMustNotHaveEmployer) {
    normalizedActor = withoutEmployer(actor);
    diagnostics.push({
      code: 'opening_civilian_employer_invalid_removed',
      path: ['roleProfiles', 'civilian', 'employerOrganizationId'],
      message: `${actor.name} 的就业状态为 ${employmentStatus}，已移除不适用的当前雇主引用。`
    });
    return {
      actor: normalizedActor,
      status: 'not_applicable',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  if (suppliedEmployerOrganizationId && !suppliedEmployerIsValid) {
    normalizedActor = withoutEmployer(actor);
    diagnostics.push({
      code: 'opening_civilian_employer_invalid_removed',
      path: ['roleProfiles', 'civilian', 'employerOrganizationId'],
      message: `${actor.name} 的雇主机构 ${suppliedEmployerOrganizationId} 不在人物已锁定的真实机构中，已移除该虚构引用。`
    });
  }

  if (suppliedEmployerIsValid) {
    return {
      actor: normalizedActor,
      status: 'linked',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  const employmentDoesNotRequireEmployer = [
    'unemployed',
    'self_employed',
    'freelance',
    'retired',
    'homemaker',
    'student',
    'dependent'
  ].includes(employmentStatus);

  if (!isWorkRelation && employmentDoesNotRequireEmployer) {
    return {
      actor: normalizedActor,
      status: 'not_applicable',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  if (allowedEmployerOrganizationIds.length === 1) {
    const employerOrganizationId = allowedEmployerOrganizationIds[0];
    normalizedActor = withEmployer(normalizedActor, employerOrganizationId);
    diagnostics.push({
      code: 'opening_civilian_employer_inferred',
      path: ['roleProfiles', 'civilian', 'employerOrganizationId'],
      message: `${actor.name} 只有一个已锁定的真实机构，已由本地补齐雇主机构 ${employerOrganizationId}。`
    });
    return {
      actor: normalizedActor,
      status: 'locally_inferred',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  if (!isWorkRelation) {
    diagnostics.push({
      code: 'opening_civilian_employer_unresolved_allowed',
      path: ['roleProfiles', 'civilian', 'employerOrganizationId'],
      message: `${actor.name} 不是玩家的正式工作关系人物；其雇主尚未成为本存档机构实体，允许保持未知。`
    });
    return {
      actor: normalizedActor,
      status: 'unresolved_allowed',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  if (allowedEmployerOrganizationIds.length === 0) {
    diagnostics.push({
      code: 'opening_employer_contract_missing_upstream',
      path: ['roleProfiles', 'civilian', 'employerOrganizationId'],
      message: `${actor.name} 被锁定为玩家工作关系人物，但上游没有提供任何真实雇主机构；该问题不能由人物字段修复解决。`
    });
    return {
      actor: normalizedActor,
      status: 'upstream_contract_invalid',
      employmentStatus,
      allowedEmployerOrganizationIds,
      diagnostics
    };
  }

  return {
    actor: normalizedActor,
    status: 'repair_required',
    employmentStatus,
    allowedEmployerOrganizationIds,
    diagnostics
  };
}

export class OpeningCivilianEmployerContractError extends Error {
  readonly actorId: string;

  constructor(actor: Pick<OpeningCoreActor, 'actorId' | 'name'>) {
    super(
      `${actor.name} 的工作关系缺少可用的本地雇主机构，必须先修复开局人物槽位。`
    );
    this.name = 'OpeningCivilianEmployerContractError';
    this.actorId = actor.actorId;
  }
}

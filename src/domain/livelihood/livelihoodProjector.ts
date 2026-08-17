import type {
  Actor,
  ActorOrganizationRelation,
  CivilianRoleProfile,
  CurrentMatter,
  EvolutionOutcomeRecord,
  Organization,
  OrganizationEvolutionTrack,
  RuntimeState
} from '../runtime/types';
import {
  projectCivilianWorkSchedule,
  type CivilianWorkScheduleProjection
} from './civilianWorkSchedule';

export interface LivelihoodRelationView {
  actorId: string;
  name: string;
  publicIdentity: string;
  relationType?: string;
  roleTitle?: string;
  departmentOrUnit?: string;
  summary: string;
}

export interface LivelihoodPanelProjection {
  available: boolean;
  roleProfile?: CivilianRoleProfile;
  primaryOrganization?: Organization;
  primaryOrganizationTrack?: OrganizationEvolutionTrack;
  workplaceName?: string;
  workRelations: LivelihoodRelationView[];
  activeMatters: CurrentMatter[];
  recentOutcomes: EvolutionOutcomeRecord[];
  workSchedule: CivilianWorkScheduleProjection;
  livelihoodSummary: string;
  opportunitySummaries: string[];
  obstacleSummaries: string[];
  actionHints: string[];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function visibleOrganizationRelation(
  actor: Actor,
  organizationId: string | undefined
): ActorOrganizationRelation | undefined {
  if (!organizationId) return undefined;
  return actor.organizationRelations.find(
    (relation) =>
      relation.organizationId === organizationId &&
      relation.visibility !== 'hidden'
  );
}

function isActiveLivelihoodMatter(matter: CurrentMatter): boolean {
  if (
    matter.visibility === 'hidden' ||
    (matter.status !== 'active' && matter.status !== 'dormant')
  ) {
    return false;
  }
  return matter.matterKind === 'livelihood';
}

function relationSummary(
  actor: Actor,
  relation: ActorOrganizationRelation | undefined
): string {
  return (
    relation?.summary ||
    actor.positionSummary ||
    actor.statusSummary ||
    actor.publicIdentity ||
    '职业关系尚未进一步确认'
  );
}

function relationView(
  actor: Actor,
  relation: ActorOrganizationRelation | undefined
): LivelihoodRelationView {
  return {
    actorId: actor.actorId,
    name: actor.name,
    publicIdentity: actor.publicIdentity ?? '身份待确认',
    relationType: relation?.relationType,
    roleTitle: relation?.roleTitle,
    departmentOrUnit: relation?.departmentOrUnit,
    summary: relationSummary(actor, relation)
  };
}

function createActionHints(
  state: RuntimeState,
  profile: CivilianRoleProfile,
  relations: LivelihoodRelationView[],
  matters: CurrentMatter[]
): string[] {
  const hints: string[] = [];
  const firstMatter = matters[0];
  const firstRelation = relations[0];
  if (firstMatter) {
    hints.push(`了解“${firstMatter.title}”目前还缺少什么信息`);
  }
  if (firstRelation) {
    hints.push(`找${firstRelation.name}谈谈最近的工作安排`);
  }
  if (profile.employerOrganizationId && state.organizations[profile.employerOrganizationId]) {
    hints.push(`留意${state.organizations[profile.employerOrganizationId].name}最近的内部动向`);
  }
  if (profile.employmentStatusId === 'unemployed' || !profile.employerOrganizationId) {
    hints.push('联系旧同事或熟人打听近期工作机会');
  }
  if (profile.familyEconomicSummary) {
    hints.push('和家人谈谈目前的收入与生活安排');
  }
  return unique(hints).slice(0, 4);
}

export function projectLivelihoodContext(
  state: RuntimeState
): LivelihoodPanelProjection {
  if (state.player.currentIdentity !== 'civilian') {
    return {
      available: false,
      workSchedule: projectCivilianWorkSchedule({
        time: state.time,
        currentIdentity: state.player.currentIdentity
      }),
      workRelations: [],
      activeMatters: [],
      recentOutcomes: [],
      livelihoodSummary: '当前公开身份不是市民。',
      opportunitySummaries: [],
      obstacleSummaries: [],
      actionHints: []
    };
  }

  const playerActor = state.actors[state.player.actorId];
  const profile = playerActor?.roleProfiles.civilian;
  if (!profile) {
    return {
      available: true,
      workSchedule: projectCivilianWorkSchedule({
        time: state.time,
        currentIdentity: state.player.currentIdentity
      }),
      workRelations: [],
      activeMatters: [],
      recentOutcomes: [],
      livelihoodSummary: '当前尚未形成可确认的职业资料。',
      opportunitySummaries: [],
      obstacleSummaries: [],
      actionHints: ['整理目前的工作、收入与求职情况']
    };
  }

  const primaryOrganization = profile.employerOrganizationId
    ? state.organizations[profile.employerOrganizationId]
    : undefined;
  const primaryOrganizationTrack = profile.employerOrganizationId
    ? Object.values(state.backgroundEvolution.organizationTracks).find(
        (track) => track.organizationId === profile.employerOrganizationId
      )
    : undefined;
  const activeMatters = Object.values(state.dynamicEvents.currentMatters)
    .filter((matter) => isActiveLivelihoodMatter(matter))
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        right.updatedAt.year - left.updatedAt.year ||
        right.updatedAt.month - left.updatedAt.month ||
        right.updatedAt.day - left.updatedAt.day
    )
    .slice(0, 8);

  const relationActorIds = unique([
    ...(profile.livelihoodActorIds ?? []),
    ...activeMatters.flatMap((matter) => matter.relatedActorIds),
    ...Object.values(state.actors)
      .filter(
        (actor) =>
          actor.actorId !== state.player.actorId &&
          actor.visibility !== 'hidden' &&
          Boolean(
            visibleOrganizationRelation(actor, profile.employerOrganizationId)
          )
      )
      .map((actor) => actor.actorId)
  ]);
  const workRelations = relationActorIds
    .map((actorId) => state.actors[actorId])
    .filter(
      (actor): actor is Actor =>
        Boolean(actor) &&
        actor.actorId !== state.player.actorId &&
        actor.visibility !== 'hidden'
    )
    .map((actor) =>
      relationView(
        actor,
        visibleOrganizationRelation(actor, profile.employerOrganizationId)
      )
    )
    .slice(0, 12);

  const recentOutcomes = state.backgroundEvolution.recentOutcomes
    .filter(
      (outcome) =>
        outcome.visibility !== 'hidden' &&
        Boolean(
          (profile.employerOrganizationId &&
            outcome.relatedOrganizationIds.includes(
              profile.employerOrganizationId
            )) ||
            outcome.relatedActorIds.some((actorId) =>
              relationActorIds.includes(actorId)
            )
        )
    )
    .slice(-8)
    .reverse();

  const occupation = profile.publicOccupation || '普通市民';
  const employment =
    profile.employmentStatusId === 'unemployed'
      ? '暂时无业'
      : profile.employmentStatusId === 'self_employed'
        ? '自营'
        : primaryOrganization
          ? `任职于${primaryOrganization.name}`
          : '工作关系尚未确认';
  const opportunitySummaries = unique([
    ...(profile.employmentStatusId === 'unemployed'
      ? ['寻找稳定工作、散工或转行机会']
      : []),
    ...(profile.employmentStatusId === 'self_employed'
      ? ['稳住供货、熟客与经营关系']
      : []),
    ...(primaryOrganizationTrack?.objective
      ? [`所在机构正在推进：${primaryOrganizationTrack.objective}`]
      : []),
    ...recentOutcomes
      .filter((outcome) => outcome.significance !== 'routine')
      .map((outcome) => outcome.consequence || outcome.summary)
  ]).slice(0, 5);
  const obstacleSummaries = unique([
    ...(profile.familyEconomicSummary ? [profile.familyEconomicSummary] : []),
    ...(primaryOrganization?.pressureSummary
      ? [primaryOrganization.pressureSummary]
      : []),
    ...activeMatters
      .filter((matter) => (matter.pressureLevel ?? 0) >= 2)
      .map(
        (matter) =>
          matter.consequenceHint || matter.currentHook || matter.summary
      )
  ]).slice(0, 5);

  return {
    available: true,
    roleProfile: profile,
    workSchedule: projectCivilianWorkSchedule({
      time: state.time,
      currentIdentity: state.player.currentIdentity,
      profile
    }),
    primaryOrganization,
    primaryOrganizationTrack,
    workplaceName: profile.workplacePlaceId
      ? state.places[profile.workplacePlaceId]?.nameZh ??
        state.places[profile.workplacePlaceId]?.name
      : undefined,
    workRelations,
    activeMatters,
    recentOutcomes,
    livelihoodSummary: `${occupation}；${employment}。`,
    opportunitySummaries,
    obstacleSummaries,
    actionHints: createActionHints(state, profile, workRelations, activeMatters)
  };
}

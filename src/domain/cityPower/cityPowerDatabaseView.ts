import type { ActorOrganizationRelation, CurrentIdentity, Organization } from '../runtime/types';
import { hkLateColonialOrganizations } from './hkLateColonialOrganizations';
import type { CityOrganizationAnchor, CityPowerVisibility } from './cityPowerTypes';

export interface CityPowerInstitutionViewRecord {
  id: string;
  name: string;
  type: string;
  summary: string;
  publicKnowledge: string;
  currentState: string;
  stanceTowardPlayer: string;
  pressureSummary: string;
  source: 'runtime' | 'anchor';
  visibility: 'public' | 'player_known';
  importance: number;
  relatedActorIds: string[];
  relatedPlaceIds: string[];
  relatedCaseIds: string[];
  playerRelationScope: 'none' | 'visible' | 'hidden';
}

export interface CityPowerInstitutionPlayerContext {
  actorId: string;
  organizationRelations: ActorOrganizationRelation[];
}

function isInstitutionPanelType(type: string): boolean {
  return type !== 'triad';
}

function anchorVisibility(anchor: CityOrganizationAnchor, identity: CurrentIdentity): CityPowerVisibility {
  return anchor.visibilityByIdentity?.[identity] ?? anchor.defaultVisibility;
}

function isAnchorVisible(anchor: CityOrganizationAnchor, identity: CurrentIdentity): boolean {
  const visibility = anchorVisibility(anchor, identity);
  return visibility === 'public' || visibility === 'rumor' || visibility === 'restricted';
}

function relationDisplayName(relation: ActorOrganizationRelation): string {
  return [relation.roleTitle, relation.departmentOrUnit].filter(Boolean).join(' / ') || '公开成员';
}

function fromRuntime(
  organization: Organization,
  playerContext?: CityPowerInstitutionPlayerContext
): CityPowerInstitutionViewRecord {
  const playerRelations =
    playerContext?.organizationRelations.filter((relation) => relation.organizationId === organization.organizationId) ?? [];
  const visiblePlayerRelation =
    playerRelations.find((relation) => relation.visibility !== 'hidden' && relation.isPrimary) ??
    playerRelations.find((relation) => relation.visibility !== 'hidden');
  const hasHiddenPlayerRelation = playerRelations.some((relation) => relation.visibility === 'hidden');
  const playerRelationScope = visiblePlayerRelation ? 'visible' : hasHiddenPlayerRelation ? 'hidden' : 'none';
  const stanceTowardPlayer = visiblePlayerRelation
    ? `玩家当前以${relationDisplayName(visiblePlayerRelation)}身份与该机构保持直接关系。`
    : playerRelationScope === 'hidden'
      ? '当前身份下没有公开的直接关系。'
      : organization.stanceTowardPlayer;
  return {
    id: organization.organizationId,
    name: organization.name,
    type: organization.type,
    summary: organization.summary,
    publicKnowledge: organization.publicKnowledge,
    currentState: organization.currentState,
    stanceTowardPlayer,
    pressureSummary: organization.pressureSummary,
    source: 'runtime',
    visibility: organization.visibility === 'public' ? 'public' : 'player_known',
    importance: organization.importance,
    relatedActorIds:
      playerRelationScope === 'hidden' && playerContext
        ? organization.relatedActorIds.filter((actorId) => actorId !== playerContext.actorId)
        : [...organization.relatedActorIds],
    relatedPlaceIds: [...organization.relatedPlaceIds],
    relatedCaseIds: playerRelationScope === 'hidden' ? [] : [...organization.relatedCaseIds],
    playerRelationScope
  };
}

function fromAnchor(anchor: CityOrganizationAnchor, identity: CurrentIdentity): CityPowerInstitutionViewRecord {
  const visibility = anchorVisibility(anchor, identity);
  return {
    id: anchor.organizationId,
    name: anchor.displayName,
    type: anchor.organizationType === 'police' ? 'police_force' : anchor.organizationType,
    summary: anchor.promptSafeProfile,
    publicKnowledge: anchor.publicKnowledge,
    currentState: visibility === 'restricted' ? '有受限情报价值，具体状态需剧情确认。' : '时代背景锚点，当前局势需剧情确认。',
    stanceTowardPlayer: '尚未形成本局直接关系。',
    pressureSummary: anchor.sectorTags.join(' / ') || '暂无压力摘要。',
    source: 'anchor',
    visibility: visibility === 'public' ? 'public' : 'player_known',
    importance: anchor.influence,
    relatedActorIds: [],
    relatedPlaceIds: [...anchor.headquartersPlaceIds, ...anchor.territoryPlaceIds],
    relatedCaseIds: [],
    playerRelationScope: 'none'
  };
}

export function createCityPowerInstitutionView(
  organizations: Record<string, Organization>,
  identity: CurrentIdentity,
  anchors: CityOrganizationAnchor[] = hkLateColonialOrganizations,
  playerContext?: CityPowerInstitutionPlayerContext
): CityPowerInstitutionViewRecord[] {
  const records = new Map<string, CityPowerInstitutionViewRecord>();
  const runtimeOrganizationIds = new Set(Object.keys(organizations));
  Object.values(organizations)
    .filter(
      (organization) => organization.visibility !== 'hidden' && isInstitutionPanelType(organization.type)
    )
    .forEach((organization) => records.set(organization.organizationId, fromRuntime(organization, playerContext)));
  anchors
    .filter((anchor) => !runtimeOrganizationIds.has(anchor.organizationId))
    .filter((anchor) => isInstitutionPanelType(anchor.organizationType))
    .filter((anchor) => isAnchorVisible(anchor, identity))
    .forEach((anchor) => records.set(anchor.organizationId, fromAnchor(anchor, identity)));
  return [...records.values()].sort((left, right) => right.importance - left.importance || left.name.localeCompare(right.name));
}

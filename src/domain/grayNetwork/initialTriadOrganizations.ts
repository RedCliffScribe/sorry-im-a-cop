import { hkLateColonialOrganizations } from '../cityPower/hkLateColonialOrganizations';
import type { CityOrganizationAnchor } from '../cityPower/cityPowerTypes';
import type { CurrentIdentity, Organization, OrganizationId, OrganizationStructureNode } from '../runtime/types';

function playerStance(identity: CurrentIdentity): string {
  if (identity === 'gang_member') return '视玩家背景而定，未确认字头前只保持试探。';
  if (identity === 'police') return '对玩家保持警惕；基层警员若频繁接触夜场、线人或外围成员，会逐渐进入对方视野。';
  return '暂无直接关系；普通市民通常只会在街面冲突、夜场或人情关系里间接接触。';
}

function initialCurrentState(anchor: CityOrganizationAnchor, openingYear: number): string {
  return `${openingYear}年，公开层面只确认“${anchor.displayName}”是香港街面传闻中的主要社团名号；本局尚无与你直接相关的具体动向，地区人事和当晚安排需要通过接触、线索和新闻逐步确认。`;
}

function initialPressureSummary(anchor: CityOrganizationAnchor): string {
  return `涉及${anchor.displayName}名号的夜场、街面、线人、外围营生或旧案牵连，都可能让你与其成员、外围或传闻发生接触。`;
}

function createInitialTriadOrganization(
  anchor: CityOrganizationAnchor,
  currentIdentity: CurrentIdentity,
  openingYear: number
): Organization {
  const stanceTowardPlayer = playerStance(currentIdentity);

  return {
    organizationId: anchor.organizationId,
    name: anchor.displayName,
    type: 'triad',
    summary: anchor.promptSafeProfile,
    publicKnowledge: anchor.publicKnowledge,
    currentState: initialCurrentState(anchor, openingYear),
    stanceTowardPlayer,
    pressureSummary: initialPressureSummary(anchor),
    structureTree: createTriadStructureTree(anchor.organizationId, '外围成员'),
    relatedActorIds: [],
    relatedPlaceIds: [...new Set([...anchor.headquartersPlaceIds, ...anchor.territoryPlaceIds])],
    relatedCaseIds: [],
    visibility: 'public',
    importance: anchor.influence
  };
}

export function createInitialTriadOrganizations(
  currentIdentity: CurrentIdentity,
  openingYear: number,
  anchors: CityOrganizationAnchor[] = hkLateColonialOrganizations
): Record<OrganizationId, Organization> {
  return {
    ...Object.fromEntries(
      anchors
        .filter((anchor) => anchor.organizationType === 'triad')
        .sort((left, right) => right.influence - left.influence || left.displayName.localeCompare(right.displayName))
        .map((anchor) => [anchor.organizationId, createInitialTriadOrganization(anchor, currentIdentity, openingYear)])
    )
  } satisfies Record<OrganizationId, Organization>;
}

function unknownNode(
  nodeId: string,
  label: string,
  role: string,
  summary: string,
  children: OrganizationStructureNode[] = []
): OrganizationStructureNode {
  return {
    nodeId,
    label,
    role,
    personName: '未知',
    status: '未知',
    confidence: 'unknown',
    summary,
    children
  };
}

function createTriadStructureTree(organizationId: OrganizationId, outerLabel: string): OrganizationStructureNode[] {
  return [
    unknownNode(`${organizationId}_seat`, '坐馆', '最高话事层', '街面只知道有拍板层，具体姓名和权力边界未确认。', [
      unknownNode(`${organizationId}_elders`, '叔父辈', '老一辈协调', '负责旧关系、名义和规矩的协调，具体人物未确认。'),
      unknownNode(`${organizationId}_district_heads`, '地区话事人', '地区/生意线负责人', '负责地区线、场所线或生意线，具体人事未确认。', [
        unknownNode(`${organizationId}_outer_members`, outerLabel, '外围执行与街面接触', '你最容易遇到这一层，但姓名、身份和归属仍需通过接触和线索确认。')
      ])
    ])
  ];
}

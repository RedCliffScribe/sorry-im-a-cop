import { applyGrayNetworkPatch } from '../../src/domain/grayNetwork/grayNetwork';
import { createBatch3aRuntimeState } from './batch3a-fixture';

export function createBatch3bRuntimeState() {
  const base = createBatch3aRuntimeState();
  const placeId = base.location.currentPlaceId;

  base.policePanel.climate = [
    {
      key: 'public_scrutiny',
      label: '公众目光',
      level: 'tense',
      summary: '近期街坊更关注巡逻警员处理夜间纠纷时是否合乎程序。'
    },
    {
      key: 'station_morale',
      label: '警署士气',
      level: 'normal',
      summary: '旺角警署更表紧密，但同僚之间仍愿意互相补位。'
    }
  ];
  base.policePanel.actionHints = ['先向值日警长确认今日巡逻范围和交更要求。'];

  base.actors.npc_reporter.organizationIds = ['org_tvb'];
  base.actors.npc_reporter.organizationRelations = [
    {
      organizationId: 'org_tvb',
      relationType: 'employee',
      roleTitle: '记者',
      departmentOrUnit: '新闻部',
      summary: '负责九龙街坊新闻采访。',
      visibility: 'player_known',
      isPrimary: true
    }
  ];

  return applyGrayNetworkPatch(base, {
    knownOrganizations: [
      {
        organizationId: 'org_sun_yee_on',
        name: 'Sun Yee On',
        visibleName: '新义安旺角外围',
        summary: '街面消息称有人在夜场外围替新义安收风。',
        knownScope: '旺角夜场与街面传闻',
        confidence: 'medium',
        visibility: { police: 'known' },
        relatedActorIds: ['npc_reporter'],
        relatedPlaceIds: [placeId],
        relatedCaseIds: []
      }
    ],
    keyPlaces: [
      {
        placeId,
        visibleRole: '街面接触点',
        tieSummary: '附近有人替新义安外围带话。',
        riskSummary: '穿制服直接追问会惊动街面人马。',
        confidence: 'medium',
        visibility: { police: 'known' },
        relatedActorIds: ['npc_reporter'],
        relatedOrganizationIds: ['org_sun_yee_on'],
        relatedCaseIds: []
      }
    ],
    relationClues: [
      {
        clueId: 'batch3b_syo_clue',
        summary: '夜场外围最近更换了替人传话的生面孔。',
        certainty: 'rumor',
        confidence: 'medium',
        visibility: { police: 'known' },
        relatedActorIds: ['npc_reporter'],
        relatedPlaceIds: [placeId],
        relatedOrganizationIds: ['org_sun_yee_on'],
        relatedCaseIds: []
      }
    ],
    actionRisks: [
      {
        riskId: 'batch3b_syo_risk',
        identity: 'police',
        title: '外围反查',
        level: 'medium',
        summary: '公开追问可能让外围成员反查玩家身份。',
        suggestedMitigation: '先从可靠消息源交叉确认。',
        relatedActorIds: ['npc_reporter'],
        relatedPlaceIds: [placeId]
      }
    ],
    suggestedActions: [
      {
        actionId: 'batch3b_syo_action',
        identity: 'police',
        text: '先找相熟记者确认夜场外围最近换了哪些人。',
        rationale: '避免直接惊动社团外围。',
        riskLevel: 'low',
        relatedActorIds: ['npc_reporter'],
        relatedPlaceIds: [placeId]
      }
    ]
  });
}

import type {
  Actor,
  ActorId,
  GameTime,
  LawIdentityRuntime,
  PoliceCareerPathState,
  PoliceClimateEntry,
  PolicePanelState
} from '../runtime/types';
import { getNextPoliceRankTarget } from './policeRankCatalog';
import { formatPoliceRank, formatPoliceTerm, formatPoliceText } from './policeTerminology';

export interface PolicePanelPatch {
  unitSummary?: string;
  rankBoundary?: Partial<PolicePanelState['rankBoundary']>;
  careerPath?: Partial<Omit<PoliceCareerPathState, 'updatedAt'>>;
  climate?: Array<Omit<PoliceClimateEntry, 'updatedAt'> & Partial<Pick<PoliceClimateEntry, 'updatedAt'>>>;
  relatedActorIds?: ActorId[];
  actionHints?: string[];
}

function cloneTime(time: GameTime | undefined): GameTime | undefined {
  return time ? { ...time } : undefined;
}

function uniqueLimited(values: string[] | undefined, limit: number): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function normalizeRankText(rank: string | undefined): string {
  return formatPoliceRank(rank);
}

function getNextRankTarget(rank: string | undefined): string | undefined {
  return getNextPoliceRankTarget(rank);
}

function createCareerPath(lawIdentity: LawIdentityRuntime, time: GameTime): PoliceCareerPathState {
  const currentRank = normalizeRankText(lawIdentity.rank);
  const targetRank = getNextRankTarget(currentRank);
  return {
    currentRank,
    targetRank,
    routeSummary: targetRank
      ? `当前可见晋升路径：先在${currentRank}职级留下可靠记录，再争取向${targetRank}晋升的推荐。`
      : '当前职级路径尚未固定；需要通过上级评价和正式记录确认下一步。',
    knownRequirements: [
      '足够的服务记录与本职级年资。',
      '没有严重纪律污点。',
      '上级评价正面，日常表现稳定可靠。',
      '有书面勤务记录、嘉奖或有效案件参与会有帮助，但不保证晋升。'
    ],
    dynamicAssessment: {
      seniority: '尚未评估。',
      discipline: '未记录正式纪律处分。',
      supervisor: '中性，或尚未建立明确评价。',
      performance: '开局记录仍然很薄。',
      commendation: '暂无正式嘉奖。',
      opportunity: '暂无明确推荐机会。'
    },
    opportunities: [],
    obstacles: [],
    suggestedActions: [
      '询问直属上司，下一步晋升最看重哪些记录。',
      '争取能留下正式表现记录的勤务。'
    ],
    updatedAt: cloneTime(time)
  };
}

function createInactiveCareerPath(time: GameTime): PoliceCareerPathState {
  return {
    currentRank: '无警务职级',
    routeSummary: '玩家当前没有有效警队职务或晋升路径。',
    knownRequirements: [],
    dynamicAssessment: {
      seniority: '不适用。',
      discipline: '不适用。',
      supervisor: '不适用。',
      performance: '不适用。',
      commendation: '不适用。',
      opportunity: '不适用。'
    },
    opportunities: [],
    obstacles: [],
    suggestedActions: [],
    updatedAt: cloneTime(time)
  };
}

export function createInitialPolicePanel(
  player: Pick<Actor, 'actorId' | 'currentIdentity'>,
  lawIdentity: LawIdentityRuntime,
  time: GameTime
): PolicePanelState {
  const isPolice = player.currentIdentity === 'police' || lawIdentity.status !== 'none';
  const stationOrPost = formatPoliceTerm(lawIdentity.stationOrPost ?? 'Unspecified station or posting');
  const department = formatPoliceTerm(lawIdentity.department ?? 'Unspecified branch');
  const rank = normalizeRankText(lawIdentity.rank);
  const assignment = formatPoliceTerm(lawIdentity.assignmentSummary ?? 'Unspecified posting');

  return {
    institutionName: '皇家香港警察',
    institutionNameEn: 'Royal Hong Kong Police',
    eraSummary:
      '港英时期警队层级清晰，基层警员受职级、岗位、上级链条、纪律与公众投诉约束；晋升依赖年资、表现记录、纪律记录、上级评价和实际机会。',
    localChain: isPolice
      ? ['皇家香港警察', stationOrPost, department, `${rank} / ${assignment}`]
      : ['暂无有效警队链条'],
    unitName: isPolice ? `${stationOrPost} / ${department}` : '暂无有效警队单位',
    unitSummary: isPolice
      ? `当前隶属${stationOrPost}、${department}；职责边界受${rank}和${assignment}约束。`
      : '玩家当前没有有效警队职务。',
    rankBoundary: {
      can: isPolice
        ? [
            '可以处理职级范围内的日常勤务、街面接触、即时报告和证物交接。',
            '可以经本地指挥链汇报观察并请求指示。'
          ]
        : ['当前没有可用的警务权限。'],
      cannot: isPolice
        ? [
            '不能独立指挥超出职级的跨区重大案件或高曝光调查。',
            '不能绕过上级链条改变警队层面的决定。'
          ]
        : ['没有有效执法身份时，不能使用警务权限。'],
      contacts: isPolice ? ['直属上司', '值日官', '同署同僚'] : []
    },
    careerPath: isPolice ? createCareerPath(lawIdentity, time) : createInactiveCareerPath(time),
    climate: isPolice
      ? [
          {
            key: 'discipline_pressure',
            label: '纪律压力',
            level: 'normal',
            summary: lawIdentity.disciplinePressureSummary
              ? formatPoliceText(lawIdentity.disciplinePressureSummary)
              : '暂未形成明确纪律风险。',
            updatedAt: cloneTime(time)
          },
          {
            key: 'supervisor_attitude',
            label: '上级态度',
            level: 'unclear',
            summary: lawIdentity.institutionalReputation ? formatPoliceText(lawIdentity.institutionalReputation) : '上级评价尚未稳定。',
            updatedAt: cloneTime(time)
          }
        ]
      : [],
    relatedActorIds: isPolice
      ? uniqueLimited([player.actorId, ...(lawIdentity.supervisorActorIds ?? []), ...(lawIdentity.peerActorIds ?? [])], 12)
      : [],
    actionHints: isPolice
      ? [
          '询问直属上司，下一步最看重哪些表现记录。',
          '寻找能留下清楚书面记录的勤务。'
        ]
      : [],
    updatedAt: cloneTime(time),
    worldpackPoliceData: {}
  };
}

export function applyPolicePanelPatch(
  panel: PolicePanelState,
  patch: PolicePanelPatch | undefined,
  time: GameTime
): PolicePanelState {
  if (!patch) return panel;

  const careerPatch = patch.careerPath;
  const careerChanged = Boolean(careerPatch && Object.keys(careerPatch).length > 0);
  const nextCareerPath: PoliceCareerPathState = careerPatch
    ? {
        ...panel.careerPath,
        ...careerPatch,
        dynamicAssessment: {
          ...panel.careerPath.dynamicAssessment,
          ...(careerPatch.dynamicAssessment ?? {})
        },
        knownRequirements: careerPatch.knownRequirements
          ? uniqueLimited(careerPatch.knownRequirements, 8)
          : panel.careerPath.knownRequirements,
        opportunities: careerPatch.opportunities ? uniqueLimited(careerPatch.opportunities, 8) : panel.careerPath.opportunities,
        obstacles: careerPatch.obstacles ? uniqueLimited(careerPatch.obstacles, 8) : panel.careerPath.obstacles,
        suggestedActions: careerPatch.suggestedActions
          ? uniqueLimited(careerPatch.suggestedActions, 8)
          : panel.careerPath.suggestedActions,
        updatedAt: careerChanged ? cloneTime(time) : panel.careerPath.updatedAt
      }
    : panel.careerPath;

  const climateByKey = new Map(panel.climate.map((entry) => [entry.key, entry]));
  for (const entry of patch.climate ?? []) {
    climateByKey.set(entry.key, {
      ...climateByKey.get(entry.key),
      ...entry,
      updatedAt: cloneTime(entry.updatedAt ?? time)
    });
  }

  const rankBoundary = patch.rankBoundary
    ? {
        can: patch.rankBoundary.can ? uniqueLimited(patch.rankBoundary.can, 8) : panel.rankBoundary.can,
        cannot: patch.rankBoundary.cannot ? uniqueLimited(patch.rankBoundary.cannot, 8) : panel.rankBoundary.cannot,
        contacts: patch.rankBoundary.contacts ? uniqueLimited(patch.rankBoundary.contacts, 8) : panel.rankBoundary.contacts
      }
    : panel.rankBoundary;

  return {
    ...panel,
    unitSummary: patch.unitSummary ?? panel.unitSummary,
    rankBoundary,
    careerPath: nextCareerPath,
    climate: Array.from(climateByKey.values()).slice(0, 8),
    relatedActorIds: patch.relatedActorIds ? uniqueLimited(patch.relatedActorIds, 12) : panel.relatedActorIds,
    actionHints: patch.actionHints ? uniqueLimited(patch.actionHints, 6) : panel.actionHints,
    updatedAt: cloneTime(time)
  };
}

import type {
  PlayerReputationLogEntry,
  ReputationCircle,
  ReputationEntry,
  RuntimeState
} from '../runtime/types';
import {
  formatNotorietyLevel,
  formatReputationTone,
  reputationCircleLabels,
  reputationCircleValues
} from './reputation';

export const MAX_REPUTATION_CONTEXT_CIRCLES = 3;
export const MAX_REPUTATION_CONTEXT_LOGS = 3;
const MIN_REPUTATION_CIRCLE_SCORE = 40;

export interface ReputationCircleProjection {
  circle: ReputationCircle;
  label: string;
  entry: ReputationEntry;
  score: number;
  reasons: string[];
}

export interface ReputationProjection {
  overall: {
    notoriety: number;
    notorietyLevel: string;
    overallReputation: number;
    tone: string;
    summary: string;
  };
  circles: ReputationCircleProjection[];
  recentLogs: PlayerReputationLogEntry[];
  diagnostics: {
    selectedCircles: ReputationCircle[];
    omittedCircleCount: number;
    selectedLogIds: string[];
    omittedLogCount: number;
  };
}

const circleKeywordMap: Record<ReputationCircle, string[]> = {
  police: [
    'police',
    'station',
    'sergeant',
    'inspector',
    'complaint',
    'discipline',
    'patrol',
    'case',
    'report',
    '警',
    '警队',
    '警署',
    '上级',
    '同僚',
    '纪律',
    '投诉',
    '巡逻',
    '案件',
    '报案'
  ],
  neighborhoodMedia: [
    'media',
    'public',
    'resident',
    'local',
    'complaint',
    'newspaper',
    'press',
    '街坊',
    '公众',
    '媒体',
    '报纸',
    '投诉',
    '市民',
    '邻居',
    '居民',
    '舆论'
  ],
  entertainment: ['entertainment', 'film', 'nightclub', 'hostess', 'star', 'reporter', 'movie', '娱乐', '夜总会', '电影', '片场', '明星', '记者'],
  triad: ['triad', 'gang', 'society', 'runner', 'gambling', 'blackmail', '社团', '黑帮', '江湖', '马仔', '赌', '斩', '砍'],
  business: ['business', 'shop', 'boss', 'company', 'merchant', 'money', '老板', '公司', '生意', '店铺', '商会', '钱'],
  politics: ['government', 'court', 'icac', 'governor', 'council', 'prosecution', '政府', '政界', '港督', '立法局', '廉署', '法院', '检控']
};

function tokenizeInput(playerInput: string): string[] {
  const normalized = playerInput.trim().toLowerCase();
  if (!normalized) return [];
  return Array.from(new Set([normalized, ...normalized.split(/[^\p{L}\p{N}_]+/u).filter(Boolean)]));
}

function matchesKeyword(circle: ReputationCircle, tokens: string[]): boolean {
  const keywords = circleKeywordMap[circle];
  return keywords.some((keyword) => {
    const normalizedKeyword = keyword.toLowerCase();
    return tokens.some((token) => token.includes(normalizedKeyword) || normalizedKeyword.includes(token));
  });
}

function reputationLogTimeValue(log: PlayerReputationLogEntry): number {
  const { year, month, day, hour, minute } = log.gameTime;
  return (((year * 100 + month) * 100 + day) * 100 + hour) * 100 + minute;
}

function sortedRecentLogs(logs: PlayerReputationLogEntry[]): PlayerReputationLogEntry[] {
  return [...logs].sort(
    (left, right) => reputationLogTimeValue(right) - reputationLogTimeValue(left) || right.logId.localeCompare(left.logId)
  );
}

function scoreCircle(
  circle: ReputationCircle,
  entry: ReputationEntry,
  logs: PlayerReputationLogEntry[],
  tokens: string[],
  state: RuntimeState
): ReputationCircleProjection {
  let score = 0;
  const reasons: string[] = [];

  if (state.player.currentIdentity === 'police' && circle === 'police') {
    score += 50;
    reasons.push('player_identity');
  }
  if (circle === 'neighborhoodMedia') {
    score += 15;
    reasons.push('default_social_surface');
  }
  if (matchesKeyword(circle, tokens)) {
    score += 100;
    reasons.push('player_input');
  }

  const recentCircleLogs = logs.filter((log) => log.kind === 'circle' && log.circle === circle).slice(0, 3);
  if (recentCircleLogs.length) {
    score += recentCircleLogs.length * 20;
    reasons.push('recent_log');
  }
  if (entry.visibility >= 25) {
    score += Math.min(40, Math.floor(entry.visibility / 25));
    reasons.push('visibility');
  }
  if (entry.visibility >= 25 && entry.standing !== 0) {
    score += Math.min(30, Math.abs(entry.standing));
    reasons.push('standing');
  }

  return { circle, label: reputationCircleLabels[circle], entry, score, reasons };
}

export function projectReputationContext(state: RuntimeState, playerInput: string): ReputationProjection {
  const reputation = state.player.reputation;
  const tokens = tokenizeInput(playerInput);
  const recentLogs = sortedRecentLogs(reputation.logs);
  const scoredCircles = reputationCircleValues
    .map((circle) => scoreCircle(circle, reputation.circles[circle], recentLogs, tokens, state))
    .filter((entry) => entry.score >= MIN_REPUTATION_CIRCLE_SCORE)
    .sort(
      (left, right) =>
        right.score - left.score || reputationCircleValues.indexOf(left.circle) - reputationCircleValues.indexOf(right.circle)
    );
  const circles = scoredCircles.slice(0, MAX_REPUTATION_CONTEXT_CIRCLES);
  const selectedLogs = recentLogs.slice(0, MAX_REPUTATION_CONTEXT_LOGS);

  return {
    overall: {
      notoriety: reputation.notoriety,
      notorietyLevel: formatNotorietyLevel(reputation.notoriety),
      overallReputation: reputation.overallReputation,
      tone: formatReputationTone(reputation.overallReputation),
      summary: reputation.summary
    },
    circles,
    recentLogs: selectedLogs,
    diagnostics: {
      selectedCircles: circles.map((entry) => entry.circle),
      omittedCircleCount: Math.max(0, reputationCircleValues.length - circles.length),
      selectedLogIds: selectedLogs.map((log) => log.logId),
      omittedLogCount: Math.max(0, reputation.logs.length - selectedLogs.length)
    }
  };
}

import type {
  CurrentIdentity,
  GameTime,
  PlayerReputationState,
  ReputationByCircle,
  ReputationCircle,
  ReputationEntry
} from '../runtime/types';

export const reputationCircleValues = [
  'police',
  'neighborhoodMedia',
  'entertainment',
  'triad',
  'business',
  'politics'
] as const satisfies readonly ReputationCircle[];

export const reputationCircleLabels: Record<ReputationCircle, string> = {
  police: '警队',
  neighborhoodMedia: '街坊/公众媒体',
  entertainment: '娱乐圈',
  triad: '社团',
  business: '商业',
  politics: '政界'
};

export const neutralReputationSummary = '尚未形成稳定整体口碑。';

const legacyCircleAliases: Record<string, ReputationCircle> = {
  policeinternal: 'police',
  police: 'police',
  localpublic: 'neighborhoodMedia',
  mediapublic: 'neighborhoodMedia',
  neighborhoodmedia: 'neighborhoodMedia',
  publicmedia: 'neighborhoodMedia',
  underworld: 'triad',
  triad: 'triad',
  society: 'triad',
  entertainment: 'entertainment',
  business: 'business',
  political: 'politics',
  politics: 'politics',
  oversight: 'politics',
  government: 'politics'
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function normalizeReputationCircle(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return legacyCircleAliases[normalizeKey(value)] ?? value;
}

export function clampReputationVisibility(value: number): number {
  return Math.max(0, Math.min(1000, Math.round(value)));
}

export function clampReputationScore(value: number): number {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

function entry(visibility: number, standing: number, summary: string): ReputationEntry {
  return {
    visibility: clampReputationVisibility(visibility),
    standing: clampReputationScore(standing),
    summary
  };
}

export function createInitialReputationCircles(currentIdentity: CurrentIdentity): ReputationByCircle {
  return {
    police: entry(
      currentIdentity === 'police' ? 10 : 0,
      0,
      currentIdentity === 'police' ? '警队内部只把玩家视为新人，暂未形成稳定评价。' : '警队内部暂未注意到玩家。'
    ),
    neighborhoodMedia: entry(0, 0, '街坊、媒体和公众暂未形成明确印象。'),
    entertainment: entry(0, 0, '娱乐圈暂未注意到玩家。'),
    triad: entry(0, 0, '社团圈暂未注意到玩家。'),
    business: entry(0, 0, '商业圈暂未注意到玩家。'),
    politics: entry(
      currentIdentity === 'police' ? 3 : 0,
      0,
      currentIdentity === 'police' ? '政府/监督视角中只是普通基层人员。' : '政界和政府系统暂未注意到玩家。'
    )
  };
}

export function createInitialReputationState(currentIdentity: CurrentIdentity): PlayerReputationState {
  return {
    notoriety: 0,
    overallReputation: 0,
    summary: neutralReputationSummary,
    circles: createInitialReputationCircles(currentIdentity),
    logs: []
  };
}

export function normalizeReputationEntry(value: unknown, fallback: ReputationEntry): ReputationEntry {
  if (!value || typeof value !== 'object') return { ...fallback };
  const raw = value as Partial<ReputationEntry>;
  return {
    visibility:
      typeof raw.visibility === 'number' && Number.isFinite(raw.visibility)
        ? clampReputationVisibility(raw.visibility)
        : fallback.visibility,
    standing:
      typeof raw.standing === 'number' && Number.isFinite(raw.standing)
        ? clampReputationScore(raw.standing)
        : fallback.standing,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : fallback.summary
  };
}

export function normalizeReputationCircles(value: unknown, fallback: ReputationByCircle): ReputationByCircle {
  const circles: ReputationByCircle = {
    police: { ...fallback.police },
    neighborhoodMedia: { ...fallback.neighborhoodMedia },
    entertainment: { ...fallback.entertainment },
    triad: { ...fallback.triad },
    business: { ...fallback.business },
    politics: { ...fallback.politics }
  };
  if (!value || typeof value !== 'object') return circles;

  for (const [rawCircle, rawEntry] of Object.entries(value as Record<string, unknown>)) {
    const normalizedCircle = normalizeReputationCircle(rawCircle);
    if (!reputationCircleValues.includes(normalizedCircle as ReputationCircle)) continue;
    const circle = normalizedCircle as ReputationCircle;
    circles[circle] = normalizeReputationEntry(rawEntry, circles[circle]);
  }

  return circles;
}

export function normalizePlayerReputationState(
  value: unknown,
  fallback: PlayerReputationState
): PlayerReputationState {
  if (!value || typeof value !== 'object') return cloneReputationState(fallback);
  const raw = value as Partial<PlayerReputationState>;
  return {
    notoriety:
      typeof raw.notoriety === 'number' && Number.isFinite(raw.notoriety)
        ? clampReputationVisibility(raw.notoriety)
        : fallback.notoriety,
    overallReputation:
      typeof raw.overallReputation === 'number' && Number.isFinite(raw.overallReputation)
        ? clampReputationScore(raw.overallReputation)
        : fallback.overallReputation,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : fallback.summary,
    circles: normalizeReputationCircles(raw.circles, fallback.circles),
    logs: Array.isArray(raw.logs)
      ? raw.logs.map((log) => ({
          ...log,
          gameTime: { ...log.gameTime }
        }))
      : []
  };
}

export function cloneReputationState(state: PlayerReputationState): PlayerReputationState {
  return {
    notoriety: state.notoriety,
    overallReputation: state.overallReputation,
    summary: state.summary,
    circles: normalizeReputationCircles(state.circles, state.circles),
    logs: state.logs.map((log) => ({ ...log, gameTime: { ...log.gameTime } }))
  };
}

export function formatNotorietyLevel(value: number): string {
  if (value >= 800) return '全城瞩目';
  if (value >= 500) return '广泛知名';
  if (value >= 250) return '区域有名';
  if (value >= 80) return '圈内听过';
  if (value > 0) return '少数人知道';
  return '无人知晓';
}

export function formatReputationTone(value: number): string {
  if (value <= -70) return '恶评很重';
  if (value <= -30) return '负面明显';
  if (value < 0) return '略偏负面';
  if (value === 0) return '未定';
  if (value < 30) return '略偏正面';
  if (value < 70) return '正面明显';
  return '好评很强';
}

export function formatReputationTime(time: GameTime): string {
  return `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

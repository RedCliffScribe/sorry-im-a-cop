import type { CurrentIdentity, GameTime, LawIdentityRuntime } from '../runtime/types';

export type PoliceDutyStatus = 'not_applicable' | 'on_duty' | 'near_shift_end' | 'off_duty' | 'rest_day';

export interface PoliceDutyContextProjection {
  available: boolean;
  status: PoliceDutyStatus;
  label: string;
  summary: string;
  ordinaryTurnRules: string[];
  openingRules: string[];
}

interface ProjectPoliceDutyContextInput {
  time: GameTime;
  currentIdentity: CurrentIdentity;
  lawIdentity: LawIdentityRuntime;
}

const SHIFT_REFERENCE_DAY = { year: 1988, month: 9, day: 12 };
const DAY_MS = 24 * 60 * 60 * 1000;

function dateIndex(time: Pick<GameTime, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / DAY_MS);
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function minutesOfDay(time: Pick<GameTime, 'hour' | 'minute'>): number {
  return time.hour * 60 + time.minute;
}

function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function isUniformOrStationDuty(lawIdentity: LawIdentityRuntime): boolean {
  const text = [
    lawIdentity.department,
    lawIdentity.assignmentSummary,
    lawIdentity.stationOrPost,
    lawIdentity.rank,
    lawIdentity.dutySummary
  ]
    .filter(Boolean)
    .join(' / ');
  return containsAny(text, [
    'uniform',
    'patrol',
    'beat',
    'report room',
    'station duty',
    '军装',
    '巡逻',
    '巡逻警',
    '报案室',
    '值日',
    '值班'
  ]);
}

function isNarrativeRestDay(time: GameTime): boolean {
  const cycleDay = positiveModulo(dateIndex(time) - dateIndex(SHIFT_REFERENCE_DAY), 14);
  return cycleDay === 5 || cycleDay === 6 || cycleDay === 12;
}

function projectUniformDutyStatus(time: GameTime): PoliceDutyStatus {
  if (isNarrativeRestDay(time)) {
    return 'rest_day';
  }

  const minutes = minutesOfDay(time);
  const dayShiftEnd = 15 * 60 + 15;
  const eveningShiftEnd = 22 * 60 + 45;
  const nightShiftEnd = 6 * 60 + 45;

  if (minutes >= 6 * 60 + 30 && minutes <= dayShiftEnd) {
    return dayShiftEnd - minutes <= 60 ? 'near_shift_end' : 'on_duty';
  }
  if (minutes >= 14 * 60 && minutes <= eveningShiftEnd) {
    return eveningShiftEnd - minutes <= 60 ? 'near_shift_end' : 'on_duty';
  }
  if (minutes >= 22 * 60 || minutes <= nightShiftEnd) {
    const minutesUntilEnd = minutes >= 22 * 60 ? 24 * 60 - minutes + nightShiftEnd : nightShiftEnd - minutes;
    return minutesUntilEnd <= 60 ? 'near_shift_end' : 'on_duty';
  }

  return 'off_duty';
}

function projectOfficeDutyStatus(time: GameTime): PoliceDutyStatus {
  const minutes = minutesOfDay(time);
  if (isNarrativeRestDay(time)) {
    return 'rest_day';
  }
  if (minutes >= 9 * 60 && minutes <= 18 * 60) {
    return 18 * 60 - minutes <= 60 ? 'near_shift_end' : 'on_duty';
  }
  return 'off_duty';
}

function createRules(status: PoliceDutyStatus): Pick<PoliceDutyContextProjection, 'ordinaryTurnRules' | 'openingRules'> {
  const ordinaryTurnRules = [
    '不要因为玩家是警察就每回合自动新增报案、上级任务、无线电通报、纪律压力或连续加班。',
    '警务事件只有在玩家主动选择、已存在事件自然推进、上级明确召回、真实紧急现场或结构化模块已投喂时才进入正文。',
    '允许交班、下班、补眠、私人生活、人脉经营、家庭琐事、娱乐消遣、街坊寒暄和普通城市日常成为有效回合内容。',
    '如果当前节奏是临近交班、下班或轮休，优先提供收尾、交接、回家、休息或自主安排时间的空间；不要强行把轻微事项升级成正式案件。'
  ];
  const openingRules = [
    '不要因为玩家是警察就自动安排新报案、新上级任务或连续加班。',
    '可以写下班、休班、补眠、私人生活、人脉、家庭、娱乐、街坊关系或城市日常；这些都是有效开局入口。',
    '只有玩家额外要求、开局压力档位明确允许、或身份岗位确实需要时，才安排新的警务事件；轻松开局优先给普通日常和自由时间。',
    '如果开局时间临近交班、下班或轮休，不要把它反向写成必须继续上班。'
  ];

  if (status === 'on_duty') {
    ordinaryTurnRules.push('正在值勤不等于每回合都要有新冲突；可以写例行巡逻、文书、问候、观察、等待和低压力处置。');
    openingRules.push('正在值勤时也可以从例行巡逻、报案室文书、交接记录或普通街面观察开场。');
  }

  return { ordinaryTurnRules, openingRules };
}

export function projectPoliceDutyContext({
  time,
  currentIdentity,
  lawIdentity
}: ProjectPoliceDutyContextInput): PoliceDutyContextProjection {
  if (currentIdentity !== 'police' || lawIdentity.status !== 'active') {
    return {
      available: false,
      status: 'not_applicable',
      label: '非警务值班',
      summary: '玩家当前没有有效警务值班节奏；不要调用警务日程压力。',
      ...createRules('not_applicable')
    };
  }

  const uniformLike = isUniformOrStationDuty(lawIdentity);
  const status = uniformLike ? projectUniformDutyStatus(time) : projectOfficeDutyStatus(time);
  const labelByStatus: Record<PoliceDutyStatus, string> = {
    not_applicable: '非警务值班',
    on_duty: uniformLike ? '当值中' : '办公时段',
    near_shift_end: '临近交班',
    off_duty: '下班时段',
    rest_day: '轮休中'
  };
  const summaryByStatus: Record<PoliceDutyStatus, string> = {
    not_applicable: '玩家当前没有有效警务值班节奏；不要调用警务日程压力。',
    on_duty: uniformLike
      ? '当前可按军装/巡逻/报案室当值处理，但本回合不必自动新增报案；例行巡逻、文书、等待和普通观察都可以成立。'
      : '当前可按警务办公或案件工作时段处理，但不要把身份自动等同于每回合都有新任务。',
    near_shift_end:
      '当前临近交班，优先允许收尾、交接、写记录、下班、补眠、私人生活或自主安排；除非已有事件明确推进，不要强塞新警务压力。',
    off_duty:
      '当前属于下班时段，玩家可以休息、社交、处理家庭或私人事务；除非玩家主动、上级召回或已有紧急事件，不要自动拉回工作。',
    rest_day:
      '当前按轻量轮值节奏视为轮休或可支配时间，玩家应有自由活动空间；不要因为警察职业持续制造值班事件。'
  };

  return {
    available: true,
    status,
    label: labelByStatus[status],
    summary: summaryByStatus[status],
    ...createRules(status)
  };
}

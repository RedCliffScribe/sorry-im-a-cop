import type { CurrentIdentity, GameTime, LawIdentityRuntime } from '../runtime/types';
import { getWeekdayLabel } from '../time/gameTime';

export type PoliceDutyStatus =
  | 'not_applicable'
  | 'on_duty'
  | 'near_shift_end'
  | 'before_shift'
  | 'off_duty'
  | 'rest_day';

export type PoliceShiftKind = 'not_applicable' | 'day' | 'evening' | 'night' | 'office' | 'rest';

export interface PoliceDutyDayProjection {
  dateKey: string;
  dateLabel: string;
  weekdayLabel: string;
  isToday: boolean;
  isRestDay: boolean;
  shiftKind: PoliceShiftKind;
  shiftLabel: string;
  scheduleWindow: string;
  summary: string;
}

export interface PoliceDutyContextProjection {
  available: boolean;
  status: PoliceDutyStatus;
  label: string;
  shiftKind: PoliceShiftKind;
  shiftLabel: string;
  scheduleWindow: string;
  currentDutySummary: string;
  nextDutySummary: string;
  rosterSummary: string;
  weekSchedule: PoliceDutyDayProjection[];
  weekScheduleSummary: string;
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

interface PoliceShiftDefinition {
  kind: Exclude<PoliceShiftKind, 'not_applicable' | 'rest'>;
  label: string;
  startMinute: number;
  endMinute: number;
  overnight?: boolean;
}

type PoliceRosterAssignment = PoliceShiftDefinition | { kind: 'rest'; label: string };

const DAY_SHIFT: PoliceShiftDefinition = {
  kind: 'day',
  label: '早更',
  startMinute: 6 * 60 + 30,
  endMinute: 15 * 60 + 15
};
const EVENING_SHIFT: PoliceShiftDefinition = {
  kind: 'evening',
  label: '晚更',
  startMinute: 14 * 60,
  endMinute: 22 * 60 + 45
};
const NIGHT_SHIFT: PoliceShiftDefinition = {
  kind: 'night',
  label: '夜更',
  startMinute: 22 * 60,
  endMinute: 6 * 60 + 45,
  overnight: true
};
const OFFICE_SHIFT: PoliceShiftDefinition = {
  kind: 'office',
  label: '日勤',
  startMinute: 9 * 60,
  endMinute: 18 * 60
};
const REST_ASSIGNMENT: PoliceRosterAssignment = { kind: 'rest', label: '轮休' };

// A deterministic 4-on/2-off roster keeps old saves reproducible while giving one
// player one actual shift at a time. The reference day intentionally remains an
// evening shift so existing 1988-09-12 openings keep their near-handover pacing.
const UNIFORM_ROSTER: PoliceRosterAssignment[] = [
  ...Array.from({ length: 4 }, () => EVENING_SHIFT),
  ...Array.from({ length: 2 }, () => REST_ASSIGNMENT),
  ...Array.from({ length: 4 }, () => NIGHT_SHIFT),
  ...Array.from({ length: 2 }, () => REST_ASSIGNMENT),
  ...Array.from({ length: 4 }, () => DAY_SHIFT),
  ...Array.from({ length: 2 }, () => REST_ASSIGNMENT)
];

function dateIndex(time: Pick<GameTime, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / DAY_MS);
}

function shiftDate(
  time: Pick<GameTime, 'year' | 'month' | 'day'>,
  dayOffset: number
): Pick<GameTime, 'year' | 'month' | 'day'> {
  const shifted = new Date(Date.UTC(time.year, time.month - 1, time.day + dayOffset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function minutesOfDay(time: Pick<GameTime, 'hour' | 'minute'>): number {
  return time.hour * 60 + time.minute;
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function formatDate(time: Pick<GameTime, 'year' | 'month' | 'day'>): string {
  return `${time.year}年${time.month}月${time.day}日 ${getWeekdayLabel(time)}`;
}

function formatDateKey(time: Pick<GameTime, 'year' | 'month' | 'day'>): string {
  return `${String(time.year).padStart(4, '0')}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
}

function formatShiftWindow(shift: PoliceShiftDefinition): string {
  return `${formatMinute(shift.startMinute)}–${shift.overnight ? '次日' : ''}${formatMinute(shift.endMinute)}`;
}

function containsAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function isRotatingOperationalDuty(lawIdentity: LawIdentityRuntime): boolean {
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
    'traffic',
    'emergency unit',
    'police tactical unit',
    '军装',
    '巡逻',
    '巡逻警',
    '报案室',
    '值日',
    '值班',
    '交通',
    '冲锋',
    '衝鋒',
    '机动部队',
    '機動部隊'
  ]);
}

function uniformAssignmentForDate(
  time: Pick<GameTime, 'year' | 'month' | 'day'>
): PoliceRosterAssignment {
  const cycleDay = positiveModulo(
    dateIndex(time) - dateIndex(SHIFT_REFERENCE_DAY),
    UNIFORM_ROSTER.length
  );
  return UNIFORM_ROSTER[cycleDay] ?? REST_ASSIGNMENT;
}

function statusWithinShift(time: GameTime, shift: PoliceShiftDefinition): PoliceDutyStatus {
  const minutes = minutesOfDay(time);
  if (shift.overnight) {
    if (minutes < shift.startMinute) return 'before_shift';
    const minutesUntilEnd = 24 * 60 - minutes + shift.endMinute;
    return minutesUntilEnd <= 60 ? 'near_shift_end' : 'on_duty';
  }
  if (minutes < shift.startMinute) return 'before_shift';
  if (minutes <= shift.endMinute) {
    return shift.endMinute - minutes <= 60 ? 'near_shift_end' : 'on_duty';
  }
  return 'off_duty';
}

function weekdayOfficeAssignment(
  time: Pick<GameTime, 'year' | 'month' | 'day'>
): PoliceRosterAssignment {
  const weekday = new Date(Date.UTC(time.year, time.month - 1, time.day)).getUTCDay();
  return weekday >= 1 && weekday <= 5 ? OFFICE_SHIFT : REST_ASSIGNMENT;
}

function currentAssignment(
  time: GameTime,
  assignmentForDate: (date: Pick<GameTime, 'year' | 'month' | 'day'>) => PoliceRosterAssignment
): {
  assignment: PoliceRosterAssignment;
  assignmentDate: Pick<GameTime, 'year' | 'month' | 'day'>;
  status: PoliceDutyStatus;
  carriesFromPreviousNight: boolean;
} {
  const minutes = minutesOfDay(time);
  const previousDate = shiftDate(time, -1);
  const previous = assignmentForDate(previousDate);
  if (previous.kind !== 'rest' && previous.overnight && minutes <= previous.endMinute) {
    return {
      assignment: previous,
      assignmentDate: previousDate,
      status: previous.endMinute - minutes <= 60 ? 'near_shift_end' : 'on_duty',
      carriesFromPreviousNight: true
    };
  }

  const assignment = assignmentForDate(time);
  if (assignment.kind === 'rest') {
    return {
      assignment,
      assignmentDate: time,
      status: 'rest_day',
      carriesFromPreviousNight: false
    };
  }
  return {
    assignment,
    assignmentDate: time,
    status: statusWithinShift(time, assignment),
    carriesFromPreviousNight: false
  };
}

function findNextDuty(
  time: GameTime,
  assignmentForDate: (date: Pick<GameTime, 'year' | 'month' | 'day'>) => PoliceRosterAssignment
): string {
  const nowAbsoluteMinute = dateIndex(time) * 24 * 60 + minutesOfDay(time);
  for (let offset = 0; offset <= 21; offset += 1) {
    const date = shiftDate(time, offset);
    const assignment = assignmentForDate(date);
    if (assignment.kind === 'rest') continue;
    const startAbsoluteMinute = dateIndex(date) * 24 * 60 + assignment.startMinute;
    if (startAbsoluteMinute > nowAbsoluteMinute) {
      return `${formatDate(date)} ${assignment.label} ${formatShiftWindow(assignment)}`;
    }
  }
  return '下一更尚未排定';
}

function buildRollingWeekSchedule(
  time: GameTime,
  assignmentForDate: (date: Pick<GameTime, 'year' | 'month' | 'day'>) => PoliceRosterAssignment
): PoliceDutyDayProjection[] {
  return Array.from({ length: 7 }, (_, dayOffset) => {
    const date = shiftDate(time, dayOffset);
    const assignment = assignmentForDate(date);
    const isRestDay = assignment.kind === 'rest';
    const scheduleWindow = isRestDay ? '休班' : formatShiftWindow(assignment);

    return {
      dateKey: formatDateKey(date),
      dateLabel: `${date.month}月${date.day}日`,
      weekdayLabel: getWeekdayLabel(date),
      isToday: dayOffset === 0,
      isRestDay,
      shiftKind: assignment.kind,
      shiftLabel: assignment.label,
      scheduleWindow,
      summary: `${formatDate(date)} ${assignment.label}${isRestDay ? '' : ` ${scheduleWindow}`}`
    };
  });
}

function formatWeekScheduleSummary(schedule: PoliceDutyDayProjection[]): string {
  return schedule
    .map(
      (entry) =>
        `${entry.isToday ? '今天 · ' : ''}${entry.dateLabel} ${entry.weekdayLabel}：${entry.shiftLabel}${entry.isRestDay ? '' : ` ${entry.scheduleWindow}`}`
    )
    .join('；');
}

function createRules(status: PoliceDutyStatus): Pick<PoliceDutyContextProjection, 'ordinaryTurnRules' | 'openingRules'> {
  const ordinaryTurnRules = [
    '不要因为玩家是警察就每回合自动新增报案、上级任务、无线电通报、纪律压力或连续加班。',
    '警务事件只有在玩家主动选择、已存在事件自然推进、上级明确召回、真实紧急现场或结构化模块已投喂时才进入正文。',
    '允许交班、下班、补眠、私人生活、人脉经营、家庭琐事、娱乐消遣、街坊寒暄和普通城市日常成为有效回合内容。',
    '如果当前节奏是临近交班、下班或轮休，优先提供收尾、交接、回家、休息或自主安排时间的空间；不要强行把轻微事项升级成正式案件。',
    '本地班表是当前排班基线；除非已有结构化事实明确发生调更、加班、召回或紧急延时，正文不得把休班时间写成正常当值。'
  ];
  const openingRules = [
    '不要因为玩家是警察就自动安排新报案、新上级任务或连续加班。',
    '可以写下班、休班、补眠、私人生活、人脉、家庭、娱乐、街坊关系或城市日常；这些都是有效开局入口。',
    '只有玩家额外要求、开局压力档位明确允许、或身份岗位确实需要时，才安排新的警务事件；轻松开局优先给普通日常和自由时间。',
    '如果开局时间临近交班、下班或轮休，不要把它反向写成必须继续上班。',
    '开局必须服从本地给出的具体班别和时间，不得同时把早更、晚更、夜更都视为玩家本人的当前班次。'
  ];

  if (status === 'on_duty') {
    ordinaryTurnRules.push('正在值勤不等于每回合都要有新冲突；可以写例行巡逻、文书、问候、观察、等待和低压力处置。');
    openingRules.push('正在值勤时也可以从例行巡逻、报案室文书、交接记录或普通街面观察开场。');
  }

  if (status === 'before_shift') {
    ordinaryTurnRules.push('当前尚未开更，玩家可以先处理私人事务、休息或提前到署；不要把“稍后上班”写成已经当值。');
    openingRules.push('当前尚未开更，可以从上班前的私人时间或准备返署开场。');
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
      shiftKind: 'not_applicable',
      shiftLabel: '不适用',
      scheduleWindow: '不适用',
      currentDutySummary: '玩家当前没有有效警务班表。',
      nextDutySummary: '不适用',
      rosterSummary: '不适用',
      weekSchedule: [],
      weekScheduleSummary: '不适用',
      summary: '玩家当前没有有效警务值班节奏；不要调用警务日程压力。',
      ...createRules('not_applicable')
    };
  }

  const rotatingDuty = isRotatingOperationalDuty(lawIdentity);
  const assignmentForDate = rotatingDuty ? uniformAssignmentForDate : weekdayOfficeAssignment;
  const current = currentAssignment(time, assignmentForDate);
  const status = current.status;
  const labelByStatus: Record<PoliceDutyStatus, string> = {
    not_applicable: '非警务值班',
    on_duty: '当值中',
    near_shift_end: '临近交班',
    before_shift: '尚未开更',
    off_duty: '已交班',
    rest_day: '轮休中'
  };
  const summaryByStatus: Record<PoliceDutyStatus, string> = {
    not_applicable: '玩家当前没有有效警务值班节奏；不要调用警务日程压力。',
    on_duty: rotatingDuty
      ? '当前可按一线轮班或警署值日岗位当值处理，但本回合不必自动新增报案；例行巡逻、文书、等待和普通观察都可以成立。'
      : '当前可按警务办公或案件工作时段处理，但不要把身份自动等同于每回合都有新任务。',
    near_shift_end:
      '当前临近交班，优先允许收尾、交接、写记录、下班、补眠、私人生活或自主安排；除非已有事件明确推进，不要强塞新警务压力。',
    before_shift:
      '当前尚未到本更开始时间，玩家仍处于可支配时间；可以准备返署，但不要自动视为已经当值。',
    off_duty:
      '当前属于下班时段，玩家可以休息、社交、处理家庭或私人事务；除非玩家主动、上级召回或已有紧急事件，不要自动拉回工作。',
    rest_day:
      '当前按轻量轮值节奏视为轮休或可支配时间，玩家应有自由活动空间；不要因为警察职业持续制造值班事件。'
  };

  const assignment = current.assignment;
  const shiftKind = assignment.kind;
  const shiftLabel = assignment.label;
  const scheduleWindow = assignment.kind === 'rest' ? '今日无固定值班' : formatShiftWindow(assignment);
  const currentDutySummary =
    assignment.kind === 'rest'
      ? `${formatDate(time)} 轮休`
      : current.carriesFromPreviousNight
        ? `${assignment.label}（昨日${formatMinute(assignment.startMinute)}–今日${formatMinute(assignment.endMinute)}）`
        : `${formatDate(current.assignmentDate)} ${assignment.label} ${formatShiftWindow(assignment)}`;
  const rosterSummary = rotatingDuty
    ? '一线岗位循环轮班：4天晚更 → 2天轮休 → 4天夜更 → 2天轮休 → 4天早更 → 2天轮休。'
    : '日勤安排：周一至周五 09:00–18:00；周六、周日休班。';
  const weekSchedule = buildRollingWeekSchedule(time, assignmentForDate);

  return {
    available: true,
    status,
    label: labelByStatus[status],
    shiftKind,
    shiftLabel,
    scheduleWindow,
    currentDutySummary,
    nextDutySummary: findNextDuty(time, assignmentForDate),
    rosterSummary,
    weekSchedule,
    weekScheduleSummary: formatWeekScheduleSummary(weekSchedule),
    summary: `${summaryByStatus[status]} 当前安排：${currentDutySummary}。`,
    ...createRules(status)
  };
}

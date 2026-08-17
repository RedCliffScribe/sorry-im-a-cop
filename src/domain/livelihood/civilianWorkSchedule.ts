import type { CivilianRoleProfile, CurrentIdentity, GameTime } from '../runtime/types';
import { getWeekdayLabel } from '../time/gameTime';

export type CivilianWorkStatus =
  | 'not_applicable'
  | 'working'
  | 'near_work_end'
  | 'before_work'
  | 'off_work'
  | 'rest_day'
  | 'flexible'
  | 'unemployed';

export interface CivilianWorkScheduleProjection {
  available: boolean;
  status: CivilianWorkStatus;
  label: string;
  scheduleLabel: string;
  scheduleWindow: string;
  currentWorkSummary: string;
  nextWorkSummary: string;
  weeklyPatternSummary: string;
  summary: string;
  promptRules: string[];
}

interface ProjectCivilianWorkScheduleInput {
  time: GameTime;
  currentIdentity: CurrentIdentity;
  profile?: CivilianRoleProfile;
}

interface WeeklyWorkShift {
  label: string;
  startMinute: number;
  endMinute: number;
  overnight?: boolean;
}

const REGULAR_SHIFT: WeeklyWorkShift = {
  label: '日班',
  startMinute: 9 * 60,
  endMinute: 18 * 60
};
const EARLY_SHIFT: WeeklyWorkShift = {
  label: '轮班日更',
  startMinute: 8 * 60,
  endMinute: 16 * 60
};
const EVENING_SHIFT: WeeklyWorkShift = {
  label: '夜场班',
  startMinute: 18 * 60,
  endMinute: 2 * 60,
  overnight: true
};
const NIGHT_SHIFT: WeeklyWorkShift = {
  label: '夜班',
  startMinute: 22 * 60,
  endMinute: 6 * 60,
  overnight: true
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

function minutesOfDay(time: Pick<GameTime, 'hour' | 'minute'>): number {
  return time.hour * 60 + time.minute;
}

function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

function formatShiftWindow(shift: WeeklyWorkShift): string {
  return `${formatMinute(shift.startMinute)}–${shift.overnight ? '次日' : ''}${formatMinute(shift.endMinute)}`;
}

function formatDate(time: Pick<GameTime, 'year' | 'month' | 'day'>): string {
  return `${time.year}年${time.month}月${time.day}日 ${getWeekdayLabel(time)}`;
}

function isWeekday(time: Pick<GameTime, 'year' | 'month' | 'day'>): boolean {
  const weekday = new Date(Date.UTC(time.year, time.month - 1, time.day)).getUTCDay();
  return weekday >= 1 && weekday <= 5;
}

function profileText(profile: CivilianRoleProfile): string {
  return [
    profile.civilianProfileId,
    profile.publicOccupation,
    profile.workUnitSummary,
    profile.positionSummary,
    profile.dutySummary,
    ...profile.sectorIds,
    ...profile.roleTags
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function includesAny(text: string, values: string[]): boolean {
  return values.some((value) => text.includes(value.toLowerCase()));
}

function isFlexibleWork(profile: CivilianRoleProfile): boolean {
  const employment = profile.employmentStatusId?.toLowerCase();
  if (employment && ['self_employed', 'freelance', 'casual_worker', 'custom'].includes(employment)) {
    return true;
  }
  return profile.roleTags.some((tag) =>
    ['owner', 'freelance', 'commission_income', 'irregular_income', 'job_seeking'].includes(tag.toLowerCase())
  );
}

function deriveWeeklyShift(profile: CivilianRoleProfile): WeeklyWorkShift {
  const text = profileText(profile);
  if (includesAny(text, ['market_transport_helper', '果栏夜班', '夜班运输'])) return NIGHT_SHIFT;
  if (includesAny(text, ['nightlife_staff', '夜场', 'nightlife'])) return EVENING_SHIFT;
  if (profile.roleTags.some((tag) => tag.toLowerCase() === 'shift_work')) return EARLY_SHIFT;
  return REGULAR_SHIFT;
}

function findNextWork(time: GameTime, shift: WeeklyWorkShift): string {
  const nowAbsoluteMinute = dateIndex(time) * 24 * 60 + minutesOfDay(time);
  for (let offset = 0; offset <= 10; offset += 1) {
    const date = shiftDate(time, offset);
    if (!isWeekday(date)) continue;
    const startAbsoluteMinute = dateIndex(date) * 24 * 60 + shift.startMinute;
    if (startAbsoluteMinute > nowAbsoluteMinute) {
      return `${formatDate(date)} ${shift.label} ${formatShiftWindow(shift)}`;
    }
  }
  return '下一次上班尚未排定';
}

function standardPromptRules(): string[] {
  return [
    '本地工作安排是当前职业日程基线；不要在休息日或下班后自动把玩家写成正在上班。',
    '玩家主动加班、接临时委托、换班或响应已有紧急事项可以成立，但必须在正文中有明确原因。',
    '工作时段不等于每回合都要产生新任务；例行工作、空档、交接、午休和普通同事互动都可以成立。'
  ];
}

export function projectCivilianWorkSchedule({
  time,
  currentIdentity,
  profile
}: ProjectCivilianWorkScheduleInput): CivilianWorkScheduleProjection {
  if (currentIdentity !== 'civilian') {
    return {
      available: false,
      status: 'not_applicable',
      label: '不适用',
      scheduleLabel: '不适用',
      scheduleWindow: '不适用',
      currentWorkSummary: '当前公开身份不是市民。',
      nextWorkSummary: '不适用',
      weeklyPatternSummary: '不适用',
      summary: '当前不使用市民工作安排。',
      promptRules: []
    };
  }

  if (!profile || profile.employmentStatusId === 'unemployed') {
    return {
      available: true,
      status: 'unemployed',
      label: '无固定上班',
      scheduleLabel: '暂时无业',
      scheduleWindow: '可自行安排时间',
      currentWorkSummary: '当前没有固定雇主或上班时段。',
      nextWorkSummary: '如有散工、面试或临时安排，应由实际剧情明确建立。',
      weeklyPatternSummary: '没有固定工作周。',
      summary: '玩家当前没有固定上班安排，可以自行处理求职、散工与生活事务。',
      promptRules: standardPromptRules()
    };
  }

  if (isFlexibleWork(profile)) {
    return {
      available: true,
      status: 'flexible',
      label: '弹性安排',
      scheduleLabel: '自营／自由工作',
      scheduleWindow: '无固定朝九晚六',
      currentWorkSummary: '工作时间由已确认的营业、客户、委托或个人安排决定。',
      nextWorkSummary: '没有固定下一班；以已成立的预约、营业或委托为准。',
      weeklyPatternSummary: '弹性工作制，不自动套用周一至周五日勤。',
      summary: '玩家采用弹性工作安排；没有明确委托或营业事实时，不要自动认定正在上班。',
      promptRules: standardPromptRules()
    };
  }

  const shift = deriveWeeklyShift(profile);
  const minutes = minutesOfDay(time);
  const previousDate = shiftDate(time, -1);
  const continuingPreviousShift =
    Boolean(shift.overnight) && isWeekday(previousDate) && minutes <= shift.endMinute;
  const todayIsWorkday = isWeekday(time);
  let status: CivilianWorkStatus;
  let currentWorkSummary: string;

  if (continuingPreviousShift) {
    status = shift.endMinute - minutes <= 60 ? 'near_work_end' : 'working';
    currentWorkSummary = `${shift.label}（昨日${formatMinute(shift.startMinute)}–今日${formatMinute(shift.endMinute)}）`;
  } else if (!todayIsWorkday) {
    status = 'rest_day';
    currentWorkSummary = `${formatDate(time)} 休息日`;
  } else if (minutes < shift.startMinute) {
    status = 'before_work';
    currentWorkSummary = `${formatDate(time)} ${shift.label} ${formatShiftWindow(shift)}`;
  } else if (shift.overnight || minutes <= shift.endMinute) {
    const minutesUntilEnd = shift.overnight
      ? 24 * 60 - minutes + shift.endMinute
      : shift.endMinute - minutes;
    status = minutesUntilEnd <= 60 ? 'near_work_end' : 'working';
    currentWorkSummary = `${formatDate(time)} ${shift.label} ${formatShiftWindow(shift)}`;
  } else {
    status = 'off_work';
    currentWorkSummary = `${formatDate(time)} ${shift.label} ${formatShiftWindow(shift)}`;
  }

  const labels: Record<CivilianWorkStatus, string> = {
    not_applicable: '不适用',
    working: '上班中',
    near_work_end: '临近下班',
    before_work: '尚未上班',
    off_work: '已下班',
    rest_day: '休息日',
    flexible: '弹性安排',
    unemployed: '无固定上班'
  };
  const summaries: Record<CivilianWorkStatus, string> = {
    not_applicable: '当前不使用市民工作安排。',
    working: '当前处于工作时段，但不代表必须自动发生新职业事件。',
    near_work_end: '当前临近下班，应允许收尾、交接和离开工作地点。',
    before_work: '当前尚未到上班时间，玩家可以处理私人事务或提前到岗。',
    off_work: '当前已经下班，不应自动把玩家留在工作岗位。',
    rest_day: '当前是休息日，除非玩家主动或已有明确临时安排，不应自动上班。',
    flexible: '工作时间由已确认的营业、客户、委托或个人安排决定。',
    unemployed: '当前没有固定雇主或上班时段。'
  };

  return {
    available: true,
    status,
    label: labels[status],
    scheduleLabel: `周一至周五 · ${shift.label}`,
    scheduleWindow: formatShiftWindow(shift),
    currentWorkSummary,
    nextWorkSummary: findNextWork(time, shift),
    weeklyPatternSummary: `周一至周五 ${formatShiftWindow(shift)}；周六、周日休息。明确换班、加班或临时委托可覆盖当天安排。`,
    summary: `${summaries[status]} 当前安排：${currentWorkSummary}。`,
    promptRules: standardPromptRules()
  };
}

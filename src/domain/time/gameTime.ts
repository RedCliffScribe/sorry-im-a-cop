import type { GameTime } from '../runtime/types';

const weekdayLabels = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function getWeekdayLabel(
  time: Pick<GameTime, 'year' | 'month' | 'day'> & Partial<Pick<GameTime, 'hour' | 'minute'>>
): string {
  const date = new Date(Date.UTC(time.year, time.month - 1, time.day));
  return weekdayLabels[date.getUTCDay()] ?? '星期未知';
}

export function formatGameTimeWithWeekday(time: GameTime): string {
  return `${time.year}-${pad2(time.month)}-${pad2(time.day)} ${getWeekdayLabel(time)} ${pad2(time.hour)}:${pad2(time.minute)}`;
}

export function formatChineseGameTimeWithWeekday(time: GameTime): string {
  return `${time.year}年${pad2(time.month)}月${pad2(time.day)}日 ${getWeekdayLabel(time)} ${pad2(time.hour)}:${pad2(time.minute)}`;
}

function formatDateKey(time: Pick<GameTime, 'year' | 'month' | 'day'>): string {
  return `${time.year}-${pad2(time.month)}-${pad2(time.day)}`;
}

function toUtcDayNumber(time: Pick<GameTime, 'year' | 'month' | 'day'>): number {
  return Math.floor(Date.UTC(time.year, time.month - 1, time.day) / 86_400_000);
}

function shiftGameDate(
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

export function addGameDays(time: GameTime, dayOffset: number): GameTime {
  return { ...time, ...shiftGameDate(time, dayOffset) };
}

function getDayPart(hour: number): '凌晨' | '早上' | '上午' | '中午' | '下午' | '夜间' {
  if (hour < 5) return '凌晨';
  if (hour < 9) return '早上';
  if (hour < 12) return '上午';
  if (hour < 14) return '中午';
  if (hour < 18) return '下午';
  return '夜间';
}

function isNightPart(part: ReturnType<typeof getDayPart>): boolean {
  return part === '凌晨' || part === '夜间';
}

export function describeGameTimeRelativeTo(target: GameTime, now: GameTime): string {
  const dayOffset = toUtcDayNumber(target) - toUtcDayNumber(now);
  const part = getDayPart(target.hour);

  if (dayOffset === 0) return isNightPart(part) ? '今晚' : `今天${part}`;
  if (dayOffset === -1) return isNightPart(part) ? '昨晚' : `昨日${part}`;
  if (dayOffset === 1) return isNightPart(part) ? '明晚' : `明日${part}`;
  if (dayOffset === -2) return isNightPart(part) ? '前晚' : `前日${part}`;
  if (dayOffset === 2) return isNightPart(part) ? '后晚' : `后日${part}`;
  if (dayOffset < 0) return `${Math.abs(dayOffset)}天前${part}`;
  return `${dayOffset}天后${part}`;
}

export function formatTimeReferenceFrame(now: GameTime): string {
  const dayBeforeYesterday = shiftGameDate(now, -2);
  const yesterday = shiftGameDate(now, -1);
  const tomorrow = shiftGameDate(now, 1);
  const dayAfterTomorrow = shiftGameDate(now, 2);
  const currentWeekday = new Date(Date.UTC(now.year, now.month - 1, now.day)).getUTCDay();
  const daysSinceMonday = currentWeekday === 0 ? 6 : currentWeekday - 1;
  const nextWeekStart = shiftGameDate(now, 7 - daysSinceMonday);
  const nextWeekEnd = shiftGameDate(nextWeekStart, 6);

  return [
    `current=${formatGameTimeWithWeekday(now)}`,
    `today=${formatDateKey(now)}`,
    `dayBeforeYesterday=${formatDateKey(dayBeforeYesterday)}`,
    `yesterday=${formatDateKey(yesterday)}`,
    `tomorrow=${formatDateKey(tomorrow)}`,
    `dayAfterTomorrow=${formatDateKey(dayAfterTomorrow)}`,
    `nextWeek=${formatDateKey(nextWeekStart)}..${formatDateKey(nextWeekEnd)}`,
    `tonight=${formatDateKey(now)} 夜间`,
    `nightBeforeLast=${formatDateKey(dayBeforeYesterday)} 夜间`,
    `lastNight=${formatDateKey(yesterday)} 夜间`,
    `tomorrowNight=${formatDateKey(tomorrow)} 夜间`
  ].join('\n');
}

import type { GameTime, MemoryItem, MemoryTemporalReference } from '../runtime/types';
import { describeGameTimeRelativeTo, formatChineseGameTimeWithWeekday } from './gameTime';

export interface NormalizedMemoryTemporalText {
  text: string;
  temporalReferences: MemoryTemporalReference[];
}

const weekdayOffsets: Record<string, number> = {
  '一': 0,
  '二': 1,
  '三': 2,
  '四': 3,
  '五': 4,
  '六': 5,
  '日': 6,
  '天': 6
};

const dayOffsets: Record<string, number> = {
  '前天': -2,
  '昨天': -1,
  '昨日': -1,
  '今天': 0,
  '今日': 0,
  '明天': 1,
  '明日': 1,
  '后天': 2
};

const shortDayPartOffsets: Record<string, { dayOffset: number; label: string; hour: number }> = {
  '前晚': { dayOffset: -2, label: '夜间', hour: 21 },
  '昨晚': { dayOffset: -1, label: '夜间', hour: 21 },
  '今晚': { dayOffset: 0, label: '夜间', hour: 21 },
  '明晚': { dayOffset: 1, label: '夜间', hour: 21 },
  '后晚': { dayOffset: 2, label: '夜间', hour: 21 },
  '昨早': { dayOffset: -1, label: '早上', hour: 7 },
  '今早': { dayOffset: 0, label: '早上', hour: 7 },
  '今晨': { dayOffset: 0, label: '早上', hour: 7 },
  '明早': { dayOffset: 1, label: '早上', hour: 7 }
};

const dayPartHours: Record<string, number> = {
  '凌晨': 2,
  '早上': 7,
  '上午': 9,
  '中午': 12,
  '下午': 15,
  '晚上': 21,
  '夜里': 21,
  '夜间': 21
};

function cloneGameTime(time: GameTime): GameTime {
  return { ...time };
}

function shiftDate(time: GameTime, dayOffset: number, hour = time.hour, minute = time.minute): GameTime {
  const shifted = new Date(Date.UTC(time.year, time.month - 1, time.day + dayOffset, hour, minute));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes()
  };
}

function dayBounds(time: GameTime, dayOffset: number): { start: GameTime; end: GameTime } {
  return {
    start: shiftDate(time, dayOffset, 0, 0),
    end: shiftDate(time, dayOffset, 23, 59)
  };
}

function startOfWeek(time: GameTime, weekOffset: number): GameTime {
  const weekday = new Date(Date.UTC(time.year, time.month - 1, time.day)).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return shiftDate(time, weekOffset * 7 - daysSinceMonday, 0, 0);
}

function formatDate(time: GameTime): string {
  return `${time.year}年${time.month}月${time.day}日`;
}

function formatResolvedRange(start: GameTime, end?: GameTime): string {
  return end ? `${formatDate(start)}至${formatDate(end)}` : formatDate(start);
}

function replaceWithReference(
  text: string,
  pattern: RegExp,
  references: MemoryTemporalReference[],
  resolve: (phrase: string, ...groups: string[]) => { replacement: string; reference: MemoryTemporalReference }
): string {
  return text.replace(pattern, (phrase: string, ...args: unknown[]) => {
    const groups = args.slice(0, -2).map((value) => String(value ?? ''));
    const resolved = resolve(phrase, ...groups);
    references.push(resolved.reference);
    return resolved.replacement;
  });
}

function dedupeReferences(references: MemoryTemporalReference[]): MemoryTemporalReference[] {
  const seen = new Set<string>();
  const result: MemoryTemporalReference[] = [];
  for (const reference of references) {
    const key = [
      reference.sourcePhrase,
      reference.precision,
      reference.resolvedStart.year,
      reference.resolvedStart.month,
      reference.resolvedStart.day,
      reference.resolvedStart.hour,
      reference.resolvedStart.minute,
      reference.resolvedEnd?.year ?? '',
      reference.resolvedEnd?.month ?? '',
      reference.resolvedEnd?.day ?? ''
    ].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(reference);
  }
  return result;
}

export function normalizeMemoryTemporalText(text: string, referenceTime: GameTime): NormalizedMemoryTemporalText {
  const temporalReferences: MemoryTemporalReference[] = [];
  let normalized = text;

  normalized = replaceWithReference(
    normalized,
    /(\u4e0a|\u672c|\u8fd9|\u4e0b)(?:\u4e2a)?(?:\u5468|\u661f\u671f|\u793c\u62dc)([\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u65e5\u5929])?/g,
    temporalReferences,
    (phrase, prefix, weekdayLabel) => {
      const weekOffset = prefix === '上' ? -1 : prefix === '下' ? 1 : 0;
      const weekStart = startOfWeek(referenceTime, weekOffset);
      if (weekdayLabel) {
        const target = shiftDate(weekStart, weekdayOffsets[weekdayLabel] ?? 0, 0, 0);
        return {
          replacement: formatDate(target),
          reference: {
            sourcePhrase: phrase,
            resolvedStart: target,
            resolvedEnd: shiftDate(target, 0, 23, 59),
            precision: 'day'
          }
        };
      }
      const end = shiftDate(weekStart, 6, 23, 59);
      return {
        replacement: formatResolvedRange(weekStart, end),
        reference: {
          sourcePhrase: phrase,
          resolvedStart: weekStart,
          resolvedEnd: end,
          precision: 'week'
        }
      };
    }
  );

  normalized = replaceWithReference(
    normalized,
    /(\u524d\u665a|\u6628\u665a|\u4eca\u665a|\u660e\u665a|\u540e\u665a|\u6628\u65e9|\u4eca\u65e9|\u4eca\u6668|\u660e\u65e9)/g,
    temporalReferences,
    (phrase) => {
      const rule = shortDayPartOffsets[phrase];
      const target = shiftDate(referenceTime, rule.dayOffset, rule.hour, 0);
      return {
        replacement: `${formatDate(target)}${rule.label}`,
        reference: {
          sourcePhrase: phrase,
          resolvedStart: target,
          precision: 'day_part'
        }
      };
    }
  );

  normalized = replaceWithReference(
    normalized,
    /(\u524d\u5929|\u6628\u5929|\u6628\u65e5|\u4eca\u5929|\u4eca\u65e5|\u660e\u5929|\u660e\u65e5|\u540e\u5929)(\u51cc\u6668|\u65e9\u4e0a|\u4e0a\u5348|\u4e2d\u5348|\u4e0b\u5348|\u665a\u4e0a|\u591c\u91cc|\u591c\u95f4)?/g,
    temporalReferences,
    (phrase, dayLabel, dayPart) => {
      const dayOffset = dayOffsets[dayLabel] ?? 0;
      if (dayPart) {
        const target = shiftDate(referenceTime, dayOffset, dayPartHours[dayPart] ?? referenceTime.hour, 0);
        return {
          replacement: `${formatDate(target)}${dayPart}`,
          reference: {
            sourcePhrase: phrase,
            resolvedStart: target,
            precision: 'day_part'
          }
        };
      }
      const bounds = dayBounds(referenceTime, dayOffset);
      return {
        replacement: formatDate(bounds.start),
        reference: {
          sourcePhrase: phrase,
          resolvedStart: bounds.start,
          resolvedEnd: bounds.end,
          precision: 'day'
        }
      };
    }
  );

  return {
    text: normalized,
    temporalReferences: dedupeReferences(temporalReferences)
  };
}

export function projectMemoryTemporalContext(
  memory: Pick<MemoryItem, 'text' | 'gameTime' | 'temporalReferences'>
): NormalizedMemoryTemporalText {
  const normalized = normalizeMemoryTemporalText(memory.text, memory.gameTime);
  return {
    text: normalized.text,
    temporalReferences: dedupeReferences([
      ...(memory.temporalReferences ?? []).map((reference) => ({
        ...reference,
        resolvedStart: cloneGameTime(reference.resolvedStart),
        resolvedEnd: reference.resolvedEnd ? cloneGameTime(reference.resolvedEnd) : undefined
      })),
      ...normalized.temporalReferences
    ])
  };
}

export function formatMemoryTemporalReferences(
  references: MemoryTemporalReference[],
  now: GameTime
): string[] {
  return references.map((reference) => {
    const resolved = reference.resolvedEnd
      ? `${formatChineseGameTimeWithWeekday(reference.resolvedStart)} 至 ${formatChineseGameTimeWithWeekday(reference.resolvedEnd)}`
      : formatChineseGameTimeWithWeekday(reference.resolvedStart);
    const relative = describeGameTimeRelativeTo(reference.resolvedStart, now);
    // Keep the original phrase only in audit metadata. Prompt projections get
    // the resolved absolute range so old relative wording cannot float forward.
    return `absolute=${resolved} (相对本回合为${relative})`;
  });
}

export function mergeMemoryTemporalReferences(memories: MemoryItem[], limit = 12): MemoryTemporalReference[] {
  return dedupeReferences(memories.flatMap((memory) => projectMemoryTemporalContext(memory).temporalReferences)).slice(0, limit);
}

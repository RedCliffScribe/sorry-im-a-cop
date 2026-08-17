import { describe, expect, it } from 'vitest';
import {
  describeGameTimeRelativeTo,
  formatGameTimeWithWeekday,
  formatTimeReferenceFrame,
  getWeekdayLabel
} from './gameTime';

describe('game time calendar helpers', () => {
  it('derives the weekday from the absolute game date', () => {
    expect(getWeekdayLabel({ year: 1988, month: 9, day: 12, hour: 22, minute: 13 })).toBe('星期一');
  });

  it('formats game time with weekday for player-facing and prompt-facing labels', () => {
    expect(formatGameTimeWithWeekday({ year: 1988, month: 9, day: 12, hour: 22, minute: 13 })).toBe(
      '1988-09-12 星期一 22:13'
    );
  });

  it('labels past and current night references from the current game date', () => {
    const now = { year: 1988, month: 9, day: 13, hour: 1, minute: 20 };

    expect(describeGameTimeRelativeTo({ year: 1988, month: 9, day: 12, hour: 22, minute: 30 }, now)).toBe(
      '昨晚'
    );
    expect(describeGameTimeRelativeTo({ year: 1988, month: 9, day: 13, hour: 0, minute: 10 }, now)).toBe('今晚');
    expect(describeGameTimeRelativeTo({ year: 1988, month: 9, day: 12, hour: 14, minute: 0 }, now)).toBe('昨日下午');
    expect(describeGameTimeRelativeTo({ year: 1988, month: 9, day: 11, hour: 22, minute: 0 }, now)).toBe('前晚');
    expect(describeGameTimeRelativeTo({ year: 1988, month: 9, day: 10, hour: 23, minute: 0 }, now)).toBe(
      '3天前夜间'
    );
  });

  it('builds a compact time reference frame for prompt grounding', () => {
    const frame = formatTimeReferenceFrame({ year: 1988, month: 9, day: 13, hour: 1, minute: 20 });

    expect(frame).toContain('current=1988-09-13 星期二 01:20');
    expect(frame).toContain('today=1988-09-13');
    expect(frame).toContain('dayBeforeYesterday=1988-09-11');
    expect(frame).toContain('yesterday=1988-09-12');
    expect(frame).toContain('tomorrow=1988-09-14');
    expect(frame).toContain('dayAfterTomorrow=1988-09-15');
    expect(frame).toContain('nextWeek=1988-09-19..1988-09-25');
    expect(frame).toContain('tonight=1988-09-13 夜间');
    expect(frame).toContain('nightBeforeLast=1988-09-11 夜间');
    expect(frame).toContain('lastNight=1988-09-12 夜间');
  });
});

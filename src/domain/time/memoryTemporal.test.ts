import { describe, expect, it } from 'vitest';
import type { MemoryItem } from '../runtime/types';
import {
  formatMemoryTemporalReferences,
  normalizeMemoryTemporalText,
  projectMemoryTemporalContext
} from './memoryTemporal';

const referenceTime = { year: 1988, month: 12, day: 1, hour: 10, minute: 30 };

describe('NPC memory temporal normalization', () => {
  it('turns deterministic relative days into absolute dates at write time', () => {
    const result = normalizeMemoryTemporalText(
      '玩家说后天上午见面，并提到昨天收到过一次电话。',
      referenceTime
    );

    expect(result.text).toBe('玩家说1988年12月3日上午见面，并提到1988年11月30日收到过一次电话。');
    expect(result.temporalReferences).toEqual([
      expect.objectContaining({
        sourcePhrase: '后天上午',
        precision: 'day_part',
        resolvedStart: { year: 1988, month: 12, day: 3, hour: 9, minute: 0 }
      }),
      expect.objectContaining({
        sourcePhrase: '昨天',
        precision: 'day',
        resolvedStart: { year: 1988, month: 11, day: 30, hour: 0, minute: 0 }
      })
    ]);
  });

  it('resolves a named weekday and keeps an unspecified next week as an absolute range', () => {
    const result = normalizeMemoryTemporalText('约好下周三见面，下周再确认地点。', referenceTime);

    expect(result.text).toBe('约好1988年12月7日见面，1988年12月5日至1988年12月11日再确认地点。');
    expect(result.temporalReferences[0]).toMatchObject({
      sourcePhrase: '下周三',
      precision: 'day',
      resolvedStart: { year: 1988, month: 12, day: 7 }
    });
    expect(result.temporalReferences[1]).toMatchObject({
      sourcePhrase: '下周',
      precision: 'week',
      resolvedStart: { year: 1988, month: 12, day: 5 },
      resolvedEnd: { year: 1988, month: 12, day: 11 }
    });
  });

  it('does not invent a date for deliberately vague timing', () => {
    const result = normalizeMemoryTemporalText('双方只说改天再谈，过阵子再联系。', referenceTime);

    expect(result.text).toBe('双方只说改天再谈，过阵子再联系。');
    expect(result.temporalReferences).toEqual([]);
  });

  it('projects legacy relative text without mutating the stored memory', () => {
    const memory = {
      memoryId: 'memory_legacy',
      text: '玩家说明天再来。',
      kind: 'actor',
      tier: 'short_term',
      relatedActorIds: ['npc_1'],
      relatedCaseIds: [],
      relatedPlaceIds: [],
      relatedOrganizationIds: [],
      gameTime: referenceTime,
      importance: 50,
      visibility: 'player_known',
      certainty: 'fact'
    } satisfies MemoryItem;

    const projection = projectMemoryTemporalContext(memory);

    expect(memory.text).toBe('玩家说明天再来。');
    expect(projection.text).toBe('玩家说1988年12月2日再来。');
    const formatted = formatMemoryTemporalReferences(projection.temporalReferences, {
      year: 1988,
      month: 12,
      day: 8,
      hour: 10,
      minute: 0
    })[0];
    expect(formatted).toContain('absolute=1988年12月02日');
    expect(formatted).toContain('6天前');
    expect(formatted).not.toContain('明天');
  });
});
